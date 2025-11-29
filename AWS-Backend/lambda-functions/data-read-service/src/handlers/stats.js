/**
 * Stats Handlers
 * Get summary statistics
 */

const logger = require('../../shared/utils/logger');
const response = require('../../shared/utils/response');
const { query } = require('../../shared/utils/dynamodb');

const ACCOUNTS_TABLE = process.env.ACCOUNTS_TABLE;
const POSITIONS_TABLE = process.env.POSITIONS_TABLE;
const ACTIVITIES_TABLE = process.env.ACTIVITIES_TABLE;
const SYNC_HISTORY_TABLE = process.env.SYNC_HISTORY_TABLE;

/**
 * GET /api/data/stats?personName=xxx
 * Get summary statistics for a person
 */
async function getStats(event) {
  try {
    const personName = event.queryStringParameters?.personName;

    if (!personName) {
      return response.badRequest('personName query parameter is required');
    }

    // Get accounts count
    const accountsResult = await query(
      ACCOUNTS_TABLE,
      'personName = :personName',
      { ':personName': personName },
      { IndexName: 'personName-index' }
    );

    // Get positions count and total value
    const positionsResult = await query(
      POSITIONS_TABLE,
      'personName = :personName',
      { ':personName': personName },
      { IndexName: 'personName-symbol-index' }
    );

    const totalMarketValue = positionsResult.items.reduce(
      (sum, pos) => sum + (pos.currentMarketValue || 0),
      0
    );

    // Get recent activities count (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const activitiesResult = await query(
      ACTIVITIES_TABLE,
      'personName = :personName AND activityDateTime > :startDate',
      {
        ':personName': personName,
        ':startDate': thirtyDaysAgo
      },
      {
        IndexName: 'personName-date-index',
        Select: 'COUNT'
      }
    );

    const stats = {
      personName,
      accounts: accountsResult.items.length,
      positions: positionsResult.items.length,
      totalMarketValue,
      recentActivities: activitiesResult.items.length,
      lastUpdated: Date.now()
    };

    return response.success(stats);

  } catch (error) {
    logger.error('Get stats handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * GET /api/stats/sync
 * Get sync statistics across all persons
 */
async function getSyncStats(event) {
  try {
    logger.info('Getting sync statistics');

    const { scan } = require('../../shared/utils/dynamodb');

    // Get all sync history
    const result = await scan(SYNC_HISTORY_TABLE);
    const syncHistory = result.items || [];

    // Calculate stats
    const totalSyncs = syncHistory.length;
    const successfulSyncs = syncHistory.filter(s => s.status === 'success').length;
    const failedSyncs = syncHistory.filter(s => s.status === 'error').length;

    // Get last 24 hours syncs
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    const recentSyncs = syncHistory.filter(s => s.syncTimestamp > oneDayAgo);

    // Get latest sync per person
    const personSyncs = {};
    syncHistory.forEach(sync => {
      if (!personSyncs[sync.personName] || sync.syncTimestamp > personSyncs[sync.personName].syncTimestamp) {
        personSyncs[sync.personName] = sync;
      }
    });

    const stats = {
      totalSyncs,
      successfulSyncs,
      failedSyncs,
      successRate: totalSyncs > 0 ? ((successfulSyncs / totalSyncs) * 100).toFixed(2) : 0,
      recentSyncs: recentSyncs.length,
      lastSyncByPerson: Object.keys(personSyncs).map(personName => ({
        personName,
        lastSync: personSyncs[personName].syncTimestamp,
        status: personSyncs[personName].status
      }))
    };

    return response.success(stats, 'Sync statistics retrieved');

  } catch (error) {
    logger.error('Get sync stats handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * GET /api/stats/data
 * Get data statistics (accounts, positions, activities)
 */
async function getDataStats(event) {
  try {
    logger.info('Getting data statistics');

    const { scan } = require('../../shared/utils/dynamodb');

    // Get counts from each table
    const [accountsResult, positionsResult, activitiesResult] = await Promise.all([
      scan(ACCOUNTS_TABLE, { Select: 'COUNT' }),
      scan(POSITIONS_TABLE, { Select: 'COUNT' }),
      scan(ACTIVITIES_TABLE, { Select: 'COUNT' })
    ]);

    // Get total market value
    const positionsData = await scan(POSITIONS_TABLE);
    const totalMarketValue = (positionsData.items || []).reduce(
      (sum, pos) => sum + (pos.currentMarketValue || 0),
      0
    );

    const stats = {
      accounts: accountsResult.items?.length || 0,
      positions: positionsResult.items?.length || 0,
      activities: activitiesResult.items?.length || 0,
      totalMarketValue: Math.round(totalMarketValue * 100) / 100,
      lastUpdated: Date.now()
    };

    return response.success(stats, 'Data statistics retrieved');

  } catch (error) {
    logger.error('Get data stats handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * GET /api/stats/errors
 * Get error statistics from sync history
 */
async function getErrorStats(event) {
  try {
    logger.info('Getting error statistics');

    const { scan } = require('../../shared/utils/dynamodb');

    // Get all error syncs
    const result = await scan(SYNC_HISTORY_TABLE, {
      FilterExpression: '#status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': 'error' }
    });

    const errors = result.items || [];

    // Group errors by person
    const errorsByPerson = {};
    errors.forEach(error => {
      if (!errorsByPerson[error.personName]) {
        errorsByPerson[error.personName] = [];
      }
      errorsByPerson[error.personName].push({
        timestamp: error.syncTimestamp,
        errorMessage: error.errorMessage,
        syncType: error.syncType
      });
    });

    // Get last 24 hours errors
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    const recentErrors = errors.filter(e => e.syncTimestamp > oneDayAgo);

    const stats = {
      totalErrors: errors.length,
      recentErrors: recentErrors.length,
      errorsByPerson,
      lastError: errors.length > 0 ? errors.sort((a, b) => b.syncTimestamp - a.syncTimestamp)[0] : null
    };

    return response.success(stats, 'Error statistics retrieved');

  } catch (error) {
    logger.error('Get error stats handler error', { error: error.message });
    return response.handleError(error);
  }
}

module.exports = {
  getStats,
  getSyncStats,
  getDataStats,
  getErrorStats
};
