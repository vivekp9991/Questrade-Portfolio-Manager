/**
 * Allocation Handlers
 * Calculate asset allocation
 */

const logger = require('../../shared/utils/logger');
const response = require('../../shared/utils/response');
const portfolioService = require('../services/portfolioService');

/**
 * GET /api/allocation/:personName
 * Get asset allocation breakdown
 */
async function getAllocation(event) {
  try {
    const personName = event.pathParameters?.personName;
    const groupBy = event.queryStringParameters?.groupBy || 'sector'; // sector, assetClass, currency

    if (!personName) {
      return response.badRequest('personName is required');
    }

    const allocation = await portfolioService.calculateAllocation(personName, groupBy);

    return response.success(allocation);

  } catch (error) {
    logger.error('Get allocation handler error', { error: error.message });
    return response.handleError(error);
  }
}

module.exports = {
  getAllocation
};
