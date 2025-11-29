/**
 * Quote Handlers
 * Get real-time quotes
 */

const logger = require('../../shared/utils/logger');
const response = require('../../shared/utils/response');

/**
 * GET /api/quotes/:symbols
 * Get quotes for symbols (comma-separated)
 */
async function getQuotes(event) {
  try {
    const symbolsParam = event.pathParameters?.symbols;

    if (!symbolsParam) {
      return response.badRequest('symbols parameter is required');
    }

    const symbols = symbolsParam.split(',').map(s => s.trim());

    // Placeholder - would fetch from Questrade API
    const quotes = symbols.map(symbol => ({
      symbol,
      lastPrice: 100.0,
      bidPrice: 99.95,
      askPrice: 100.05,
      volume: 1000000,
      timestamp: new Date().toISOString(),
      message: 'Real-time quote integration to be implemented'
    }));

    return response.success({
      quotes,
      count: quotes.length
    });

  } catch (error) {
    logger.error('Get quotes handler error', { error: error.message });
    return response.handleError(error);
  }
}

module.exports = {
  getQuotes
};
