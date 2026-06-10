/**
 * Dividend Service - AWS Lambda Version
 * Calculate dividend data for positions from DynamoDB activities
 */

const logger = require('../../shared/utils/logger');
const { query } = require('../../shared/utils/dynamodb');

const ACTIVITIES_TABLE = process.env.ACTIVITIES_TABLE;

class DividendService {
  constructor() {
    this.dividendCache = new Map(); // In-memory cache for dividend data
    this.cacheTimeout = 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Convert dividend frequency to payments per year
   */
  getPaymentsPerYear(frequency) {
    const mapping = {
      'monthly': 12,
      'semi-monthly': 24,  // 2 times per month
      'quarterly': 4,
      'semi-annual': 2,
      'annual': 1,
      'unknown': 12  // Default to monthly
    };
    return mapping[frequency] || 12;
  }

  /**
   * Fetch dividend activities for a person and symbol from DynamoDB
   */
  async fetchDividendActivities(personName, symbol = null) {
    try {
      // Check cache first
      const cacheKey = `${personName}_${symbol || 'all'}`;
      const cached = this.dividendCache.get(cacheKey);

      if (cached && (Date.now() - cached.timestamp < this.cacheTimeout)) {
        logger.debug(`[DIVIDEND] Using cached data for ${cacheKey}`);
        return cached.data;
      }

      // Build query expression
      let keyConditionExpression = 'personName = :personName';
      const expressionValues = { ':personName': personName };

      // Filter for dividend types - Questrade uses various formats
      // Common values: 'Dividends', 'Dividend', 'DIV'
      let filterExpression = '(#type = :type1 OR #type = :type2 OR #type = :type3 OR contains(#type, :typeDividend))';
      const expressionAttributeNames = { '#type': 'type' };

      expressionValues[':type1'] = 'Dividends';
      expressionValues[':type2'] = 'Dividend';
      expressionValues[':type3'] = 'DIV';
      expressionValues[':typeDividend'] = 'dividend';

      if (symbol) {
        filterExpression += ' AND symbol = :symbol';
        expressionValues[':symbol'] = symbol;
      }

      logger.info(`[DIVIDEND] Querying activities for ${personName}${symbol ? ` (${symbol})` : ''}`);

      const result = await query(
        ACTIVITIES_TABLE,
        keyConditionExpression,
        expressionValues,
        {
          IndexName: 'personName-date-index',
          FilterExpression: filterExpression,
          ExpressionAttributeNames: expressionAttributeNames,
          ScanIndexForward: false // Most recent first
        }
      );

      const activities = result.items || [];

      logger.info(`[DIVIDEND] Found ${activities.length} dividend activities for ${personName}${symbol ? ` (${symbol})` : ''}`);

      // Cache the result
      this.dividendCache.set(cacheKey, {
        data: activities,
        timestamp: Date.now()
      });

      return activities;

    } catch (error) {
      logger.error(`[DIVIDEND] Error fetching activities for ${personName}:`, {
        message: error.message,
        stack: error.stack
      });

      // Return cached data if available, even if expired
      const cacheKey = `${personName}_${symbol || 'all'}`;
      const cached = this.dividendCache.get(cacheKey);
      if (cached) {
        logger.info(`[DIVIDEND] Returning expired cache for ${cacheKey} due to fetch error`);
        return cached.data;
      }

      return [];
    }
  }

  /**
   * Calculate dividend data for a specific symbol
   */
  async calculateDividendData(symbol, positions, currentPrice) {
    try {
      logger.info(`[DIVIDEND] Calculating dividend data for ${symbol}:`, {
        positionCount: positions?.length || 0,
        currentPrice
      });

      // Return empty dividend data if no positions
      if (!positions || positions.length === 0) {
        logger.debug(`[DIVIDEND] No positions for ${symbol}, returning empty data`);
        return this.getEmptyDividendData();
      }

      // Collect all person names from positions
      const personNames = [...new Set(positions.map(p => p.personName).filter(Boolean))];

      logger.info(`[DIVIDEND] Found ${personNames.length} persons for ${symbol}:`, personNames);

      if (personNames.length === 0) {
        logger.warn(`[DIVIDEND] No person names found in positions for ${symbol}`);
        return this.getEmptyDividendData();
      }

      // Fetch dividend activities for all persons
      const allDividendActivities = [];
      const activityMap = new Map(); // To track unique dividends and aggregate them

      for (const personName of personNames) {
        try {
          logger.debug(`[DIVIDEND] Fetching activities for ${personName} - ${symbol}`);
          const activities = await this.fetchDividendActivities(personName, symbol);

          if (activities && activities.length > 0) {
            logger.info(`[DIVIDEND] Found ${activities.length} activities for ${personName} - ${symbol}`);

            // Process activities and aggregate by date
            activities.forEach(activity => {
              const date = activity.transactionDate || activity.tradeDate || activity.activityDateTime;
              const dateKey = this.formatDate(date);
              const amount = Math.abs(activity.netAmount || activity.grossAmount || 0);

              if (activityMap.has(dateKey)) {
                // If we already have a dividend for this date, add to it
                const existing = activityMap.get(dateKey);
                existing.amount += amount;
                existing.accounts.push({
                  personName: personName,
                  accountId: activity.accountId,
                  amount: amount
                });
              } else {
                // New dividend date
                activityMap.set(dateKey, {
                  date: date,
                  amount: amount,
                  accounts: [{
                    personName: personName,
                    accountId: activity.accountId,
                    amount: amount
                  }]
                });
              }
            });

            allDividendActivities.push(...activities);
          } else {
            logger.debug(`[DIVIDEND] No activities found for ${personName} - ${symbol}`);
          }
        } catch (error) {
          // Individual fetch failed, continue with others
          logger.warn(`[DIVIDEND] Failed to fetch for ${personName} - ${symbol}:`, error.message);
        }
      }

      logger.info(`[DIVIDEND] Total dividend activities found for ${symbol}: ${allDividendActivities.length}`);
      logger.info(`[DIVIDEND] Unique dividend dates: ${activityMap.size}`);

      // If no dividend data available, return empty structure
      if (activityMap.size === 0) {
        logger.debug(`[DIVIDEND] No dividend activities found for ${symbol}`);
        return this.getEmptyDividendData();
      }

      // Calculate total dividends received (aggregated)
      let totalReceived = 0;
      activityMap.forEach(dividend => {
        totalReceived += dividend.amount;
      });

      logger.info(`[DIVIDEND] Total dividends received for ${symbol}: ${totalReceived}`);

      // Calculate total shares across all positions
      const totalShares = positions.reduce((sum, pos) => sum + (pos.openQuantity || 0), 0);

      logger.debug(`[DIVIDEND] Total shares for ${symbol}: ${totalShares}`);

      // Calculate weighted average cost
      let totalCost = 0;
      positions.forEach(pos => {
        const cost = pos.totalCost || (pos.openQuantity * pos.averageEntryPrice) || 0;
        totalCost += cost;
      });

      const avgCostPerShare = totalShares > 0 ? totalCost / totalShares : 0;

      logger.debug(`[DIVIDEND] Average cost per share for ${symbol}: ${avgCostPerShare}`);

      // Calculate payment frequency and amounts
      const dividendDates = Array.from(activityMap.values())
        .sort((a, b) => new Date(a.date) - new Date(b.date));

      // Get the most recent dividend payment for per-share calculation
      const mostRecentDividend = dividendDates[dividendDates.length - 1];
      const mostRecentDividendPerShare = totalShares > 0 ?
        mostRecentDividend.amount / totalShares : 0;

      logger.info(`[DIVIDEND] Most recent dividend for ${symbol}: ${mostRecentDividend.amount} on ${this.formatDate(mostRecentDividend.date)}`);
      logger.info(`[DIVIDEND] Most recent dividend per share: ${mostRecentDividendPerShare}`);

      // Auto-detect frequency from historical data
      let paymentFrequency = 12; // Default to monthly
      let monthlyDividendPerShare = mostRecentDividendPerShare;

      if (dividendDates.length >= 2) {
        // Calculate average days between payments
        let totalDaysBetween = 0;
        let gapCount = 0;

        for (let i = 1; i < dividendDates.length; i++) {
          const daysBetween = this.daysBetween(dividendDates[i-1].date, dividendDates[i].date);
          if (daysBetween > 0) {
            totalDaysBetween += daysBetween;
            gapCount++;
          }
        }

        if (gapCount > 0) {
          const avgDaysBetween = totalDaysBetween / gapCount;
          logger.info(`[DIVIDEND] Average days between payments: ${avgDaysBetween}`);

          // Determine frequency based on average days between payments
          if (avgDaysBetween <= 20) {
            paymentFrequency = 24; // Semi-monthly (2 times per month)
            monthlyDividendPerShare = mostRecentDividendPerShare;
          } else if (avgDaysBetween <= 35) {
            paymentFrequency = 12; // Monthly
            monthlyDividendPerShare = mostRecentDividendPerShare;
          } else if (avgDaysBetween <= 100) {
            paymentFrequency = 4; // Quarterly
            monthlyDividendPerShare = mostRecentDividendPerShare / 3;
          } else if (avgDaysBetween <= 200) {
            paymentFrequency = 2; // Semi-annual
            monthlyDividendPerShare = mostRecentDividendPerShare / 6;
          } else {
            paymentFrequency = 1; // Annual
            monthlyDividendPerShare = mostRecentDividendPerShare / 12;
          }
        }
      }

      logger.info(`[DIVIDEND] Auto-detected payment frequency: ${paymentFrequency} times per year`);
      logger.info(`[DIVIDEND] Final monthly dividend per share: ${monthlyDividendPerShare}`);

      // Calculate annual dividend
      const annualDividendPerShare = monthlyDividendPerShare * 12;
      const annualDividend = annualDividendPerShare * totalShares;

      logger.info(`[DIVIDEND] Annual dividend for ${symbol}:`, {
        monthlyPerShare: monthlyDividendPerShare,
        annualPerShare: annualDividendPerShare,
        totalAnnual: annualDividend,
        frequency: paymentFrequency
      });

      // Calculate yields
      // Yield on Cost = (Annual Dividend Per Share / Average Cost Per Share) * 100
      // Current Yield = (Annual Dividend Per Share / Current Price) * 100
      const yieldOnCost = avgCostPerShare > 0 ? (annualDividendPerShare / avgCostPerShare) * 100 : 0;
      const currentYield = currentPrice > 0 ? (annualDividendPerShare / currentPrice) * 100 : 0;

      logger.info(`[DIVIDEND] Yields for ${symbol}:`, {
        yieldOnCost: `${yieldOnCost.toFixed(2)}%`,
        currentYield: `${currentYield.toFixed(2)}%`,
        avgCost: avgCostPerShare,
        currentPrice
      });

      // Format dividend history (aggregated by date)
      const dividendHistory = dividendDates
        .slice(-10) // Last 10 payments
        .reverse() // Most recent first
        .map(dividend => ({
          date: this.formatDate(dividend.date),
          amount: Math.round(dividend.amount * 10000) / 10000,
          accounts: dividend.accounts.length
        }));

      const result = {
        totalReceived: Math.round(totalReceived * 10000) / 10000,
        monthlyDividendPerShare: Math.round(monthlyDividendPerShare * 10000) / 10000,
        annualDividend: Math.round(annualDividend * 10000) / 10000,
        annualDividendPerShare: Math.round(annualDividendPerShare * 10000) / 10000,
        yieldOnCost: Math.round(yieldOnCost * 100) / 100,
        currentYield: Math.round(currentYield * 100) / 100,
        dividendHistory,
        paymentFrequency
      };

      logger.info(`[DIVIDEND] Final dividend data for ${symbol}:`, result);

      return result;
    } catch (error) {
      logger.error(`[DIVIDEND] Failed to calculate dividend data for ${symbol}:`, {
        message: error.message,
        stack: error.stack
      });
      return this.getEmptyDividendData();
    }
  }

  /**
   * Get empty dividend data structure
   */
  getEmptyDividendData() {
    return {
      totalReceived: 0,
      monthlyDividendPerShare: 0,
      annualDividend: 0,
      annualDividendPerShare: 0,
      yieldOnCost: 0,
      currentYield: 0,
      dividendHistory: [],
      paymentFrequency: 0
    };
  }

  /**
   * Clear dividend cache (for manual refresh)
   */
  clearCache() {
    this.dividendCache.clear();
    logger.info('[DIVIDEND] Cache cleared');
  }

  /**
   * Format date to YYYY-MM-DD
   */
  formatDate(date) {
    const d = new Date(date);
    return d.toISOString().split('T')[0];
  }

  /**
   * Calculate days between two dates
   */
  daysBetween(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diffTime = Math.abs(d2 - d1);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
}

module.exports = new DividendService();
