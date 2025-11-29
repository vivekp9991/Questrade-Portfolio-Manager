/**
 * Exchange Rate Handler
 * Get USD/CAD exchange rate from DynamoDB cache
 *
 * Strategy: Read from cache updated by token-refresh-scheduler every 4 minutes
 * Benefits:
 * - No external API calls from this Lambda (saves invocation costs)
 * - Always fresh data (updated every 4 min)
 * - Fast response time (DynamoDB read)
 */

const logger = require('../../shared/utils/logger');
const { success, internalError } = require('../../shared/utils/response');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamodb = DynamoDBDocumentClient.from(client);

const CACHE_TABLE = process.env.CACHE_TABLE;

/**
 * Get exchange rate from DynamoDB cache
 * GET /api/portfolio/exchange-rate
 */
exports.getExchangeRate = async (event) => {
  try {
    logger.info('Getting exchange rate from cache');

    // Check if cache table is configured
    if (!CACHE_TABLE) {
      logger.warn('CACHE_TABLE not configured, using fallback');
      return getFallbackRate();
    }

    try {
      // Read from DynamoDB cache
      const result = await dynamodb.send(new GetCommand({
        TableName: CACHE_TABLE,
        Key: {
          cacheKey: 'exchange-rate-USD-CAD'
        }
      }));

      if (result.Item && result.Item.data) {
        const cacheData = result.Item.data;
        const cacheAge = Math.floor((Date.now() - cacheData.timestamp) / 1000 / 60); // minutes

        logger.info('Exchange rate retrieved from cache', {
          rate: cacheData.rate,
          cacheAge: `${cacheAge} minutes`,
          source: cacheData.source
        });

        return success({
          ...cacheData,
          cached: true,
          cacheAge: `${cacheAge} minutes`,
          updatedBy: 'token-refresh-scheduler'
        });
      }

      // Cache miss - return fallback
      logger.warn('Exchange rate not found in cache, using fallback');
      return getFallbackRate();

    } catch (cacheError) {
      // If cache read fails, return fallback
      logger.warn('Failed to read from cache, using fallback', {
        error: cacheError.message
      });

      return getFallbackRate();
    }

  } catch (error) {
    logger.error('Exchange rate handler error', {
      error: error.message,
      stack: error.stack
    });
    return internalError(error.message, error);
  }
};

/**
 * Fallback exchange rate when cache is unavailable
 */
function getFallbackRate() {
  return success({
    rate: 1.40,
    base: 'USD',
    target: 'CAD',
    pair: 'USD/CAD',
    timestamp: Date.now(),
    source: 'fallback',
    cached: false,
    note: 'Using default exchange rate - cache unavailable'
  });
}
