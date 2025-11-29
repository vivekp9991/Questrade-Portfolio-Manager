/**
 * Yield Exclusions Handlers
 * Manage which symbols to exclude from YoC calculation
 */

const logger = require('../../shared/utils/logger');
const response = require('../../shared/utils/response');
const { putItem, deleteItem, query } = require('../../shared/utils/dynamodb');

const YIELD_EXCLUSIONS_TABLE = process.env.YIELD_EXCLUSIONS_TABLE;

/**
 * GET /api/yield-exclusions/person/:personName
 * Get all yield exclusions for a person
 */
async function getYieldExclusions(event) {
  try {
    const personName = event.pathParameters?.personName;

    if (!personName) {
      return response.badRequest('personName is required');
    }

    logger.info(`Getting yield exclusions for: ${personName}`);

    const result = await query(
      YIELD_EXCLUSIONS_TABLE,
      'personName = :personName',
      { ':personName': personName }
    );

    const exclusions = result.items || [];

    return response.success(exclusions, `Retrieved ${exclusions.length} yield exclusions`);

  } catch (error) {
    logger.error('Get yield exclusions error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * POST /api/yield-exclusions/person/:personName
 * Add a yield exclusion
 */
async function addYieldExclusion(event) {
  try {
    const personName = event.pathParameters?.personName;
    const body = event.body ? JSON.parse(event.body) : {};
    const symbol = body.symbol?.toUpperCase();

    if (!personName || !symbol) {
      return response.badRequest('personName and symbol are required');
    }

    logger.info(`Adding yield exclusion for ${personName}: ${symbol}`);

    const exclusion = {
      personName,
      symbol,
      symbolId: body.symbolId || null,
      name: body.name || '',
      reason: body.reason || '',
      excludedBy: body.excludedBy || 'user',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await putItem(YIELD_EXCLUSIONS_TABLE, exclusion);

    return response.success(exclusion, `Yield exclusion added for ${symbol}`);

  } catch (error) {
    logger.error('Add yield exclusion error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * DELETE /api/yield-exclusions/person/:personName/:symbol
 * Remove a yield exclusion
 */
async function removeYieldExclusion(event) {
  try {
    const personName = event.pathParameters?.personName;
    const symbol = event.pathParameters?.symbol?.toUpperCase();

    if (!personName || !symbol) {
      return response.badRequest('personName and symbol are required');
    }

    logger.info(`Removing yield exclusion for ${personName}: ${symbol}`);

    await deleteItem(YIELD_EXCLUSIONS_TABLE, { personName, symbol });

    return response.success({ personName, symbol }, `Yield exclusion removed for ${symbol}`);

  } catch (error) {
    logger.error('Remove yield exclusion error', { error: error.message });
    return response.handleError(error);
  }
}

module.exports = {
  getYieldExclusions,
  addYieldExclusion,
  removeYieldExclusion
};
