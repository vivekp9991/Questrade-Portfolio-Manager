/**
 * Portfolio Handlers
 * Get portfolio overview and summary
 */

const logger = require('../../shared/utils/logger');
const response = require('../../shared/utils/response');
const portfolioService = require('../services/portfolioService');

/**
 * GET /api/portfolio/:personName
 * Get complete portfolio for a person
 */
async function getPortfolio(event) {
  try {
    const personName = event.pathParameters?.personName;
    const accountId = event.queryStringParameters?.accountId;

    if (!personName) {
      return response.badRequest('personName is required');
    }

    const portfolio = await portfolioService.calculatePortfolio(personName, accountId);

    return response.success(portfolio);

  } catch (error) {
    logger.error('Get portfolio handler error', { error: error.message });
    return response.handleError(error);
  }
}

module.exports = {
  getPortfolio
};
