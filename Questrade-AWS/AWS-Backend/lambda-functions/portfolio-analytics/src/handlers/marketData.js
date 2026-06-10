/**
 * Market Data Handler
 * Get market data from symbols-master table (SINGLE SOURCE OF TRUTH)
 */

const logger = require('../../shared/utils/logger');
const { success, internalError, badRequest } = require('../../shared/utils/response');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, BatchGetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamodb = DynamoDBDocumentClient.from(client);

const SYMBOLS_MASTER_TABLE = process.env.SYMBOLS_MASTER_TABLE;

/**
 * GET /api/market-data/symbols (get all symbols with market data)
 * GET /api/market-data/symbol/:symbol (get specific symbol)
 */
exports.getMarketData = async (event) => {
  try {
    const { rawPath } = event;
    const pathParts = rawPath.split('/');
    const symbol = pathParts[pathParts.length - 1];

    if (!SYMBOLS_MASTER_TABLE) {
      logger.warn('SYMBOLS_MASTER_TABLE not configured');
      return internalError('Symbols master table not configured');
    }

    // If requesting specific symbol
    if (rawPath.includes('/symbol/') && symbol) {
      logger.info(`Getting market data for symbol: ${symbol}`);

      const result = await dynamodb.send(new GetCommand({
        TableName: SYMBOLS_MASTER_TABLE,
        Key: { symbol: symbol }
      }));

      if (!result.Item) {
        return badRequest(`Symbol ${symbol} not found`);
      }

      return success({
        symbol: result.Item.symbol,
        symbolId: result.Item.symbolId,
        marketData: result.Item.marketData || {},
        lastUpdate: result.Item.lastMarketDataUpdate || null,
        dividendData: result.Item.dividendData || {}
      });
    }

    // Otherwise, get all symbols
    logger.info('Getting all symbols with market data');

    const result = await dynamodb.send(new ScanCommand({
      TableName: SYMBOLS_MASTER_TABLE,
      ProjectionExpression: 'symbol, symbolId, marketData, lastMarketDataUpdate'
    }));

    const symbols = (result.Items || []).map(item => ({
      symbol: item.symbol,
      symbolId: item.symbolId,
      marketData: item.marketData || {},
      lastUpdate: item.lastMarketDataUpdate || null
    }));

    logger.info(`Retrieved ${symbols.length} symbols with market data`);

    return success({
      symbols: symbols,
      count: symbols.length,
      timestamp: Date.now()
    });

  } catch (error) {
    logger.error('Market data handler error', {
      error: error.message,
      stack: error.stack
    });
    return internalError(error.message, error);
  }
};

/**
 * POST /api/market-data/batch
 * Get market data for multiple symbols in one request
 * Body: { symbols: ["GLD", "SLV", "XIU.TO"] }
 */
exports.getBatchMarketData = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { symbols } = body;

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return badRequest('symbols array is required');
    }

    if (symbols.length > 100) {
      return badRequest('Maximum 100 symbols per batch request');
    }

    logger.info(`Getting batch market data for ${symbols.length} symbols`);

    // Batch get from DynamoDB (max 100 items)
    const keys = symbols.map(symbol => ({ symbol }));

    const result = await dynamodb.send(new BatchGetCommand({
      RequestItems: {
        [SYMBOLS_MASTER_TABLE]: {
          Keys: keys,
          ProjectionExpression: 'symbol, symbolId, marketData, lastMarketDataUpdate'
        }
      }
    }));

    const items = result.Responses?.[SYMBOLS_MASTER_TABLE] || [];
    const marketDataMap = {};

    items.forEach(item => {
      marketDataMap[item.symbol] = {
        symbolId: item.symbolId,
        marketData: item.marketData || {},
        lastUpdate: item.lastMarketDataUpdate || null
      };
    });

    logger.info(`Retrieved market data for ${items.length} of ${symbols.length} symbols`);

    return success({
      marketData: marketDataMap,
      found: items.length,
      requested: symbols.length,
      timestamp: Date.now()
    });

  } catch (error) {
    logger.error('Batch market data handler error', {
      error: error.message,
      stack: error.stack
    });
    return internalError(error.message, error);
  }
};
