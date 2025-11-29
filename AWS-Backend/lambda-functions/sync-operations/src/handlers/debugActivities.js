/**
 * Debug Activities Handler
 * Fetch raw activities from Questrade API for debugging
 */

const logger = require('../../shared/utils/logger');
const response = require('../../shared/utils/response');
const questradeApi = require('../services/questradeApiService');

/**
 * POST /api/debug/activities/:personName/:accountNumber
 * Fetch raw activities from Questrade for specific date range
 */
async function fetchActivitiesDebug(event) {
  try {
    // Extract parameters from path
    let personName = event.pathParameters?.personName;
    let accountNumber = event.pathParameters?.accountNumber;

    // Fallback: extract from rawPath
    if ((!personName || !accountNumber) && event.rawPath) {
      const match = event.rawPath.match(/\/api\/debug\/activities\/([^\/]+)\/([^\/]+)/);
      if (match) {
        personName = personName || match[1];
        accountNumber = accountNumber || match[2];
      }
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const { startDate, endDate, month, year } = body;

    if (!personName || !accountNumber) {
      return response.badRequest('personName and accountNumber are required');
    }

    // Parse dates
    let start, end;

    if (month && year) {
      // Fetch specific month
      start = new Date(year, month - 1, 1); // month is 1-indexed
      end = new Date(year, month, 0, 23, 59, 59); // Last day of month
      logger.info(`Fetching activities for ${personName}/${accountNumber} for ${year}-${month}`);
    } else if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
      logger.info(`Fetching activities for ${personName}/${accountNumber} from ${startDate} to ${endDate}`);
    } else {
      return response.badRequest('Either (month, year) or (startDate, endDate) are required');
    }

    // Format dates for Questrade
    const formatQuestradeDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');

      // EST/EDT offset
      const offset = -date.getTimezoneOffset();
      const offsetHours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
      const offsetMinutes = String(Math.abs(offset) % 60).padStart(2, '0');
      const offsetSign = offset >= 0 ? '+' : '-';

      return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offsetSign}${offsetHours}:${offsetMinutes}`;
    };

    const startTime = formatQuestradeDate(start);
    const endTime = formatQuestradeDate(end);

    logger.info(`[DEBUG] Querying Questrade API: ${startTime} to ${endTime}`);

    // Fetch activities directly from Questrade API
    const activities = await questradeApi.getActivities(
      personName,
      accountNumber,
      startTime,
      endTime
    );

    logger.info(`[DEBUG] Received ${activities.length} activities from Questrade API`);

    // Return raw activities
    return response.success({
      personName,
      accountNumber,
      startTime,
      endTime,
      count: activities.length,
      activities: activities
    }, `Fetched ${activities.length} activities from Questrade API`);

  } catch (error) {
    logger.error('Debug activities handler error', { error: error.message });
    return response.handleError(error);
  }
}

module.exports = {
  fetchActivitiesDebug
};
