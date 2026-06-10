/**
 * Symbol Dividends Handlers
 * Manage centralized dividend data per symbol
 */

const logger = require('../../shared/utils/logger');
const response = require('../../shared/utils/response');
const { putItem, getItem, deleteItem, scan, batchWrite } = require('../../shared/utils/dynamodb');

const SYMBOL_DIVIDENDS_TABLE = process.env.SYMBOL_DIVIDENDS_TABLE;

// Payments per year by frequency — used to turn Questrade's per-payment dividend into an
// annual figure, then a monthly-equivalent (annual / 12). Must match the sync service.
const FREQUENCY_MULTIPLIER = {
  monthly: 12, 'semi-monthly': 24, quarterly: 4, 'semi-annual': 2, annual: 1, none: 0, unknown: 0
};
const freqMultiplier = (f) => FREQUENCY_MULTIPLIER[String(f || '').toLowerCase()] || 0;

/**
 * GET /api/symbol-dividends/all
 * Get all symbol dividend data
 */
async function getAllSymbolDividends(event) {
  try {
    logger.info('Getting all symbol dividends');

    const result = await scan(SYMBOL_DIVIDENDS_TABLE);
    const dividends = result.items || [];

    return response.success(dividends, `Retrieved ${dividends.length} symbol dividends`);

  } catch (error) {
    logger.error('Get all symbol dividends error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * GET /api/symbol-dividends/symbol/:symbol
 * Get dividend data for a specific symbol
 */
async function getSymbolDividend(event) {
  try {
    const symbol = event.pathParameters?.symbol?.toUpperCase();

    if (!symbol) {
      return response.badRequest('Symbol is required');
    }

    logger.info(`Getting dividend data for symbol: ${symbol}`);

    const result = await getItem(SYMBOL_DIVIDENDS_TABLE, { symbol });

    if (!result) {
      return response.success(null, `No dividend data found for ${symbol}`);
    }

    return response.success(result, `Retrieved dividend data for ${symbol}`);

  } catch (error) {
    logger.error('Get symbol dividend error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * POST /api/symbol-dividends/symbol/:symbol
 * Set/update dividend data for a symbol
 */
async function setSymbolDividend(event) {
  try {
    const symbol = event.pathParameters?.symbol?.toUpperCase();
    const body = event.body ? JSON.parse(event.body) : {};

    if (!symbol) {
      return response.badRequest('Symbol is required');
    }

    logger.info(`Setting dividend data for symbol: ${symbol}`, body);

    // Get existing data to preserve dividendPerShare from Questrade
    const existing = await getItem(SYMBOL_DIVIDENDS_TABLE, { symbol });
    const existingData = existing || {};

    const dividendData = {
      symbol,
      dividendFrequency: body.dividendFrequency || 'monthly',
      dividendPerShare: existingData.dividendPerShare || 0, // Preserve Questrade value
      lastPaymentDate: body.lastPaymentDate || null,
      nextPaymentDate: body.nextPaymentDate || null,
      lastModifiedBy: body.lastModifiedBy || 'user',
      lastModifiedAt: Date.now(),
      notes: body.notes || '',
      dataSource: body.dataSource || 'manual',
      createdAt: existingData.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    // Handle manual override
    if (body.isManualOverride === true || body.isManualOverride === 'true') {
      dividendData.isManualOverride = 'true';
      dividendData.overrideValue = body.monthlyDividendPerShare || 0; // Store as overrideValue
      logger.info(`Setting manual override for ${symbol}: $${dividendData.overrideValue}`);
    } else {
      dividendData.isManualOverride = 'false';
      // Remove override value if turning off manual override
      if (existingData.overrideValue !== undefined) {
        dividendData.overrideValue = null;
      }
      // Recompute the monthly-equivalent per share from Questrade's PER-PAYMENT dividend and the
      // (possibly just-changed) frequency: annual = perPayment × paymentsPerYear; monthly = annual / 12.
      // So changing the frequency immediately corrects the value (previously it kept the stale number).
      const perPayment = Number(existingData.questradeData?.dividend) || 0;
      const mult = freqMultiplier(dividendData.dividendFrequency);
      if (perPayment > 0) {
        dividendData.dividendPerShare = (perPayment * mult) / 12; // mult=0 (none/unknown) ⇒ 0
      }
    }

    // Preserve Questrade data if exists
    if (existingData.questradeData) {
      dividendData.questradeData = existingData.questradeData;
    }
    if (existingData.lastSyncTimestamp) {
      dividendData.lastSyncTimestamp = existingData.lastSyncTimestamp;
    }

    await putItem(SYMBOL_DIVIDENDS_TABLE, dividendData);

    return response.success(dividendData, `Dividend data updated for ${symbol}`);

  } catch (error) {
    logger.error('Set symbol dividend error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * DELETE /api/symbol-dividends/symbol/:symbol
 * Delete dividend data for a symbol
 */
async function deleteSymbolDividend(event) {
  try {
    const symbol = event.pathParameters?.symbol?.toUpperCase();

    if (!symbol) {
      return response.badRequest('Symbol is required');
    }

    logger.info(`Deleting dividend data for symbol: ${symbol}`);

    await deleteItem(SYMBOL_DIVIDENDS_TABLE, { symbol });

    return response.success({ symbol }, `Dividend data deleted for ${symbol}`);

  } catch (error) {
    logger.error('Delete symbol dividend error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * POST /api/symbol-dividends/bulk
 * Bulk update symbol dividends
 */
async function bulkUpdateSymbolDividends(event) {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const dividends = body.dividends || [];

    if (!Array.isArray(dividends) || dividends.length === 0) {
      return response.badRequest('Dividends array is required');
    }

    logger.info(`Bulk updating ${dividends.length} symbol dividends`);

    const items = dividends.map(div => ({
      symbol: div.symbol.toUpperCase(),
      dividendFrequency: div.dividendFrequency || 'monthly',
      monthlyDividendPerShare: div.monthlyDividendPerShare || 0,
      lastPaymentDate: div.lastPaymentDate || null,
      nextPaymentDate: div.nextPaymentDate || null,
      isManualOverride: div.isManualOverride === true ? 'true' : 'false',
      lastModifiedBy: div.lastModifiedBy || 'user',
      lastModifiedAt: Date.now(),
      notes: div.notes || '',
      dataSource: div.dataSource || 'manual',
      createdAt: div.createdAt || Date.now(),
      updatedAt: Date.now()
    }));

    await batchWrite(SYMBOL_DIVIDENDS_TABLE, items, 'put');

    return response.success({ updated: items.length }, `Bulk updated ${items.length} symbol dividends`);

  } catch (error) {
    logger.error('Bulk update symbol dividends error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * POST /api/symbol-dividends/symbol/:symbol/reset-override
 * Reset manual override for a symbol (set to auto-calculated)
 */
async function resetSymbolDividendOverride(event) {
  try {
    const symbol = event.pathParameters?.symbol?.toUpperCase();

    if (!symbol) {
      return response.badRequest('Symbol is required');
    }

    logger.info(`Resetting override for symbol: ${symbol}`);

    const result = await getItem(SYMBOL_DIVIDENDS_TABLE, { symbol });

    if (!result) {
      return response.badRequest(`No dividend data found for ${symbol}`);
    }

    const updatedData = {
      ...result,
      isManualOverride: 'false',
      dataSource: 'calculated',
      lastModifiedAt: Date.now(),
      updatedAt: Date.now()
    };

    await putItem(SYMBOL_DIVIDENDS_TABLE, updatedData);

    return response.success(updatedData, `Override reset for ${symbol}`);

  } catch (error) {
    logger.error('Reset symbol dividend override error', { error: error.message });
    return response.handleError(error);
  }
}

module.exports = {
  getAllSymbolDividends,
  getSymbolDividend,
  setSymbolDividend,
  deleteSymbolDividend,
  bulkUpdateSymbolDividends,
  resetSymbolDividendOverride
};
