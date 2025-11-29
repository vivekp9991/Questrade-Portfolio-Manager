/**
 * Dividend Sync Service
 * Calculate and sync dividend data for positions
 */

const logger = require('../../shared/utils/logger');
const { query } = require('../../shared/utils/dynamodb');

const ACTIVITIES_TABLE = process.env.ACTIVITIES_TABLE;

class DividendSyncService {
  /**
   * Calculate dividend data from activities for a position
   */
  async calculateDividendDataForPosition(
    personName,
    symbol,
    openQuantity,
    totalCost,
    averageEntryPrice,
    currentPrice
  ) {
    try {
      logger.debug(`[DIVIDEND SYNC] Calculating dividend data for ${symbol} (${personName})`);

      // Query dividend activities for this person and symbol
      const activities = await this.fetchDividendActivities(personName, symbol);

      if (!activities || activities.length === 0) {
        logger.debug(`[DIVIDEND SYNC] No dividend activities found for ${symbol}`);
        return this.getEmptyDividendData(totalCost, averageEntryPrice, openQuantity);
      }

      logger.info(`[DIVIDEND SYNC] Found ${activities.length} dividend activities for ${symbol}`);

      // Calculate dividend metrics
      const dividendData = await this.calculateDividendMetrics(
        activities,
        openQuantity,
        totalCost,
        averageEntryPrice,
        currentPrice
      );

      logger.info(`[DIVIDEND SYNC] Updated ${symbol}: Annual dividend ${dividendData.annualDividendPerShare}, YOC: ${dividendData.yieldOnCost}%`);

      return dividendData;

    } catch (error) {
      logger.error(`[DIVIDEND SYNC] Error calculating dividend data for ${symbol}:`, error.message);
      return this.getEmptyDividendData(totalCost, averageEntryPrice, openQuantity);
    }
  }

  /**
   * Fetch dividend activities from DynamoDB
   */
  async fetchDividendActivities(personName, symbol) {
    try {
      const keyConditionExpression = 'personName = :personName';
      const expressionValues = {
        ':personName': personName,
        ':type1': 'Dividends',
        ':type2': 'Dividend',
        ':type3': 'DIV',
        ':typeDividend': 'dividend',
        ':symbol': symbol
      };

      const filterExpression = '(#type = :type1 OR #type = :type2 OR #type = :type3 OR contains(#type, :typeDividend)) AND symbol = :symbol';
      const expressionAttributeNames = { '#type': 'type' };

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

      return result.items || [];

    } catch (error) {
      logger.error(`[DIVIDEND SYNC] Error fetching dividend activities:`, error.message);
      return [];
    }
  }

  /**
   * Calculate dividend metrics from activities
   */
  async calculateDividendMetrics(
    activities,
    openQuantity,
    totalCost,
    averageEntryPrice,
    currentPrice
  ) {
    // Sort activities by date
    const sortedActivities = activities.sort((a, b) => {
      const dateA = new Date(a.transactionDate || a.activityDateTime);
      const dateB = new Date(b.transactionDate || a.activityDateTime);
      return dateA - dateB;
    });

    // Calculate total dividends received
    let totalReceived = 0;
    const dividendHistory = [];

    sortedActivities.forEach(activity => {
      const amount = Math.abs(activity.netAmount || activity.grossAmount || 0);
      totalReceived += amount;

      dividendHistory.push({
        date: activity.transactionDate || activity.activityDateTime,
        amount: amount
      });
    });

    // Get most recent dividend for per-share calculation
    const mostRecentActivity = sortedActivities[sortedActivities.length - 1];
    const mostRecentAmount = Math.abs(mostRecentActivity.netAmount || mostRecentActivity.grossAmount || 0);

    // Estimate shares at time of dividend (use current quantity as approximation)
    const sharesAtDividend = openQuantity > 0 ? openQuantity : 1;
    const mostRecentDividendPerShare = mostRecentAmount / sharesAtDividend;

    // Auto-detect frequency
    let paymentFrequency = 12; // Default monthly
    let monthlyDividendPerShare = mostRecentDividendPerShare;

    if (sortedActivities.length >= 2) {
      // Calculate average days between payments
      let totalDaysBetween = 0;
      let gapCount = 0;

      for (let i = 1; i < sortedActivities.length; i++) {
        const date1 = new Date(sortedActivities[i - 1].transactionDate || sortedActivities[i - 1].activityDateTime);
        const date2 = new Date(sortedActivities[i].transactionDate || sortedActivities[i].activityDateTime);
        const daysBetween = Math.abs(date2 - date1) / (1000 * 60 * 60 * 24);

        if (daysBetween > 0) {
          totalDaysBetween += daysBetween;
          gapCount++;
        }
      }

      if (gapCount > 0) {
        const avgDaysBetween = totalDaysBetween / gapCount;

        // Determine frequency
        if (avgDaysBetween <= 20) {
          paymentFrequency = 24; // Semi-monthly
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

    // Calculate annual dividend
    const annualDividendPerShare = monthlyDividendPerShare * 12;
    const annualDividend = annualDividendPerShare * openQuantity;
    const monthlyDividend = monthlyDividendPerShare * openQuantity;

    // Calculate yields
    // YoC formula: ((monthlyDividend * 12) / avgCost) * 100
    const yieldOnCost = averageEntryPrice > 0 ? ((monthlyDividendPerShare * 12) / averageEntryPrice) * 100 : 0;
    const currentYield = currentPrice > 0 ? ((monthlyDividendPerShare * 12) / currentPrice) * 100 : 0;

    // Get last 10 dividends for history
    const recentHistory = dividendHistory
      .slice(-10)
      .reverse()
      .map(d => ({
        date: this.formatDate(d.date),
        amount: Math.round(d.amount * 10000) / 10000
      }));

    return {
      totalReceived: Math.round(totalReceived * 10000) / 10000,
      monthlyDividendPerShare: Math.round(monthlyDividendPerShare * 10000) / 10000,
      monthlyDividend: Math.round(monthlyDividend * 10000) / 10000,
      annualDividend: Math.round(annualDividend * 10000) / 10000,
      annualDividendPerShare: Math.round(annualDividendPerShare * 10000) / 10000,
      yieldOnCost: Math.round(yieldOnCost * 100) / 100,
      currentYield: Math.round(currentYield * 100) / 100,
      dividendHistory: recentHistory,
      dividendFrequency: paymentFrequency,
      lastDividendAmount: mostRecentAmount,
      lastDividendDate: mostRecentActivity.transactionDate || mostRecentActivity.activityDateTime
    };
  }

  /**
   * Get empty dividend data structure
   */
  getEmptyDividendData(totalCost, averageEntryPrice, openQuantity) {
    return {
      totalReceived: 0,
      monthlyDividendPerShare: 0,
      monthlyDividend: 0,
      annualDividend: 0,
      annualDividendPerShare: 0,
      yieldOnCost: 0,
      currentYield: 0,
      dividendHistory: [],
      dividendFrequency: 0,
      lastDividendAmount: 0,
      lastDividendDate: null
    };
  }

  /**
   * Format date to YYYY-MM-DD
   */
  formatDate(date) {
    const d = new Date(date);
    return d.toISOString().split('T')[0];
  }
}

module.exports = new DividendSyncService();
