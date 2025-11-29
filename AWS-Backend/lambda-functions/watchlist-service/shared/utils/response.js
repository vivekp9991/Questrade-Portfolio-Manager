/**
 * API Response Helper Functions
 * Standardizes Lambda response format for API Gateway
 */

const logger = require('./logger');

/**
 * Create a standardized API response
 */
function createResponse(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*', // Configure based on your CORS needs
      'Access-Control-Allow-Credentials': true,
      ...headers
    },
    body: JSON.stringify(body)
  };
}

/**
 * Success response (200)
 */
function success(data, message = 'Success') {
  return createResponse(200, {
    success: true,
    message,
    data
  });
}

/**
 * Created response (201)
 */
function created(data, message = 'Resource created successfully') {
  return createResponse(201, {
    success: true,
    message,
    data
  });
}

/**
 * No content response (204)
 */
function noContent() {
  return {
    statusCode: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true
    }
  };
}

/**
 * Bad request response (400)
 */
function badRequest(message = 'Bad request', errors = null) {
  return createResponse(400, {
    success: false,
    message,
    ...(errors && { errors })
  });
}

/**
 * Unauthorized response (401)
 */
function unauthorized(message = 'Unauthorized') {
  return createResponse(401, {
    success: false,
    message
  });
}

/**
 * Forbidden response (403)
 */
function forbidden(message = 'Forbidden') {
  return createResponse(403, {
    success: false,
    message
  });
}

/**
 * Not found response (404)
 */
function notFound(message = 'Resource not found') {
  return createResponse(404, {
    success: false,
    message
  });
}

/**
 * Conflict response (409)
 */
function conflict(message = 'Resource already exists') {
  return createResponse(409, {
    success: false,
    message
  });
}

/**
 * Internal server error response (500)
 */
function internalError(message = 'Internal server error', error = null) {
  // Log the error for debugging
  logger.error('Internal server error', { message, error: error?.message, stack: error?.stack });

  return createResponse(500, {
    success: false,
    message,
    ...(process.env.NODE_ENV !== 'production' && error && {
      error: error.message,
      stack: error.stack
    })
  });
}

/**
 * Service unavailable response (503)
 */
function serviceUnavailable(message = 'Service temporarily unavailable') {
  return createResponse(503, {
    success: false,
    message
  });
}

/**
 * Handle errors and return appropriate response
 */
function handleError(error) {
  logger.error('Error occurred', {
    message: error.message,
    stack: error.stack,
    name: error.name
  });

  // Handle specific error types
  if (error.name === 'ValidationError') {
    return badRequest('Validation failed', error.details);
  }

  if (error.name === 'UnauthorizedError' || error.name === 'JsonWebTokenError') {
    return unauthorized(error.message);
  }

  if (error.name === 'TokenExpiredError') {
    return unauthorized('Token has expired');
  }

  if (error.name === 'NotFoundError') {
    return notFound(error.message);
  }

  if (error.name === 'ConflictError') {
    return conflict(error.message);
  }

  // Default to internal server error
  return internalError(error.message, error);
}

module.exports = {
  createResponse,
  success,
  created,
  noContent,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  internalError,
  serviceUnavailable,
  handleError
};
