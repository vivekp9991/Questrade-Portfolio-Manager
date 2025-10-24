const PortfolioSnapshot = require('../models/PortfolioSnapshot');
const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config/environment');
const Decimal = require('decimal.js');
const currencyService = require('./currencyService');
const dividendService = require('./dividendService');
const marketDataService = require('./marketDataService');
const YieldExclusion = require('../models/YieldExclusion');
const SymbolDividend = require('../models/SymbolDividend');

class PortfolioCalculator {
  constructor() {
    this.syncApiUrl = config.services.syncApiUrl;
  }

  /**
     * Fetch data from Sync API
     */
  async fetchFromSyncApi(endpoint, params = {}) {
    try {
      const response = await axios.get(`${this.syncApiUrl}${endpoint}`, { params });

      // Check if response has expected structure
      if (!response.data) {
        logger.warn(`[PORTFOLIO] No data in response from ${endpoint}`);
        return { success: false, data: [] };
      }

      return response.data;
    } catch (error) {
      // Log more detailed error information
      if (error.response) {
        logger.error(`[PORTFOLIO] Sync API error ${endpoint}:`, {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        });
      } else if (error.request) {
        logger.error(`[PORTFOLIO] No response from Sync API ${endpoint}:`, {
          message: error.message,
          syncApiUrl: this.syncApiUrl
        });
      } else {
        logger.error(`[PORTFOLIO] Error setting up request to Sync API ${endpoint}:`, error.message);
      }

      // Return empty but valid response structure
      return { success: false, data: [] };
    }
  }

  /**
   * Get all persons from Auth API
   */
  async getAllPersons() {
    try {
      const authApiUrl = config.services.authApiUrl || 'http://localhost:4001/api';
      const response = await axios.get(`${authApiUrl}/persons`);

      if (response.data && response.data.success) {
        return response.data.data.filter(p => p.isActive);
      }

      return [];
    } catch (error) {
      logger.error('[PORTFOLIO] Failed to fetch persons:', error.message);
      return [];
    }
  }

  /**
   * Get all positions for all persons (main method for UI)
   * @param {string} viewMode - 'all', 'person', or 'account'
   * @param {boolean} aggregate - Whether to aggregate positions by symbol
   * @param {string} personName - Optional filter by person name
   * @param {string} accountId - Optional filter by account ID
   */
  async getAllPersonsPositions(viewMode = 'all', aggregate = true, personName = null, accountId = null) {
    try {
      logger.info(`[PORTFOLIO] Getting positions - viewMode: ${viewMode}, aggregate: ${aggregate}, personName: ${personName}, accountId: ${accountId}`);

      // Get all active persons
      let persons = await this.getAllPersons();

      // FIXED: Filter persons based on personName parameter
      if (personName && viewMode !== 'all') {
        persons = persons.filter(p => p.personName === personName);
        logger.info(`[PORTFOLIO] Filtered to person: ${personName}`);
      }

      logger.info(`[PORTFOLIO] Processing ${persons.length} person(s)`);

      if (persons.length === 0) {
        return [];
      }

      // Fetch all positions and accounts
      let allPositions = [];
      const accountsMap = new Map();

      for (const person of persons) {
        try {
          // Fetch positions for this person
          const positionsResponse = await this.fetchFromSyncApi('/positions/person/' + person.personName, {
            aggregated: 'false' // Get raw positions, not aggregated
          });

          if (positionsResponse.success && positionsResponse.data) {
            // Add personName to each position
            const personPositions = positionsResponse.data.map(pos => ({
              ...pos,
              personName: person.personName
            }));
            allPositions.push(...personPositions);
          }

          // Fetch accounts for this person
          const accountsResponse = await this.fetchFromSyncApi('/accounts/' + person.personName);

          if (accountsResponse.success && accountsResponse.data) {
            accountsResponse.data.forEach(account => {
              accountsMap.set(account.accountId, {
                ...account,
                personName: person.personName
              });
            });
          }
        } catch (error) {
          logger.error(`[PORTFOLIO] Failed to fetch data for ${person.personName}:`, error.message);
        }
      }

      // FIXED: Filter by accountId if provided
      if (accountId && viewMode === 'account') {
        allPositions = allPositions.filter(pos => pos.accountId === accountId);
        logger.info(`[PORTFOLIO] Filtered to account: ${accountId}, remaining positions: ${allPositions.length}`);
      }

      logger.info(`[PORTFOLIO] Total positions after filtering: ${allPositions.length}`);

      if (aggregate) {
        return await this.aggregatePositions(allPositions, accountsMap, personName);
      } else {
        return await this.formatIndividualPositions(allPositions, accountsMap, personName);
      }
    } catch (error) {
      logger.error('[PORTFOLIO] Failed to get all persons positions:', error);
      throw error;
    }
  }

  async aggregatePositions(positions, accountsMap, personName = null) {
    try {
      // If no positions, return empty array
      if (!positions || positions.length === 0) {
        logger.info('[PORTFOLIO] No positions to aggregate');
        return [];
      }

      logger.info(`[PORTFOLIO] Starting aggregation of ${positions.length} positions`);

      // Fetch excluded symbols for YoC calculation
      // For ALL ACCOUNTS view (personName = null), get exclusions for all persons
      // For single person view, get exclusions only for that person
      let excludedSymbols = [];
      try {
        if (personName) {
          // Single person view - get exclusions for this person only
          excludedSymbols = await YieldExclusion.getExcludedSymbols(personName);
          if (excludedSymbols.length > 0) {
            logger.info(`[PORTFOLIO] Found ${excludedSymbols.length} symbols excluded from YoC for ${personName}: ${excludedSymbols.join(', ')}`);
          }
        } else {
          // ALL ACCOUNTS view - get exclusions for all persons
          // Get unique person names from positions
          const personNames = [...new Set(positions.map(p => p.personName))];
          logger.info(`[PORTFOLIO] Fetching YoC exclusions for ${personNames.length} persons: ${personNames.join(', ')}`);

          // Fetch exclusions for each person and combine them
          const allExclusions = await Promise.all(
            personNames.map(name => YieldExclusion.getExcludedSymbols(name))
          );

          // Combine all exclusions into one array (remove duplicates)
          excludedSymbols = [...new Set(allExclusions.flat())];

          if (excludedSymbols.length > 0) {
            logger.info(`[PORTFOLIO] Found ${excludedSymbols.length} symbols excluded from YoC across all persons: ${excludedSymbols.join(', ')}`);
          }
        }
      } catch (error) {
        logger.warn(`[PORTFOLIO] Failed to fetch YoC exclusions:`, error.message);
        // Continue without exclusions rather than failing
      }

      // Fetch manual dividend overrides from SymbolDividend collection
      let manualDividendOverrides = new Map();
      try {
        const overrides = await SymbolDividend.find({});
        overrides.forEach(override => {
          manualDividendOverrides.set(override.symbol, override);
        });
        if (manualDividendOverrides.size > 0) {
          logger.info(`[PORTFOLIO] Found ${manualDividendOverrides.size} manual dividend overrides`);
        }
      } catch (error) {
        logger.warn(`[PORTFOLIO] Failed to fetch manual dividend overrides:`, error.message);
        // Continue without overrides
      }

      // Group positions by symbol
      const symbolGroups = new Map();

      for (const position of positions) {
        const symbol = position.symbol;

        if (!symbolGroups.has(symbol)) {
          symbolGroups.set(symbol, {
            positions: [],
            totalQuantity: new Decimal(0),
            totalCost: new Decimal(0),
            accounts: new Set(),
            accountTypes: new Set(),
            persons: new Set()
          });
        }

        const group = symbolGroups.get(symbol);
        group.positions.push(position);
        group.totalQuantity = group.totalQuantity.plus(position.openQuantity || 0);
        group.totalCost = group.totalCost.plus(position.totalCost || 0);

        const account = accountsMap.get(position.accountId);
        if (account) {
          group.accounts.add(position.accountId);
          group.accountTypes.add(account.type);
          group.persons.add(position.personName);
        }
      }

      logger.info(`[PORTFOLIO] Grouped into ${symbolGroups.size} unique symbols`);

      // Get all unique symbols for batch price fetch
      const symbols = Array.from(symbolGroups.keys());

      // Only fetch prices if we have symbols
      let priceData = {};
      let symbolData = {};
      if (symbols.length > 0) {
        try {
          logger.info(`[PORTFOLIO] Fetching prices for ${symbols.length} symbols`);
          priceData = await marketDataService.getMultiplePrices(symbols);
          logger.info(`[PORTFOLIO] Fetched prices for ${Object.keys(priceData).length} symbols`);
        } catch (error) {
          logger.error('[PORTFOLIO] Failed to fetch market prices, continuing with cached/default prices:', error.message);
          // Continue with empty price data rather than failing
        }

        // Fetch symbol descriptions (company names) from Market API
        try {
          logger.info(`[PORTFOLIO] Fetching symbol descriptions for ${symbols.length} symbols`);
          const marketApiUrl = config.services.marketApiUrl || 'http://localhost:4004/api';
          const symbolResponse = await axios.post(`${marketApiUrl}/symbols/lookup`, { symbols });

          if (symbolResponse.data && symbolResponse.data.success && symbolResponse.data.data) {
            symbolData = symbolResponse.data.data;
            logger.info(`[PORTFOLIO] Fetched descriptions for ${Object.keys(symbolData).length} symbols`);
          }
        } catch (error) {
          logger.error('[PORTFOLIO] Failed to fetch symbol descriptions, continuing without company names:', error.message);
          // Continue without symbol data
        }
      }

      // First pass: Calculate total portfolio value in CAD (for portfolio percentage)
      let totalPortfolioValueCAD = new Decimal(0);
      const usdToCADRate = await currencyService.getUSDtoCAD();

      logger.info(`[PORTFOLIO] USD to CAD rate: ${usdToCADRate}`);

      for (const [symbol, group] of symbolGroups.entries()) {
        const currentPriceData = priceData[symbol] || {};
        const currentPrice = currentPriceData.currentPrice || group.positions[0]?.currentPrice || 0;
        const symbolInfo = symbolData[symbol] || {};
        const currency = symbolInfo.currency || (symbol.includes('.TO') ? 'CAD' : 'USD');

        const marketValue = new Decimal(currentPrice).mul(group.totalQuantity.toNumber());

        // Convert to CAD if USD
        const marketValueCAD = currency === 'USD'
          ? marketValue.mul(usdToCADRate)
          : marketValue;

        totalPortfolioValueCAD = totalPortfolioValueCAD.plus(marketValueCAD);
      }

      logger.info(`[PORTFOLIO] Total portfolio value in CAD: $${totalPortfolioValueCAD.toFixed(2)}`);

      // Build aggregated positions
      const aggregatedPositions = [];

      for (const [symbol, group] of symbolGroups.entries()) {
        logger.debug(`[PORTFOLIO] Processing symbol ${symbol} with ${group.positions.length} positions`);

        const totalQuantity = group.totalQuantity.toNumber();
        const totalCost = group.totalCost.toNumber();
        const averageEntryPrice = totalQuantity > 0 ? totalCost / totalQuantity : 0;

        // Get current price data
        const currentPriceData = priceData[symbol] || {};
        const currentPrice = currentPriceData.currentPrice || group.positions[0]?.currentPrice || 0;
        const openPrice = currentPriceData.openPrice || currentPrice;
        // FIXED: Use previousDayClose from Position database (synced via candle API)
        // Fallback chain: Position.previousDayClose -> Market.previousClosePrice -> openPrice
        const previousClose = group.positions[0]?.previousDayClose || currentPriceData.previousClosePrice || openPrice;

        // Get symbol info (company name + currency from Market API)
        const symbolInfo = symbolData[symbol] || {};
        const companyName = symbolInfo.description || symbol;
        const currency = symbolInfo.currency || (symbol.includes('.TO') ? 'CAD' : 'USD');

        logger.debug(`[PORTFOLIO] Processing ${symbol} - Currency: ${currency}`);

        // Use dividend data from positions (already synced and stored in DB)
        // Check for manual overrides first, then use auto data from positions
        let dividendData = {
          totalReceived: 0,
          monthlyDividendPerShare: 0,
          annualDividend: 0,
          annualDividendPerShare: 0,
          yieldOnCost: 0,
          currentYield: 0,
          dividendHistory: [],
          dividendFrequency: 0
        };

        try {
          // Check for manual dividend override
          const manualOverride = manualDividendOverrides.get(symbol);

          // Check if any position has dividend data (auto data from Questrade)
          const firstDividendPosition = group.positions.find(p => p.isDividendStock && p.dividendData);

          // Determine dividend per share values
          let monthlyDividendPerShare = 0;
          let annualDividendPerShare = 0;
          let dividendFrequency = 0;
          let dataSource = 'none';

          if (manualOverride) {
            // Use manual override data (highest priority)
            monthlyDividendPerShare = manualOverride.monthlyDividendPerShare || 0;

            // FIXED: monthlyDividendPerShare represents TOTAL monthly dividend (not per payment)
            // So Annual = Monthly × 12 regardless of payment frequency
            // The dividendFrequency field is just metadata about how often payments occur
            annualDividendPerShare = monthlyDividendPerShare * 12;

            // Store frequency as number of payments per year for reporting
            const frequencyMultipliers = {
              'monthly': 12,
              'semi-monthly': 24,
              'quarterly': 4,
              'semi-annual': 2,
              'annual': 1,
              'none': 0
            };
            dividendFrequency = frequencyMultipliers[manualOverride.dividendFrequency] || 12;
            dataSource = 'manual';

            logger.info(`[PORTFOLIO] Using manual dividend override for ${symbol}: ${monthlyDividendPerShare}/month → ${annualDividendPerShare}/year, frequency: ${manualOverride.dividendFrequency}`);
          } else if (firstDividendPosition && firstDividendPosition.dividendData) {
            // Use auto data from Questrade
            annualDividendPerShare = firstDividendPosition.dividendData.annualDividendPerShare || 0;
            monthlyDividendPerShare = firstDividendPosition.dividendData.monthlyDividendPerShare || 0;
            dividendFrequency = firstDividendPosition.dividendData.dividendFrequency || 0;
            dataSource = 'auto';

            logger.info(`[PORTFOLIO] Using auto dividend data for ${symbol}`);
          }

          if (dataSource !== 'none') {
            // Sum total dividends received across all positions
            const totalReceived = group.positions.reduce((sum, p) =>
              sum + (p.dividendData?.totalReceived || 0), 0
            );

            // Calculate aggregated dividends using the aggregated quantities and costs
            const annualDividend = annualDividendPerShare * totalQuantity;
            const monthlyDividend = monthlyDividendPerShare * totalQuantity;

            // Calculate YOC using aggregated average cost
            const yieldOnCost = averageEntryPrice > 0 ?
              (annualDividendPerShare / averageEntryPrice) * 100 : 0;
            const currentYield = currentPrice > 0 ?
              (annualDividendPerShare / currentPrice) * 100 : 0;

            dividendData = {
              totalReceived: Math.round(totalReceived * 10000) / 10000, // 4 decimal places
              monthlyDividendPerShare: Math.round(monthlyDividendPerShare * 10000) / 10000, // 4 decimal places
              annualDividend: Math.round(annualDividend * 10000) / 10000, // 4 decimal places
              annualDividendPerShare: Math.round(annualDividendPerShare * 10000) / 10000, // 4 decimal places
              yieldOnCost: Math.round(yieldOnCost * 100) / 100,
              currentYield: Math.round(currentYield * 100) / 100,
              dividendHistory: firstDividendPosition?.dividendData?.dividendHistory || [],
              dividendFrequency: dividendFrequency,
              lastDividendAmount: firstDividendPosition?.dividendData?.lastDividendAmount || 0,
              lastDividendDate: firstDividendPosition?.dividendData?.lastDividendDate || null,
              dataSource: dataSource  // Track whether this is manual or auto
            };

            logger.info(`[PORTFOLIO] Dividend data for ${symbol} (${dataSource}):`, {
              totalReceived: dividendData.totalReceived,
              annualDividend: dividendData.annualDividend,
              yieldOnCost: dividendData.yieldOnCost
            });
          } else {
            logger.debug(`[PORTFOLIO] No dividend data found for ${symbol}`);
          }
        } catch (error) {
          logger.error(`[PORTFOLIO] Failed to get dividend data for ${symbol}:`, {
            message: error.message,
            stack: error.stack
          });
        }

        // Build individual positions array
        const individualPositions = [];
        for (const pos of group.positions) {
          const account = accountsMap.get(pos.accountId);
          if (account) {
            individualPositions.push({
              accountName: `${account.type}-${account.number}`,
              accountType: account.type,
              personName: pos.personName,
              shares: pos.openQuantity,
              avgCost: pos.averageEntryPrice || 0,
              marketValue: pos.currentMarketValue || (pos.openQuantity * currentPrice),
              currency: currency
            });
          }
        }

        // Aggregate dayPnl (Today's P&L) from all positions for this symbol
        const totalDayPnl = group.positions.reduce((sum, pos) => sum + (pos.dayPnl || 0), 0);

        // Check if this symbol is excluded from YoC calculations
        const isExcludedFromYoC = excludedSymbols.includes(symbol);

        // Calculate portfolio percentage (in CAD)
        const marketValue = new Decimal(currentPrice).mul(totalQuantity);
        const marketValueCAD = currency === 'USD'
          ? marketValue.mul(usdToCADRate)
          : marketValue;

        const portfolioPercentage = totalPortfolioValueCAD.toNumber() > 0
          ? (marketValueCAD.toNumber() / totalPortfolioValueCAD.toNumber()) * 100
          : 0;

        logger.debug(`[PORTFOLIO] ${symbol} - Market Value: ${currency === 'USD' ? 'USD' : 'CAD'} $${marketValue.toFixed(2)}, CAD: $${marketValueCAD.toFixed(2)}, Portfolio %: ${portfolioPercentage.toFixed(2)}%, Day P&L: $${totalDayPnl.toFixed(2)}`);

        // Build the aggregated position
        const aggregatedPosition = {
          symbol: symbol,
          companyName: companyName,
          currency: currency,
          openQuantity: totalQuantity,
          averageEntryPrice: Math.round(averageEntryPrice * 100) / 100,
          currentPrice: Math.round(currentPrice * 100) / 100,
          openPrice: Math.round(openPrice * 100) / 100,
          previousClose: Math.round(previousClose * 100) / 100,  // NEW: Previous day's close for accurate Today's P&L
          dayPnl: Math.round(totalDayPnl * 100) / 100,  // NEW: Aggregated Today's P&L from Questrade
          dividendData: dividendData, // This now includes paymentFrequency
          isAggregated: group.accounts.size > 1,
          sourceAccounts: Array.from(group.accountTypes),
          accountCount: group.accounts.size,
          individualPositions: individualPositions,
          excludedFromYoC: isExcludedFromYoC,  // NEW: Flag for YoC exclusion
          portfolioPercentage: Math.round(portfolioPercentage * 100) / 100  // NEW: Portfolio percentage in CAD
        };

        aggregatedPositions.push(aggregatedPosition);
      }

      // Sort by market value (descending)
      aggregatedPositions.sort((a, b) => {
        const aValue = a.openQuantity * a.currentPrice;
        const bValue = b.openQuantity * b.currentPrice;
        return bValue - aValue;
      });

      logger.info(`[PORTFOLIO] Aggregated ${positions.length} positions into ${aggregatedPositions.length} symbols`);

      return aggregatedPositions;
    } catch (error) {
      logger.error('[PORTFOLIO] Failed to aggregate positions:', {
        message: error.message,
        stack: error.stack
      });
      // Return empty array instead of throwing
      return [];
    }
  }

  /**
   * Format individual positions without aggregation
   */
  async formatIndividualPositions(positions, accountsMap, personName = null) {
    try {
      // Fetch excluded symbols for YoC calculation
      // For ALL ACCOUNTS view (personName = null), get exclusions for all persons
      // For single person view, get exclusions only for that person
      let excludedSymbols = [];
      try {
        if (personName) {
          // Single person view - get exclusions for this person only
          excludedSymbols = await YieldExclusion.getExcludedSymbols(personName);
          if (excludedSymbols.length > 0) {
            logger.info(`[PORTFOLIO] Found ${excludedSymbols.length} symbols excluded from YoC for ${personName}: ${excludedSymbols.join(', ')}`);
          }
        } else {
          // ALL ACCOUNTS view - get exclusions for all persons
          // Get unique person names from positions
          const personNames = [...new Set(positions.map(p => p.personName))];
          logger.info(`[PORTFOLIO] Fetching YoC exclusions for ${personNames.length} persons: ${personNames.join(', ')}`);

          // Fetch exclusions for each person and combine them
          const allExclusions = await Promise.all(
            personNames.map(name => YieldExclusion.getExcludedSymbols(name))
          );

          // Combine all exclusions into one array (remove duplicates)
          excludedSymbols = [...new Set(allExclusions.flat())];

          if (excludedSymbols.length > 0) {
            logger.info(`[PORTFOLIO] Found ${excludedSymbols.length} symbols excluded from YoC across all persons: ${excludedSymbols.join(', ')}`);
          }
        }
      } catch (error) {
        logger.warn(`[PORTFOLIO] Failed to fetch YoC exclusions:`, error.message);
        // Continue without exclusions rather than failing
      }

      // Fetch manual dividend overrides from SymbolDividend collection
      let manualDividendOverrides = new Map();
      try {
        const overrides = await SymbolDividend.find({});
        overrides.forEach(override => {
          manualDividendOverrides.set(override.symbol, override);
        });
        if (manualDividendOverrides.size > 0) {
          logger.info(`[PORTFOLIO] Found ${manualDividendOverrides.size} manual dividend overrides`);
        }
      } catch (error) {
        logger.warn(`[PORTFOLIO] Failed to fetch manual dividend overrides:`, error.message);
        // Continue without overrides
      }

      // Get all unique symbols for batch price fetch
      const symbols = [...new Set(positions.map(p => p.symbol))];
      const priceData = await marketDataService.getMultiplePrices(symbols);

      // Fetch symbol descriptions (company names) from Market API
      let symbolData = {};
      try {
        logger.info(`[PORTFOLIO] Fetching symbol descriptions for ${symbols.length} symbols`);
        const marketApiUrl = config.services.marketApiUrl || 'http://localhost:4004/api';
        const symbolResponse = await axios.post(`${marketApiUrl}/symbols/lookup`, { symbols });

        if (symbolResponse.data && symbolResponse.data.success && symbolResponse.data.data) {
          symbolData = symbolResponse.data.data;
          logger.info(`[PORTFOLIO] Fetched descriptions for ${Object.keys(symbolData).length} symbols`);
        }
      } catch (error) {
        logger.error('[PORTFOLIO] Failed to fetch symbol descriptions, continuing without company names:', error.message);
        // Continue without symbol data
      }

      const formattedPositions = [];

      for (const position of positions) {
        const account = accountsMap.get(position.accountId);
        const symbol = position.symbol;

        // Get current price data
        const currentPriceData = priceData[symbol] || {};
        const currentPrice = currentPriceData.currentPrice || position.currentPrice || 0;
        const openPrice = currentPriceData.openPrice || currentPrice;
        // FIXED: Use previousDayClose from Position database (synced via candle API)
        // Fallback chain: Position.previousDayClose -> Market.previousClosePrice -> openPrice
        const previousClose = position.previousDayClose || currentPriceData.previousClosePrice || openPrice;

        // Get symbol info (company name + currency from Market API)
        const posSymbolInfo = symbolData[symbol] || {};
        const companyName = posSymbolInfo.description || symbol;
        const currency = posSymbolInfo.currency || (symbol.includes('.TO') ? 'CAD' : 'USD');

        // Use dividend data from position (already synced and stored in DB)
        // Check for manual overrides first, then use auto data
        let dividendData = {
          totalReceived: 0,
          monthlyDividendPerShare: 0,
          annualDividend: 0,
          annualDividendPerShare: 0,
          yieldOnCost: 0,
          currentYield: 0,
          dividendHistory: [],
          dividendFrequency: 0
        };

        // Check for manual dividend override
        const manualOverride = manualDividendOverrides.get(symbol);

        if (manualOverride) {
          // Use manual override data
          const monthlyDivPerShare = manualOverride.monthlyDividendPerShare || 0;

          // FIXED: monthlyDividendPerShare represents TOTAL monthly dividend (not per payment)
          // So Annual = Monthly × 12 regardless of payment frequency
          const annualDivPerShare = monthlyDivPerShare * 12;

          // Store frequency as number of payments per year for reporting
          const frequencyMultipliers = {
            'monthly': 12,
            'semi-monthly': 24,
            'quarterly': 4,
            'semi-annual': 2,
            'annual': 1,
            'none': 0
          };
          const dividendFreq = frequencyMultipliers[manualOverride.dividendFrequency] || 12;

          // Calculate YOC using position data
          const avgEntryPrice = position.averageEntryPrice || 0;
          const yieldOnCost = avgEntryPrice > 0 ? (annualDivPerShare / avgEntryPrice) * 100 : 0;
          const currentYield = currentPrice > 0 ? (annualDivPerShare / currentPrice) * 100 : 0;

          dividendData = {
            totalReceived: position.dividendData?.totalReceived || 0,
            monthlyDividendPerShare: Math.round(monthlyDivPerShare * 100) / 100,
            annualDividend: Math.round(annualDivPerShare * position.openQuantity * 100) / 100,
            annualDividendPerShare: Math.round(annualDivPerShare * 100) / 100,
            yieldOnCost: Math.round(yieldOnCost * 100) / 100,
            currentYield: Math.round(currentYield * 100) / 100,
            dividendHistory: position.dividendData?.dividendHistory || [],
            dividendFrequency: dividendFreq,
            lastDividendAmount: position.dividendData?.lastDividendAmount || 0,
            lastDividendDate: position.dividendData?.lastDividendDate || null,
            dataSource: 'manual'
          };
        } else if (position.isDividendStock && position.dividendData) {
          // Use auto data from position
          dividendData = { ...position.dividendData, dataSource: 'auto' };
        }

        // Check if this symbol is excluded from YoC calculations
        const isExcludedFromYoC = excludedSymbols.includes(symbol);

        const formattedPosition = {
          symbol: symbol,
          companyName: companyName,
          currency: currency,
          openQuantity: position.openQuantity,
          averageEntryPrice: Math.round((position.averageEntryPrice || 0) * 100) / 100,
          currentPrice: Math.round(currentPrice * 100) / 100,
          openPrice: Math.round(openPrice * 100) / 100,
          previousClose: Math.round(previousClose * 100) / 100,  // NEW: Previous day's close for accurate Today's P&L
          dayPnl: Math.round((position.dayPnl || 0) * 100) / 100,  // NEW: Today's P&L from Questrade
          dividendData: dividendData,
          isAggregated: false,
          sourceAccounts: account ? [account.type] : [],
          accountCount: 1,
          excludedFromYoC: isExcludedFromYoC,  // NEW: Flag for YoC exclusion
          individualPositions: account ? [{
            accountName: `${account.type}-${account.number}`,
            accountType: account.type,
            personName: position.personName,
            shares: position.openQuantity,
            avgCost: position.averageEntryPrice || 0,
            marketValue: position.currentMarketValue || (position.openQuantity * currentPrice),
            currency: currency
          }] : []
        };

        formattedPositions.push(formattedPosition);
      }

      // Sort by market value (descending)
      formattedPositions.sort((a, b) => {
        const aValue = a.openQuantity * a.currentPrice;
        const bValue = b.openQuantity * b.currentPrice;
        return bValue - aValue;
      });

      return formattedPositions;
    } catch (error) {
      logger.error('[PORTFOLIO] Failed to format individual positions:', error);
      throw error;
    }
  }

  // ... (keep all existing methods from the original file)

  /**
   * Get complete portfolio summary
   */
  async getPortfolioSummary(personName) {
    try {
      // Fetch all required data
      const [accountsResponse, positionsResponse, activitiesResponse] = await Promise.all([
        this.fetchFromSyncApi(`/accounts/${personName}`),
        this.fetchFromSyncApi(`/positions/person/${personName}`),
        this.fetchFromSyncApi(`/activities/person/${personName}`, { limit: 50 })
      ]);

      const accounts = accountsResponse.data || [];
      const positions = positionsResponse.data || [];
      const activities = activitiesResponse.data || [];

      // Calculate portfolio value
      const portfolioValue = await this.calculatePortfolioValue(personName);

      // Calculate holdings
      const holdings = await this.calculateHoldings(personName);

      // Get latest snapshot for day change
      const latestSnapshot = await PortfolioSnapshot.getLatest(personName);

      let dayChange = {
        amount: 0,
        percentage: 0
      };

      if (latestSnapshot && latestSnapshot.dayChange) {
        dayChange = latestSnapshot.dayChange;
      }

      return {
        overview: {
          totalValue: portfolioValue.totalValueCAD,
          totalCash: portfolioValue.totalCash,
          totalMarketValue: portfolioValue.totalMarketValue,
          dayChange,
          lastUpdated: new Date()
        },
        accounts: accounts.map(acc => ({
          accountId: acc.accountId,
          type: acc.type,
          value: acc.summary?.totalEquityCAD || 0,
          cash: acc.summary?.cashCAD || 0
        })),
        holdings: {
          count: holdings.count,
          totalValue: holdings.totalValue,
          holdings: holdings.holdings,
          topHoldings: holdings.topHoldings.map(h => ({
            symbol: h.symbol,
            value: h.marketValue,
            percentage: h.percentage,
            quantity: h.quantity,
            marketValue: h.marketValue
          }))
        },
        recentActivity: activities.slice(0, 10).map(activity => ({
          date: activity.transactionDate,
          type: activity.type,
          symbol: activity.symbol,
          amount: activity.netAmount
        }))
      };
    } catch (error) {
      logger.error(`Error getting portfolio summary for ${personName}:`, error);
      throw error;
    }
  }

  /**
   * Calculate total portfolio value
   */
  async calculatePortfolioValue(personName) {
    try {
      const accountsResponse = await this.fetchFromSyncApi(`/accounts/${personName}`);
      const accounts = accountsResponse.data || [];

      let totalValueCAD = new Decimal(0);
      let totalCash = new Decimal(0);
      let totalMarketValue = new Decimal(0);

      accounts.forEach(account => {
        if (account.summary) {
          totalValueCAD = totalValueCAD.plus(account.summary.totalEquityCAD || 0);
          totalCash = totalCash.plus(account.summary.cashCAD || 0);
          totalMarketValue = totalMarketValue.plus(account.summary.marketValueCAD || 0);
        }
      });

      return {
        totalValueCAD: totalValueCAD.toNumber(),
        totalCash: totalCash.toNumber(),
        totalMarketValue: totalMarketValue.toNumber(),
        accountCount: accounts.length
      };
    } catch (error) {
      logger.error(`Error calculating portfolio value for ${personName}:`, error);
      throw error;
    }
  }

  /**
   * Calculate holdings with aggregation across accounts
   */
  async calculateHoldings(personName) {
    try {
      const positionsResponse = await this.fetchFromSyncApi(`/positions/person/${personName}`);
      const positions = positionsResponse.data || [];

      // Aggregate positions by symbol
      const holdingsMap = new Map();

      positions.forEach(position => {
        if (!holdingsMap.has(position.symbol)) {
          holdingsMap.set(position.symbol, {
            symbol: position.symbol,
            totalQuantity: 0,
            totalCost: new Decimal(0),
            marketValue: new Decimal(0),
            unrealizedPnL: new Decimal(0),
            dayPnL: new Decimal(0),
            accounts: []
          });
        }

        const holding = holdingsMap.get(position.symbol);
        holding.totalQuantity += position.openQuantity;
        holding.totalCost = holding.totalCost.plus(position.totalCost || 0);
        holding.marketValue = holding.marketValue.plus(position.currentMarketValue || 0);
        holding.unrealizedPnL = holding.unrealizedPnL.plus(position.openPnl || 0);
        holding.dayPnL = holding.dayPnL.plus(position.dayPnl || 0);
        holding.accounts.push(position.accountId);
      });

      // Convert to array and calculate percentages
      const totalMarketValue = Array.from(holdingsMap.values())
        .reduce((sum, h) => sum.plus(h.marketValue), new Decimal(0));

      const holdings = Array.from(holdingsMap.values()).map(holding => {
        const marketValueNum = holding.marketValue.toNumber();
        const percentage = totalMarketValue.gt(0)
          ? holding.marketValue.div(totalMarketValue).mul(100).toNumber()
          : 0;

        return {
          symbol: holding.symbol,
          quantity: holding.totalQuantity,
          averagePrice: holding.totalQuantity > 0
            ? holding.totalCost.div(holding.totalQuantity).toNumber()
            : 0,
          marketValue: marketValueNum,
          totalCost: holding.totalCost.toNumber(),
          unrealizedPnL: holding.unrealizedPnL.toNumber(),
          unrealizedPnLPercent: holding.totalCost.gt(0)
            ? holding.unrealizedPnL.div(holding.totalCost).mul(100).toNumber()
            : 0,
          dayPnL: holding.dayPnL.toNumber(),
          percentage,
          accountCount: holding.accounts.length
        };
      });

      // Sort by market value
      holdings.sort((a, b) => b.marketValue - a.marketValue);

      return {
        count: holdings.length,
        totalValue: totalMarketValue.toNumber(),
        holdings,
        topHoldings: holdings.slice(0, 10)
      };
    } catch (error) {
      logger.error(`Error calculating holdings for ${personName}:`, error);
      throw error;
    }
  }

  /**
   * Create a new portfolio snapshot
   */
  async createSnapshot(personName) {
    try {
      logger.info(`Creating portfolio snapshot for ${personName}`);

      // Get current portfolio data
      const [portfolioValue, holdings, accountsResponse] = await Promise.all([
        this.calculatePortfolioValue(personName),
        this.calculateHoldings(personName),
        this.fetchFromSyncApi(`/accounts/${personName}`)
      ]);

      const accounts = accountsResponse.data || [];

      // Get previous snapshot for comparison
      const previousSnapshot = await PortfolioSnapshot.getLatest(personName);

      // Calculate day change
      let dayChange = {
        amount: 0,
        percentage: 0
      };

      if (previousSnapshot &&
          typeof previousSnapshot.totalValueCAD === 'number' &&
          !isNaN(previousSnapshot.totalValueCAD) &&
          typeof portfolioValue.totalValueCAD === 'number' &&
          !isNaN(portfolioValue.totalValueCAD)) {
        dayChange.amount = portfolioValue.totalValueCAD - previousSnapshot.totalValueCAD;
        dayChange.percentage = previousSnapshot.totalValueCAD > 0
          ? (dayChange.amount / previousSnapshot.totalValueCAD) * 100
          : 0;
      }

      // Calculate asset allocation (simplified)
      const cashPercentage = portfolioValue.totalValueCAD > 0
        ? (portfolioValue.totalCash / portfolioValue.totalValueCAD) * 100
        : 0;
      const stocksPercentage = portfolioValue.totalValueCAD > 0
        ? (portfolioValue.totalMarketValue / portfolioValue.totalValueCAD) * 100
        : 0;

      // Helper function to ensure valid number
      const safeNumber = (val, defaultVal = 0) => {
        const num = Number(val);
        return isNaN(num) || !isFinite(num) ? defaultVal : num;
      };

      // Create snapshot with properly formatted accountBreakdown
      const snapshot = new PortfolioSnapshot({
        personName,
        snapshotDate: new Date(),
        totalValue: safeNumber(portfolioValue.totalValueCAD),
        totalValueCAD: safeNumber(portfolioValue.totalValueCAD),
        totalCash: safeNumber(portfolioValue.totalCash),
        totalMarketValue: safeNumber(portfolioValue.totalMarketValue),
        dayChange: {
          amount: safeNumber(dayChange.amount),
          percentage: safeNumber(dayChange.percentage)
        },
        holdingsCount: holdings.count,
        topHoldings: holdings.topHoldings.map(h => ({
          symbol: h.symbol,
          value: safeNumber(h.marketValue),
          percentage: safeNumber(h.percentage)
        })),
        // Ensure accountBreakdown is properly formatted as array of objects
        accountBreakdown: accounts.map(acc => ({
          accountId: String(acc.accountId),
          type: String(acc.type || 'Unknown'),
          value: safeNumber(acc.summary?.totalEquityCAD),
          percentage: portfolioValue.totalValueCAD > 0
            ? safeNumber((acc.summary?.totalEquityCAD || 0) / portfolioValue.totalValueCAD * 100)
            : 0
        })),
        assetAllocation: {
          stocks: {
            value: safeNumber(portfolioValue.totalMarketValue),
            percentage: safeNumber(stocksPercentage)
          },
          cash: {
            value: safeNumber(portfolioValue.totalCash),
            percentage: safeNumber(cashPercentage)
          },
          bonds: { value: 0, percentage: 0 },
          other: { value: 0, percentage: 0 }
        },
        currencyExposure: [
          {
            currency: 'CAD',
            value: safeNumber(portfolioValue.totalValueCAD),
            percentage: 100
          }
        ],
        calculatedAt: new Date(),
        isEndOfDay: false
      });

      await snapshot.save();

      logger.info(`Portfolio snapshot created for ${personName}`);

      return snapshot;
    } catch (error) {
      logger.error(`Error creating snapshot for ${personName}:`, error);
      throw error;
    }
  }

  /**
   * Get cash balances with filtering
   * @param {string} viewMode - 'all', 'person', or 'account'
   * @param {string} personName - Optional filter by person name
   * @param {string} accountId - Optional filter by account ID
   */
  async getCashBalances(viewMode = 'all', personName = null, accountId = null) {
    try {
      logger.info(`[PORTFOLIO] Getting cash balances - viewMode: ${viewMode}, personName: ${personName}, accountId: ${accountId}`);

      // Fetch balances from Sync API
      let balancesResponse;

      if (viewMode === 'account' && accountId) {
        // Get balances for specific account
        balancesResponse = await this.fetchFromSyncApi(`/balances/${accountId}`);
      } else if (viewMode === 'person' && personName) {
        // Get balances for specific person
        balancesResponse = await this.fetchFromSyncApi(`/balances/person/${personName}`);
      } else {
        // Get all balances
        balancesResponse = await this.fetchFromSyncApi('/balances');
      }

      if (!balancesResponse.success || !balancesResponse.data) {
        logger.warn('[PORTFOLIO] No balance data returned from Sync API');
        return {
          accounts: [],
          summary: {
            totalAccounts: 0,
            totalPersons: 0,
            totalCAD: 0,
            totalUSD: 0,
            totalInCAD: 0
          }
        };
      }

      const balances = Array.isArray(balancesResponse.data) ? balancesResponse.data : [];
      logger.info(`[PORTFOLIO] Retrieved ${balances.length} balance records`);

      // Get account details to enrich the data
      const accountsMap = new Map();
      const persons = await this.getAllPersons();

      for (const person of persons) {
        const accountsResponse = await this.fetchFromSyncApi('/accounts/' + person.personName);
        if (accountsResponse.success && accountsResponse.data) {
          accountsResponse.data.forEach(account => {
            accountsMap.set(account.accountId, {
              ...account,
              personName: person.personName
            });
          });
        }
      }

      // Group balances by account
      const accountBalances = new Map();

      balances.forEach(balance => {
        const accountInfo = accountsMap.get(balance.accountId);

        if (!accountInfo) {
          logger.warn(`[PORTFOLIO] No account info found for accountId: ${balance.accountId}`);
          return;
        }

        // Skip if we've already processed this account (avoid duplicates from CAD/USD records)
        if (accountBalances.has(balance.accountId)) {
          return;
        }

        // Use perCurrencyBalances which shows actual cash per currency (not converted)
        const cashBalances = (balance.perCurrencyBalances || []).map(pcb => ({
          currency: pcb.currency,
          cash: pcb.cash || 0,
          marketValue: pcb.marketValue || 0,
          totalEquity: pcb.totalEquity || 0
        }));

        accountBalances.set(balance.accountId, {
          accountId: balance.accountId,
          accountName: accountInfo.number || balance.accountId,
          accountType: accountInfo.type || 'Cash',
          personName: balance.personName,
          cashBalances: cashBalances
        });
      });

      // Convert to array and calculate totals
      const accounts = Array.from(accountBalances.values());

      let totalCAD = 0;
      let totalUSD = 0;
      const personsSet = new Set();

      accounts.forEach(account => {
        account.cashBalances.forEach(cb => {
          if (cb.currency === 'CAD') {
            totalCAD += cb.cash;
          } else if (cb.currency === 'USD') {
            totalUSD += cb.cash;
          }
        });
        if (account.personName) {
          personsSet.add(account.personName);
        }
      });

      const result = {
        accounts,
        summary: {
          totalAccounts: accounts.length,
          totalPersons: personsSet.size,
          totalCAD,
          totalUSD,
          totalInCAD: totalCAD + (totalUSD * 1.35) // Simple conversion, should use real rate
        }
      };

      logger.info(`[PORTFOLIO] Cash balance summary:`, result.summary);
      return result;

    } catch (error) {
      logger.error('[PORTFOLIO] Failed to get cash balances:', error);
      throw error;
    }
  }
}

module.exports = new PortfolioCalculator();