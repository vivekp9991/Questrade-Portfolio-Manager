/**
 * Auth Service Lambda Handler
 * Routes requests to appropriate handlers based on path and method
 */

const logger = require('../shared/utils/logger');
const { handleError } = require('../shared/utils/response');

// Import route handlers
const loginHandlers = require('./handlers/login');
const personHandlers = require('./handlers/persons');
const authHandlers = require('./handlers/auth');
const tokenHandlers = require('./handlers/tokens');

/**
 * Main Lambda handler
 * Routes requests based on HTTP path and method
 */
exports.handler = async (event) => {
  logger.info('Auth service request', {
    path: event.rawPath,
    method: event.requestContext.http.method
  });

  try {
    const { rawPath, requestContext } = event;
    const method = requestContext.http.method;

    // Remove stage prefix if present (e.g., /dev/api/... -> /api/...)
    const path = rawPath.replace(/^\/[^\/]+\/api\//, '/api/');

    // Parse route and params
    const pathParts = path.split('/').filter(Boolean); // ['api', 'login', ...]

    // Extract path parameters for parameterized routes
    event.pathParameters = event.pathParameters || {};
    if (pathParts.length >= 4 && pathParts[0] === 'api' && pathParts[1] === 'auth') {
      event.pathParameters.personName = pathParts[3];
    }
    if (pathParts.length >= 3 && pathParts[0] === 'api' && pathParts[1] === 'tokens') {
      event.pathParameters.personName = pathParts[2];
    }
    if (pathParts.length >= 3 && pathParts[0] === 'api' && pathParts[1] === 'persons') {
      event.pathParameters.personName = pathParts[2];
    }

    // Health check
    if (path === '/api/auth/health' && method === 'GET') {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          service: 'auth-service',
          status: 'healthy',
          timestamp: new Date().toISOString()
        })
      };
    }

    // Route to appropriate handler
    // Login routes
    if (path === '/api/login' && method === 'POST') {
      return await loginHandlers.login(event);
    }
    if (path === '/api/login/verify' && method === 'POST') {
      return await loginHandlers.verifyToken(event);
    }
    if (path === '/api/login/refresh' && method === 'POST') {
      return await loginHandlers.refreshJWT(event);
    }

    // Person routes
    if (path === '/api/persons' && method === 'GET') {
      return await personHandlers.getAllPersons(event);
    }
    if (path === '/api/persons' && method === 'POST') {
      return await personHandlers.createPerson(event);
    }
    if (path.match(/^\/api\/persons\/[^\/]+$/) && method === 'GET') {
      return await personHandlers.getPerson(event);
    }
    if (path.match(/^\/api\/persons\/[^\/]+$/) && method === 'PUT') {
      return await personHandlers.updatePerson(event);
    }
    if (path.match(/^\/api\/persons\/[^\/]+$/) && method === 'DELETE') {
      return await personHandlers.deletePerson(event);
    }
    if (path.match(/^\/api\/persons\/[^\/]+\/token$/) && method === 'POST') {
      return await personHandlers.updatePersonToken(event);
    }

    // Auth routes
    if (path === '/api/auth/setup-person' && method === 'POST') {
      return await authHandlers.setupPerson(event);
    }
    if (path.match(/^\/api\/auth\/refresh-token\/[^\/]+$/) && method === 'POST') {
      return await authHandlers.refreshToken(event);
    }
    if (path.match(/^\/api\/auth\/token-status\/[^\/]+$/) && method === 'GET') {
      return await authHandlers.getTokenStatus(event);
    }
    if (path.match(/^\/api\/auth\/access-token\/[^\/]+$/) && method === 'GET') {
      return await authHandlers.getAccessToken(event);
    }
    if (path.match(/^\/api\/auth\/test-connection\/[^\/]+$/) && method === 'POST') {
      return await authHandlers.testConnection(event);
    }

    // Token routes
    if (path === '/api/tokens' && method === 'GET') {
      return await tokenHandlers.getAllTokens(event);
    }
    if (path.match(/^\/api\/tokens\/[^\/]+$/) && method === 'GET') {
      return await tokenHandlers.getPersonTokens(event);
    }
    if (path === '/api/tokens/expired' && method === 'DELETE') {
      return await tokenHandlers.deleteExpiredTokens(event);
    }
    if (path === '/api/tokens/stats/summary' && method === 'GET') {
      return await tokenHandlers.getTokenStats(event);
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
