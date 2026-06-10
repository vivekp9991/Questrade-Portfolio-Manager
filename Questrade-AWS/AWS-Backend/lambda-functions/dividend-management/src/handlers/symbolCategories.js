/**
 * Symbol Categories Handlers
 * Manage symbol categorization (Type, Sub-Type, Sector, etc.)
 * Used for Portfolio Analysis feature
 */

const logger = require('../../shared/utils/logger');
const response = require('../../shared/utils/response');
const { putItem, deleteItem, scan, getItem, batchWrite, query } = require('../../shared/utils/dynamodb');

const SYMBOL_CATEGORIES_TABLE = process.env.SYMBOL_CATEGORIES_TABLE;

// Available category options
const CATEGORY_OPTIONS = {
  symbolTypes: [
    { value: 'DIVIDEND_ETF', label: 'Dividend ETF' },
    { value: 'INDEX_ETF', label: 'Index ETF' },
    { value: 'STOCK', label: 'Stock' },
    { value: 'COMMODITY', label: 'Commodity' }
  ],
  subTypes: {
    COMMODITY: [
      { value: 'GOLD', label: 'Gold' },
      { value: 'SILVER', label: 'Silver' },
      { value: 'PLATINUM', label: 'Platinum' },
      { value: 'PALLADIUM', label: 'Palladium' },
      { value: 'COPPER', label: 'Copper' },
      { value: 'ALUMINUM', label: 'Aluminum' },
      { value: 'URANIUM', label: 'Uranium' },
      { value: 'OIL', label: 'Oil' },
      { value: 'NATURAL_GAS', label: 'Natural Gas' },
      { value: 'OTHER', label: 'Other' }
    ],
    DIVIDEND_ETF: [
      { value: 'CANADIAN', label: 'Canadian' },
      { value: 'US', label: 'US' },
      { value: 'INTERNATIONAL', label: 'International' },
      { value: 'COVERED_CALL', label: 'Covered Call' }
    ],
    INDEX_ETF: [
      { value: 'SP500', label: 'S&P 500' },
      { value: 'NASDAQ', label: 'NASDAQ' },
      { value: 'TSX', label: 'TSX' },
      { value: 'INTERNATIONAL', label: 'International' }
    ],
    STOCK: [
      { value: 'TECHNOLOGY', label: 'Technology' },
      { value: 'HEALTHCARE', label: 'Healthcare' },
      { value: 'FINANCIALS', label: 'Financials' },
      { value: 'ENERGY', label: 'Energy' },
      { value: 'CONSUMER', label: 'Consumer' },
      { value: 'INDUSTRIALS', label: 'Industrials' },
      { value: 'UTILITIES', label: 'Utilities' },
      { value: 'REAL_ESTATE', label: 'Real Estate' },
      { value: 'MATERIALS', label: 'Materials' },
      { value: 'COMMUNICATION', label: 'Communication' },
      { value: 'OTHER', label: 'Other' }
    ]
  },
  sectors: [
    { value: 'TECHNOLOGY', label: 'Technology' },
    { value: 'HEALTHCARE', label: 'Healthcare' },
    { value: 'FINANCIALS', label: 'Financials' },
    { value: 'ENERGY', label: 'Energy' },
    { value: 'MATERIALS', label: 'Materials' },
    { value: 'INDUSTRIALS', label: 'Industrials' },
    { value: 'CONSUMER_DISCRETIONARY', label: 'Consumer Discretionary' },
    { value: 'CONSUMER_STAPLES', label: 'Consumer Staples' },
    { value: 'UTILITIES', label: 'Utilities' },
    { value: 'REAL_ESTATE', label: 'Real Estate' },
    { value: 'COMMUNICATION', label: 'Communication Services' }
  ]
};

/**
 * GET /api/symbol-categories
 * Get all symbol categories
 */
async function getAllSymbolCategories(event) {
  try {
    logger.info('Getting all symbol categories');

    const result = await scan(SYMBOL_CATEGORIES_TABLE);
    const categories = result.items || [];

    return response.success(categories, `Retrieved ${categories.length} symbol categories`);

  } catch (error) {
    logger.error('Get symbol categories error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * GET /api/symbol-categories/:symbol
 * Get category for a specific symbol
 */
async function getSymbolCategory(event) {
  try {
    const symbol = event.pathParameters?.symbol?.toUpperCase();

    if (!symbol) {
      return response.badRequest('symbol is required');
    }

    logger.info(`Getting category for symbol: ${symbol}`);

    const result = await getItem(SYMBOL_CATEGORIES_TABLE, { symbol });

    if (!result) {
      // Return default category if not set
      return response.success({
        symbol,
        symbolType: 'UNCATEGORIZED',
        symbolSubType: null,
        sector: null,
        subSector: null,
        updatedBy: null
      }, `No category set for ${symbol}`);
    }

    return response.success(result, `Category found for ${symbol}`);

  } catch (error) {
    logger.error('Get symbol category error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * POST /api/symbol-categories/:symbol
 * Set/update category for a symbol
 */
async function setSymbolCategory(event) {
  try {
    const symbol = event.pathParameters?.symbol?.toUpperCase();
    const body = event.body ? JSON.parse(event.body) : {};

    if (!symbol) {
      return response.badRequest('symbol is required');
    }

    if (!body.symbolType) {
      return response.badRequest('symbolType is required');
    }

    logger.info(`Setting category for symbol: ${symbol}`, { body });

    const category = {
      symbol,
      symbolType: body.symbolType,
      symbolSubType: body.symbolSubType || null,
      sector: body.sector || null,
      subSector: body.subSector || null,
      updatedAt: Date.now(),
      updatedBy: body.updatedBy || 'manual'
    };

    await putItem(SYMBOL_CATEGORIES_TABLE, category);

    return response.success(category, `Category set for ${symbol}`);

  } catch (error) {
    logger.error('Set symbol category error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * DELETE /api/symbol-categories/:symbol
 * Remove category for a symbol
 */
async function deleteSymbolCategory(event) {
  try {
    const symbol = event.pathParameters?.symbol?.toUpperCase();

    if (!symbol) {
      return response.badRequest('symbol is required');
    }

    logger.info(`Deleting category for symbol: ${symbol}`);

    await deleteItem(SYMBOL_CATEGORIES_TABLE, { symbol });

    return response.success({ symbol }, `Category removed for ${symbol}`);

  } catch (error) {
    logger.error('Delete symbol category error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * POST /api/symbol-categories/bulk
 * Bulk update categories for multiple symbols
 */
async function bulkUpdateSymbolCategories(event) {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { categories } = body;

    if (!categories || !Array.isArray(categories) || categories.length === 0) {
      return response.badRequest('categories array is required');
    }

    logger.info(`Bulk updating ${categories.length} symbol categories`);

    const items = categories.map(cat => ({
      symbol: cat.symbol.toUpperCase(),
      symbolType: cat.symbolType,
      symbolSubType: cat.symbolSubType || null,
      sector: cat.sector || null,
      subSector: cat.subSector || null,
      updatedAt: Date.now(),
      updatedBy: cat.updatedBy || 'bulk'
    }));

    // DynamoDB batch write (max 25 items per batch)
    const batches = [];
    for (let i = 0; i < items.length; i += 25) {
      batches.push(items.slice(i, i + 25));
    }

    for (const batch of batches) {
      await batchWrite(SYMBOL_CATEGORIES_TABLE, batch);
    }

    return response.success({
      updated: items.length,
      categories: items
    }, `Bulk updated ${items.length} symbol categories`);

  } catch (error) {
    logger.error('Bulk update symbol categories error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * GET /api/category-options
 * Get available category options (types, subtypes, sectors)
 */
async function getCategoryOptions(event) {
  try {
    logger.info('Getting category options');

    return response.success(CATEGORY_OPTIONS, 'Category options retrieved');

  } catch (error) {
    logger.error('Get category options error', { error: error.message });
    return response.handleError(error);
  }
}

module.exports = {
  getAllSymbolCategories,
  getSymbolCategory,
  setSymbolCategory,
  deleteSymbolCategory,
  bulkUpdateSymbolCategories,
  getCategoryOptions
};
