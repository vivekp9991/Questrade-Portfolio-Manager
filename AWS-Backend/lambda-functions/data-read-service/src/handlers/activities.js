/**
 * Activity Handlers
 * Read transaction/activity data
 */

const logger = require('../../shared/utils/logger');
const response = require('../../shared/utils/response');
const { query } = require('../../shared/utils/dynamodb');

const ACTIVITIES_TABLE = process.env.ACTIVITIES_TABLE;

/**
 * GET /api/data/activities?personName=xxx
 * Get all activities for a person (across all accounts)
 */
async function getActivities(event) {
  try {
    const personName = event.queryStringParameters?.personName;
    const startDate = event.queryStringParameters?.startDate;
    const endDate = event.queryStringParameters?.endDate;
    const limit = parseInt(event.queryStringParameters?.limit || '100');

    if (!personName) {
      return response.badRequest('personName query parameter is required');
    }

    let keyConditionExpression = 'personName = :personName';
    const expressionValues = { ':personName': personName };

    if (startDate && endDate) {
      keyConditionExpression += ' AND activityDateTime BETWEEN :startDate AND :endDate';
      expressionValues[':startDate'] = startDate;
      expressionValues[':endDate'] = endDate;
    }

    const result = await query(
      ACTIVITIES_TABLE,
      keyConditionExpression,
      expressionValues,
      {
        IndexName: 'personName-date-index',
        Limit: limit,
        ScanIndexForward: false // Most recent first
      }
    );

    return response.success({
      personName,
      activities: result.items,
      count: result.items.length
    });

  } catch (error) {
    logger.error('Get activities handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * GET /api/data/activities/account/:accountId
 * Get activities for a specific account
 */
async function getAccountActivities(event) {
  try {
    const accountId = event.pathParameters?.accountId;
    const limit = parseInt(event.queryStringParameters?.limit || '100');

    if (!accountId) {
      return response.badRequest('accountId is required');
    }

    const result = await query(
      ACTIVITIES_TABLE,
      'accountId = :accountId',
      { ':accountId': accountId },
      {
        Limit: limit,
        ScanIndexForward: false // Most recent first
      }
    );

    // Get personName from first activity if available
    const personName = result.items.length > 0 ? result.items[0].personName : null;

    return response.success({
      personName,
      accountId,
      activities: result.items,
      count: result.items.length
    });

  } catch (error) {
    logger.error('Get account activities handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * GET /api/activities/person/:personName
 * Get all activities for a person (Phase 2 endpoint)
 */
async function getPersonActivities(event) {
  try {
    const personName = event.pathParameters?.personName;
    const limit = parseInt(event.queryStringParameters?.limit || '100');
    const type = event.queryStringParameters?.type;
    const symbol = event.queryStringParameters?.symbol;
    const startDate = event.queryStringParameters?.startDate;
    const endDate = event.queryStringParameters?.endDate;

    if (!personName) {
      return response.badRequest('personName is required');
    }

    let keyConditionExpression = 'personName = :personName';
    const expressionValues = { ':personName': personName };
    let filterExpression = [];

    // Handle date range in key condition if provided
    if (startDate && endDate) {
      keyConditionExpression += ' AND activityDateTime BETWEEN :startDate AND :endDate';
      expressionValues[':startDate'] = startDate;
      expressionValues[':endDate'] = endDate;
    } else if (startDate) {
      keyConditionExpression += ' AND activityDateTime >= :startDate';
      expressionValues[':startDate'] = startDate;
    } else if (endDate) {
      keyConditionExpression += ' AND activityDateTime <= :endDate';
      expressionValues[':endDate'] = endDate;
    }

    // Add filters for type and symbol
    if (type) {
      filterExpression.push('#type = :type');
      expressionValues[':type'] = type;
    }
    if (symbol) {
      filterExpression.push('symbol = :symbol');
      expressionValues[':symbol'] = symbol;
    }

    const queryOptions = {
      IndexName: 'personName-date-index',
      Limit: limit,
      ScanIndexForward: false // Most recent first
    };

    if (filterExpression.length > 0) {
      queryOptions.FilterExpression = filterExpression.join(' AND ');
      queryOptions.ExpressionAttributeNames = { '#type': 'type' };
    }

    const result = await query(
      ACTIVITIES_TABLE,
      keyConditionExpression,
      expressionValues,
      queryOptions
    );

    // Sort by transaction date descending
    const activities = result.items.sort((a, b) => {
      const dateA = new Date(a.transactionDate || a.activityDateTime);
      const dateB = new Date(b.transactionDate || b.activityDateTime);
      return dateB - dateA;
    });

    return response.success({
      personName,
      activities,
      count: activities.length,
      filters: { type, symbol, startDate, endDate, limit }
    }, `Retrieved ${activities.length} activities for ${personName}`);

  } catch (error) {
    logger.error('Get person activities handler error', { error: error.message });
    return response.handleError(error);
  }
}

module.exports = {
  getActivities,
  getAccountActivities,
  getPersonActivities
};
