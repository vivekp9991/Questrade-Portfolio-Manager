const Position = require('../models/Position');
const Activity = require('../models/Activity');
const logger = require('../utils/logger');
const moment = require('moment');
const mongoose = require('mongoose');

// Access DividendOverride model from portfolio-api database
const DividendOverride = mongoose.connection.useDb('questrade-portfolio').model('DividendOverride', new mongoose.Schema({
  personName: String,
  symbol: String,
  dividendFrequency: String,
  monthlyDividendPerShare: Number,
  overriddenBy: String,
  overriddenAt: Date,
  notes: String
}, { timestamps: true }));

class DividendSync {
  /**
   * Calculate and update dividend data for all positions
   */
  async syncAllDividendData() {
    try {
      logger.info('[DIVIDEND SYNC] Starting dividend sync for all positions');

      // Get all unique positions (by symbol and personName)
      const positions = await Position.find({});

      logger.info(`[DIVIDEND SYNC] Found ${positions.length} positions to process`);

      let updatedCount = 0;
      let errorCount = 0;

      for (const position of positions) {
        try {
          await this.syncPositionDividendData(position);
          updatedCount++;
        } catch (error) {
          logger.error(`[DIVIDEND SYNC] Failed to sync dividends for ${position.symbol}:`, error.message);
          errorCount++;
        }
      }

      logger.info(`[DIVIDEND SYNC] Completed. Updated: ${updatedCount}, Errors: ${errorCount}`);

      return {
        success: true,
        updated: updatedCount,
        errors: errorCount,
        total: positions.length
      };

    } catch (error) {
      logger.error('[DIVIDEND SYNC] Failed to sync dividend data:', error);
      throw error;
    }
  }

  /**
   * Calculate and update dividend data for a specific position
   */
  async syncPositionDividendData(position) {
    try {
      const { symbol, personName, accountId, openQuantity, totalCost, currentPrice, averageEntryPrice } = position;

      logger.debug(`[DIVIDEND SYNC] Processing ${symbol} for ${personName} (${accountId})`);

      // Check for manual override first
      const override = await DividendOverride.findOne({
        personName,
        symbol: symbol.toUpperCase()
      });

      if (override && override.monthlyDividendPerShare !== undefined) {
        logger.info(`[DIVIDEND SYNC] ⚠️  Manual override found for ${symbol} (${personName}) - using override data`);

        // Use manual override data instead of calculating from Questrade
        const dividendData = this.applyManualOverride(
          override,
          openQuantity,
          totalCost,
          averageEntryPrice,
          currentPrice
        );

        position.isDividendStock = true;
        position.dividendData = dividendData;
        position.isManualOverride = true;
        position.lastDividendUpdate = new Date();
        await position.save();

        logger.info(`[DIVIDEND SYNC] 🔒 Protected override for ${symbol}: ${override.dividendFrequency}, monthly/share: ${override.monthlyDividendPerShare}`);
        return;
      }

      // No manual override - proceed with normal sync from Questrade data
      position.isManualOverride = false;

      // Fetch dividend activities for this specific position (symbol + person + account)
      const dividendActivities = await Activity.find({
        personName,
        symbol,
        accountId,
        type: 'Dividend'
      }).sort({ transactionDate: -1 });

      if (dividendActivities.length === 0) {
        // No dividends - set to empty/zero
        position.isDividendStock = false;
        position.dividendData = this.getEmptyDividendData(totalCost, averageEntryPrice, openQuantity);
        position.lastDividendUpdate = new Date();
        await position.save();

        logger.debug(`[DIVIDEND SYNC] No dividends found for ${symbol} (${personName})`);
        return;
      }

      logger.debug(`[DIVIDEND SYNC] Found ${dividendActivities.length} dividend activities for ${symbol}`);

      // Calculate dividend data
      const dividendData = await this.calculateDividendData(
        dividendActivities,
        openQuantity,
        totalCost,
        averageEntryPrice,
        currentPrice
      );

      // Update position with dividend data
      position.isDividendStock = true;
      position.dividendData = dividendData;
      position.lastDividendUpdate = new Date();

      await position.save();

      logger.info(`[DIVIDEND SYNC] Updated ${symbol} (${personName}): Annual dividend ${dividendData.annualDividendPerShare}, YOC: ${dividendData.yieldOnCost}%`);

    } catch (error) {
      logger.error(`[DIVIDEND SYNC] Error syncing position dividend data:`, error);
      throw error;
    }
  }

  /**
   * Apply manual override data to position
   */
  applyManualOverride(override, shares, totalCost, avgCostPerShare, currentPrice) {
    const monthlyDividendPerShare = override.monthlyDividendPerShare || 0;
    const monthlyDividend = monthlyDividendPerShare * shares;

    // Map frequency string to annual multiplier
    const frequencyMap = {
      'monthly': 12,
      'quarterly': 4,
      'semi-annual': 2,
      'annual': 1,
      'none': 0
    };

    const frequency = frequencyMap[override.dividendFrequency] || 12;
    const annualDividendPerShare = monthlyDividendPerShare * 12;
    const annualDividend = annualDividendPerShare * shares;

    // Calculate yields
    const yieldOnCost = avgCostPerShare > 0 ?
      (annualDividendPerShare / avgCostPerShare) * 100 : 0;
    const currentYield = currentPrice > 0 ?
      (annualDividendPerShare / currentPrice) * 100 : 0;

    return {
      totalReceived: 0, // Not applicable for manual overrides
      lastDividendAmount: 0,
      lastDividendDate: null,
      dividendReturnPercent: 0,
      yieldOnCost: Math.round(yieldOnCost * 100) / 100,
      currentYield: Math.round(currentYield * 100) / 100,
      dividendAdjustedCost: totalCost || 0,
      dividendAdjustedCostPerShare: avgCostPerShare || 0,
      monthlyDividend: Math.round(monthlyDividend * 10000) / 10000, // 4 decimal places
      monthlyDividendPerShare: Math.round(monthlyDividendPerShare * 10000) / 10000, // 4 decimal places
      annualDividend: Math.round(annualDividend * 10000) / 10000, // 4 decimal places
      annualDividendPerShare: Math.round(annualDividendPerShare * 10000) / 10000, // 4 decimal places
      dividendFrequency: frequency,
      dividendHistory: [],
      isManualOverride: true
    };
  }

  /**
   * Calculate dividend data from activities
   */
  async calculateDividendData(dividendActivities, shares, totalCost, avgCostPerShare, currentPrice) {
    try {
      // Get most recent dividend (activities are sorted desc in query)
      const mostRecentDividend = dividendActivities[0];
      const lastDividendAmount = Math.abs(mostRecentDividend.netAmount || mostRecentDividend.grossAmount || 0);
      const lastDividendDate = mostRecentDividend.transactionDate;

      // Sort activities by date (oldest to newest for frequency calculation)
      const sortedActivities = [...dividendActivities].sort((a, b) =>
        new Date(a.transactionDate) - new Date(b.transactionDate)
      );

      // Calculate total dividends received
      const totalReceived = sortedActivities.reduce((sum, act) =>
        sum + Math.abs(act.netAmount || act.grossAmount || 0), 0
      );

      // Calculate dividend per share from most recent payment
      // Extract shares from description if available, or use price field
      let lastDividendPerShare = mostRecentDividend.price || 0;

      // If price is 0, try to calculate from description
      if (lastDividendPerShare === 0 && mostRecentDividend.description) {
        const sharesMatch = mostRecentDividend.description.match(/ON\s+(\d+)\s+SHS/);
        if (sharesMatch) {
          const dividendShares = parseInt(sharesMatch[1]);
          if (dividendShares > 0) {
            lastDividendPerShare = lastDividendAmount / dividendShares;
          }
        }
      }

      logger.debug(`[DIVIDEND SYNC] Last dividend per share: ${lastDividendPerShare}`);

      // Determine payment frequency
      const { frequency, monthlyDividendPerShare } = this.calculatePaymentFrequency(
        sortedActivities,
        lastDividendPerShare
      );

      // Calculate annual dividend
      const annualDividendPerShare = lastDividendPerShare * frequency;
      const annualDividend = annualDividendPerShare * shares;
      const monthlyDividend = monthlyDividendPerShare * shares;

      // Calculate yields
      const yieldOnCost = avgCostPerShare > 0 ?
        (annualDividendPerShare / avgCostPerShare) * 100 : 0;
      const currentYield = currentPrice > 0 ?
        (annualDividendPerShare / currentPrice) * 100 : 0;

      // Calculate dividend-adjusted cost
      const dividendAdjustedCost = totalCost - totalReceived;
      const dividendAdjustedCostPerShare = shares > 0 ?
        dividendAdjustedCost / shares : avgCostPerShare;

      // Calculate dividend return percentage
      const dividendReturnPercent = totalCost > 0 ?
        (totalReceived / totalCost) * 100 : 0;

      // Format dividend history (last 10 payments)
      const dividendHistory = dividendActivities
        .slice(0, 10)
        .map(act => ({
          date: moment(act.transactionDate).format('YYYY-MM-DD'),
          amount: Math.round(Math.abs(act.netAmount || act.grossAmount || 0) * 10000) / 10000, // 4 decimal places
          perShare: Math.round((act.price || 0) * 10000) / 10000 // 4 decimal places
        }));

      return {
        totalReceived: Math.round(totalReceived * 10000) / 10000, // 4 decimal places
        lastDividendAmount: Math.round(lastDividendAmount * 10000) / 10000, // 4 decimal places
        lastDividendDate,
        dividendReturnPercent: Math.round(dividendReturnPercent * 100) / 100,
        yieldOnCost: Math.round(yieldOnCost * 100) / 100,
        currentYield: Math.round(currentYield * 100) / 100,
        dividendAdjustedCost: Math.round(dividendAdjustedCost * 100) / 100,
        dividendAdjustedCostPerShare: Math.round(dividendAdjustedCostPerShare * 100) / 100,
        monthlyDividend: Math.round(monthlyDividend * 10000) / 10000, // 4 decimal places
        monthlyDividendPerShare: Math.round(monthlyDividendPerShare * 10000) / 10000, // 4 decimal places
        annualDividend: Math.round(annualDividend * 10000) / 10000, // 4 decimal places
        annualDividendPerShare: Math.round(annualDividendPerShare * 10000) / 10000, // 4 decimal places
        dividendFrequency: frequency,
        dividendHistory
      };

    } catch (error) {
      logger.error('[DIVIDEND SYNC] Error calculating dividend data:', error);
      throw error;
    }
  }

  /**
   * Calculate payment frequency from dividend history
   */
  calculatePaymentFrequency(sortedActivities, lastDividendPerShare) {
    if (sortedActivities.length < 2) {
      // Default to monthly if we only have one payment
      return {
        frequency: 12,
        monthlyDividendPerShare: lastDividendPerShare
      };
    }

    // Calculate average days between payments
    let totalDaysBetween = 0;
    let gapCount = 0;

    for (let i = 1; i < sortedActivities.length; i++) {
      const daysBetween = moment(sortedActivities[i].transactionDate)
        .diff(moment(sortedActivities[i-1].transactionDate), 'days');

      if (daysBetween > 0) {
        totalDaysBetween += daysBetween;
        gapCount++;
      }
    }

    if (gapCount === 0) {
      return {
        frequency: 12,
        monthlyDividendPerShare: lastDividendPerShare
      };
    }

    const avgDaysBetween = totalDaysBetween / gapCount;

    logger.debug(`[DIVIDEND SYNC] Average days between payments: ${avgDaysBetween}`);

    let frequency = 12;
    let monthlyDividendPerShare = lastDividendPerShare;

    // Determine frequency based on average days
    if (avgDaysBetween <= 35) {
      // Monthly
      frequency = 12;
      monthlyDividendPerShare = lastDividendPerShare;
    } else if (avgDaysBetween <= 100) {
      // Quarterly
      frequency = 4;
      monthlyDividendPerShare = lastDividendPerShare / 3;
    } else if (avgDaysBetween <= 200) {
      // Semi-annual
      frequency = 2;
      monthlyDividendPerShare = lastDividendPerShare / 6;
    } else {
      // Annual
      frequency = 1;
      monthlyDividendPerShare = lastDividendPerShare / 12;
    }

    return { frequency, monthlyDividendPerShare };
  }

  /**
   * Get empty dividend data structure
   */
  getEmptyDividendData(totalCost, avgCostPerShare, shares) {
    return {
      totalReceived: 0,
      lastDividendAmount: 0,
      lastDividendDate: null,
      dividendReturnPercent: 0,
      yieldOnCost: 0,
      currentYield: 0,
      dividendAdjustedCost: totalCost || 0,
      dividendAdjustedCostPerShare: avgCostPerShare || 0,
      monthlyDividend: 0,
      monthlyDividendPerShare: 0,
      annualDividend: 0,
      annualDividendPerShare: 0,
      dividendFrequency: 0,
      dividendHistory: []
    };
  }

  /**
   * Sync dividend data for a specific person
   */
  async syncPersonDividendData(personName) {
    try {
      logger.info(`[DIVIDEND SYNC] Syncing dividends for ${personName}`);

      const positions = await Position.find({ personName });

      logger.info(`[DIVIDEND SYNC] Found ${positions.length} positions for ${personName}`);

      let updatedCount = 0;

      for (const position of positions) {
        try {
          await this.syncPositionDividendData(position);
          updatedCount++;
        } catch (error) {
          logger.error(`[DIVIDEND SYNC] Failed for ${position.symbol}:`, error.message);
        }
      }

      logger.info(`[DIVIDEND SYNC] Updated ${updatedCount} positions for ${personName}`);

      return {
        success: true,
        updated: updatedCount,
        total: positions.length
      };

    } catch (error) {
      logger.error(`[DIVIDEND SYNC] Failed to sync for ${personName}:`, error);
      throw error;
    }
  }

  /**
   * Sync dividend data for a specific symbol
   */
  async syncSymbolDividendData(symbol) {
    try {
      logger.info(`[DIVIDEND SYNC] Syncing dividends for ${symbol}`);

      const positions = await Position.find({ symbol });

      logger.info(`[DIVIDEND SYNC] Found ${positions.length} positions for ${symbol}`);

      let updatedCount = 0;

      for (const position of positions) {
        try {
          await this.syncPositionDividendData(position);
          updatedCount++;
        } catch (error) {
          logger.error(`[DIVIDEND SYNC] Failed for ${position.accountId}:`, error.message);
        }
      }

      logger.info(`[DIVIDEND SYNC] Updated ${updatedCount} positions for ${symbol}`);

      return {
        success: true,
        updated: updatedCount,
        total: positions.length
      };

    } catch (error) {
      logger.error(`[DIVIDEND SYNC] Failed to sync for ${symbol}:`, error);
      throw error;
    }
  }
}

module.exports = new DividendSync();
