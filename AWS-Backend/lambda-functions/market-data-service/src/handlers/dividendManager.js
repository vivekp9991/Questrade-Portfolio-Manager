/**
 * Dividend Manager Handlers
 * CRUD operations for SymbolsMasterTable dividend data and YOC settings
 */

const logger = require('../../shared/utils/logger');
const response = require('../../shared/utils/response');
const { scan, query, getItem, putItem, updateItem } = require('../../shared/utils/dynamodb');

const SYMBOLS_MASTER_TABLE = process.env.SYMBOLS_MASTER_TABLE;

/**
 * GET /api/dividend-manager/symbols
 * Get all symbols with dividend data and YOC settings
 * Optional query params: ?needsReview=true&includeInYOC=true
 */
async function getAllSymbols(event) {
  try {
    const queryParams = event.queryStringParameters || {};
    const needsReview = queryParams.needsReview;
    const includeInYOC = queryParams.includeInYOC;

    let items;

    if (needsReview === 'true') {
      // Query using needsReview-index GSI
      const result = await query(
        SYMBOLS_MASTER_TABLE,
        'needsReview = :needsReview',
        { ':needsReview': 'true' },
        { IndexName: 'needsReview-index' }
      );
      items = result.items;
    } else {
      // Scan all symbols
      const result = await scan(SYMBOLS_MASTER_TABLE);
      items = result.items;
    }

    // Filter by includeInYOC if specified
    if (includeInYOC !== undefined) {
      const includeFlag = includeInYOC === 'true';
      items = items.filter(item =>
        item.portfolioSettings?.includeInYOC === includeFlag
      );
    }

    // Sort by symbol name
    items.sort((a, b) => a.symbol.localeCompare(b.symbol));

    return response.success({
      symbols: items,
      count: items.length
    });

  } catch (error) {
    logger.error('Get all symbols error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * GET /api/dividend-manager/symbols/:symbol
 * Get single symbol with full details
 */
async function getSymbol(event) {
  try {
    const symbol = event.pathParameters?.symbol?.toUpperCase();

    if (!symbol) {
      return response.badRequest('Symbol is required');
    }

    const result = await query(
      SYMBOLS_MASTER_TABLE,
      'symbol = :symbol',
      { ':symbol': symbol },
      { Limit: 1 }
    );

    if (result.items.length === 0) {
      return response.notFound(`Symbol ${symbol} not found`);
    }

    return response.success(result.items[0]);

  } catch (error) {
    logger.error('Get symbol error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * PUT /api/dividend-manager/symbols/:symbol/dividend
 * Update dividend data for a symbol (manual override)
 */
async function updateDividend(event) {
  try {
    const symbol = event.pathParameters?.symbol?.toUpperCase();
    const body = JSON.parse(event.body || '{}');

    if (!symbol) {
      return response.badRequest('Symbol is required');
    }

    const {
      dividendPerMonth,
      dividendFrequency,
      notes
    } = body;

    if (dividendPerMonth === undefined) {
      return response.badRequest('dividendPerMonth is required');
    }

    // Calculate annual dividend
    const annualDividend = dividendPerMonth * (dividendFrequency || 12);

    // Get current symbol data
    const queryResult = await query(
      SYMBOLS_MASTER_TABLE,
      'symbol = :symbol',
      { ':symbol': symbol },
      { Limit: 1 }
    );

    if (queryResult.items.length === 0) {
      return response.notFound(`Symbol ${symbol} not found`);
    }

    const currentData = queryResult.items[0];
    const previousAmount = currentData.dividendData?.questradeLastAmount || 0;

    // Update dividend data
    const updates = {
      dividendData: {
        ...currentData.dividendData,
        dividendPerMonth: parseFloat(dividendPerMonth),
        dividendFrequency: dividendFrequency || currentData.dividendData?.dividendFrequency || 12,
        annualDividend: annualDividend,
        isManualOverride: true,
        questradeLastAmount: previousAmount,
        lastVerifiedDate: new Date().toISOString().split('T')[0],
        notes: notes || null
      },
      updatedAt: Date.now(),
      syncStatus: 'manual_override',
      needsReview: 'false'  // Clear review flag after manual update
    };

    await updateItem(SYMBOLS_MASTER_TABLE, { symbol }, updates);

    logger.info(`Updated dividend for ${symbol}: $${dividendPerMonth}/month (manual override)`);

    return response.success({
      message: 'Dividend updated successfully',
      symbol,
      dividendData: updates.dividendData
    });

  } catch (error) {
    logger.error('Update dividend error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * PUT /api/dividend-manager/symbols/:symbol/yoc-settings
 * Update YOC (Yield on Cost) settings for a symbol
 */
async function updateYOCSettings(event) {
  try {
    const symbol = event.pathParameters?.symbol?.toUpperCase();
    const body = JSON.parse(event.body || '{}');

    if (!symbol) {
      return response.badRequest('Symbol is required');
    }

    const {
      includeInYOC,
      excludeReason,
      category
    } = body;

    if (includeInYOC === undefined) {
      return response.badRequest('includeInYOC is required');
    }

    // Get current symbol data
    const queryResult = await query(
      SYMBOLS_MASTER_TABLE,
      'symbol = :symbol',
      { ':symbol': symbol },
      { Limit: 1 }
    );

    if (queryResult.items.length === 0) {
      return response.notFound(`Symbol ${symbol} not found`);
    }

    const currentData = queryResult.items[0];

    // Update portfolio settings
    const updates = {
      portfolioSettings: {
        ...currentData.portfolioSettings,
        includeInYOC: includeInYOC === true || includeInYOC === 'true',
        excludeReason: includeInYOC ? null : (excludeReason || 'Manual exclusion'),
        category: category || currentData.portfolioSettings?.category || null
      },
      updatedAt: Date.now()
    };

    await updateItem(SYMBOLS_MASTER_TABLE, { symbol }, updates);

    logger.info(`Updated YOC settings for ${symbol}: includeInYOC=${includeInYOC}`);

    return response.success({
      message: 'YOC settings updated successfully',
      symbol,
      portfolioSettings: updates.portfolioSettings
    });

  } catch (error) {
    logger.error('Update YOC settings error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * POST /api/dividend-manager/symbols/:symbol/accept-questrade
 * Accept Questrade's dividend value (resolve review flag)
 */
async function acceptQuestradeDividend(event) {
  try {
    const symbol = event.pathParameters?.symbol?.toUpperCase();

    if (!symbol) {
      return response.badRequest('Symbol is required');
    }

    // Get current symbol data
    const queryResult = await query(
      SYMBOLS_MASTER_TABLE,
      'symbol = :symbol',
      { ':symbol': symbol },
      { Limit: 1 }
    );

    if (queryResult.items.length === 0) {
      return response.notFound(`Symbol ${symbol} not found`);
    }

    const currentData = queryResult.items[0];
    const questradeAmount = currentData.dividendData?.questradeLastAmount || 0;

    // Update to use Questrade value
    const updates = {
      dividendData: {
        ...currentData.dividendData,
        dividendPerMonth: questradeAmount,
        isManualOverride: false,
        lastVerifiedDate: new Date().toISOString().split('T')[0],
        notes: 'Accepted Questrade value'
      },
      updatedAt: Date.now(),
      syncStatus: 'auto_synced',
      needsReview: 'false'  // Clear review flag
    };

    await updateItem(SYMBOLS_MASTER_TABLE, { symbol }, updates);

    logger.info(`Accepted Questrade dividend for ${symbol}: $${questradeAmount}/month`);

    return response.success({
      message: 'Questrade dividend value accepted',
      symbol,
      dividendData: updates.dividendData
    });

  } catch (error) {
    logger.error('Accept Questrade dividend error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * POST /api/dividend-manager/sync
 * Trigger sync job to compare Questrade vs master table
 * (This would normally be a scheduled job, but can be triggered manually)
 */
async function triggerSync(event) {
  try {
    // This is a placeholder for the sync logic
    // In production, this would invoke a separate Lambda or Step Function

    logger.info('Dividend sync triggered (placeholder)');

    return response.success({
      message: 'Sync job triggered successfully',
      note: 'This is a placeholder - implement full sync logic in Phase 5'
    });

  } catch (error) {
    logger.error('Trigger sync error', { error: error.message });
    return response.handleError(error);
  }
}

module.exports = {
  getAllSymbols,
  getSymbol,
  updateDividend,
  updateYOCSettings,
  acceptQuestradeDividend,
  triggerSync
};
