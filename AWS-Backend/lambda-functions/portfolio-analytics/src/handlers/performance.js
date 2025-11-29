/**
 * Performance Handlers
 * Calculate portfolio performance metrics
 */

const logger = require('../../shared/utils/logger');
const response = require('../../shared/utils/response');
const portfolioService = require('../services/portfolioService');

/**
 * GET /api/performance/:personName
 * Get portfolio performance metrics
 */
async function getPerformance(event) {
  try {
    const personName = event.pathParameters?.personName;
    const period = event.queryStringParameters?.period || 'all'; // all, 1Y, 6M, 3M, 1M

    if (!personName) {
      return response.badRequest('personName is required');
    }

    const performance = await portfolioService.calculatePerformance(personName, period);

    return response.success(performance);

  } catch (error) {
    logger.error('Get performance handler error', { error: error.message });
    return response.handleError(error);
  }
}

module.exports = {
  getPerformance
};
