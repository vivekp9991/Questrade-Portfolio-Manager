/**
 * Portfolio Analytics Lambda Handler
 * Calculate portfolio metrics, performance, and analytics
 */

const logger = require('../shared/utils/logger');
const { handleError } = require('../shared/utils/response');

// Import handlers
const portfolioHandlers = require('./handlers/portfolio');
const performanceHandlers = require('./handlers/performance');
const allocationHandlers = require('./handlers/allocation');
const analyticsHandlers = require('./handlers/analytics');
const reportsHandlers = require('./handlers/reports');
const comparisonHandlers = require('./handlers/comparison');
const exchangeRateHandlers = require('./handlers/exchangeRate');
const positionsHandlers = require('./handlers/positions');
const cashBalancesHandlers = require('./handlers/cashBalances');
const marketDataHandlers = require('./handlers/marketData');

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
  logger.info('Portfolio analytics request', {
    path: event.rawPath,
    method: event.requestContext.http.method
  });

  try {
    const { rawPath, requestContext } = event;
    const method = requestContext.http.method;

    // Remove stage prefix if present (e.g., /dev/api/... -> /api/...)
    const path = rawPath.replace(/^\/[^\/]+\/api\//, '/api/');

    // Health check
    if (path === '/api/portfolio/health' && method === 'GET') {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          service: 'portfolio-analytics',
          status: 'healthy',
          timestamp: new Date().toISOString()
        })
      };
    }

    // Exchange rate route (check BEFORE portfolio routes to avoid regex collision)
    if (path === '/api/portfolio/exchange-rate' && method === 'GET') {
      return await exchangeRateHandlers.getExchangeRate(event);
    }

    // Positions route (check BEFORE portfolio routes to avoid regex collision)
    if (path === '/api/portfolio/positions' && method === 'GET') {
      return await positionsHandlers.getPositions(event);
    }

    // Cash balances route (check BEFORE portfolio routes to avoid regex collision)
    if (path === '/api/portfolio/cash-balances' && method === 'GET') {
      return await cashBalancesHandlers.getCashBalances(event);
    }

    // Market data routes (SINGLE SOURCE OF TRUTH from symbols-master)
    if (path === '/api/market-data/symbols' && method === 'GET') {
      return await marketDataHandlers.getMarketData(event);
    }

    if (path.match(/^\/api\/market-data\/symbol\/[^\/]+$/) && method === 'GET') {
      return await marketDataHandlers.getMarketData(event);
    }

    if (path === '/api/market-data/batch' && method === 'POST') {
      return await marketDataHandlers.getBatchMarketData(event);
    }

    // Portfolio routes
    if (rawPath.match(/^\/api\/portfolio\/[^\/]+$/) && method === 'GET') {
      return await portfolioHandlers.getPortfolio(event);
    }

    // Performance routes
    if (rawPath.match(/^\/api\/performance\/[^\/]+$/) && method === 'GET') {
      return await performanceHandlers.getPerformance(event);
    }

    // Allocation routes
    if (rawPath.match(/^\/api\/allocation\/[^\/]+$/) && method === 'GET') {
      return await allocationHandlers.getAllocation(event);
    }

    // Analytics routes
    if (rawPath.match(/^\/api\/analytics\/[^\/]+$/) && method === 'GET') {
      return await analyticsHandlers.getAnalytics(event);
    }

    // Reports routes
    if (rawPath.match(/^\/api\/reports\/[^\/]+$/) && method === 'GET') {
      return await reportsHandlers.getReports(event);
    }

    // Comparison routes
    if (rawPath.match(/^\/api\/comparison\/[^\/]+$/) && method === 'GET') {
      return await comparisonHandlers.getComparison(event);
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
