/**
 * Reports Handlers
 * Generate portfolio reports
 */

const logger = require('../../shared/utils/logger');
const response = require('../../shared/utils/response');

/**
 * GET /api/reports/:personName
 * Generate portfolio reports (placeholder)
 */
async function getReports(event) {
  try {
    const personName = event.pathParameters?.personName;
    const reportType = event.queryStringParameters?.type || 'summary'; // summary, detailed, tax

    if (!personName) {
      return response.badRequest('personName is required');
    }

    // Placeholder - to be implemented
    const report = {
      personName,
      reportType,
      message: 'Report generation - To be implemented',
      availableReports: [
        'Portfolio summary',
        'Performance report',
        'Tax report',
        'Dividend income report'
      ]
    };

    return response.success(report);

  } catch (error) {
    logger.error('Get reports handler error', { error: error.message });
    return response.handleError(error);
  }
}

module.exports = {
  getReports
};
