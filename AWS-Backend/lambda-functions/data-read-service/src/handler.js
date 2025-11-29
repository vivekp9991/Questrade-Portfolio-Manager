/**
 * Data Read Service Lambda Handler
 * Read-only access to accounts, positions, and activities
 */

const logger = require('../shared/utils/logger');
const { handleError } = require('../shared/utils/response');

// Import handlers
const accountHandlers = require('./handlers/accounts');
const positionHandlers = require('./handlers/positions');
const activityHandlers = require('./handlers/activities');
const statsHandlers = require('./handlers/stats');
const questradeApiTestHandlers = require('./handlers/questradeApiTest');

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
  logger.info('Data read service request', {
    path: event.rawPath,
    method: event.requestContext.http.method
  });

  try {
    const { rawPath, requestContext } = event;
    const method = requestContext.http.method;

    // Remove stage prefix if present (e.g., /dev/api/... -> /api/...)
    const path = rawPath.replace(/^\/[^\/]+\/api\//, '/api/');

    // Handle CORS preflight for all routes
    if (method === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Credentials': 'true'
        },
        body: JSON.stringify({ message: 'CORS preflight OK' })
      };
    }

    // Health check
    if (path === '/api/data/health' && method === 'GET') {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          service: 'data-read-service',
          status: 'healthy',
          timestamp: new Date().toISOString()
        })
      };
    }

    // Account routes
    if (path.match(/^\/api\/data\/accounts$/) && method === 'GET') {
      return await accountHandlers.getAccounts(event);
    }
    if (path.match(/^\/api\/data\/accounts\/[^\/]+$/) && method === 'GET') {
      return await accountHandlers.getAccount(event);
    }

    // Position routes
    if (path.match(/^\/api\/data\/positions$/) && method === 'GET') {
      return await positionHandlers.getPositions(event);
    }
    if (path.match(/^\/api\/data\/positions\/account\/[^\/]+$/) && method === 'GET') {
      return await positionHandlers.getAccountPositions(event);
    }

    // Activity routes
    if (path.match(/^\/api\/data\/activities$/) && method === 'GET') {
      return await activityHandlers.getActivities(event);
    }
    if (path.match(/^\/api\/data\/activities\/account\/[^\/]+$/) && method === 'GET') {
      return await activityHandlers.getAccountActivities(event);
    }

    // Phase 2: Account endpoints (specific routes BEFORE catch-all)
    if (path === '/api/accounts/dropdown-options' && method === 'GET') {
      return await accountHandlers.getAccountDropdownOptions(event);
    }
    if (path.match(/^\/api\/accounts\/summary\/[^\/]+$/) && method === 'GET') {
      return await accountHandlers.getAccountSummary(event);
    }
    if (path.match(/^\/api\/accounts\/detail\/[^\/]+$/) && method === 'GET') {
      return await accountHandlers.getAccountDetail(event);
    }
    if (path.match(/^\/api\/accounts\/[^\/]+$/) && method === 'GET') {
      return await accountHandlers.getPersonAccounts(event);
    }

    // Phase 2: Position endpoint
    if (path.match(/^\/api\/positions\/person\/[^\/]+$/) && method === 'GET') {
      return await positionHandlers.getPersonPositions(event);
    }

    // Phase 2: Activity endpoint
    if (path.match(/^\/api\/activities\/person\/[^\/]+$/) && method === 'GET') {
      return await activityHandlers.getPersonActivities(event);
    }

    // Stats routes
    if (path.match(/^\/api\/data\/stats$/) && method === 'GET') {
      return await statsHandlers.getStats(event);
    }

    // Statistics endpoints
    if (path === '/api/stats/sync' && method === 'GET') {
      return await statsHandlers.getSyncStats(event);
    }
    if (path === '/api/stats/data' && method === 'GET') {
      return await statsHandlers.getDataStats(event);
    }
    if (path === '/api/stats/errors' && method === 'GET') {
      return await statsHandlers.getErrorStats(event);
    }

    // Questrade API Test endpoint
    if (path === '/api/test/questrade-api' && method === 'POST') {
      return await questradeApiTestHandlers.testQuestradeApi(event);
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
