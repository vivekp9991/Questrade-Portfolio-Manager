/**
 * Login Handlers
 * Handle user authentication and JWT operations
 */

const logger = require('../../shared/utils/logger');
const response = require('../../shared/utils/response');
const userService = require('../services/userService');

/**
 * POST /api/login
 * User login - validates credentials and returns JWT token
 */
async function login(event) {
  try {
    const body = JSON.parse(event.body || '{}');
    const { username, password } = body;

    // Validate input
    if (!username || !password) {
      return response.badRequest('Username and password are required');
    }

    // Login user
    const result = await userService.login(username, password);

    return response.success({
      token: result.token,
      user: result.user
    }, 'Login successful');

  } catch (error) {
    logger.error('Login handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * POST /api/login/verify
 * Verify JWT token validity
 */
async function verifyToken(event) {
  try {
    const token = event.headers?.authorization?.replace('Bearer ', '') ||
                  event.headers?.Authorization?.replace('Bearer ', '');

    if (!token) {
      return response.unauthorized('No token provided');
    }

    // Verify token
    const decoded = userService.verifyToken(token);

    // Get user from database
    const user = await userService.getUser(decoded.userId);

    if (!user || !user.isActive) {
      return response.unauthorized('Invalid token or inactive user');
    }

    return response.success({
      user: {
        userId: user.userId,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        role: user.role
      }
    }, 'Token is valid');

  } catch (error) {
    logger.error('Token verification handler error', { error: error.message });

    if (error.name === 'TokenExpiredError') {
      return response.unauthorized('Token has expired');
    }
    if (error.name === 'JsonWebTokenError') {
      return response.unauthorized('Invalid token');
    }

    return response.handleError(error);
  }
}

/**
 * POST /api/login/refresh
 * Refresh JWT token (extends session)
 */
async function refreshJWT(event) {
  try {
    const token = event.headers?.authorization?.replace('Bearer ', '') ||
                  event.headers?.Authorization?.replace('Bearer ', '');

    if (!token) {
      return response.unauthorized('No token provided');
    }

    // Refresh token
    const result = await userService.refreshToken(token);

    return response.success({
      token: result.token,
      user: result.user
    }, 'Token refreshed successfully');

  } catch (error) {
    logger.error('Token refresh handler error', { error: error.message });
    return response.handleError(error);
  }
}

module.exports = {
  login,
  verifyToken,
  refreshJWT
};
