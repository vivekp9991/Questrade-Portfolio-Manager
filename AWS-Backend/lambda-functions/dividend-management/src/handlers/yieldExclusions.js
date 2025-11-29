/**
 * Yield Exclusions Handlers (GLOBAL - No personName)
 * Manage which symbols to exclude from YoC calculation
 * These exclusions apply to ALL users (e.g., GLD doesn't pay dividends)
 */

const logger = require('../../shared/utils/logger');
const response = require('../../shared/utils/response');
const { putItem, deleteItem, scan, getItem } = require('../../shared/utils/dynamodb');

const YIELD_EXCLUSIONS_TABLE = process.env.YIELD_EXCLUSIONS_TABLE;

/**
 * GET /api/yield-exclusions
 * Get all yield exclusions (global list)
 */
async function getAllYieldExclusions(event) {
  try {
    logger.info('Getting all yield exclusions (global)');

    const result = await scan(YIELD_EXCLUSIONS_TABLE);
    const exclusions = result.items || [];

    return response.success(exclusions, `Retrieved ${exclusions.length} yield exclusions`);

  } catch (error) {
    logger.error('Get yield exclusions error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * GET /api/yield-exclusions/:symbol
 * Check if a symbol is excluded
 */
async function getYieldExclusion(event) {
  try {
    const symbol = event.pathParameters?.symbol?.toUpperCase();

    if (!symbol) {
      return response.badRequest('symbol is required');
    }

    logger.info(`Checking yield exclusion for: ${symbol}`);

    const result = await getItem(YIELD_EXCLUSIONS_TABLE, { symbol });

    if (!result.item) {
      return response.success(null, `${symbol} is not excluded from YoC`);
    }

    return response.success(result.item, `${symbol} is excluded from YoC`);

  } catch (error) {
    logger.error('Get yield exclusion error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * POST /api/yield-exclusions/:symbol
 * Add a yield exclusion (applies to ALL users)
 */
async function addYieldExclusion(event) {
  try {
    const symbol = event.pathParameters?.symbol?.toUpperCase();
    const body = event.body ? JSON.parse(event.body) : {};

    if (!symbol) {
      return response.badRequest('symbol is required');
    }

    logger.info(`Adding global yield exclusion for: ${symbol}`);

    const exclusion = {
      symbol,
      symbolId: body.symbolId || null,
      name: body.name || '',
      reason: body.reason || 'Does not pay dividends',
      excludedBy: body.excludedBy || 'user',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await putItem(YIELD_EXCLUSIONS_TABLE, exclusion);

    return response.success(exclusion, `Yield exclusion added for ${symbol} (applies to all users)`);

  } catch (error) {
    logger.error('Add yield exclusion error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * DELETE /api/yield-exclusions/:symbol
 * Remove a yield exclusion (applies to ALL users)
 */
async function removeYieldExclusion(event) {
  try {
    const symbol = event.pathParameters?.symbol?.toUpperCase();

    if (!symbol) {
      return response.badRequest('symbol is required');
    }

    logger.info(`Removing global yield exclusion for: ${symbol}`);

    await deleteItem(YIELD_EXCLUSIONS_TABLE, { symbol });

    return response.success({ symbol }, `Yield exclusion removed for ${symbol} (applies to all users)`);

  } catch (error) {
    logger.error('Remove yield exclusion error', { error: error.message });
    return response.handleError(error);
  }
}

module.exports = {
  getAllYieldExclusions,
  getYieldExclusion,
  addYieldExclusion,
  removeYieldExclusion
};
