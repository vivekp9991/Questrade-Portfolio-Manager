/**
 * Market Data Service Lambda Handler
 * Fetch market data, quotes, and symbols
 */

const logger = require('../shared/utils/logger');
const { handleError } = require('../shared/utils/response');

// Import handlers
const marketHandlers = require('./handlers/markets');
const quoteHandlers = require('./handlers/quotes');
const symbolHandlers = require('./handlers/symbols');
const dividendManagerHandlers = require('./handlers/dividendManager');

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
  logger.info('Market data service request', {
    path: event.rawPath,
    method: event.requestContext.http.method
  });

  try {
    const { rawPath, requestContext } = event;
    const method = requestContext.http.method;

    // Remove stage prefix if present (e.g., /dev/api/... -> /api/...)
    const path = rawPath.replace(/^\/[^\/]+\/api\//, '/api/');

    // Health check
    if (path === '/api/market/health' && method === 'GET') {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          service: 'market-data-service',
          status: 'healthy',
          timestamp: new Date().toISOString()
        })
      };
    }

    // Market routes
    if (path === '/api/markets' && method === 'GET') {
      return await marketHandlers.getMarkets(event);
    }

    // Quote routes
    if (rawPath.match(/^\/api\/quotes\/[^\/]+$/) && method === 'GET') {
      return await quoteHandlers.getQuotes(event);
    }

    // Symbol routes
    if (path === '/api/symbols' && method === 'GET') {
      return await symbolHandlers.getSymbols(event);
    }
    if (path === '/api/symbols/search' && method === 'GET') {
      return await symbolHandlers.searchSymbols(event);
    }
    if (path === '/api/symbols/lookup' && method === 'POST') {
      return await symbolHandlers.lookupSymbols(event);
    }
    if (path === '/api/symbols/stream-port' && method === 'POST') {
      return await symbolHandlers.getStreamPort(event);
    }

    // Dividend Manager routes
    if (path === '/api/dividend-manager/symbols' && method === 'GET') {
      return await dividendManagerHandlers.getAllSymbols(event);
    }
    if (path.match(/^\/api\/dividend-manager\/symbols\/[^\/]+$/) && method === 'GET') {
      return await dividendManagerHandlers.getSymbol(event);
    }
    if (path.match(/^\/api\/dividend-manager\/symbols\/[^\/]+\/dividend$/) && method === 'PUT') {
      return await dividendManagerHandlers.updateDividend(event);
    }
    if (path.match(/^\/api\/dividend-manager\/symbols\/[^\/]+\/yoc-settings$/) && method === 'PUT') {
      return await dividendManagerHandlers.updateYOCSettings(event);
    }
    if (path.match(/^\/api\/dividend-manager\/symbols\/[^\/]+\/accept-questrade$/) && method === 'POST') {
      return await dividendManagerHandlers.acceptQuestradeDividend(event);
    }
    if (path === '/api/dividend-manager/sync' && method === 'POST') {
      return await dividendManagerHandlers.triggerSync(event);
    }

    // Route not found
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        message: 'Route not found'
      })
    };

  } catch (error) {
    logger.error('Handler error', { error: error.message, stack: error.stack });
    return handleError(error);
  }
};
