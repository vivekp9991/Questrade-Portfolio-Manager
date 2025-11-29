/**
 * Positions Handler
 * Get portfolio positions with aggregation support
 */

const logger = require('../../shared/utils/logger');
const { success, internalError } = require('../../shared/utils/response');
const { query, scan, batchGet } = require('../../shared/utils/dynamodb');

const POSITIONS_TABLE = process.env.POSITIONS_TABLE;
const ACCOUNTS_TABLE = process.env.ACCOUNTS_TABLE;
const PERSONS_TABLE = process.env.PERSONS_TABLE;
const SYMBOLS_MASTER_TABLE = process.env.SYMBOLS_MASTER_TABLE;
const YIELD_EXCLUSIONS_TABLE = process.env.YIELD_EXCLUSIONS_TABLE;

/**
 * GET /api/portfolio/positions
 * Get positions with view mode and aggregation
 */
exports.getPositions = async (event) => {
  try {
    const { viewMode = 'all', aggregate = 'true', personName, accountId } = event.queryStringParameters || {};

    logger.info('Getting positions', {
      viewMode,
      aggregate,
      personName,
      accountId
    });

    let positions = [];

    // Fetch positions based on view mode
    if (viewMode === 'person' && personName) {
      // Get positions for specific person
      const result = await query(
        POSITIONS_TABLE,
        'personName = :personName',
        { ':personName': personName },
        { IndexName: 'personName-symbol-index' }
      );
      positions = result.items || [];
    } else if (viewMode === 'account' && accountId) {
      // Get positions for specific account
      const result = await query(
        POSITIONS_TABLE,
        'accountId = :accountId',
        { ':accountId': accountId }
      );
      positions = result.items || [];
    } else {
      // Get all positions (all persons)
      const result = await scan(POSITIONS_TABLE);
      positions = result.items || [];
    }

    // Fetch company names from symbols-master table
    if (positions.length > 0 && SYMBOLS_MASTER_TABLE) {
      const symbols = [...new Set(positions.map(p => p.symbol))]; // Get unique symbols
      const symbolsMap = new Map();

      try {
        // batchGet returns an array directly, handles batching internally
        const symbolMasterItems = await batchGet(SYMBOLS_MASTER_TABLE, symbols.map(symbol => ({ symbol })));

        // Map symbol to company name
        symbolMasterItems.forEach(item => {
          if (item.symbol && item.companyName) {
            symbolsMap.set(item.symbol, item.companyName);
          }
        });

        logger.info(`Fetched ${symbolsMap.size} company names from symbols-master for ${symbols.length} symbols`);
      } catch (error) {
        logger.warn('Failed to fetch company names from symbols-master', { error: error.message });
      }

      // Add company names to positions
      positions = positions.map(pos => ({
        ...pos,
        companyName: symbolsMap.get(pos.symbol) || pos.companyName || null
      }));
    }

    // Fetch yield exclusions (global list of symbols excluded from YoC)
    let excludedSymbols = new Set();
    if (positions.length > 0 && YIELD_EXCLUSIONS_TABLE) {
      try {
        const exclusionsResult = await scan(YIELD_EXCLUSIONS_TABLE);
        const exclusions = exclusionsResult.items || [];

        // Create a set of excluded symbols for fast lookup
        exclusions.forEach(exc => {
          if (exc.symbol) {
            excludedSymbols.add(exc.symbol);
          }
        });

        logger.info(`Fetched ${excludedSymbols.size} yield exclusions`);
      } catch (error) {
        logger.warn('Failed to fetch yield exclusions', { error: error.message });
      }

      // Add excludedFromYoC flag to all positions
      positions = positions.map(pos => ({
        ...pos,
        excludedFromYoC: excludedSymbols.has(pos.symbol)
      }));
    }

    // Aggregate positions by symbol if requested
    const shouldAggregate = aggregate === 'true' || aggregate === true;
    if (shouldAggregate) {
      positions = aggregatePositions(positions);
    }

    // Ensure all positions have dividend data and previousClose
    // Dividend data should be pre-calculated during sync
    positions = positions.map(pos => ({
      ...pos,
      dividendData: pos.dividendData || {
        annualDividend: 0,
        monthlyDividend: 0,
        annualDividendPerShare: 0,
        monthlyDividendPerShare: 0,
        totalReceived: 0,
        yieldOnCost: 0,
        currentYield: 0,
        dividendFrequency: 0,
        dividendHistory: []
      },
      previousClose: pos.previousClose || pos.currentPrice || 0
    }));

    // Sort by market value descending
    positions.sort((a, b) => {
      const aValue = a.currentMarketValue || (a.currentPrice || 0) * (a.openQuantity || 0);
      const bValue = b.currentMarketValue || (b.currentPrice || 0) * (b.openQuantity || 0);
      return bValue - aValue;
    });

    logger.info(`Returning ${positions.length} positions`);

    return success(positions);

  } catch (error) {
    logger.error('Get positions handler error', {
      error: error.message,
      stack: error.stack
    });
    return internalError(error.message, error);
  }
};

/**
 * Aggregate positions by symbol
 */
function aggregatePositions(positions) {
  const symbolMap = new Map();

  for (const position of positions) {
    const symbol = position.symbol;

    if (!symbolMap.has(symbol)) {
      // First occurrence of this symbol - create aggregated entry
      symbolMap.set(symbol, {
        ...position,
        sourceAccounts: [{
          accountId: position.accountId,
          accountNumber: position.accountNumber,
          accountType: position.accountType,
          quantity: position.openQuantity
        }],
        individualPositions: [{
          accountName: position.accountType && position.accountId
            ? `${position.accountType}-${position.accountId}`
            : position.accountId,
          accountType: position.accountType,
          personName: position.personName,
          shares: position.openQuantity,
          avgCost: position.averageEntryPrice || 0,
          marketValue: position.currentMarketValue || (position.openQuantity * position.currentPrice),
          currency: position.currency
        }]
      });
    } else {
      // Merge with existing position
      const existing = symbolMap.get(symbol);

      // Add source account info
      existing.sourceAccounts.push({
        accountId: position.accountId,
        accountNumber: position.accountNumber,
        accountType: position.accountType,
        quantity: position.openQuantity
      });

      // Add individual position
      existing.individualPositions.push({
        accountName: position.accountType && position.accountId
          ? `${position.accountType}-${position.accountId}`
          : position.accountId,
        accountType: position.accountType,
        personName: position.personName,
        shares: position.openQuantity,
        avgCost: position.averageEntryPrice || 0,
        marketValue: position.currentMarketValue || (position.openQuantity * position.currentPrice),
        currency: position.currency
      });

      // Aggregate quantities and values
      const totalQuantity = existing.openQuantity + position.openQuantity;
      const totalCost = (existing.averageEntryPrice * existing.openQuantity) +
                       (position.averageEntryPrice * position.openQuantity);

      existing.openQuantity = totalQuantity;
      existing.averageEntryPrice = totalCost / totalQuantity;
      existing.totalCost = totalCost;
      existing.currentMarketValue = (existing.currentMarketValue || 0) + (position.currentMarketValue || 0);

      // Aggregate dividend data
      if (position.dividendData && position.dividendData.annualDividend > 0) {
        const existingDiv = existing.dividendData || {
          annualDividend: 0,
          totalReceived: 0,
          dividendHistory: []
        };

        // Sum up annual dividends (this is per-share, so should be summed)
        existingDiv.annualDividend = (existingDiv.annualDividend || 0) + (position.dividendData.annualDividend || 0);

        // FIX: Do NOT sum totalReceived - it's the same value across all accounts for the same symbol
        // totalReceived is tracked per symbol, not per account-symbol pair
        // Use the value from the first position (all positions for same symbol have same totalReceived)
        if (!existingDiv.totalReceived || existingDiv.totalReceived === 0) {
          existingDiv.totalReceived = position.dividendData.totalReceived || 0;
        }

        // Recalculate per-share values based on total quantity
        existingDiv.annualDividendPerShare = totalQuantity > 0 ? existingDiv.annualDividend / totalQuantity : 0;
        existingDiv.monthlyDividendPerShare = existingDiv.annualDividendPerShare / 12;

        // Recalculate yields based on aggregated data
        const avgCost = existing.averageEntryPrice;
        const currentPrice = existing.currentPrice || 0;
        existingDiv.yieldOnCost = avgCost > 0 ? (existingDiv.annualDividendPerShare / avgCost) * 100 : 0;
        existingDiv.currentYield = currentPrice > 0 ? (existingDiv.annualDividendPerShare / currentPrice) * 100 : 0;

        // Keep the most recent dividend history
        existingDiv.dividendHistory = position.dividendData.dividendHistory || existingDiv.dividendHistory || [];
        existingDiv.dividendFrequency = position.dividendData.dividendFrequency || existingDiv.dividendFrequency || 0;

        existing.dividendData = existingDiv;
      }
    }
  }

  return Array.from(symbolMap.values());
}
