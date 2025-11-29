/**
 * Questrade Dividend Sync Service
 * Fetches dividend data from Questrade /symbols/{id} API and stores in symbol-dividends table
 */

const logger = require('../../shared/utils/logger');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { decrypt } = require('../../shared/utils/crypto');

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

const SYMBOL_DIVIDENDS_TABLE = process.env.SYMBOL_DIVIDENDS_TABLE || 'questrade-symbol-dividends-dev';
const POSITIONS_TABLE = process.env.POSITIONS_TABLE || 'questrade-positions-dev';
const TOKENS_TABLE = process.env.TOKENS_TABLE || 'questrade-tokens-dev';

/**
 * Get frequency multiplier for annual dividend calculation
 * @param {string} frequency - Dividend frequency (monthly, quarterly, etc.)
 * @returns {number} - Multiplier for annual calculation
 */
function getFrequencyMultiplier(frequency) {
  const multipliers = {
    'monthly': 12,
    'semi-monthly': 24,
    'quarterly': 4,
    'semi-annual': 2,
    'annual': 1,
    'none': 0,
    'unknown': 0
  };
  return multipliers[frequency?.toLowerCase()] || 0;
}

/**
 * Sync dividend data for all symbols from Questrade API
 * @param {string} triggerType - SCHEDULED or MANUAL
 * @returns {Promise<Object>} - Sync results
 */
async function syncDividendsFromQuestrade(triggerType = 'MANUAL') {
  logger.info(`[QUESTRADE DIVIDEND SYNC] Starting dividend sync (trigger: ${triggerType})...`);

  try {
    // Step 1: Get all unique symbols from positions table
    const symbols = await getAllUniqueSymbols();
    logger.info(`[QUESTRADE DIVIDEND SYNC] Found ${symbols.length} unique symbols`);

    // Step 2: Get access token for Questrade API calls
    const tokenData = await getActiveAccessToken();
    if (!tokenData) {
      throw new Error('No active access token found');
    }

    const { accessToken, apiServer } = tokenData;

    // Step 3: Fetch dividend data for each symbol
    const results = {
      total: symbols.length,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: []
    };

    for (const symbolInfo of symbols) {
      try {
        await syncSymbolDividend(symbolInfo, accessToken, apiServer, results);

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        logger.error(`[QUESTRADE DIVIDEND SYNC] Failed to sync ${symbolInfo.symbol}:`, { error: error.message });
        results.failed++;
        results.errors.push({ symbol: symbolInfo.symbol, error: error.message });
      }
    }

    logger.info(`[QUESTRADE DIVIDEND SYNC] Completed: ${results.updated} updated, ${results.skipped} skipped, ${results.failed} failed`);

    // IMPORTANT: After syncing dividends from Questrade, we need to resync positions
    // so the positions table gets updated with the new dividend values
    // from the symbol-dividends table
    logger.info('[QUESTRADE DIVIDEND SYNC] Triggering positions resync to update dividend data...');

    try {
      const syncService = require('./syncService');

      // Get all unique persons from positions
      const personNames = await getAllActivePersons();
      logger.info(`[QUESTRADE DIVIDEND SYNC] Resyncing positions for ${personNames.length} active persons`);

      for (const personName of personNames) {
        try {
          await syncService.syncPerson(personName, 'positions');
          logger.info(`[QUESTRADE DIVIDEND SYNC] Positions resynced for ${personName}`);
        } catch (error) {
          logger.warn(`[QUESTRADE DIVIDEND SYNC] Failed to resync positions for ${personName}: ${error.message}`);
        }
      }

      logger.info('[QUESTRADE DIVIDEND SYNC] Positions resync completed');
    } catch (error) {
      logger.error('[QUESTRADE DIVIDEND SYNC] Failed to resync positions:', { error: error.message });
      // Don't throw - dividend sync itself was successful
    }

    return {
      success: true,
      triggerType,
      results,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    logger.error('[QUESTRADE DIVIDEND SYNC] Sync failed:', { error: error.message });
    throw error;
  }
}

/**
 * Get all unique symbols from positions table
 * @returns {Promise<Array>} - Array of unique symbols with symbolId
 */
async function getAllUniqueSymbols() {
  const params = {
    TableName: POSITIONS_TABLE,
    ProjectionExpression: 'symbol, symbolId'
  };

  const result = await ddb.send(new ScanCommand(params));

  // De-duplicate symbols
  const symbolMap = new Map();
  result.Items.forEach(item => {
    if (item.symbol && item.symbolId) {
      symbolMap.set(item.symbol, { symbol: item.symbol, symbolId: item.symbolId });
    }
  });

  return Array.from(symbolMap.values());
}

/**
 * Get active access token for API calls
 * @returns {Promise<Object>} - Token data
 */
async function getActiveAccessToken() {
  // Get token for first active person (Vivek)
  const params = {
    TableName: TOKENS_TABLE,
    Key: {
      personName: 'Vivek',
      tokenType: 'access'
    }
  };

  const result = await ddb.send(new GetCommand(params));

  if (!result.Item || !result.Item.isActive) {
    return null;
  }

  return {
    accessToken: decrypt(result.Item.encryptedToken),
    apiServer: result.Item.apiServer
  };
}

/**
 * Sync dividend data for a single symbol
 * @param {Object} symbolInfo - Symbol info with symbol and symbolId
 * @param {string} accessToken - Questrade access token
 * @param {string} apiServer - Questrade API server
 * @param {Object} results - Results object to update
 */
async function syncSymbolDividend(symbolInfo, accessToken, apiServer, results) {
  const { symbol, symbolId} = symbolInfo;

  // Step 1: Get existing data (check for manual override)
  const existingData = await getSymbolDividendData(symbol);
  const hasManualOverride = existingData && existingData.isManualOverride === 'true';

  // Step 2: Fetch dividend data from Questrade API
  const dividendData = await fetchQuestradeSymbolData(symbolId, accessToken, apiServer);

  if (!dividendData || !dividendData.dividend || dividendData.dividend === 0) {
    logger.info(`[QUESTRADE DIVIDEND SYNC] No dividend data for ${symbol}`);
    results.skipped++;
    return;
  }

  // Step 3: Calculate monthly dividend per share from Questrade
  // Get frequency from existing data, or default to 'unknown'
  const frequency = existingData?.dividendFrequency || 'unknown';
  const multiplier = getFrequencyMultiplier(frequency);

  // Questrade's dividend field is per-payment amount
  // Annual = dividend × multiplier
  // Monthly = Annual / 12
  const annualDividend = multiplier > 0 ? dividendData.dividend * multiplier : 0;
  const dividendPerShare = multiplier > 0 ? annualDividend / 12 : 0;

  // Step 4: Prepare data to store
  const dataToStore = {
    dividendPerShare, // ALWAYS update with Questrade value
    dividendFrequency: frequency,
    questradeData: {
      dividend: dividendData.dividend,
      yield: dividendData.yield,
      exDate: dividendData.exDate,
      dividendDate: dividendData.dividendDate
    },
    lastSyncTimestamp: new Date().toISOString()
  };

  // If manual override exists, preserve overrideValue and isManualOverride flag
  if (hasManualOverride) {
    dataToStore.isManualOverride = 'true';
    dataToStore.overrideValue = existingData.overrideValue; // Preserve override
    logger.info(`[QUESTRADE DIVIDEND SYNC] Updated ${symbol} with override: Questrade=$${dividendPerShare.toFixed(4)}, Override=$${existingData.overrideValue}`);
  } else {
    dataToStore.isManualOverride = 'false';
    logger.info(`[QUESTRADE DIVIDEND SYNC] Updated ${symbol}: $${dividendData.dividend} per payment, frequency: ${frequency}, monthly: $${dividendPerShare.toFixed(4)}`);
  }

  // Step 5: Store in symbol-dividends table
  await storeSymbolDividend(symbol, dataToStore);

  results.updated++;
}

/**
 * Get existing symbol dividend data
 * @param {string} symbol - Stock symbol
 * @returns {Promise<Object>} - Existing data or null
 */
async function getSymbolDividendData(symbol) {
  const params = {
    TableName: SYMBOL_DIVIDENDS_TABLE,
    Key: { symbol }
  };

  const result = await ddb.send(new GetCommand(params));
  return result.Item || null;
}

/**
 * Fetch symbol data from Questrade API
 * @param {string} symbolId - Questrade symbol ID
 * @param {string} accessToken - Access token
 * @param {string} apiServer - API server URL
 * @returns {Promise<Object>} - Symbol data with dividend info
 */
async function fetchQuestradeSymbolData(symbolId, accessToken, apiServer) {
  const url = `${apiServer}/v1/symbols/${symbolId}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`Questrade API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  return {
    dividend: data.symbols?.[0]?.dividend || 0,
    yield: data.symbols?.[0]?.yield || 0,
    exDate: data.symbols?.[0]?.exDate || null,
    dividendDate: data.symbols?.[0]?.dividendDate || null
  };
}

/**
 * Store symbol dividend data in DynamoDB
 * @param {string} symbol - Stock symbol
 * @param {Object} data - Dividend data to store
 */
async function storeSymbolDividend(symbol, data) {
  const params = {
    TableName: SYMBOL_DIVIDENDS_TABLE,
    Item: {
      symbol,
      ...data,
      updatedAt: new Date().toISOString()
    }
  };

  await ddb.send(new PutCommand(params));
}

/**
 * Get all active persons from tokens table
 * @returns {Promise<Array<string>>} - Array of person names
 */
async function getAllActivePersons() {
  const params = {
    TableName: POSITIONS_TABLE,
    ProjectionExpression: 'personName'
  };

  const result = await ddb.send(new ScanCommand(params));

  // De-duplicate person names
  const personSet = new Set();
  result.Items.forEach(item => {
    if (item.personName) {
      personSet.add(item.personName);
    }
  });

  return Array.from(personSet);
}

module.exports = {
  syncDividendsFromQuestrade
};
