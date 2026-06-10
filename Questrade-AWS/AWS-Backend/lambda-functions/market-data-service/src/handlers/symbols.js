/**
 * Symbol Handlers
 * Search and get symbol information
 */

const logger = require('../../shared/utils/logger');
const response = require('../../shared/utils/response');
const { scan, query, getItem } = require('../../shared/utils/dynamodb');
const { decrypt } = require('../../shared/utils/crypto');
const tokenManager = require('../../shared/utils/tokenManager');
const axios = require('axios');

const SYMBOLS_TABLE = process.env.SYMBOLS_TABLE;
const SYMBOLS_MASTER_TABLE = process.env.SYMBOLS_MASTER_TABLE;
const POSITIONS_TABLE = process.env.POSITIONS_TABLE;
const PERSONS_TABLE = process.env.PERSONS_TABLE;
const TOKENS_TABLE = process.env.TOKENS_TABLE;

// Helper to get a valid access token via the shared token service (on-demand locked refresh).
async function getAccessToken(personName) {
  const tokenData = await tokenManager.getValidAccessToken(personName);
  return { accessToken: tokenData.accessToken, apiServer: tokenData.apiServer };
}

// Helper to call Questrade API. Retries once on 401 by forcing a token refresh
// (recovers from an expired or Questrade-invalidated access token).
async function callQuestradeApi(personName, endpoint, _retried = false) {
  let tokenData;
  try {
    tokenData = await getAccessToken(personName);

    // apiServer already has a host; ensure single trailing slash, then strip leading / from endpoint.
    const baseUrl = tokenData.apiServer.endsWith('/') ? tokenData.apiServer : `${tokenData.apiServer}/`;
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
    const url = `${baseUrl}${cleanEndpoint}`;

    logger.info(`Calling Questrade API: ${url}`);

    const res = await axios.get(url, {
      headers: { 'Authorization': `Bearer ${tokenData.accessToken}` },
      timeout: 30000
    });

    return res.data;
  } catch (error) {
    const status = error.response?.status || error.status;

    // On 401, force a single refresh and retry once.
    if (status === 401 && !_retried) {
      logger.warn(`Questrade 401 for ${personName} — forcing token refresh and retrying once`);
      await tokenManager.refreshAccessToken(personName);
      return callQuestradeApi(personName, endpoint, true);
    }

    // Extract safe error info to avoid circular references from Axios
    if (error.response) {
      const safeError = new Error(`Questrade API error: ${error.response.status} ${error.response.statusText}`);
      safeError.status = error.response.status;
      safeError.statusText = error.response.statusText;
      safeError.data = error.response.data;
      throw safeError;
    }
    // Re-throw non-Axios errors as-is
    throw error;
  }
}

/**
 * GET /api/symbols
 * Get all symbols (paginated)
 */
async function getSymbols(event) {
  try {
    const limit = parseInt(event.queryStringParameters?.limit || '100');

    const result = await scan(SYMBOLS_TABLE, {
      Limit: limit
    });

    return response.success({
      symbols: result.items,
      count: result.items.length
    });

  } catch (error) {
    logger.error('Get symbols handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * GET /api/symbols/search
 * Search for symbols
 */
async function searchSymbols(event) {
  try {
    const searchTerm = event.queryStringParameters?.q;

    if (!searchTerm) {
      return response.badRequest('Search term (q) is required');
    }

    // Simple scan with filter (in production, consider using OpenSearch/ElasticSearch)
    const result = await scan(SYMBOLS_TABLE, {
      FilterExpression: 'contains(symbol, :term) OR contains(description, :term)',
      ExpressionAttributeValues: {
        ':term': searchTerm.toUpperCase()
      },
      Limit: 50
    });

    return response.success({
      searchTerm,
      symbols: result.items,
      count: result.items.length
    });

  } catch (error) {
    logger.error('Search symbols handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * POST /api/symbols/lookup
 * Batch lookup symbol IDs for WebSocket subscription
 *
 * Strategy: Check SymbolsMasterTable FIRST (single source of truth)
 * If not found → Fetch from Questrade → Insert into master table
 */
async function lookupSymbols(event) {
  try {
    const body = JSON.parse(event.body || '{}');
    const symbols = body.symbols;
    const { putItem } = require('../../shared/utils/dynamodb');

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return response.badRequest('symbols must be a non-empty array');
    }

    logger.info(`Looking up ${symbols.length} symbols: ${symbols.join(', ')}`);

    const result = {};
    const symbolsToFetch = [];

    // TIER 1: Check SymbolsMasterTable FIRST (single source of truth)
    for (const symbol of symbols) {
      const upperSymbol = symbol.toUpperCase();

      try {
        const masterResult = await query(
          SYMBOLS_MASTER_TABLE,
          'symbol = :symbol',
          { ':symbol': upperSymbol },
          { Limit: 1 }
        );

        if (masterResult.items.length > 0) {
          const master = masterResult.items[0];
          result[upperSymbol] = {
            symbolId: master.symbolId,
            symbol: master.symbol,
            description: master.companyName || master.symbol,
            currency: master.currency || 'USD',
            // Include dividend data for frontend
            dividendData: master.dividendData || null,
            portfolioSettings: master.portfolioSettings || null
          };
          logger.info(`Found ${symbol} in master table: symbolId=${master.symbolId}`);
        } else {
          symbolsToFetch.push(symbol);
        }
      } catch (error) {
        logger.warn(`Failed to query master table for ${symbol}:`, error.message);
        symbolsToFetch.push(symbol);
      }
    }

    // If all symbols found in master table, return
    if (symbolsToFetch.length === 0) {
      logger.info(`✅ All ${symbols.length} symbols found in master table`);
      return response.success(result);
    }

    // TIER 2: Fetch missing symbols from Questrade
    logger.info(`Fetching ${symbolsToFetch.length} symbols from Questrade: ${symbolsToFetch.join(', ')}`);

    // Get any active person's token (for market data, not portfolio data)
    const personsResult = await scan(PERSONS_TABLE, {
      FilterExpression: 'isActive = :active',
      ExpressionAttributeValues: { ':active': true }
    });

    if (personsResult.items.length === 0) {
      return response.badRequest('No active persons available');
    }

    const personName = personsResult.items[0].personName;

    // Get access token ONCE before loop
    const tokenData = await getAccessToken(personName);
    logger.info(`Using ${personName}'s token to fetch ${symbolsToFetch.length} symbols`);

    // Fetch each symbol from Questrade and insert into master table
    for (const symbol of symbolsToFetch) {
      try {
        const url = `${tokenData.apiServer}/v1/symbols/search?prefix=${symbol}`;
        const searchResponse = await axios.get(url, {
          headers: {
            'Authorization': `Bearer ${tokenData.accessToken}`
          },
          timeout: 30000
        });

        const searchResults = searchResponse.data.symbols || [];
        const exactMatch = searchResults.find(s => s.symbol === symbol.toUpperCase());

        if (exactMatch) {
          // Prepare master record
          const masterRecord = {
            symbol: exactMatch.symbol,
            symbolId: String(exactMatch.symbolId),
            currency: exactMatch.currency || 'USD',
            companyName: exactMatch.description || exactMatch.symbol,
            securityType: exactMatch.securityType,
            exchange: exactMatch.exchange,

            // Default dividend data (will be updated by sync job)
            dividendData: {
              dividendPerMonth: 0,
              dividendFrequency: 0,
              annualDividend: 0,
              currentYield: 0,
              lastDividendDate: null,
              lastDividendAmount: 0,
              isManualOverride: false,
              questradeLastAmount: 0,
              lastVerifiedDate: null,
              notes: null
            },

            // Default portfolio settings
            portfolioSettings: {
              includeInYOC: true,  // Default: include in YOC
              excludeReason: null,
              isWatchlistOnly: false,
              category: null
            },

            // Metadata
            createdAt: Date.now(),
            updatedAt: Date.now(),
            lastQuestradeSyncAt: Date.now(),
            syncStatus: 'auto_synced',
            needsReview: 'false',  // String for GSI
            source: 'questrade_api'
          };

          // Insert into master table
          try {
            await putItem(SYMBOLS_MASTER_TABLE, masterRecord);
            logger.info(`✅ Inserted ${symbol} into master table: symbolId=${exactMatch.symbolId}`);
          } catch (insertError) {
            logger.error(`Failed to insert ${symbol} into master table:`, insertError.message);
          }

          // Add to result
          result[exactMatch.symbol] = {
            symbolId: String(exactMatch.symbolId),
            symbol: exactMatch.symbol,
            description: exactMatch.description,
            currency: exactMatch.currency,
            dividendData: masterRecord.dividendData,
            portfolioSettings: masterRecord.portfolioSettings
          };

        } else {
          result[symbol.toUpperCase()] = {
            symbolId: null,
            symbol: symbol.toUpperCase(),
            error: 'Symbol not found'
          };
        }
      } catch (error) {
        logger.error(`Failed to lookup symbol ${symbol}:`, error.message);
        result[symbol.toUpperCase()] = {
          symbolId: null,
          symbol: symbol.toUpperCase(),
          error: error.message
        };
      }
    }

    return response.success(result);

  } catch (error) {
    logger.error('Lookup symbols handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * POST /api/symbols/stream-port
 * Get WebSocket stream port from Questrade
 */
async function getStreamPort(event) {
  try {
    const body = JSON.parse(event.body || '{}');
    const { symbolIds, personName } = body;

    if (!symbolIds || !Array.isArray(symbolIds) || symbolIds.length === 0) {
      return response.badRequest('symbolIds must be a non-empty array');
    }

    if (!personName) {
      return response.badRequest('personName is required');
    }

    logger.info(`Getting stream port for ${symbolIds.length} symbols for ${personName}`);

    // Build the URL to get stream port
    const idsParam = symbolIds.join(',');
    const endpoint = `/v1/markets/quotes?ids=${idsParam}&stream=true&mode=WebSocket`;

    // Make request to Questrade
    const data = await callQuestradeApi(personName, endpoint);

    if (!data.streamPort) {
      throw new Error('No streamPort in Questrade response');
    }

    logger.info(`Got stream port: ${data.streamPort}`);

    return response.success({ streamPort: data.streamPort });

  } catch (error) {
    logger.error('Get stream port handler error', { error: error.message });
    return response.handleError(error);
  }
}

module.exports = {
  getSymbols,
  searchSymbols,
  lookupSymbols,
  getStreamPort
};
