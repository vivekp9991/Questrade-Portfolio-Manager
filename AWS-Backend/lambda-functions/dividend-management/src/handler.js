/**
 * Dividend Management Lambda Handler
 * Manages symbol dividends, yield exclusions, and dividend overrides
 */

const logger = require('../shared/utils/logger');
const { handleError } = require('../shared/utils/response');

// Import handlers
const symbolDividendHandlers = require('./handlers/symbolDividends');
const yieldExclusionHandlers = require('./handlers/yieldExclusions');

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
  logger.info('Dividend management request', {
    path: event.rawPath,
    method: event.requestContext.http.method
  });

  try {
    const { rawPath, requestContext } = event;
    const method = requestContext.http.method;

    // Remove stage prefix if present
    const path = rawPath.replace(/^\/[^\/]+\/api\//, '/api/');

    // ==================== Symbol Dividends Routes ====================

    // GET /api/symbol-dividends/all
    if (path === '/api/symbol-dividends/all' && method === 'GET') {
      return await symbolDividendHandlers.getAllSymbolDividends(event);
    }

    // GET /api/symbol-dividends/symbol/:symbol
    if (path.match(/^\/api\/symbol-dividends\/symbol\/[^\/]+$/) && method === 'GET') {
      return await symbolDividendHandlers.getSymbolDividend(event);
    }

    // POST /api/symbol-dividends/symbol/:symbol
    if (path.match(/^\/api\/symbol-dividends\/symbol\/[^\/]+$/) && method === 'POST') {
      return await symbolDividendHandlers.setSymbolDividend(event);
    }

    // DELETE /api/symbol-dividends/symbol/:symbol
    if (path.match(/^\/api\/symbol-dividends\/symbol\/[^\/]+$/) && method === 'DELETE') {
      return await symbolDividendHandlers.deleteSymbolDividend(event);
    }

    // POST /api/symbol-dividends/bulk
    if (path === '/api/symbol-dividends/bulk' && method === 'POST') {
      return await symbolDividendHandlers.bulkUpdateSymbolDividends(event);
    }

    // POST /api/symbol-dividends/symbol/:symbol/reset-override
    if (path.match(/^\/api\/symbol-dividends\/symbol\/[^\/]+\/reset-override$/) && method === 'POST') {
      return await symbolDividendHandlers.resetSymbolDividendOverride(event);
    }

    // ==================== Yield Exclusions Routes (GLOBAL) ====================

    // GET /api/yield-exclusions - Get all excluded symbols
    if (path === '/api/yield-exclusions' && method === 'GET') {
      return await yieldExclusionHandlers.getAllYieldExclusions(event);
    }

    // GET /api/yield-exclusions/:symbol - Check if symbol is excluded
    if (path.match(/^\/api\/yield-exclusions\/[^\/]+$/) && method === 'GET') {
      return await yieldExclusionHandlers.getYieldExclusion(event);
    }

    // POST /api/yield-exclusions/:symbol - Exclude symbol from YoC
    if (path.match(/^\/api\/yield-exclusions\/[^\/]+$/) && method === 'POST') {
      return await yieldExclusionHandlers.addYieldExclusion(event);
    }

    // DELETE /api/yield-exclusions/:symbol - Remove exclusion
    if (path.match(/^\/api\/yield-exclusions\/[^\/]+$/) && method === 'DELETE') {
      return await yieldExclusionHandlers.removeYieldExclusion(event);
    }

    // Route not found
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        message: 'Route not found',
        requestedPath: path
      })
    };

  } catch (error) {
    logger.error('Handler error', { error: error.message, stack: error.stack });
    return handleError(error);
  }
};
