/**
 * Daily Sync Lambda Handler
 * Lightweight daily sync for core portfolio data (5-8s target)
 *
 * Syncs:
 * - Accounts (cached 7 days)
 * - Positions
 * - Balances
 * - Market quotes (non-WebSocket symbols)
 *
 * Does NOT sync:
 * - Activities (handled by activities-sync Lambda)
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, PutCommand, UpdateCommand, BatchGetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const axios = require('axios');

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Environment variables
const PERSONS_TABLE = process.env.PERSONS_TABLE;
const TOKENS_TABLE = process.env.TOKENS_TABLE;
const ACCOUNTS_TABLE = process.env.ACCOUNTS_TABLE;
const POSITIONS_TABLE = process.env.POSITIONS_TABLE;
const CACHE_TABLE = process.env.CACHE_TABLE;
const SYMBOLS_MASTER_TABLE = process.env.SYMBOLS_MASTER_TABLE;

// Logger
const logger = {
  info: (msg, data = {}) => console.log(JSON.stringify({ level: 'INFO', message: msg, ...data })),
  error: (msg, data = {}) => console.error(JSON.stringify({ level: 'ERROR', message: msg, ...data })),
  debug: (msg, data = {}) => console.log(JSON.stringify({ level: 'DEBUG', message: msg, ...data }))
};

/**
 * Main handler
 */
exports.handler = async (event) => {
  const startTime = Date.now();
  logger.info('[DAILY SYNC] Starting daily sync for all active persons');

  try {
    // Get all active persons
    const persons = await getAllActivePersons();
    logger.info(`Found ${persons.length} active persons`);

    if (persons.length === 0) {
      return successResponse({ message: 'No active persons to sync', duration: 0 });
    }

    // Sync each person in parallel
    const results = await Promise.allSettled(
      persons.map(person => syncPersonDaily(person.personName))
    );

    // Count successes and failures
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    const duration = (Date.now() - startTime) / 1000;
    logger.info(`[DAILY SYNC] Completed in ${duration}s (${successful} succeeded, ${failed} failed)`);

    return successResponse({
      message: 'Daily sync completed',
      duration,
      personsProcessed: persons.length,
      successful,
      failed,
      results: results.map((r, i) => ({
        personName: persons[i].personName,
        status: r.status,
        error: r.status === 'rejected' ? r.reason.message : undefined
      }))
    });

  } catch (error) {
    logger.error('[DAILY SYNC] Fatal error', { error: error.message, stack: error.stack });
    return errorResponse(error.message);
  }
};

/**
 * Sync single person - daily lightweight sync
 */
async function syncPersonDaily(personName) {
  const personStart = Date.now();
  logger.info(`[${personName}] Starting daily sync`);

  try {
    // 1. Get valid access token
    const tokenData = await getValidAccessToken(personName);
    const { accessToken, apiServer } = tokenData;

    // 2. Get accounts (with 7-day caching)
    const accounts = await getAccountsWithCache(personName, apiServer, accessToken);
    logger.info(`[${personName}] Found ${accounts.length} accounts`);

    // 3. Sync all accounts in parallel
    await Promise.all(
      accounts.map(account => syncAccountData(account, personName, apiServer, accessToken))
    );

    const duration = (Date.now() - personStart) / 1000;
    logger.info(`[${personName}] Daily sync completed in ${duration}s`);

    return { personName, success: true, duration };

  } catch (error) {
    logger.error(`[${personName}] Daily sync failed`, { error: error.message });
    throw error;
  }
}

/**
 * Sync account data (positions, balances)
 */
async function syncAccountData(account, personName, apiServer, accessToken) {
  const accountId = account.number;

  try {
    // Get positions and balances in parallel
    const [positions, balances] = await Promise.all([
      getPositions(accountId, apiServer, accessToken),
      getBalances(accountId, apiServer, accessToken)
    ]);

    // Update accounts table
    await updateAccountInDB(accountId, personName, account, balances);

    // Update positions table with company names
    if (positions && positions.length > 0) {
      // Enrich positions with company names (smart sync - only fetches for new symbols)
      const enrichedPositions = await enrichPositionsWithCompanyNames(positions, apiServer, accessToken);
      await updatePositionsInDB(enrichedPositions, accountId, personName);
    }

    logger.debug(`[${personName}] Account ${accountId} synced (${positions.length} positions)`);

  } catch (error) {
    logger.error(`[${personName}] Failed to sync account ${accountId}`, { error: error.message });
    throw error;
  }
}

/**
 * Get all active persons from DynamoDB
 */
async function getAllActivePersons() {
  try {
    const command = new ScanCommand({
      TableName: PERSONS_TABLE,
      FilterExpression: 'isActive = :isActive',
      ExpressionAttributeValues: {
        ':isActive': true
      }
    });

    const response = await docClient.send(command);
    return response.Items || [];
  } catch (error) {
    logger.error('Failed to get active persons', { error: error.message });
    throw error;
  }
}

/**
 * Get valid access token for person
 */
async function getValidAccessToken(personName) {
  try {
    // Query for active access token
    const command = new QueryCommand({
      TableName: TOKENS_TABLE,
      KeyConditionExpression: 'personName = :personName AND tokenType = :tokenType',
      FilterExpression: 'isActive = :isActive',
      ExpressionAttributeValues: {
        ':personName': personName,
        ':tokenType': 'access',
        ':isActive': true
      },
      Limit: 1
    });

    const response = await docClient.send(command);

    if (!response.Items || response.Items.length === 0) {
      throw new Error(`No active access token found for ${personName}`);
    }

    const token = response.Items[0];
    return {
      accessToken: token.accessToken,
      apiServer: token.apiServer
    };

  } catch (error) {
    logger.error(`Failed to get access token for ${personName}`, { error: error.message });
    throw error;
  }
}

/**
 * Get accounts with 7-day caching
 */
async function getAccountsWithCache(personName, apiServer, accessToken) {
  const cacheKey = `accounts-${personName}`;

  try {
    // Check cache first
    const cached = await getCacheItem(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      logger.info(`[${personName}] Using cached accounts (expires in ${Math.round((cached.expiresAt - Date.now()) / 1000 / 60 / 60)} hours)`);
      return cached.data;
    }

    // Cache miss - fetch from Questrade API
    logger.info(`[${personName}] Cache miss, fetching accounts from Questrade`);
    const accounts = await questradeRequest(apiServer, '/v1/accounts', accessToken);

    // Store in cache (7 days)
    const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000);
    await putCacheItem(cacheKey, accounts.accounts, expiresAt);

    return accounts.accounts;

  } catch (error) {
    logger.error(`[${personName}] Failed to get accounts`, { error: error.message });
    throw error;
  }
}

/**
 * Get positions for account
 */
async function getPositions(accountId, apiServer, accessToken) {
  try {
    const response = await questradeRequest(apiServer, `/v1/accounts/${accountId}/positions`, accessToken);
    return response.positions || [];
  } catch (error) {
    logger.error(`Failed to get positions for account ${accountId}`, { error: error.message });
    throw error;
  }
}

/**
 * Get balances for account
 */
async function getBalances(accountId, apiServer, accessToken) {
  try {
    const response = await questradeRequest(apiServer, `/v1/accounts/${accountId}/balances`, accessToken);
    return response;
  } catch (error) {
    logger.error(`Failed to get balances for account ${accountId}`, { error: error.message });
    throw error;
  }
}

/**
 * Make Questrade API request
 */
async function questradeRequest(apiServer, endpoint, accessToken) {
  const url = `${apiServer}${endpoint}`;

  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      timeout: 10000
    });

    return response.data;

  } catch (error) {
    if (error.response) {
      throw new Error(`Questrade API error: ${error.response.status} ${error.response.statusText}`);
    }
    throw error;
  }
}

/**
 * Get cache item from DynamoDB
 */
async function getCacheItem(cacheKey) {
  try {
    const command = new QueryCommand({
      TableName: CACHE_TABLE,
      KeyConditionExpression: 'cacheKey = :cacheKey',
      ExpressionAttributeValues: {
        ':cacheKey': cacheKey
      },
      Limit: 1
    });

    const response = await docClient.send(command);
    return response.Items && response.Items.length > 0 ? response.Items[0] : null;

  } catch (error) {
    logger.debug(`Cache miss for ${cacheKey}`, { error: error.message });
    return null;
  }
}

/**
 * Put cache item in DynamoDB
 */
async function putCacheItem(cacheKey, data, expiresAt) {
  try {
    const command = new PutCommand({
      TableName: CACHE_TABLE,
      Item: {
        cacheKey,
        data,
        expiresAt,
        ttl: Math.floor(expiresAt / 1000),
        cachedAt: Date.now()
      }
    });

    await docClient.send(command);

  } catch (error) {
    logger.error(`Failed to cache item ${cacheKey}`, { error: error.message });
    // Don't throw - caching is not critical
  }
}

/**
 * Enrich positions with company names (Smart Sync)
 * Only fetches company names for symbols not in master table
 */
async function enrichPositionsWithCompanyNames(positions, apiServer, accessToken) {
  try {
    // Extract unique symbols from positions
    const uniqueSymbols = [...new Set(positions.map(p => p.symbol))];

    if (uniqueSymbols.length === 0) {
      return positions;
    }

    logger.info(`Enriching ${positions.length} positions with company names (${uniqueSymbols.length} unique symbols)`);

    // Batch fetch existing symbols from master table
    const existingSymbols = await batchGetSymbolsFromMaster(uniqueSymbols);

    // Create a map of symbol -> company name for quick lookup
    const companyNameMap = new Map();
    existingSymbols.forEach(symbolData => {
      if (symbolData.companyName) {
        companyNameMap.set(symbolData.symbol, symbolData.companyName);
      }
    });

    // Identify symbols not in master table (new symbols)
    const existingSymbolSet = new Set(existingSymbols.map(s => s.symbol));
    const newSymbols = uniqueSymbols.filter(symbol => !existingSymbolSet.has(symbol));

    if (newSymbols.length > 0) {
      logger.info(`Detected ${newSymbols.length} new symbols, fetching from Questrade API`);

      // Fetch new symbols from Questrade API and store in master table
      await fetchAndStoreNewSymbols(newSymbols, positions, apiServer, accessToken, companyNameMap);
    } else {
      logger.info(`All symbols already in master table, no API calls needed`);
    }

    // Enrich positions with company names
    const enrichedPositions = positions.map(position => ({
      ...position,
      companyName: companyNameMap.get(position.symbol) || null
    }));

    return enrichedPositions;

  } catch (error) {
    logger.error('Failed to enrich positions with company names', { error: error.message });
    // Return original positions if enrichment fails (non-critical)
    return positions;
  }
}

/**
 * Batch fetch symbols from master table
 */
async function batchGetSymbolsFromMaster(symbols) {
  try {
    if (symbols.length === 0) {
      return [];
    }

    // DynamoDB BatchGetItem supports max 100 items
    const chunks = [];
    for (let i = 0; i < symbols.length; i += 100) {
      chunks.push(symbols.slice(i, i + 100));
    }

    const allResults = [];

    for (const chunk of chunks) {
      const keys = chunk.map(symbol => ({ symbol }));

      const command = new BatchGetCommand({
        RequestItems: {
          [SYMBOLS_MASTER_TABLE]: {
            Keys: keys
          }
        }
      });

      const response = await docClient.send(command);
      const items = response.Responses?.[SYMBOLS_MASTER_TABLE] || [];
      allResults.push(...items);
    }

    logger.debug(`Fetched ${allResults.length}/${symbols.length} symbols from master table`);
    return allResults;

  } catch (error) {
    logger.error('Failed to batch get symbols from master', { error: error.message });
    return [];
  }
}

/**
 * Fetch new symbols from Questrade API and store in master table
 */
async function fetchAndStoreNewSymbols(newSymbols, positions, apiServer, accessToken, companyNameMap) {
  try {
    // Get symbolIds for new symbols from positions
    const symbolIdMap = new Map();
    positions.forEach(p => {
      if (newSymbols.includes(p.symbol)) {
        symbolIdMap.set(p.symbol, p.symbolId);
      }
    });

    // Fetch each new symbol from Questrade API
    const fetchPromises = newSymbols.map(async (symbol) => {
      try {
        const symbolId = symbolIdMap.get(symbol);
        if (!symbolId) {
          logger.warn(`No symbolId found for symbol ${symbol}`);
          return null;
        }

        // Fetch symbol details from Questrade
        const symbolData = await questradeRequest(apiServer, `/v1/symbols/${symbolId}`, accessToken);

        if (symbolData && symbolData.symbols && symbolData.symbols.length > 0) {
          const symbolInfo = symbolData.symbols[0];
          const companyName = symbolInfo.description || symbolInfo.symbol;

          // Store in master table
          await storeSymbolInMaster(symbol, symbolId, companyName);

          // Add to map for enrichment
          companyNameMap.set(symbol, companyName);

          logger.info(`Fetched and stored new symbol: ${symbol} - ${companyName}`);
          return { symbol, companyName };
        }

        return null;

      } catch (error) {
        logger.error(`Failed to fetch symbol ${symbol}`, { error: error.message });
        return null;
      }
    });

    await Promise.all(fetchPromises);

  } catch (error) {
    logger.error('Failed to fetch and store new symbols', { error: error.message });
  }
}

/**
 * Store symbol in master table
 */
async function storeSymbolInMaster(symbol, symbolId, companyName) {
  try {
    const command = new PutCommand({
      TableName: SYMBOLS_MASTER_TABLE,
      Item: {
        symbol,
        symbolId: String(symbolId),
        companyName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'daily-sync'
      }
    });

    await docClient.send(command);
    logger.debug(`Stored symbol in master: ${symbol}`);

  } catch (error) {
    logger.error(`Failed to store symbol ${symbol} in master`, { error: error.message });
    throw error;
  }
}

/**
 * Update account in DynamoDB
 */
async function updateAccountInDB(accountId, personName, accountData, balances) {
  try {
    const command = new PutCommand({
      TableName: ACCOUNTS_TABLE,
      Item: {
        accountId,
        personName,
        accountType: accountData.type,
        accountNumber: accountData.number,
        status: accountData.status,
        isPrimary: accountData.isPrimary || false,
        isBilling: accountData.isBilling || false,
        clientAccountType: accountData.clientAccountType,
        totalEquity: balances.perCurrencyBalances?.[0]?.totalEquity || 0,
        cash: balances.perCurrencyBalances?.[0]?.cash || 0,
        marketValue: balances.perCurrencyBalances?.[0]?.marketValue || 0,
        currency: balances.perCurrencyBalances?.[0]?.currency || 'CAD',
        updatedAt: new Date().toISOString(),
        lastSyncTime: Date.now()
      }
    });

    await docClient.send(command);

  } catch (error) {
    logger.error(`Failed to update account ${accountId}`, { error: error.message });
    throw error;
  }
}

/**
 * Update positions in DynamoDB
 */
async function updatePositionsInDB(positions, accountId, personName) {
  try {
    // Update each position
    await Promise.all(
      positions.map(async (position) => {
        const item = {
          accountId,
          symbolId: String(position.symbolId),
          personName,
          symbol: position.symbol,
          openQuantity: position.openQuantity || 0,
          closedQuantity: position.closedQuantity || 0,
          currentMarketValue: position.currentMarketValue || 0,
          currentPrice: position.currentPrice || 0,
          averageEntryPrice: position.averageEntryPrice || 0,
          totalCost: position.totalCost || 0,
          isRealTime: position.isRealTime || false,
          isUnderReorg: position.isUnderReorg || false,
          updatedAt: new Date().toISOString(),
          lastSyncTime: Date.now()
        };

        // Add company name if available
        if (position.companyName) {
          item.companyName = position.companyName;
        }

        const command = new PutCommand({
          TableName: POSITIONS_TABLE,
          Item: item
        });

        await docClient.send(command);
      })
    );

  } catch (error) {
    logger.error(`Failed to update positions for account ${accountId}`, { error: error.message });
    throw error;
  }
}

/**
 * Success response helper
 */
function successResponse(data) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      success: true,
      ...data
    })
  };
}

/**
 * Error response helper
 */
function errorResponse(message) {
  return {
    statusCode: 500,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      success: false,
      error: message
    })
  };
}
