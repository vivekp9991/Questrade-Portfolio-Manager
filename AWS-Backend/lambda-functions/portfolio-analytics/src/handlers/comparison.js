/**
 * Comparison Handlers
 * Compare portfolios or periods
 */

const logger = require('../../shared/utils/logger');
const response = require('../../shared/utils/response');

/**
 * GET /api/comparison/:personName
 * Compare portfolio performance (placeholder)
 */
async function getComparison(event) {
  try {
    const personName = event.pathParameters?.personName;
    const compareTo = event.queryStringParameters?.compareTo; // Another person or benchmark

    if (!personName) {
      return response.badRequest('personName is required');
    }

    // Placeholder - to be implemented
    const comparison = {
      personName,
      compareTo,
      message: 'Portfolio comparison - To be implemented',
      availableComparisons: [
        'Compare to market indices (S&P 500, TSX)',
        'Compare to another person',
        'Compare periods (YoY, QoQ)'
      ]
    };

    return response.success(comparison);

  } catch (error) {
    logger.error('Get comparison handler error', { error: error.message });
    return response.handleError(error);
  }
}

module.exports = {
  getComparison
};
