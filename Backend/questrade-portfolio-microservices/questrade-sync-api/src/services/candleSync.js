const axios = require('axios');
const Position = require('../models/Position');
const logger = require('../utils/logger');

class CandleSync {
  constructor(authApiUrl) {
    this.authApiUrl = authApiUrl || process.env.AUTH_API_URL || 'http://localhost:4001/api';
  }

  /**
   * Get previous day's close price from Questrade Candles API
   * @param {number} symbolId - Questrade symbol ID
   * @param {string} accessToken - Questrade access token
   * @param {string} apiServer - Questrade API server URL
   * @returns {Promise<number>} Previous day's close price
   */
  async getPreviousDayClose(symbolId, accessToken, apiServer) {
    try {
      // Calculate time range: get last 2 days of daily candles
      const endTime = new Date();
      const startTime = new Date();
      startTime.setDate(startTime.getDate() - 5); // Go back 5 days to ensure we get data (accounting for weekends)

      const startTimeISO = startTime.toISOString();
      const endTimeISO = endTime.toISOString();

      // Make request to Questrade Candles API
      // GET /v1/markets/candles/{id}?startTime=...&endTime=...&interval=OneDay
      const url = `${apiServer}/v1/markets/candles/${symbolId}`;

      logger.info(`[CANDLE SYNC] Fetching candles for symbolId ${symbolId}`, {
        startTime: startTimeISO,
        endTime: endTimeISO
      });

      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        params: {
          startTime: startTimeISO,
          endTime: endTimeISO,
          interval: 'OneDay'
        }
      });

      if (!response.data || !response.data.candles || response.data.candles.length === 0) {
        logger.warn(`[CANDLE SYNC] No candles returned for symbolId ${symbolId}`);
        return 0;
      }

      const candles = response.data.candles;

      // Sort candles by end time (descending) to get the most recent first
      candles.sort((a, b) => new Date(b.end) - new Date(a.end));

      // Get the second-most recent candle (yesterday's candle)
      // The most recent (index 0) is today's candle (incomplete)
      // The second (index 1) is yesterday's complete candle
      const yesterdayCandle = candles.length >= 2 ? candles[1] : candles[0];

      if (!yesterdayCandle) {
        logger.warn(`[CANDLE SYNC] Could not find yesterday's candle for symbolId ${symbolId}`);
        return 0;
      }

      const previousDayClose = yesterdayCandle.close || 0;

      logger.info(`[CANDLE SYNC] Got previous day close for symbolId ${symbolId}: $${previousDayClose} (from ${yesterdayCandle.end})`);

      return previousDayClose;

    } catch (error) {
      logger.error(`[CANDLE SYNC] Error fetching candle for symbolId ${symbolId}:`, error.message);

      // If 401, token might be expired
      if (error.response && error.response.status === 401) {
        throw new Error('Access token expired');
      }

      return 0;
    }
  }

  /**
   * Sync previous day close prices for all positions of a person
   * @param {string} personName - Person name
   * @returns {Promise<Object>} Sync results
   */
  async syncPreviousDayCloseForPerson(personName) {
    try {
      logger.info(`[CANDLE SYNC] Starting previous day close sync for ${personName}`);

      // Get access token
      let tokenResponse = await axios.get(`${this.authApiUrl}/auth/access-token/${personName}`);
      let tokenData = tokenResponse.data.data;

      // Get all positions for this person
      const positions = await Position.find({ personName });

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
      let tokenRefreshed = false;

      // Process each unique symbol
      for (const [symbol, data] of symbolMap) {
        try {
          const { symbolId, positions: symbolPositions } = data;

          logger.info(`[CANDLE SYNC] Processing ${symbol} (${symbolPositions.length} position(s))`);

          // Get previous day close from Questrade
          let previousDayClose = 0;

          try {
            previousDayClose = await this.getPreviousDayClose(
              symbolId,
              tokenData.accessToken,
              tokenData.apiServer
            );
          } catch (error) {
            // If token expired, refresh it once and retry
            if (error.message === 'Access token expired' && !tokenRefreshed) {
              logger.info('[CANDLE SYNC] Access token expired, refreshing...');

              const refreshResponse = await axios.post(
                `${this.authApiUrl}/auth/refresh-token/${personName}`
              );

              if (!refreshResponse.data.success) {
                throw new Error('Failed to refresh token');
              }

              tokenRefreshed = true;
              tokenResponse = await axios.get(`${this.authApiUrl}/auth/access-token/${personName}`);
              tokenData = tokenResponse.data.data;

              logger.info('[CANDLE SYNC] Token refreshed successfully, retrying...');

              // Retry with new token
              previousDayClose = await this.getPreviousDayClose(
                symbolId,
                tokenData.accessToken,
                tokenData.apiServer
              );
            } else {
              throw error;
            }
          }

          if (previousDayClose > 0) {
            // Update all positions for this symbol
            for (const position of symbolPositions) {
              position.previousDayClose = previousDayClose;
              position.lastPriceUpdate = new Date();
              await position.save();
              updated++;
            }

            logger.info(`[CANDLE SYNC] ✅ Updated ${symbol}: previousDayClose = $${previousDayClose}`);
          } else {
            logger.warn(`[CANDLE SYNC] ⚠️  Skipped ${symbol}: previousDayClose not available`);
            failed += symbolPositions.length;
          }

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error) {
          logger.error(`[CANDLE SYNC] ❌ Failed to update ${symbol}:`, error.message);
          failed += data.positions.length;
        }
      }

      logger.info(`[CANDLE SYNC] Completed sync for ${personName}: ${updated} updated, ${failed} failed`);

      return {
        success: true,
        personName,
        updated,
        failed,
        total: positions.length,
        message: `Updated ${updated} position(s), ${failed} failed`
      };

    } catch (error) {
      logger.error(`[CANDLE SYNC] Error syncing previous day close for ${personName}:`, error);
      throw error;
    }
  }

  /**
   * Sync previous day close prices for all persons
   * @returns {Promise<Array>} Array of sync results for each person
   */
  async syncPreviousDayCloseForAll() {
    try {
      logger.info('[CANDLE SYNC] Starting previous day close sync for all persons');

      // Get all unique person names
      const persons = await Position.distinct('personName');

      if (persons.length === 0) {
        logger.info('[CANDLE SYNC] No persons found');
        return [];
      }

      logger.info(`[CANDLE SYNC] Found ${persons.length} person(s): ${persons.join(', ')}`);

      const results = [];

      for (const personName of persons) {
        try {
          const result = await this.syncPreviousDayCloseForPerson(personName);
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

module.exports = CandleSync;
