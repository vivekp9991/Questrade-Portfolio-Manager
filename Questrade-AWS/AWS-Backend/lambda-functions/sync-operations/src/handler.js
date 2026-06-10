/**
 * Sync Operations Lambda Handler
 * Syncs data from Questrade API to DynamoDB
 */

const logger = require('../shared/utils/logger');
const { handleError } = require('../shared/utils/response');

// Import handlers
const syncHandlers = require('./handlers/sync');
const debugHandlers = require('./handlers/debugActivities');
const balanceHandlers = require('./handlers/balances');
const syncService = require('./services/syncService');

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
  // PHASE 1.4: Check if this is a scheduled daily sync
  const isScheduledSync = event.action === 'daily-sync' || event['detail-type'] === 'Scheduled Event';
  const isMasterCandleSync = event.action === 'master-candles';

  logger.info('Sync operations request', {
    path: event.rawPath,
    method: event.requestContext?.http?.method,
    isScheduledSync,
    source: event.source
  });

  try {
    // Step Functions task dispatch (direct invoke with a `task` field — no HTTP/EventBridge envelope).
    // The portfolio-sync state machine invokes these. Tasks THROW on failure so Step Functions
    // can retry/backoff and isolate per-login failures via Catch.
    if (event && event.task) {
      logger.info(`[SFN] task=${event.task} ${event.personName || ''}`);
      if (event.task === 'getEligiblePersons') {
        const persons = await syncService.getEligiblePersonNames();
        return { persons };
      }
      if (event.task === 'syncPerson') {
        return await syncService.syncPerson(event.personName, 'full');
      }
      throw new Error(`Unknown SFN task: ${event.task}`);
    }

    // PHASE 1.4: Handle scheduled daily sync (EventBridge trigger)
    if (isMasterCandleSync) {
      logger.info('[SCHEDULED] Running master candle sync for all symbols...');
      const result = await syncHandlers.syncMasterCandles({ body: JSON.stringify({ triggerType: 'SCHEDULED' }) });
      return result;
    }

    if (isScheduledSync) {
      logger.info('[SCHEDULED] Running daily sync for all active persons...');
      const result = await syncHandlers.syncAll(event);
      return result;
    }

    const { rawPath, requestContext, httpMethod } = event;
    const method = requestContext?.http?.method || httpMethod || 'POST';

    // Handle OPTIONS requests (CORS preflight) - MUST be before path processing
    if (method === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
          'Access-Control-Allow-Credentials': true,
          'Access-Control-Max-Age': '86400'
        },
        body: JSON.stringify({ success: true })
      };
    }

    // Remove stage prefix if present (e.g., /dev/api/... -> /api/...)
    const path = rawPath.replace(/^\/[^\/]+\/api\//, '/api/');

    // Health check
    if (path === '/api/sync/health' && method === 'GET') {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Credentials': true
        },
        body: JSON.stringify({
          success: true,
          service: 'sync-operations',
          status: 'healthy',
          timestamp: new Date().toISOString()
        })
      };
    }

    // Account balances (B1 — current value per account/currency)
    if (path === '/api/sync/balances' && method === 'POST') {
      return await balanceHandlers.syncBalances(event);
    }
    if (path.match(/^\/api\/sync\/balances\/[^\/]+$/) && method === 'POST') {
      return await balanceHandlers.syncBalancesPerson(event);
    }
    if (path === '/api/sync/contributions' && method === 'POST') {
      return await balanceHandlers.syncContributions(event);
    }
    if (path === '/api/account-balances' && method === 'GET') {
      return await balanceHandlers.getAccountBalances(event);
    }
    if (path.match(/^\/api\/account-balances\/[^\/]+\/[^\/]+$/) && method === 'POST') {
      return await balanceHandlers.setAccountBaseline(event);
    }

    // Bank / cash balances (R2 — manual)
    if (path === '/api/bank-balances' && method === 'GET') {
      return await balanceHandlers.getBankBalances(event);
    }
    if (path === '/api/bank-balances' && method === 'POST') {
      return await balanceHandlers.postBankBalance(event);
    }
    if (path.match(/^\/api\/bank-balances\/[^\/]+\/[^\/]+$/) && method === 'DELETE') {
      return await balanceHandlers.deleteBankBalance(event);
    }

    // Custom investments (R3 — manual)
    if (path === '/api/custom-investments' && method === 'GET') {
      return await balanceHandlers.getCustomInvestments(event);
    }
    if (path === '/api/custom-investments' && method === 'POST') {
      return await balanceHandlers.postCustomInvestment(event);
    }
    if (path.match(/^\/api\/custom-investments\/[^\/]+\/[^\/]+$/) && method === 'DELETE') {
      return await balanceHandlers.deleteCustomInvestment(event);
    }

    // Sync routes
    if (path.match(/^\/api\/sync\/person\/[^\/]+$/) && method === 'POST') {
      return await syncHandlers.syncPerson(event);
    }

    if (path.match(/^\/api\/sync\/accounts\/[^\/]+$/) && method === 'POST') {
      return await syncHandlers.syncAccounts(event);
    }

    if (path.match(/^\/api\/sync\/positions\/[^\/]+$/) && method === 'POST') {
      return await syncHandlers.syncPositions(event);
    }

    if (path.match(/^\/api\/sync\/activities\/[^\/]+$/) && method === 'POST') {
      return await syncHandlers.syncActivities(event);
    }

    if (path.match(/^\/api\/sync\/account\/[^\/]+\/[^\/]+$/) && method === 'POST') {
      return await syncHandlers.syncAccount(event);
    }

    if (path === '/api/sync/all' && method === 'POST') {
      return await syncHandlers.syncAll(event);
    }

    if (path === '/api/sync/status' && method === 'GET') {
      return await syncHandlers.getSyncStatus(event);
    }

    if (path === '/api/sync/history' && method === 'GET') {
      return await syncHandlers.getSyncHistory(event);
    }

    // Candles sync routes
    if (path.match(/^\/api\/sync\/candles\/person\/[^\/]+$/) && method === 'POST') {
      return await syncHandlers.syncCandlesPerson(event);
    }

    if (path === '/api/sync/candles/all' && method === 'POST') {
      return await syncHandlers.syncCandlesAll(event);
    }

    // Master candles sync (SINGLE SOURCE OF TRUTH)
    if (path === '/api/sync/master-candles' && method === 'POST') {
      return await syncHandlers.syncMasterCandles(event);
    }
    // Questrade dividend sync (from Symbols API)
    if (path === '/api/sync/questrade-dividends' && method === 'POST') {
      return await syncHandlers.syncQuestradeDividends(event);
    }


    if (path === '/api/sync/trigger' && method === 'POST') {
      return await syncHandlers.syncTrigger(event);
    }

    // Debug routes
    if (path.match(/^\/api\/debug\/activities\/[^\/]+\/[^\/]+$/) && method === 'POST') {
      return await debugHandlers.fetchActivitiesDebug(event);
    }

    // Route not found
    return {
      statusCode: 404,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true
      },
      body: JSON.stringify({
        success: false,
        message: 'Route not found',
        requestedPath: path
      })
    };

  } catch (error) {
    logger.error('Handler error', { error: error.message, stack: error.stack });
    return handleError(error);
  }
};
