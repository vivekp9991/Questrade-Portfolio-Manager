/**
 * Sync Handlers
 * Handle Questrade API sync operations
 */

const logger = require('../../shared/utils/logger');
const response = require('../../shared/utils/response');
const syncService = require('../services/syncService');
const candleSyncService = require('../services/candleSyncService');
const masterCandleSyncService = require('../services/masterCandleSyncService');
const questradeDividendSyncService = require('../services/questradeDividendSyncService');

/**
 * POST /api/sync/person/:personName
 * Sync all data for a specific person
 */
async function syncPerson(event) {
  try {
    // Extract personName from path: /api/sync/person/{personName}
    let personName = event.pathParameters?.personName;

    // Fallback: extract from rawPath if pathParameters not available
    if (!personName && event.rawPath) {
      const match = event.rawPath.match(/\/api\/sync\/person\/([^\/]+)/);
      personName = match ? match[1] : null;
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const { syncType = 'full' } = body;

    if (!personName) {
      return response.badRequest('personName is required');
    }

    logger.info(`Starting ${syncType} sync for person: ${personName}`);

    const result = await syncService.syncPerson(personName, syncType);

    return response.success(result, `${syncType} sync completed successfully`);

  } catch (error) {
    logger.error('Sync person handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * POST /api/sync/accounts/:personName
 * Sync only accounts for a specific person
 */
async function syncAccounts(event) {
  try {
    // Extract personName from path: /api/sync/accounts/{personName}
    let personName = event.pathParameters?.personName;

    // Fallback: extract from rawPath if pathParameters not available
    if (!personName && event.rawPath) {
      const match = event.rawPath.match(/\/api\/sync\/accounts\/([^\/]+)/);
      personName = match ? match[1] : null;
    }

    if (!personName) {
      return response.badRequest('personName is required');
    }

    logger.info(`Starting accounts sync for: ${personName}`);

    const result = await syncService.syncPerson(personName, 'accounts');

    return response.success(result, 'Account sync completed successfully');

  } catch (error) {
    logger.error('Sync accounts handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * POST /api/sync/positions/:personName
 * Sync only positions for a specific person
 */
async function syncPositions(event) {
  try {
    // Extract personName from path: /api/sync/positions/{personName}
    let personName = event.pathParameters?.personName;

    // Fallback: extract from rawPath if pathParameters not available
    if (!personName && event.rawPath) {
      const match = event.rawPath.match(/\/api\/sync\/positions\/([^\/]+)/);
      personName = match ? match[1] : null;
    }

    if (!personName) {
      return response.badRequest('personName is required');
    }

    logger.info(`Starting positions sync for: ${personName}`);

    const result = await syncService.syncPerson(personName, 'positions');

    return response.success(result, 'Position sync completed successfully');

  } catch (error) {
    logger.error('Sync positions handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * POST /api/sync/activities/:personName
 * Sync only activities for a specific person
 */
async function syncActivities(event) {
  try {
    // Extract personName from path: /api/sync/activities/{personName}
    let personName = event.pathParameters?.personName;

    // Fallback: extract from rawPath if pathParameters not available
    if (!personName && event.rawPath) {
      const match = event.rawPath.match(/\/api\/sync\/activities\/([^\/]+)/);
      personName = match ? match[1] : null;
    }

    if (!personName) {
      return response.badRequest('personName is required');
    }

    logger.info(`Starting activities sync for: ${personName}`);

    const result = await syncService.syncPerson(personName, 'activities');

    return response.success(result, 'Activity sync completed successfully');

  } catch (error) {
    logger.error('Sync activities handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * POST /api/sync/account/:personName/:accountNumber
 * Sync a specific account for a person
 */
async function syncAccount(event) {
  try {
    // Extract parameters from path: /api/sync/account/{personName}/{accountNumber}
    let personName = event.pathParameters?.personName;
    let accountNumber = event.pathParameters?.accountNumber;

    // Fallback: extract from rawPath if pathParameters not available
    if ((!personName || !accountNumber) && event.rawPath) {
      const match = event.rawPath.match(/\/api\/sync\/account\/([^\/]+)\/([^\/]+)/);
      if (match) {
        personName = personName || match[1];
        accountNumber = accountNumber || match[2];
      }
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const { syncType = 'full' } = body;

    if (!personName) {
      return response.badRequest('personName is required');
    }

    if (!accountNumber) {
      return response.badRequest('accountNumber is required');
    }

    logger.info(`Starting ${syncType} sync for account ${accountNumber} (${personName})`);

    const result = await syncService.syncAccount(personName, accountNumber, syncType);

    return response.success(result, `Account ${accountNumber} sync completed successfully`);

  } catch (error) {
    logger.error('Sync account handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * POST /api/sync/all
 * Sync all active persons
 */
async function syncAll(event) {
  try {
    logger.info('Starting sync for all persons');

    const result = await syncService.syncAllPersons();

    return response.success(result, 'Batch sync completed');

  } catch (error) {
    logger.error('Sync all handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * GET /api/sync/status
 * Get current sync status for all persons
 */
async function getSyncStatus(event) {
  try {
    logger.info('Getting sync status');

    const result = await syncService.getSyncStatus();

    return response.success(result, 'Sync status retrieved');

  } catch (error) {
    logger.error('Get sync status handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * GET /api/sync/history
 * Get sync history with optional filters
 */
async function getSyncHistory(event) {
  try {
    const {
      personName,
      status,
      syncType,
      startDate,
      endDate,
      limit = '50'
    } = event.queryStringParameters || {};

    logger.info('Getting sync history', { personName, status, syncType });

    const filters = {};
    if (personName) filters.personName = personName;
    if (status) filters.status = status;
    if (syncType) filters.syncType = syncType;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    const result = await syncService.getSyncHistory(filters, parseInt(limit));

    return response.success(result, 'Sync history retrieved');

  } catch (error) {
    logger.error('Get sync history handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * POST /api/sync/candles/person/:personName
 * Sync previous day close prices for a person
 */
async function syncCandlesPerson(event) {
  try {
    // Extract personName from path: /api/sync/candles/person/{personName}
    let personName = event.pathParameters?.personName;

    // Fallback: extract from rawPath if pathParameters not available
    if (!personName && event.rawPath) {
      const match = event.rawPath.match(/\/api\/sync\/candles\/person\/([^\/]+)/);
      personName = match ? match[1] : null;
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const { triggerType = 'MANUAL' } = body;

    if (!personName) {
      return response.badRequest('personName is required');
    }

    logger.info(`Starting candles sync for: ${personName} (trigger: ${triggerType})`);

    const result = await candleSyncService.syncPreviousDayCloseForPerson(personName, triggerType);

    return response.success(result, 'Candles sync completed successfully');

  } catch (error) {
    logger.error('Sync candles person handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * POST /api/sync/candles/all
 * Sync previous day close prices for all persons
 */
async function syncCandlesAll(event) {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { triggerType = 'MANUAL' } = body;

    logger.info(`Starting candles sync for all persons (trigger: ${triggerType})`);

    const results = await candleSyncService.syncPreviousDayCloseForAll(triggerType);

    return response.success(results, 'Candles sync for all persons completed');

  } catch (error) {
    logger.error('Sync candles all handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * POST /api/sync/trigger
 * Trigger full sync + candles for all persons
 */
async function syncTrigger(event) {
  try {
    logger.info('Starting sync trigger (full sync + candles)');

    // First sync all persons
    const syncResult = await syncService.syncAllPersons();

    // Then sync candles
    const candlesResult = await candleSyncService.syncPreviousDayCloseForAll();

    return response.success({
      sync: syncResult,
      candles: candlesResult
    }, 'Full sync trigger completed successfully');

  } catch (error) {
    logger.error('Sync trigger handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * POST /api/sync/master-candles
 * Sync market data to symbols-master table (SINGLE SOURCE OF TRUTH)
 */
async function syncMasterCandles(event) {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { triggerType = 'MANUAL' } = body;

    logger.info(`Starting master candles sync (trigger: ${triggerType})`);

    const result = await masterCandleSyncService.syncMarketDataToMaster(triggerType);

    return response.success(result, 'Master candles sync completed successfully');

  } catch (error) {
    logger.error('Sync master candles handler error', { error: error.message });
    return response.handleError(error);
  }
}


/**
 * POST /api/sync/questrade-dividends
 * Sync dividend data from Questrade Symbols API
 */
async function syncQuestradeDividends(event) {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { triggerType = 'MANUAL' } = body;

    logger.info(`Starting Questrade dividend sync (trigger: ${triggerType})`);

    const result = await questradeDividendSyncService.syncDividendsFromQuestrade(triggerType);

    return response.success(result, `Questrade dividend sync completed: ${result.results.updated} updated, ${result.results.skipped} skipped`);

  } catch (error) {
    logger.error('Questrade dividend sync handler error', { error: error.message });
    return response.handleError(error);
  }
}

module.exports = {
  syncPerson,
  syncAccount,
  syncAccounts,
  syncPositions,
  syncActivities,
  syncAll,
  getSyncStatus,
  getSyncHistory,
  syncCandlesPerson,
  syncCandlesAll,
  syncTrigger,
  syncMasterCandles,
  syncQuestradeDividends
};
