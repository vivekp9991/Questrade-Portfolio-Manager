const Symbol = require('../models/Symbol');
const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config/environment');

class SymbolService {
  constructor() {
    this.authApiUrl = config.services.authApiUrl;
    // In-memory cache for symbol IDs (permanent - symbol IDs never change)
    this.symbolIdCache = new Map(); // symbol -> { symbolId, symbol, description, currency }
    // In-memory cache for stream ports (24-hour TTL - ports change daily)
    this.streamPortCache = new Map(); // personName -> { streamPort, expiresAt }
  }

  async searchSymbols(prefix, limit = 10) {
    try {
      // Search in local database first
      let symbols = await Symbol.searchSymbols(prefix, limit);
      
      if (symbols.length > 0) {
        return symbols;
      }
      
      // If not found locally, search in Questrade
      symbols = await this.searchSymbolsInQuestrade(prefix, limit);
      
      // Save to local database
      for (const symbol of symbols) {
        await Symbol.findOneAndUpdate(
          { symbol: symbol.symbol },
          symbol,
          { upsert: true }
        );
      }
      
      return symbols;
    } catch (error) {
      logger.error('Failed to search symbols:', error);
      throw error;
    }
  }

  async searchSymbolsInQuestrade(prefix, limit) {
    try {
      const person = await this.getAvailablePerson();
      
      const response = await axios.get(
        `${this.authApiUrl}/auth/access-token/${person}`
      );
      
      const tokenData = response.data.data;
      
      const searchResponse = await axios.get(
        `${tokenData.apiServer}/v1/symbols/search?prefix=${prefix}`,
        {
          headers: {
            'Authorization': `Bearer ${tokenData.accessToken}`
          }
        }
      );
      
      const symbols = searchResponse.data.symbols || [];
      
      return symbols.slice(0, limit).map(s => ({
        symbol: s.symbol,
        symbolId: s.symbolId,
        description: s.description,
        securityType: s.securityType,
        exchange: s.exchange,
        currency: s.currency,
        isTradable: s.isTradable,
        isQuotable: s.isQuotable,
        hasOptions: s.hasOptions
      }));
    } catch (error) {
      logger.error('Failed to search symbols in Questrade:', error);
      throw error;
    }
  }

  async getSymbolDetails(symbolId) {
    try {
      // Check local database
      let symbol = await Symbol.findOne({ symbolId });
      
      if (symbol) {
        return symbol;
      }
      
      // Fetch from Questrade
      symbol = await this.fetchSymbolFromQuestrade(symbolId);
      
      // Save to database
      if (symbol) {
        await Symbol.findOneAndUpdate(
          { symbolId },
          symbol,
          { upsert: true }
        );
      }
      
      return symbol;
    } catch (error) {
      logger.error(`Failed to get symbol details for ${symbolId}:`, error);
      throw error;
    }
  }

  /**
   * Get symbol details by symbol name (not ID)
   * This method fetches symbol details using the symbol ticker rather than symbolId
   */
  async getSymbolDetailsBySymbol(symbol, forceRefresh = false) {
    try {
      // Check local database first
      let symbolData = await Symbol.findOne({ symbol: symbol.toUpperCase() });
      
      // If we have the data and it's recent (within last hour), return it
      if (symbolData && !forceRefresh) {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        if (symbolData.lastDetailUpdate && symbolData.lastDetailUpdate > oneHourAgo) {
          return symbolData;
        }
      }
      
      // If not found or needs refresh, search in Questrade
      const person = await this.getAvailablePerson();
      
      const response = await axios.get(
        `${this.authApiUrl}/auth/access-token/${person}`
      );
      
      const tokenData = response.data.data;
      
      // Search for the symbol to get its ID
      const searchResponse = await axios.get(
        `${tokenData.apiServer}/v1/symbols/search?prefix=${symbol}`,
        {
          headers: {
            'Authorization': `Bearer ${tokenData.accessToken}`
          }
        }
      );
      
      const symbols = searchResponse.data.symbols || [];
      const exactMatch = symbols.find(s => s.symbol === symbol.toUpperCase());
      
      if (!exactMatch) {
        logger.warn(`Symbol ${symbol} not found in Questrade`);
        return symbolData; // Return existing data if available
      }
      
      // Now fetch detailed information using the symbol ID
      const symbolDetailsResponse = await axios.get(
        `${tokenData.apiServer}/v1/symbols/${exactMatch.symbolId}`,
        {
          headers: {
            'Authorization': `Bearer ${tokenData.accessToken}`
          }
        }
      );
      
      const detailedSymbolData = symbolDetailsResponse.data.symbols?.[0];
      
      if (detailedSymbolData) {
        // Create or update the symbol with all available fields
        const updatedSymbolData = {
          symbol: detailedSymbolData.symbol,
          symbolId: detailedSymbolData.symbolId,
          description: detailedSymbolData.description || exactMatch.description,
          securityType: detailedSymbolData.securityType,
          exchange: detailedSymbolData.exchange,
          listingExchange: detailedSymbolData.listingExchange,
          isTradable: detailedSymbolData.isTradable,
          isQuotable: detailedSymbolData.isQuotable,
          hasOptions: detailedSymbolData.hasOptions,
          currency: detailedSymbolData.currency,
          // Market data fields
          prevDayClosePrice: detailedSymbolData.prevDayClosePrice || 0,
          highPrice52: detailedSymbolData.highPrice52 || 0,
          lowPrice52: detailedSymbolData.lowPrice52 || 0,
          averageVol3Months: detailedSymbolData.averageVol3Months || 0,
          averageVol20Days: detailedSymbolData.averageVol20Days || 0,
          outstandingShares: detailedSymbolData.outstandingShares || 0,
          eps: detailedSymbolData.eps || 0,
          pe: detailedSymbolData.pe || 0,
          dividend: detailedSymbolData.dividend || 0,
          yield: detailedSymbolData.yield || 0,
          exDate: detailedSymbolData.exDate,
          dividendDate: detailedSymbolData.dividendDate,
          marketCap: detailedSymbolData.marketCap || 0,
          tradeUnit: detailedSymbolData.tradeUnit || 1,
          // Additional fields
          sector: detailedSymbolData.industrySector,
          industry: detailedSymbolData.industryGroup,
          industrySubGroup: detailedSymbolData.industrySubgroup,
          // Update timestamps
          lastDetailUpdate: new Date(),
          lastUpdated: new Date()
        };
        
        // Save to database
        symbolData = await Symbol.findOneAndUpdate(
          { symbol: symbol.toUpperCase() },
          updatedSymbolData,
          { upsert: true, new: true }
        );
        
        logger.info(`Updated symbol details for ${symbol}`);
      }
      
      return symbolData;
    } catch (error) {
      logger.error(`Error getting symbol details for ${symbol}:`, error);
      
      // Return existing data if available
      const existingData = await Symbol.findOne({ symbol: symbol.toUpperCase() });
      return existingData;
    }
  }

  async fetchSymbolFromQuestrade(symbolId) {
    try {
      const person = await this.getAvailablePerson();
      
      const response = await axios.get(
        `${this.authApiUrl}/auth/access-token/${person}`
      );
      
      const tokenData = response.data.data;
      
      const symbolResponse = await axios.get(
        `${tokenData.apiServer}/v1/symbols/${symbolId}`,
        {
          headers: {
            'Authorization': `Bearer ${tokenData.accessToken}`
          }
        }
      );
      
      const symbolData = symbolResponse.data.symbols?.[0];
      
      if (!symbolData) {
        return null;
      }
      
      return {
        symbol: symbolData.symbol,
        symbolId: symbolData.symbolId,
        description: symbolData.description,
        securityType: symbolData.securityType,
        exchange: symbolData.exchange,
        listingExchange: symbolData.listingExchange,
        isTradable: symbolData.isTradable,
        isQuotable: symbolData.isQuotable,
        hasOptions: symbolData.hasOptions,
        currency: symbolData.currency,
        lastUpdated: new Date()
      };
    } catch (error) {
      logger.error(`Failed to fetch symbol from Questrade:`, error);
      return null;
    }
  }

  async getOptionsChain(symbol, expiry) {
    // Simplified options chain
    // In production, this would fetch actual options data
    return {
      symbol,
      expiry: expiry || 'next',
      calls: [],
      puts: [],
      message: 'Options chain functionality not yet implemented'
    };
  }

  async getSymbolFundamentals(symbol) {
    // Simplified fundamentals
    // In production, this would fetch actual fundamental data
    return {
      symbol,
      marketCap: 0,
      pe: 0,
      eps: 0,
      dividend: 0,
      yield: 0,
      beta: 1.0,
      message: 'Fundamentals data not yet implemented'
    };
  }

  async syncSymbolFromQuestrade(symbol) {
    try {
      const person = await this.getAvailablePerson();
      
      const response = await axios.get(
        `${this.authApiUrl}/auth/access-token/${person}`
      );
      
      const tokenData = response.data.data;
      
      const searchResponse = await axios.get(
        `${tokenData.apiServer}/v1/symbols/search?prefix=${symbol}`,
        {
          headers: {
            'Authorization': `Bearer ${tokenData.accessToken}`
          }
        }
      );
      
      const symbols = searchResponse.data.symbols || [];
      const exactMatch = symbols.find(s => s.symbol === symbol);
      
      if (!exactMatch) {
        throw new Error(`Symbol ${symbol} not found`);
      }
      
      const symbolData = {
        symbol: exactMatch.symbol,
        symbolId: exactMatch.symbolId,
        description: exactMatch.description,
        securityType: exactMatch.securityType,
        exchange: exactMatch.exchange,
        currency: exactMatch.currency,
        isTradable: exactMatch.isTradable,
        isQuotable: exactMatch.isQuotable,
        hasOptions: exactMatch.hasOptions,
        lastUpdated: new Date()
      };
      
      await Symbol.findOneAndUpdate(
        { symbol: exactMatch.symbol },
        symbolData,
        { upsert: true }
      );
      
      return symbolData;
    } catch (error) {
      logger.error(`Failed to sync symbol ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Batch lookup symbol IDs for multiple symbols
   * Used by WebSocket service to convert symbol names to IDs
   * @param {Array<string>} symbols - Array of symbol names (e.g., ['AAPL', 'GOOG'])
   * @returns {Object} Map of symbol -> {symbolId, symbol}
   */
  async lookupSymbols(symbols) {
    try {
      if (!symbols || symbols.length === 0) {
        return {};
      }

      logger.info(`Looking up ${symbols.length} symbols: ${symbols.join(', ')}`);

      const result = {};
      const symbolsToFetch = [];

      // TIER 1: Check in-memory cache (fastest)
      for (const symbol of symbols) {
        const upperSymbol = symbol.toUpperCase();
        const cached = this.symbolIdCache.get(upperSymbol);

        if (cached && cached.symbolId) {
          result[upperSymbol] = cached;
          logger.debug(`Found ${symbol} in memory cache: symbolId=${cached.symbolId}`);
        } else {
          symbolsToFetch.push(symbol);
        }
      }

      // If all symbols were found in memory cache, return
      if (symbolsToFetch.length === 0) {
        logger.info(`✅ All ${symbols.length} symbols found in memory cache - NO API CALL`);
        return result;
      }

      // TIER 2: Check Position database (user's current holdings - most likely to be used)
      logger.info(`Checking Position database for ${symbolsToFetch.length} symbols...`);
      try {
        const axios = require('axios');
        const config = require('../config/environment');
        const syncApiUrl = config.services.syncApiUrl || process.env.SYNC_API_URL || 'http://localhost:4003';

        // Get all positions from Sync API
        const positionsResponse = await axios.get(`${syncApiUrl}/api/positions`, {
          timeout: 5000
        });

        if (positionsResponse.data && positionsResponse.data.success && positionsResponse.data.data) {
          const positions = positionsResponse.data.data;

          const stillNeedFetch = [];
          for (const symbol of symbolsToFetch) {
            const upperSymbol = symbol.toUpperCase();
            const position = positions.find(p => p.symbol === upperSymbol);

            if (position && position.symbolId) {
              const cacheEntry = {
                symbolId: position.symbolId,
                symbol: position.symbol,
                description: position.companyName || position.symbol,
                currency: position.currency || 'USD'
              };
              result[upperSymbol] = cacheEntry;

              // Add to memory cache (permanent)
              this.symbolIdCache.set(upperSymbol, cacheEntry);
              logger.info(`✅ Found ${symbol} in Position DB: symbolId=${position.symbolId} (added to cache)`);
            } else {
              stillNeedFetch.push(symbol);
            }
          }

          symbolsToFetch.length = 0;
          symbolsToFetch.push(...stillNeedFetch);

          if (symbolsToFetch.length === 0) {
            logger.info(`✅ All ${symbols.length} symbols found in Position DB - NO API CALL`);
            return result;
          }
        }
      } catch (positionError) {
        logger.warn(`Could not fetch from Position DB: ${positionError.message}`);
        // Continue to next tier
      }

      // TIER 3: Check Symbol database (fallback)
      logger.info(`Checking Symbol database for ${symbolsToFetch.length} symbols...`);
      const stillNeedFetch = [];
      for (const symbol of symbolsToFetch) {
        const symbolData = await Symbol.findOne({ symbol: symbol.toUpperCase() });

        if (symbolData && symbolData.symbolId) {
          const cacheEntry = {
            symbolId: symbolData.symbolId,
            symbol: symbolData.symbol,
            description: symbolData.description,
            currency: symbolData.currency
          };
          result[symbol.toUpperCase()] = cacheEntry;

          // Add to memory cache
          this.symbolIdCache.set(symbol.toUpperCase(), cacheEntry);
          logger.info(`Found ${symbol} in Symbol DB: symbolId=${symbolData.symbolId} (added to cache)`);
        } else {
          stillNeedFetch.push(symbol);
        }
      }

      // If all symbols were found in database, return
      if (stillNeedFetch.length === 0) {
        logger.info(`✅ All ${symbols.length} symbols found in databases - NO API CALL`);
        return result;
      }

      // Fetch missing symbols from Questrade
      logger.info(`Fetching ${stillNeedFetch.length} symbols from Questrade: ${stillNeedFetch.join(', ')}`);

      const person = await this.getAvailablePerson();

      const response = await axios.get(
        `${this.authApiUrl}/auth/access-token/${person}`
      );

      const tokenData = response.data.data;

      // Fetch each symbol (Questrade search API doesn't support batch lookup)
      for (const symbol of stillNeedFetch) {
        try {
          const searchResponse = await axios.get(
            `${tokenData.apiServer}/v1/symbols/search?prefix=${symbol}`,
            {
              headers: {
                'Authorization': `Bearer ${tokenData.accessToken}`
              }
            }
          );

          const searchResults = searchResponse.data.symbols || [];
          const exactMatch = searchResults.find(s => s.symbol === symbol.toUpperCase());

          if (exactMatch) {
            const symbolData = {
              symbol: exactMatch.symbol,
              symbolId: exactMatch.symbolId,
              description: exactMatch.description,
              securityType: exactMatch.securityType,
              exchange: exactMatch.exchange,
              currency: exactMatch.currency,
              isTradable: exactMatch.isTradable,
              isQuotable: exactMatch.isQuotable,
              hasOptions: exactMatch.hasOptions,
              lastUpdated: new Date()
            };

            // Save to database for future lookups
            await Symbol.findOneAndUpdate(
              { symbol: exactMatch.symbol },
              symbolData,
              { upsert: true }
            );

            const cacheEntry = {
              symbolId: exactMatch.symbolId,
              symbol: exactMatch.symbol,
              description: exactMatch.description,
              currency: exactMatch.currency
            };

            result[symbol.toUpperCase()] = cacheEntry;

            // Add to memory cache (permanent)
            this.symbolIdCache.set(symbol.toUpperCase(), cacheEntry);

            logger.info(`Fetched ${symbol} from Questrade: symbolId=${exactMatch.symbolId} (added to memory cache)`);
          } else {
            logger.warn(`Symbol ${symbol} not found in Questrade`);
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

      logger.info(`Symbol lookup complete: ${Object.keys(result).length} symbols processed`);
      return result;
    } catch (error) {
      logger.error('Failed to lookup symbols:', error);
      throw error;
    }
  }

  /**
   * Get WebSocket stream port from Questrade API
   * This is required for the correct WebSocket connection flow
   * @param {Array<number>} symbolIds - Array of symbol IDs
   * @param {string} personName - Person name to get access token for
   * @returns {number} Stream port number
   */
  async getStreamPort(symbolIds, personName = 'Vivek') {
    try {
      logger.info(`Getting stream port for ${symbolIds.length} symbols`);

      // Check cache first (24-hour TTL)
      const cached = this.streamPortCache.get(personName);
      if (cached && cached.expiresAt > Date.now()) {
        const timeLeft = Math.round((cached.expiresAt - Date.now()) / 1000 / 60);
        logger.info(`✅ Using cached stream port ${cached.streamPort} for ${personName} (valid for ${timeLeft} more minutes) - NO API CALL`);
        return cached.streamPort;
      }

      logger.info(`Cache miss or expired - fetching stream port from Questrade API`);

      // Get access token
      let response = await axios.get(
        `${this.authApiUrl}/auth/access-token/${personName}`
      );

      let tokenData = response.data.data;

      // Build the URL to get stream port
      const idsParam = symbolIds.join(',');

      // Ensure apiServer has trailing slash (Questrade support note: apiServer already has trailing /)
      const baseUrl = tokenData.apiServer.endsWith('/') ? tokenData.apiServer : `${tokenData.apiServer}/`;

      // CORRECT format per Questrade support: /v1/markets/quotes?ids=123,456&stream=true&mode=WebSocket
      const url = `${baseUrl}v1/markets/quotes?ids=${idsParam}&stream=true&mode=WebSocket`;

      logger.info(`Requesting stream port from: ${url}`);

      try {
        // Make GET request to Questrade to get stream port
        const streamResponse = await axios.get(url, {
          headers: {
            'Authorization': `Bearer ${tokenData.accessToken}`
          }
        });

        if (!streamResponse.data || !streamResponse.data.streamPort) {
          throw new Error('No streamPort in response from Questrade');
        }

        const streamPort = streamResponse.data.streamPort;

        // Cache the stream port for 24 hours
        const expiresAt = Date.now() + (24 * 60 * 60 * 1000);
        this.streamPortCache.set(personName, { streamPort, expiresAt });

        logger.info(`✅ Got stream port ${streamPort} from Questrade - cached for 24 hours`);

        return streamPort;
      } catch (error) {
        // If we get 401, the token is expired - refresh it and retry
        if (error.response && error.response.status === 401) {
          logger.info('Access token expired, refreshing...');

          // Refresh the token
          const refreshResponse = await axios.post(
            `${this.authApiUrl}/auth/refresh-token/${personName}`
          );

          if (!refreshResponse.data.success) {
            throw new Error('Failed to refresh token');
          }

          // Get the new access token
          response = await axios.get(
            `${this.authApiUrl}/auth/access-token/${personName}`
          );

          tokenData = response.data.data;

          logger.info('Token refreshed, retrying stream port request...');

          // Retry the request with new token
          const retryStreamResponse = await axios.get(url, {
            headers: {
              'Authorization': `Bearer ${tokenData.accessToken}`
            }
          });

          if (!retryStreamResponse.data || !retryStreamResponse.data.streamPort) {
            throw new Error('No streamPort in response from Questrade after token refresh');
          }

          const streamPort = retryStreamResponse.data.streamPort;

          // Cache the stream port for 24 hours
          const expiresAt = Date.now() + (24 * 60 * 60 * 1000);
          this.streamPortCache.set(personName, { streamPort, expiresAt });

          logger.info(`✅ Got stream port ${streamPort} after token refresh - cached for 24 hours`);

          return streamPort;
        }

        // Re-throw other errors
        throw error;
      }
    } catch (error) {
      logger.error('Failed to get stream port:', error);
      throw error;
    }
  }

  async getAvailablePerson() {
    try {
      const response = await axios.get(`${this.authApiUrl}/persons`);
      const persons = response.data.data.filter(p => p.isActive && p.hasValidToken);

      if (persons.length === 0) {
        throw new Error('No active persons with valid tokens available');
      }

      return persons[0].personName;
    } catch (error) {
      logger.error('Failed to get available person:', error);
      throw error;
    }
  }

  /**
   * Preload symbol IDs from database into memory cache
   * This should be called on service startup to warm up the cache
   */
  async preloadSymbolCache() {
    try {
      logger.info('Preloading symbol IDs into memory cache...');

      // Load all symbols from database
      const symbols = await Symbol.find({ symbolId: { $exists: true, $ne: null } });

      symbols.forEach(symbolData => {
        const cacheEntry = {
          symbolId: symbolData.symbolId,
          symbol: symbolData.symbol,
          description: symbolData.description,
          currency: symbolData.currency
        };
        this.symbolIdCache.set(symbolData.symbol, cacheEntry);
      });

      logger.info(`Preloaded ${this.symbolIdCache.size} symbol IDs into memory cache`);
    } catch (error) {
      logger.error('Failed to preload symbol cache:', error);
      // Don't throw - just log the error and continue
    }
  }
}

module.exports = new SymbolService();