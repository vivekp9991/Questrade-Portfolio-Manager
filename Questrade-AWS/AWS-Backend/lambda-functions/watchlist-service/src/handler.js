/**
 * Watchlist Service Lambda Handler
 * Manage user watchlists
 */

const logger = require('../shared/utils/logger');
const { handleError } = require('../shared/utils/response');

// Import handlers
const watchlistHandlers = require('./handlers/watchlists');

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
  logger.info('Watchlist service request', {
    path: event.rawPath,
    method: event.requestContext.http.method
  });

  try {
    const { rawPath, requestContext } = event;
    const method = requestContext.http.method;

    // Remove stage prefix if present (e.g., /dev/api/... -> /api/...)
    const path = rawPath.replace(/^\/[^\/]+\/api\//, '/api/');

    // Health check
    if (path === '/api/watchlist/health' && method === 'GET') {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          service: 'watchlist-service',
          status: 'healthy',
          timestamp: new Date().toISOString()
        })
      };
    }

    // Watchlist routes
    if (rawPath.match(/^\/api\/watchlists\/[^\/]+$/) && method === 'GET') {
      return await watchlistHandlers.getWatchlists(event);
    }
    if (rawPath.match(/^\/api\/watchlists\/[^\/]+$/) && method === 'POST') {
      return await watchlistHandlers.createWatchlist(event);
    }
    if (rawPath.match(/^\/api\/watchlists\/[^\/]+\/[^\/]+$/) && method === 'PUT') {
      return await watchlistHandlers.updateWatchlist(event);
    }
    if (rawPath.match(/^\/api\/watchlists\/[^\/]+\/[^\/]+$/) && method === 'DELETE') {
      return await watchlistHandlers.deleteWatchlist(event);
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
