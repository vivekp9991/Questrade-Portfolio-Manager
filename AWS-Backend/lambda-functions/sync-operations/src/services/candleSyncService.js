/**
 * Candle Sync Service
 * Fetch previous day close prices from Questrade for Today's P&L calculation
 */

const logger = require('../../shared/utils/logger');
const { query, scan, batchWrite, putItem } = require('../../shared/utils/dynamodb');
const questradeApi = require('./questradeApiService');

const POSITIONS_TABLE = process.env.POSITIONS_TABLE;
const SYNC_HISTORY_TABLE = process.env.SYNC_HISTORY_TABLE;

class CandleSyncService {
  /**
   * Get previous day's close price from Questrade Candles API
   */
  async getPreviousDayClose(personName, symbolId) {
    try {
      // Calculate time range: get last 5 days to account for weekends
      const endTime = new Date();
      const startTime = new Date();
      startTime.setDate(startTime.getDate() - 5);

      const startTimeISO = startTime.toISOString();
      const endTimeISO = endTime.toISOString();

      logger.info(`[CANDLE SYNC] Fetching candles for symbolId ${symbolId}`, {
        startTime: startTimeISO,
        endTime: endTimeISO
      });

      // Call Questrade Candles API
      const endpoint = `/v1/markets/candles/${symbolId}?startTime=${startTimeISO}&endTime=${endTimeISO}&interval=OneDay`;
      const data = await questradeApi.makeRequest(personName, endpoint);

      if (!data || !data.candles || data.candles.length === 0) {
        logger.warn(`[CANDLE SYNC] No candles returned for symbolId ${symbolId}`);
        return 0;
      }

      const candles = data.candles;

      // Sort candles by end time (descending) to get the most recent first
      candles.sort((a, b) => new Date(b.end) - new Date(a.end));

      // Find yesterday's complete candle by checking dates
      // We need a candle from a PREVIOUS trading day (not today)
      const today = new Date();
      today.setHours(0, 0, 0, 0);  // Normalize to start of day

      const yesterdayCandle = candles.find(candle => {
        const candleDate = new Date(candle.end);
        candleDate.setHours(0, 0, 0, 0);  // Normalize to start of day
        // Return the first candle that's from before today
        return candleDate < today;
      });

      if (!yesterdayCandle) {
        logger.warn(`[CANDLE SYNC] Could not find previous day's candle for symbolId ${symbolId}`);
        return 0;
      }

      const previousDayClose = yesterdayCandle.close || 0;

      logger.info(`[CANDLE SYNC] Got previous day close for symbolId ${symbolId}: $${previousDayClose} (from ${yesterdayCandle.end})`);

      return previousDayClose;

    } catch (error) {
      logger.error(`[CANDLE SYNC] Error fetching candle for symbolId ${symbolId}:`, error.message || error);
      return 0;
    }
  }

  /**
   * Sync previous day close prices for all positions of a person
   * @param {string} personName - Person name
   * @param {string} triggerType - MANUAL or SCHEDULED
   */
  async syncPreviousDayCloseForPerson(personName, triggerType = 'MANUAL') {
    try {
      logger.info(`[CANDLE SYNC] Starting previous day close sync for ${personName} (trigger: ${triggerType})`);

      // Get all positions for this person
      const result = await query(
        POSITIONS_TABLE,
        'personName = :personName',
        { ':personName': personName },
        { IndexName: 'personName-symbol-index' }
      );

      const positions = result.items || [];

      if (positions.length === 0) {
        logger.info(`[CANDLE SYNC] No positions found for ${personName}`);
        return {
          success: true,
          personName,
          updated: 0,
          failed: 0,
          message: 'No positions to update'
        };
      }

      logger.info(`[CANDLE SYNC] Found ${positions.length} positions for ${personName}`);

      // Group positions by symbol to avoid duplicate API calls
      const symbolMap = new Map();
      positions.forEach(pos => {
        if (!symbolMap.has(pos.symbol)) {
          symbolMap.set(pos.symbol, {
            symbolId: pos.symbolId,
            positions: []
          });
        }
        symbolMap.get(pos.symbol).positions.push(pos);
      });

      let updated = 0;
      let failed = 0;

      // Process each unique symbol
      for (const [symbol, data] of symbolMap) {
        try {
          const { symbolId, positions: symbolPositions } = data;

          logger.info(`[CANDLE SYNC] Processing ${symbol} (${symbolPositions.length} position(s))`);

          // Get previous day close from Questrade
          const previousDayClose = await this.getPreviousDayClose(personName, symbolId);

          if (previousDayClose > 0) {
            // Update all positions for this symbol
            const updateItems = symbolPositions.map(pos => ({
              ...pos,
              previousClose: previousDayClose,
              lastPriceUpdate: Date.now(),
              updatedAt: Date.now()
            }));

            await batchWrite(POSITIONS_TABLE, updateItems, 'put');
            updated += symbolPositions.length;

            logger.info(`[CANDLE SYNC] ✅ Updated ${symbol}: previousClose = $${previousDayClose}`);
          } else {
            logger.warn(`[CANDLE SYNC] ⚠️  Skipped ${symbol}: previousClose not available`);
            failed += symbolPositions.length;
          }

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error) {
          logger.error(`[CANDLE SYNC] ❌ Failed to update ${symbol}:`, error.message || error);
          failed += data.positions.length;
        }
      }

      logger.info(`[CANDLE SYNC] Completed sync for ${personName}: ${updated} updated, ${failed} failed`);

      // Write to sync history
      const now = Date.now();
      await putItem(SYNC_HISTORY_TABLE, {
        personName,
        syncTimestamp: now,
        syncType: "PREV_CLOSE",
        triggerType: triggerType, // MANUAL or SCHEDULED
        status: "COMPLETED",
        duration: `${updated + failed} positions`,
        message: `Updated ${updated}, Failed ${failed}`,
        startTime: now,
        endTime: now,
        ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 days
      });

      return {
        success: true,
        personName,
        updated,
        failed,
        total: positions.length,
        message: `Updated ${updated} position(s), ${failed} failed`
      };

    } catch (error) {
      logger.error(`[CANDLE SYNC] Error syncing previous day close for ${personName}:`, error.message || error);

      // Create safe error object without circular references
      const safeError = new Error(error.message || 'Failed to sync previous day close');
      safeError.personName = personName;
      if (error.status) safeError.status = error.status;
      if (error.statusText) safeError.statusText = error.statusText;
      if (error.data) safeError.data = error.data;

      throw safeError;
    }
  }

  /**
   * Sync previous day close prices for all persons
   * @param {string} triggerType - MANUAL or SCHEDULED
   */
  async syncPreviousDayCloseForAll(triggerType = 'MANUAL') {
    try {
      logger.info(`[CANDLE SYNC] Starting previous day close sync for all persons (trigger: ${triggerType})`);

      // Get all positions and extract unique person names
      const result = await scan(POSITIONS_TABLE);
      const positions = result.items || [];

      const personNames = [...new Set(positions.map(p => p.personName).filter(Boolean))];

      if (personNames.length === 0) {
        logger.info('[CANDLE SYNC] No persons found');
        return [];
      }

      logger.info(`[CANDLE SYNC] Found ${personNames.length} person(s): ${personNames.join(', ')}`);

      const results = [];

      for (const personName of personNames) {
        try {
          const result = await this.syncPreviousDayCloseForPerson(personName, triggerType);
          results.push(result);
        } catch (error) {
          logger.error(`[CANDLE SYNC] Failed to sync for ${personName}:`, error.message);
          results.push({
            success: false,
            personName,
            error: error.message
          });
        }
      }

      return results;

    } catch (error) {
      logger.error('[CANDLE SYNC] Error syncing previous day close for all:', error);
      throw error;
    }
  }
}

module.exports = new CandleSyncService();
