/**
 * Sync Service
 * Handles syncing data from Questrade API to DynamoDB
 */

const logger = require('../../shared/utils/logger');
const questradeApi = require('./questradeApiService');
const dividendSyncService = require('./dividendSyncService');
const activitySyncHelper = require('./activitySyncHelper');
const cacheService = require('./cacheService');
const { putItem, batchWrite, query, scan, updateItem, getItem } = require('../../shared/utils/dynamodb');

const PERSONS_TABLE = process.env.PERSONS_TABLE;
const ACCOUNTS_TABLE = process.env.ACCOUNTS_TABLE;
const POSITIONS_TABLE = process.env.POSITIONS_TABLE;
const ACTIVITIES_TABLE = process.env.ACTIVITIES_TABLE;
const SYMBOLS_TABLE = process.env.SYMBOLS_TABLE;
const SYMBOLS_MASTER_TABLE = process.env.SYMBOLS_MASTER_TABLE;
const SYNC_HISTORY_TABLE = process.env.SYNC_HISTORY_TABLE;
const SYMBOL_DIVIDENDS_TABLE = process.env.SYMBOL_DIVIDENDS_TABLE;

class SyncService {
  /**
   * Helper: Calculate total dividends received from activities
   * This should be called for ALL dividend calculations to get accurate total received
   */
  async calculateTotalDividendsReceived(personName, symbol) {
    try {
      // Query dividend activities using the same filter as dividendSyncService
      const keyConditionExpression = 'personName = :personName';
      const expressionValues = {
        ':personName': personName,
        ':type1': 'Dividends',
        ':type2': 'Dividend',
        ':type3': 'DIV',
        ':typeDividend': 'dividend',
        ':symbol': symbol
      };

      const filterExpression = '(#type = :type1 OR #type = :type2 OR #type = :type3 OR contains(#type, :typeDividend)) AND symbol = :symbol';
      const expressionAttributeNames = { '#type': 'type' };

      const result = await query(
        ACTIVITIES_TABLE,
        keyConditionExpression,
        expressionValues,
        {
          IndexName: 'personName-date-index',
          FilterExpression: filterExpression,
          ExpressionAttributeNames: expressionAttributeNames,
          ScanIndexForward: false
        }
      );

      const activities = result.items || [];

      if (activities.length === 0) {
        return 0;
      }

      // Sum up all dividend amounts
      let totalReceived = 0;
      activities.forEach(activity => {
        const amount = Math.abs(activity.netAmount || activity.grossAmount || 0);
        totalReceived += amount;
      });

      return Math.round(totalReceived * 10000) / 10000;
    } catch (error) {
      logger.error(`[SYNC] Error calculating total dividends for ${symbol}:`, error.message);
      return 0;
    }
  }

  /**
   * PHASE 5: Get accounts with 7-day cache
   * Accounts rarely change, so we can cache them to reduce API calls
   */
  async getAccountsWithCache(personName, { forceFresh = false } = {}) {
    // Full/scheduled syncs pass forceFresh so a closed/opened account is detected
    // promptly (the cache would otherwise hide account changes for its TTL).
    if (!forceFresh) {
      const cached = await cacheService.getCachedAccounts(personName);
      if (cached) {
        logger.info(`[PHASE 5] Using cached accounts for ${personName} (${cached.length} accounts)`);
        return cached;
      }
    }

    logger.info(`[PHASE 5] Fetching FRESH accounts from API for ${personName} (forceFresh=${forceFresh})`);
    const accounts = await questradeApi.getAccounts(personName);
    await cacheService.cacheAccounts(personName, accounts);
    return accounts;
  }

  /**
   * PHASE 3: Get person info including activitiesInitialized flag
   */
  async getPerson(personName) {
    try {
      // persons is keyed by personName — use getItem. (The previous query(...) passed an
      // options object where the key-condition STRING was expected, so it always threw →
      // getPerson returned null → fetchActivitiesOptimized treated activities as
      // uninitialized and re-pulled the full 3-year history on EVERY sync.)
      return await getItem(PERSONS_TABLE, { personName });
    } catch (error) {
      logger.error(`Failed to get person ${personName}`, { error: error.message });
      return null;
    }
  }

  /**
   * PHASE 3: Mark person's activities as initialized
   */
  async markActivitiesInitialized(personName) {
    try {
      await updateItem(PERSONS_TABLE, {
        personName
      }, {
        activitiesInitialized: true,
        lastActivitiesSync: Date.now()
      });
      logger.info(`[PHASE 3] Marked activities as initialized for ${personName}`);
    } catch (error) {
      logger.error(`Failed to mark activities initialized for ${personName}`, { error: error.message });
    }
  }

  async getLatestActivityDate(accountNumber) {
    try {
      const result = await query(ACTIVITIES_TABLE, {
        KeyConditionExpression: 'accountId = :accountId',
        ExpressionAttributeValues: { ':accountId': String(accountNumber) },
        ScanIndexForward: false,
        Limit: 1
      });
      if (result.items && result.items.length > 0) {
        return result.items[0].transactionDate;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async getOldestActivityDate(accountNumber) {
    try {
      const result = await query(ACTIVITIES_TABLE, {
        KeyConditionExpression: 'accountId = :accountId',
        ExpressionAttributeValues: { ':accountId': String(accountNumber) },
        ScanIndexForward: true,
        Limit: 1
      });
      if (result.items && result.items.length > 0) {
        return result.items[0].transactionDate;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Sync a specific account for a person
   */
  async syncAccount(personName, accountNumber, syncType = 'full') {
    const syncStart = Date.now();
    const syncId = `${personName}-${accountNumber}-${syncStart}`;

    try {
      logger.info(`Starting ${syncType} sync for account ${accountNumber} (${personName})`);

      await this.recordSyncStart(personName, syncStart, `${syncType}-account-${accountNumber}`);

      const result = {
        personName,
        accountNumber,
        syncId,
        syncType,
        status: 'completed'
      };

      // Sync based on type
      if (syncType === 'full' || syncType === 'account') {
        // PHASE 5: Use cached accounts
        const accounts = await this.getAccountsWithCache(personName);
        const account = accounts.find(acc => String(acc.number) === String(accountNumber));

        if (!account) {
          throw new Error(`Account ${accountNumber} not found for ${personName}`);
        }

        await this.syncAccounts(personName, [account]);
        result.accounts = 1;
        logger.info(`Synced account ${accountNumber} for ${personName}`);
      }

      if (syncType === 'full' || syncType === 'positions') {
        const positions = await questradeApi.getPositions(personName, accountNumber);

        // PHASE 5: Get account info from cache to pass account type to positions
        const accounts = await this.getAccountsWithCache(personName);
        const account = accounts.find(acc => String(acc.number) === String(accountNumber));

        await this.syncPositions(personName, accountNumber, positions, account);
        result.positions = positions.length;
        logger.info(`Synced ${positions.length} positions for account ${accountNumber}`);
      }

      if (syncType === 'full' || syncType === 'activities') {
        // PHASE 3: Use optimized activities sync
        const activities = await this.fetchActivitiesOptimized(personName, accountNumber);
        await this.syncActivities(personName, accountNumber, activities);
        result.activities = activities.length;
        logger.info(`[PHASE 3] Synced ${activities.length} activities for account ${accountNumber}`);

        // Mark activities as initialized if this was a historical sync
        const person = await this.getPerson(personName);
        if (!person || !person.activitiesInitialized) {
          await this.markActivitiesInitialized(personName);
        }
      }

      const syncEnd = Date.now();
      result.duration = syncEnd - syncStart;

      await this.recordSyncComplete(personName, syncStart, syncEnd, result, `${syncType}-account-${accountNumber}`);

      return result;

    } catch (error) {
      logger.error(`Sync failed for account ${accountNumber} (${personName})`, { error: error.message });
      await this.recordSyncError(personName, syncStart, error.message, `${syncType}-account-${accountNumber}`);
      throw error;
    }
  }

  /**
   * Sync all data for a person
   */
  async syncPerson(personName, syncType = 'full') {
    const syncStart = Date.now();
    const syncId = `${personName}-${syncStart}`;

    try {
      logger.info(`Starting ${syncType} sync for ${personName}`);

      // Record sync start
      await this.recordSyncStart(personName, syncStart, syncType);

      const result = {
        personName,
        syncId,
        syncType,
        status: 'completed'
      };

      // Sync based on type
      if (syncType === 'full' || syncType === 'accounts') {
        // Fetch a FRESH account list on full/accounts sync so closures/openings are
        // detected immediately (and pruneStale removes closed accounts + their positions).
        const accounts = await this.getAccountsWithCache(personName, { forceFresh: true });
        await this.syncAccounts(personName, accounts, { pruneStale: true });
        result.accounts = accounts.length;
        logger.info(`[PHASE 5] Synced ${accounts.length} accounts for ${personName}`);
      }

      // Get accounts for positions/activities sync
      let accounts = [];
      if (syncType === 'positions' || syncType === 'activities' || syncType === 'full') {
        // PHASE 5: Always use cached accounts (no need to check result.accounts)
        accounts = await this.getAccountsWithCache(personName);
      }

      if (syncType === 'full' || syncType === 'positions') {
        let totalPositions = 0;
        for (const account of accounts) {
          const positions = await questradeApi.getPositions(personName, account.number);
          await this.syncPositions(personName, account.number, positions, account);
          totalPositions += positions.length;
        }
        result.positions = totalPositions;
        logger.info(`Synced ${totalPositions} positions for ${personName}`);
      }

      if (syncType === 'full' || syncType === 'activities') {
        let totalActivities = 0;
        const person = await this.getPerson(personName);
        const isHistoricalSync = !person || !person.activitiesInitialized;

        for (const account of accounts) {
          // PHASE 3: Use optimized activities sync
          const activities = await this.fetchActivitiesOptimized(personName, account.number);
          await this.syncActivities(personName, account.number, activities);
          totalActivities += activities.length;
        }
        result.activities = totalActivities;
        logger.info(`[PHASE 3] Synced ${totalActivities} activities for ${personName}`);

        // Mark activities as initialized if this was a historical sync
        if (isHistoricalSync) {
          await this.markActivitiesInitialized(personName);
        }
      }

      // Record sync completion
      const syncEnd = Date.now();
      result.duration = syncEnd - syncStart;

      await this.recordSyncComplete(personName, syncStart, syncEnd, result, syncType);

      return result;

    } catch (error) {
      logger.error(`Sync failed for ${personName}`, { error: error.message });
      await this.recordSyncError(personName, syncStart, error.message, syncType);
      throw error;
    }
  }

  /**
   * Return the list of sync-eligible person names. Eligibility is isActive AND not
   * flagged needsReauth (we no longer gate on hasValidToken — a transient token error
   * must not drop a login; only a real invalid_grant sets needsReauth).
   * Used by both syncAllPersons() and the Step Functions orchestrator.
   */
  async getEligiblePersonNames() {
    const result = await scan(PERSONS_TABLE, {
      FilterExpression: 'isActive = :isActive AND (attribute_not_exists(needsReauth) OR needsReauth = :false)',
      ExpressionAttributeValues: { ':isActive': true, ':false': false }
    });
    return (result.items || []).map((p) => p.personName);
  }

  /**
   * Sync all active persons (in-process loop; the Step Functions state machine is the
   * preferred path for scheduled runs — see docs/02-phase-2-stepfunctions-sync.md).
   */
  async syncAllPersons() {
    try {
      const personNames = await this.getEligiblePersonNames();
      const persons = personNames.map((personName) => ({ personName }));
      logger.info(`Syncing ${persons.length} persons`);

      const results = [];
      for (const person of persons) {
        try {
          const syncResult = await this.syncPerson(person.personName);
          results.push(syncResult);
        } catch (error) {
          logger.error(`Failed to sync ${person.personName}`, { error: error.message });
          results.push({
            personName: person.personName,
            status: 'failed',
            error: error.message
          });
        }
      }

      const successful = results.filter(r => r.status === 'completed').length;
      const failed = results.filter(r => r.status === 'failed').length;

      return {
        total: persons.length,
        successful,
        failed,
        results
      };

    } catch (error) {
      logger.error('Sync all persons failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Sync accounts to DynamoDB
   */
  async syncAccounts(personName, accounts, { pruneStale = false } = {}) {
    const items = [];

    // Fetch balances for each account and include in the item
    for (const account of accounts) {
      if (!account.number || String(account.number).trim() === '') {
        continue;
      }

      const accountNumber = String(account.number);

      try {
        // Get account balances from Questrade API
        const balances = await questradeApi.getBalances(personName, accountNumber);

        // Find CAD balance (primary currency for Canadian accounts)
        const cadBalance = balances.find(b => b.currency === 'CAD');
        const usdBalance = balances.find(b => b.currency === 'USD');

        // Build account item with summary
        const item = {
          accountId: accountNumber,
          personName,
          type: account.type,
          number: accountNumber,
          status: account.status,
          isPrimary: account.isPrimary,
          isBilling: account.isBilling,
          clientAccountType: account.clientAccountType,
          updatedAt: Date.now()
        };

        // Add summary if we have balance data
        if (cadBalance || usdBalance) {
          item.summary = {
            totalEquityCAD: cadBalance?.totalEquity || 0,
            cashCAD: cadBalance?.cash || 0,
            marketValueCAD: cadBalance?.marketValue || 0,
            buyingPowerCAD: cadBalance?.buyingPower || 0,
            totalEquityUSD: usdBalance?.totalEquity || 0,
            cashUSD: usdBalance?.cash || 0,
            marketValueUSD: usdBalance?.marketValue || 0,
            buyingPowerUSD: usdBalance?.buyingPower || 0
          };
        }

        items.push(item);
        logger.info(`Fetched balances for account ${accountNumber}`, {
          cadEquity: cadBalance?.totalEquity,
          usdEquity: usdBalance?.totalEquity
        });

      } catch (error) {
        logger.error(`Failed to get balances for account ${accountNumber}`, { error: error.message });
        // Still add account without balances rather than failing completely
        items.push({
          accountId: accountNumber,
          personName,
          type: account.type,
          number: accountNumber,
          status: account.status,
          isPrimary: account.isPrimary,
          isBilling: account.isBilling,
          clientAccountType: account.clientAccountType,
          updatedAt: Date.now()
        });
      }
    }

    if (items.length > 0) {
      await batchWrite(ACCOUNTS_TABLE, items, 'put');
      logger.info(`Synced ${items.length} accounts with balance data for ${personName}`);
    }

    // Replace-on-sync (only when given the FULL account list — guarded so the
    // single-account path can't delete a person's other accounts).
    if (pruneStale) {
      try {
        const currentIds = new Set(items.map((i) => String(i.accountId)));
        const existing = await query(
          ACCOUNTS_TABLE,
          'personName = :p',
          { ':p': personName },
          { IndexName: 'personName-index' }
        );
        const stale = (existing.items || []).filter((a) => !currentIds.has(String(a.accountId)));
        if (stale.length > 0) {
          await batchWrite(ACCOUNTS_TABLE, stale.map((a) => ({ accountId: String(a.accountId) })), 'delete');
          logger.info(`[SYNC] Removed ${stale.length} stale/closed accounts for ${personName}`);
          // Also delete positions belonging to those closed accounts (they'd otherwise orphan,
          // since the per-account position prune only covers accounts still in the sync loop).
          for (const acc of stale) {
            const pos = await query(POSITIONS_TABLE, 'accountId = :a', { ':a': String(acc.accountId) });
            if (pos.items && pos.items.length > 0) {
              await batchWrite(
                POSITIONS_TABLE,
                pos.items.map((p) => ({ accountId: String(p.accountId), symbolId: String(p.symbolId) })),
                'delete'
              );
              logger.info(`[SYNC] Removed ${pos.items.length} positions from closed account ${acc.accountId}`);
            }
          }
        }
      } catch (error) {
        logger.error(`[SYNC] Replace-on-sync (accounts) failed for ${personName}`, { error: error.message });
      }
    }
  }

  /**
   * Sync positions to DynamoDB with dividend data
   */
  async syncPositions(personName, accountNumber, positions, account = null) {
    const items = [];
    const symbolCache = new Map(); // Cache to avoid duplicate API calls for same symbolId

    for (const position of positions) {
      if (!position.symbolId || String(position.symbolId).trim() === '') {
        continue;
      }

      // Fetch company name from Questrade API (cached to avoid duplicates)
      let companyName = null;
      if (!symbolCache.has(position.symbolId)) {
        try {
          const symbolInfo = await questradeApi.getSymbolInfo(personName, position.symbolId);
          companyName = symbolInfo?.description || null;
          symbolCache.set(position.symbolId, companyName);
          logger.info(`[SYNC] Fetched company name for ${position.symbol} (${position.symbolId}): ${companyName}`);
        } catch (error) {
          logger.warn(`[SYNC] Failed to fetch company name for ${position.symbol}`, { error: error.message });
          symbolCache.set(position.symbolId, null);
        }
      } else {
        companyName = symbolCache.get(position.symbolId);
      }

      // Fetch symbol dividend data from centralized table
      let symbolDividendData = null;
      try {
        const symbolDiv = await getItem(SYMBOL_DIVIDENDS_TABLE, { symbol: position.symbol });
        symbolDividendData = symbolDiv;
      } catch (error) {
        logger.warn(`[SYNC] Failed to fetch symbol dividend data for ${position.symbol}`, { error: error.message });
      }

      // Calculate dividend data for this position
      // Priority order:
      // 1. Manual override (isManualOverride=true AND overrideValue exists)
      // 2. Questrade value (dividendPerShare from symbol-dividends table)
      // 3. Fallback: Calculate from historical activities
      let dividendData;
      if (symbolDividendData && symbolDividendData.isManualOverride === 'true' && symbolDividendData.overrideValue) {
        // Use manual override value
        const monthlyDividendPerShare = symbolDividendData.overrideValue;
        const annualDividendPerShare = monthlyDividendPerShare * 12;
        const annualDividend = annualDividendPerShare * position.openQuantity;
        const monthlyDividend = monthlyDividendPerShare * position.openQuantity;

        const avgCost = position.averageEntryPrice || 0;
        const currentPrice = position.currentPrice || 0;
        // YoC formula: ((monthlyDividend * 12) / avgCost) * 100
        const yieldOnCost = avgCost > 0 ? ((monthlyDividendPerShare * 12) / avgCost) * 100 : 0;
        const currentYield = currentPrice > 0 ? ((monthlyDividendPerShare * 12) / currentPrice) * 100 : 0;

        // Calculate totalReceived from activities
        const totalReceived = await this.calculateTotalDividendsReceived(personName, position.symbol);

        dividendData = {
          monthlyDividendPerShare,
          annualDividendPerShare,
          annualDividend,
          monthlyDividend,
          yieldOnCost,
          currentYield,
          totalReceived,
          dividendFrequency: symbolDividendData.dividendFrequency || 'monthly',
          dividendHistory: [],
          lastDividendAmount: 0,
          lastDividendDate: null,
          isManualOverride: true
        };
        logger.info(`[SYNC] Using manual override for ${position.symbol}: $${monthlyDividendPerShare}/month, total received: $${totalReceived}`);
      } else if (symbolDividendData && symbolDividendData.dividendPerShare) {
        // Use Questrade dividend value (no override)
        const monthlyDividendPerShare = symbolDividendData.dividendPerShare;
        const annualDividendPerShare = monthlyDividendPerShare * 12;
        const annualDividend = annualDividendPerShare * position.openQuantity;
        const monthlyDividend = monthlyDividendPerShare * position.openQuantity;

        const avgCost = position.averageEntryPrice || 0;
        const currentPrice = position.currentPrice || 0;
        // YoC formula: ((monthlyDividend * 12) / avgCost) * 100
        const yieldOnCost = avgCost > 0 ? ((monthlyDividendPerShare * 12) / avgCost) * 100 : 0;
        const currentYield = currentPrice > 0 ? ((monthlyDividendPerShare * 12) / currentPrice) * 100 : 0;

        // Calculate totalReceived from activities
        const totalReceived = await this.calculateTotalDividendsReceived(personName, position.symbol);

        dividendData = {
          monthlyDividendPerShare,
          annualDividendPerShare,
          annualDividend,
          monthlyDividend,
          yieldOnCost,
          currentYield,
          totalReceived,
          dividendFrequency: symbolDividendData.dividendFrequency || 'monthly',
          dividendHistory: [],
          lastDividendAmount: 0,
          lastDividendDate: null,
          isManualOverride: false
        };
        logger.info(`[SYNC] Using Questrade dividend for ${position.symbol}: $${monthlyDividendPerShare}/month, total received: $${totalReceived}`);
      } else {
        // Fallback: Calculate from activities (legacy behavior)
        dividendData = await dividendSyncService.calculateDividendDataForPosition(
          personName,
          position.symbol,
          position.openQuantity,
          position.totalCost || (position.openQuantity * position.averageEntryPrice),
          position.averageEntryPrice,
          position.currentPrice
        );
        dividendData.isManualOverride = false;
        logger.info(`[SYNC] Calculated dividend from activities for ${position.symbol}`);
      }

      // FIXED: Infer currency from symbol suffix
      // - Symbols ending with .TO → CAD (Toronto Stock Exchange)
      // - Symbols without .TO → USD (US exchanges: NYSE, NASDAQ, etc.)
      const inferredCurrency = position.symbol && position.symbol.endsWith('.TO') ? 'CAD' : 'USD';

      // Fetch previousClose from symbols-master table
      let previousClose = null;
      try {
        const symbolMaster = await getItem(SYMBOLS_MASTER_TABLE, { symbol: position.symbol });

        logger.info(`[SYNC] Symbol master for ${position.symbol}:`, JSON.stringify(symbolMaster, null, 2));

        if (symbolMaster && symbolMaster.marketData) {
          logger.info(`[SYNC] marketData for ${position.symbol}:`, JSON.stringify(symbolMaster.marketData, null, 2));

          if (symbolMaster.marketData.previousClose) {
            previousClose = parseFloat(symbolMaster.marketData.previousClose);
            logger.info(`[SYNC] ✅ Fetched previousClose for ${position.symbol}: ${previousClose}`);
          } else {
            logger.warn(`[SYNC] ❌ No previousClose in marketData for ${position.symbol}`);
          }
        } else {
          logger.warn(`[SYNC] ❌ No marketData for ${position.symbol}`);
        }
      } catch (error) {
        logger.error(`[SYNC] ❌ Failed to fetch previousClose for ${position.symbol}`, { error: error.message });
      }

      // Create position item with dividend data
      const item = {
        accountId: String(accountNumber),
        symbolId: String(position.symbolId),
        personName,
        symbol: position.symbol,
        companyName: companyName, // Add company name
        openQuantity: position.openQuantity,
        closedQuantity: position.closedQuantity,
        currentMarketValue: position.currentMarketValue,
        currentPrice: position.currentPrice,
        previousClose: previousClose || position.currentPrice, // Use previousClose from symbols-master, fallback to currentPrice
        averageEntryPrice: position.averageEntryPrice,
        closedPnl: position.closedPnl,
        openPnl: position.openPnl,
        totalCost: position.totalCost,
        isRealTime: position.isRealTime,
        isUnderReorg: position.isUnderReorg,
        // Account type and currency for filtering
        accountType: account?.type || 'Unknown',
        accountNumber: String(accountNumber),
        currency: position.currency || inferredCurrency,
        // Dividend data
        dividendData: dividendData,
        isDividendStock: dividendData.annualDividend > 0,
        lastDividendUpdate: Date.now(),
        updatedAt: Date.now()
      };

      items.push(item);
    }

    // Replace-on-sync: remove positions no longer held in this account so the DB
    // mirrors Questrade exactly (closed/sold positions must disappear). getPositions
    // throws on error (never returns [] on failure), so an empty set means genuinely
    // no holdings → all existing rows for the account are correctly removed.
    try {
      const currentSymbolIds = new Set(items.map((i) => String(i.symbolId)));
      const existing = await query(POSITIONS_TABLE, 'accountId = :a', { ':a': String(accountNumber) });
      const stale = (existing.items || []).filter((p) => !currentSymbolIds.has(String(p.symbolId)));
      if (stale.length > 0) {
        await batchWrite(
          POSITIONS_TABLE,
          stale.map((p) => ({ accountId: String(p.accountId), symbolId: String(p.symbolId) })),
          'delete'
        );
        logger.info(`[SYNC] Removed ${stale.length} closed/stale positions for account ${accountNumber}`);
      }
    } catch (error) {
      logger.error(`[SYNC] Replace-on-sync (positions) failed for account ${accountNumber}`, { error: error.message });
    }

    if (items.length > 0) {
      logger.info(`[SYNC] Syncing ${items.length} positions with dividend data and company names for ${personName}`);
      await batchWrite(POSITIONS_TABLE, items, 'put');
    }
  }

  /**
   * PHASE 3: Fetch activities based on initialization status
   * - If activitiesInitialized = false: Historical sync (5 years)
   * - If activitiesInitialized = true: Daily sync (yesterday only)
   */
  async fetchActivitiesOptimized(personName, accountNumber) {
    const person = await this.getPerson(personName);

    // Check if activities have been initialized for this person
    if (!person || !person.activitiesInitialized) {
      // First-time setup: Fetch 3 years of historical data (trades + dividends) so
      // per-stock and per-account totals match Questrade.
      logger.info(`[PHASE 3] First-time activities sync for ${personName} - Fetching 3 years of history`);
      return await activitySyncHelper.fetchActivitiesHistorical(personName, accountNumber, 3);
    } else {
      // Daily sync: Fetch yesterday only (optimized)
      logger.info(`[PHASE 3] Daily activities sync for ${personName} - Fetching yesterday only`);
      return await activitySyncHelper.fetchActivitiesYesterday(personName, accountNumber);
    }
  }

  /**
   * Sync activities to DynamoDB
   */
  async syncActivities(personName, accountNumber, activities) {
    // Deterministic, content-based sort key so re-syncs and overlapping date chunks are
    // idempotent (the old index-based key created duplicate rows at chunk boundaries,
    // inflating dividend totals). A per-key occurrence counter disambiguates genuinely
    // identical same-day entries (e.g. two equal dividend lines) → #2, #3, ...; stable
    // across re-syncs because Questrade returns a consistent order per date range.
    const keyCounts = {};
    const items = activities
      .filter(activity => activity.transactionDate && String(activity.transactionDate).trim() !== '')
      .map((activity) => {
        const baseKey = [
          activity.transactionDate,
          activity.type || '',
          activity.action || '',
          activity.symbolId || '0',
          activity.symbol || '',
          activity.netAmount != null ? activity.netAmount : '',
          activity.grossAmount != null ? activity.grossAmount : '',
          activity.quantity != null ? activity.quantity : '',
          activity.price != null ? activity.price : '',
          activity.currency || ''
        ].join('#').replace(/\s+/g, '');
        const occ = (keyCounts[baseKey] = (keyCounts[baseKey] || 0) + 1);
        const activityDateTime = occ > 1 ? `${baseKey}#${occ}` : baseKey;

        // Prepare item - only include symbol if not empty (GSI requires non-empty values)
        const item = {
          accountId: String(accountNumber),
          activityDateTime,
          transactionDate: activity.transactionDate, // Keep original date for querying
          personName,
          type: activity.type,
          action: activity.action,
          symbolId: activity.symbolId,
          quantity: activity.quantity,
          price: activity.price,
          grossAmount: activity.grossAmount,
          commission: activity.commission,
          netAmount: activity.netAmount,
          currency: activity.currency,
          description: activity.description,
          settlementDate: activity.settlementDate,
          updatedAt: Date.now()
        };

        // Only add symbol if it's not empty (GSI key cannot be empty string)
        if (activity.symbol && String(activity.symbol).trim() !== '') {
          item.symbol = activity.symbol;
        }

        return item;
      });

    if (items.length > 0) {
      await batchWrite(ACTIVITIES_TABLE, items, 'put');
    }
  }

  /**
   * Record sync start in history
   */
  async recordSyncStart(personName, syncTimestamp, syncType = 'full') {
    await putItem(SYNC_HISTORY_TABLE, {
      personName,
      syncTimestamp,
      syncType,
      status: 'in_progress',
      startTime: syncTimestamp,
      ttl: Math.floor((Date.now() + (30 * 24 * 60 * 60 * 1000)) / 1000) // 30 days
    });
  }

  /**
   * Record sync completion
   */
  async recordSyncComplete(personName, syncTimestamp, endTime, stats, syncType = 'full') {
    await putItem(SYNC_HISTORY_TABLE, {
      personName,
      syncTimestamp,
      syncType,
      status: 'completed',
      startTime: syncTimestamp,
      endTime,
      duration: endTime - syncTimestamp,
      stats,
      ttl: Math.floor((Date.now() + (30 * 24 * 60 * 60 * 1000)) / 1000)
    });
  }

  /**
   * Record sync error
   */
  async recordSyncError(personName, syncTimestamp, errorMessage, syncType = 'full') {
    await putItem(SYNC_HISTORY_TABLE, {
      personName,
      syncTimestamp,
      syncType,
      status: 'failed',
      startTime: syncTimestamp,
      endTime: Date.now(),
      error: errorMessage,
      ttl: Math.floor((Date.now() + (30 * 24 * 60 * 60 * 1000)) / 1000)
    });
  }

  /**
   * Get sync status
   */
  async getSyncStatus() {
    // Latest sync-history entry per person
    const result = await scan(SYNC_HISTORY_TABLE);
    const lastByPerson = {};
    (result.items || []).forEach((item) => {
      const cur = lastByPerson[item.personName];
      if (!cur || item.syncTimestamp > cur.syncTimestamp) lastByPerson[item.personName] = item;
    });

    // Merge with person records so the UI can show per-login health (needsReauth / last sync).
    const personsResult = await scan(PERSONS_TABLE);
    return (personsResult.items || [])
      .filter((p) => p.personName && p.personName.toLowerCase() !== 'all')
      .map((p) => {
        const last = lastByPerson[p.personName];
        return {
          personName: p.personName,
          isActive: p.isActive === true,
          needsReauth: p.needsReauth === true,
          lastTokenError: p.lastTokenError || null,
          lastSyncStatus: last?.status || null,
          lastSyncTime: last?.endTime || last?.syncTimestamp || p.lastActivitiesSync || null,
          lastSyncType: last?.syncType || null,
          lastSyncError: last?.error || null
        };
      });
  }

  /**
   * Get sync history with filters
   */
  async getSyncHistory(filters = {}, limit = 50) {
    const { personName, status, syncType, startDate, endDate } = filters;

    let filterExpression = [];
    let expressionAttributeValues = {};
    let expressionAttributeNames = {};

    if (personName) {
      filterExpression.push('#personName = :personName');
      expressionAttributeNames['#personName'] = 'personName';
      expressionAttributeValues[':personName'] = personName;
    }

    if (status) {
      filterExpression.push('#status = :status');
      expressionAttributeNames['#status'] = 'status';
      expressionAttributeValues[':status'] = status;
    }

    if (syncType) {
      filterExpression.push('syncType = :syncType');
      expressionAttributeValues[':syncType'] = syncType;
    }

    const scanOptions = {
      Limit: limit
    };

    if (filterExpression.length > 0) {
      scanOptions.FilterExpression = filterExpression.join(' AND ');
      scanOptions.ExpressionAttributeValues = expressionAttributeValues;
      if (Object.keys(expressionAttributeNames).length > 0) {
        scanOptions.ExpressionAttributeNames = expressionAttributeNames;
      }
    }

    const result = await scan(SYNC_HISTORY_TABLE, scanOptions);

    // Sort by timestamp descending
    return result.items.sort((a, b) => b.syncTimestamp - a.syncTimestamp);
  }
}

module.exports = new SyncService();
