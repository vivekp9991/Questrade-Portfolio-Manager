/**
 * Auth Handlers
 * Handle Questrade token management and authentication
 */

const logger = require('../../shared/utils/logger');
const response = require('../../shared/utils/response');
const tokenManager = require('../services/tokenManager');
const personService = require('../services/personService');

/**
 * POST /api/auth/setup-person
 * Setup initial Questrade refresh token for a person
 */
async function setupPerson(event) {
  try {
    const body = JSON.parse(event.body || '{}');
    const { personName, refreshToken, userId } = body;

    if (!personName || !refreshToken) {
      return response.badRequest('personName and refreshToken are required');
    }

    // Check if person exists, create if not
    const personExists = await personService.personExists(personName);
    if (!personExists) {
      await personService.createPerson({
        personName,
        userId,
        displayName: personName
      });
      logger.info(`Person '${personName}' created during token setup`);
    }

    // Setup token
    const result = await tokenManager.setupPersonToken(personName, refreshToken);

    return response.success(result, 'Person token setup successfully');

  } catch (error) {
    logger.error('Setup person handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * POST /api/auth/refresh-token/:personName
 * Manually refresh Questrade access token for a person
 */
async function refreshToken(event) {
  try {
    const personName = event.pathParameters?.personName;

    if (!personName) {
      return response.badRequest('personName is required');
    }

    const tokenData = await tokenManager.refreshAccessToken(personName);

    return response.success({
      personName,
      apiServer: tokenData.apiServer,
      expiresAt: tokenData.expiresAt,
      expiresIn: Math.round((tokenData.expiresAt - Date.now()) / 1000)
    }, 'Token refreshed successfully');

  } catch (error) {
    logger.error('Refresh token handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * GET /api/auth/token-status/:personName
 * Get token status for a person
 */
async function getTokenStatus(event) {
  try {
    const personName = event.pathParameters?.personName;

    if (!personName) {
      return response.badRequest('personName is required');
    }

    const status = await tokenManager.getTokenStatus(personName);

    return response.success(status);

  } catch (error) {
    logger.error('Get token status handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * GET /api/auth/access-token/:personName
 * Get a valid access token for a person (from cache, DB, or refresh)
 */
async function getAccessToken(event) {
  try {
    const personName = event.pathParameters?.personName;

    if (!personName) {
      return response.badRequest('personName is required');
    }

    // Check for force refresh query parameter
    const forceRefresh = event.queryStringParameters?.refresh !== undefined ||
                          event.queryStringParameters?.force === 'true';

    let tokenData;
    if (forceRefresh) {
      logger.info(`Force refresh requested for ${personName}`);
      tokenData = await tokenManager.refreshAccessToken(personName);
    } else {
      tokenData = await tokenManager.getValidAccessToken(personName);
    }

    // Return the access token for browser to connect directly to Questrade WebSocket
    return response.success({
      accessToken: tokenData.accessToken,
      apiServer: tokenData.apiServer,
      expiresAt: tokenData.expiresAt,
      expiresIn: Math.round((tokenData.expiresAt - Date.now()) / 1000)
    });

  } catch (error) {
    logger.error('Get access token handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * POST /api/auth/test-connection/:personName
 * Test connection to Questrade API
 */
async function testConnection(event) {
  try {
    const personName = event.pathParameters?.personName;

    if (!personName) {
      return response.badRequest('personName is required');
    }

    const result = await tokenManager.testConnection(personName);

    return response.success(result, 'Connection test successful');

  } catch (error) {
    logger.error('Test connection handler error', { error: error.message });
    return response.handleError(error);
  }
}

module.exports = {
  setupPerson,
  refreshToken,
  getTokenStatus,
  getAccessToken,
  testConnection
};
