/**
 * Portfolio Analysis Handler
 * Provides analysis data for the Dividend Analysis page
 * Calculates breakdowns by dividend status, category, and holdings
 */

const logger = require('../../shared/utils/logger');
const response = require('../../shared/utils/response');
const { scan, query } = require('../../shared/utils/dynamodb');

const POSITIONS_TABLE = process.env.POSITIONS_TABLE;
const SYMBOL_CATEGORIES_TABLE = process.env.SYMBOL_CATEGORIES_TABLE;
const ACCOUNTS_TABLE = process.env.ACCOUNTS_TABLE;

/**
 * GET /api/portfolio/analysis
 * Get portfolio analysis data for charts
 * Query params:
 *   - personName (optional, defaults to 'all')
 *   - accountId (optional, filter by specific account)
 *   - viewMode ('investment' or 'market')
 */
async function getPortfolioAnalysis(event) {
  try {
    const queryParams = event.queryStringParameters || {};
    const personName = queryParams.personName || 'all';
    const accountId = queryParams.accountId || null;
    const viewMode = queryParams.viewMode || 'investment'; // 'investment' or 'market'

    logger.info('Getting portfolio analysis', { personName, accountId, viewMode });

    // Fetch positions
    let positions = [];

    if (accountId) {
      // Filter by specific account (accountId is the primary key)
      const result = await query(
        POSITIONS_TABLE,
        'accountId = :aid',
        { ':aid': accountId }
      );
      positions = result.items || [];
    } else if (personName === 'all') {
      const result = await scan(POSITIONS_TABLE);
      positions = result.items || [];
    } else {
      // Filter by person using GSI
      const result = await query(
        POSITIONS_TABLE,
        'personName = :pn',
        { ':pn': personName },
        { IndexName: 'personName-symbol-index' }
      );
      positions = result.items || [];
    }

    // Fetch all symbol categories (gracefully handle if table is empty or scan fails)
    const categoriesMap = new Map();
    try {
      if (SYMBOL_CATEGORIES_TABLE) {
        const categoriesResult = await scan(SYMBOL_CATEGORIES_TABLE);
        (categoriesResult.items || []).forEach(cat => {
          categoriesMap.set(cat.symbol, cat);
        });
      }
    } catch (catError) {
      logger.warn('Could not fetch symbol categories, using defaults', { error: catError.message });
      // Continue without categories - everything will be UNCATEGORIZED
    }

    // Calculate breakdowns
    const analysis = calculateAnalysis(positions, categoriesMap, viewMode);

    return response.success(analysis, 'Portfolio analysis retrieved');

  } catch (error) {
    logger.error('Get portfolio analysis error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * Calculate all analysis breakdowns
 */
function calculateAnalysis(positions, categoriesMap, viewMode) {
  let totalValue = 0;
  let dividendValue = 0;
  let nonDividendValue = 0;
  let dividendCount = 0;
  let nonDividendCount = 0;

  // Category breakdowns
  const categoryBreakdown = {
    DIVIDEND_ETF: { value: 0, count: 0, positions: [] },
    INDEX_ETF: { value: 0, count: 0, positions: [] },
    STOCK: { value: 0, count: 0, positions: [] },
    COMMODITY: { value: 0, count: 0, positions: [] },
    UNCATEGORIZED: { value: 0, count: 0, positions: [] }
  };

  // Commodity sub-type breakdown
  const commodityBreakdown = {
    GOLD: { value: 0, count: 0 },
    SILVER: { value: 0, count: 0 },
    PLATINUM: { value: 0, count: 0 },
    OTHER: { value: 0, count: 0 }
  };

  // Top holdings array
  const holdingsList = [];

  // Aggregate positions by symbol (for multi-account view)
  const aggregatedPositions = new Map();

  positions.forEach(pos => {
    const symbol = pos.symbol;
    const shares = pos.openQuantity || 0;
    const avgCost = pos.averageEntryPrice || 0;
    const currentPrice = pos.currentPrice || avgCost;

    // Calculate value based on view mode
    const value = viewMode === 'market'
      ? currentPrice * shares
      : avgCost * shares;

    if (aggregatedPositions.has(symbol)) {
      const existing = aggregatedPositions.get(symbol);
      existing.value += value;
      existing.shares += shares;
    } else {
      aggregatedPositions.set(symbol, {
        symbol,
        value,
        shares,
        companyName: pos.companyName || symbol,
        currency: pos.currency,
        hasDividend: (pos.dividendData?.annualDividendPerShare || 0) > 0,
        category: categoriesMap.get(symbol) || { symbolType: 'UNCATEGORIZED', symbolSubType: null }
      });
    }
  });

  // Process aggregated positions
  aggregatedPositions.forEach((pos, symbol) => {
    totalValue += pos.value;

    // Dividend vs Non-Dividend
    if (pos.hasDividend) {
      dividendValue += pos.value;
      dividendCount++;
    } else {
      nonDividendValue += pos.value;
      nonDividendCount++;
    }

    // Category breakdown
    const symbolType = pos.category.symbolType || 'UNCATEGORIZED';
    if (categoryBreakdown[symbolType]) {
      categoryBreakdown[symbolType].value += pos.value;
      categoryBreakdown[symbolType].count++;
      categoryBreakdown[symbolType].positions.push(symbol);
    } else {
      categoryBreakdown.UNCATEGORIZED.value += pos.value;
      categoryBreakdown.UNCATEGORIZED.count++;
      categoryBreakdown.UNCATEGORIZED.positions.push(symbol);
    }

    // Commodity sub-type breakdown
    if (symbolType === 'COMMODITY') {
      const subType = pos.category.symbolSubType || 'OTHER';
      if (commodityBreakdown[subType]) {
        commodityBreakdown[subType].value += pos.value;
        commodityBreakdown[subType].count++;
      } else {
        commodityBreakdown.OTHER.value += pos.value;
        commodityBreakdown.OTHER.count++;
      }
    }

    // Add to holdings list
    holdingsList.push({
      symbol: pos.symbol,
      companyName: pos.companyName,
      value: pos.value,
      currency: pos.currency,
      category: pos.category.symbolType
    });
  });

  // Sort holdings by value (descending) - return ALL holdings
  holdingsList.sort((a, b) => b.value - a.value);
  const allHoldings = holdingsList.map(h => ({
    symbol: h.symbol,
    companyName: h.companyName,
    value: h.value,
    percentage: totalValue > 0 ? (h.value / totalValue) * 100 : 0,
    currency: h.currency,
    category: h.category
  }));

  // Calculate percentages
  const dividendBreakdown = {
    dividendPaying: {
      value: dividendValue,
      percentage: totalValue > 0 ? (dividendValue / totalValue) * 100 : 0,
      count: dividendCount
    },
    nonDividend: {
      value: nonDividendValue,
      percentage: totalValue > 0 ? (nonDividendValue / totalValue) * 100 : 0,
      count: nonDividendCount
    }
  };

  // Format category breakdown with percentages
  const formattedCategoryBreakdown = {};
  Object.keys(categoryBreakdown).forEach(key => {
    const cat = categoryBreakdown[key];
    formattedCategoryBreakdown[key] = {
      value: cat.value,
      percentage: totalValue > 0 ? (cat.value / totalValue) * 100 : 0,
      count: cat.count
    };
  });

  // Format commodity breakdown with percentages
  const totalCommodityValue = categoryBreakdown.COMMODITY.value;
  const formattedCommodityBreakdown = {};
  Object.keys(commodityBreakdown).forEach(key => {
    const com = commodityBreakdown[key];
    formattedCommodityBreakdown[key] = {
      value: com.value,
      percentage: totalCommodityValue > 0 ? (com.value / totalCommodityValue) * 100 : 0,
      count: com.count
    };
  });

  return {
    dividendBreakdown,
    categoryBreakdown: formattedCategoryBreakdown,
    commodityBreakdown: formattedCommodityBreakdown,
    allHoldings,
    summary: {
      totalValue,
      holdingsCount: aggregatedPositions.size,
      commodityCount: categoryBreakdown.COMMODITY.count,
      viewMode
    }
  };
}

module.exports = {
  getPortfolioAnalysis
};
