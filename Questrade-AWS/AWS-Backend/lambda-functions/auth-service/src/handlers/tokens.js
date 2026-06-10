/**
 * Tokens Handlers
 * Handle token management operations (list, stats, cleanup)
 */

const logger = require('../../shared/utils/logger');
const response = require('../../shared/utils/response');
const { scan, query, updateItem } = require('../../shared/utils/dynamodb');

const TOKENS_TABLE = process.env.TOKENS_TABLE;

/**
 * GET /api/tokens
 * Get all tokens (admin function)
 */
async function getAllTokens(event) {
  try {
    const limit = parseInt(event.queryStringParameters?.limit || '50');
    const result = await scan(TOKENS_TABLE, {
      Limit: limit,
      FilterExpression: 'isActive = :isActive',
      ExpressionAttributeValues: { ':isActive': true }
    });

    // Remove encrypted tokens from response
    const tokens = result.items.map(token => ({
      personName: token.personName,
      tokenType: token.tokenType,
      expiresAt: token.expiresAt,
      lastUsed: token.lastUsed,
      usageCount: token.usageCount,
      errorCount: token.errorCount,
      isActive: token.isActive,
      createdAt: token.createdAt
    }));

    return response.success({
      tokens,
      count: tokens.length
    });

  } catch (error) {
    logger.error('Get all tokens handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * GET /api/tokens/:personName
 * Get tokens for a specific person
 */
async function getPersonTokens(event) {
  try {
    const personName = event.pathParameters?.personName;

    if (!personName) {
      return response.badRequest('personName is required');
    }

    const result = await query(
      TOKENS_TABLE,
      'personName = :personName',
      { ':personName': personName }
    );

    // Remove encrypted tokens from response
    const tokens = result.items.map(token => ({
      personName: token.personName,
      tokenType: token.tokenType,
      expiresAt: token.expiresAt,
      lastUsed: token.lastUsed,
      usageCount: token.usageCount,
      errorCount: token.errorCount,
      lastError: token.lastError,
      isActive: token.isActive,
      apiServer: token.apiServer,
      createdAt: token.createdAt
    }));

    return response.success({
      personName,
      tokens,
      count: tokens.length
    });

  } catch (error) {
    logger.error('Get person tokens handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * DELETE /api/tokens/expired
 * Delete or deactivate expired tokens
 */
async function deleteExpiredTokens(event) {
  try {
    const now = Date.now();

    // Scan for expired tokens
    const result = await scan(TOKENS_TABLE, {
      FilterExpression: 'expiresAt < :now AND isActive = :isActive',
      ExpressionAttributeValues: {
        ':now': now,
        ':isActive': true
      }
    });

    // Deactivate expired tokens
    let deactivatedCount = 0;
    for (const token of result.items) {
      await updateItem(TOKENS_TABLE,
        { personName: token.personName, tokenType: token.tokenType },
        { isActive: false }
      );
      deactivatedCount++;
    }

    logger.info(`Deactivated ${deactivatedCount} expired tokens`);

    return response.success({
      deactivatedCount,
      message: `Deactivated ${deactivatedCount} expired tokens`
    });

  } catch (error) {
    logger.error('Delete expired tokens handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * GET /api/tokens/stats/summary
 * Get token statistics summary
 */
async function getTokenStats(event) {
  try {
    const result = await scan(TOKENS_TABLE);
    const now = Date.now();

    const stats = {
      total: result.items.length,
      active: 0,
      expired: 0,
      refresh: 0,
      access: 0,
      withErrors: 0,
      expiringIn30Min: 0,
      uniquePersons: new Set()
    };

    result.items.forEach(token => {
      if (token.isActive) stats.active++;
      if (token.expiresAt < now) stats.expired++;
      if (token.tokenType === 'refresh') stats.refresh++;
      if (token.tokenType === 'access') stats.access++;
      if (token.errorCount > 0) stats.withErrors++;
      if (token.expiresAt < now + (30 * 60 * 1000) && token.expiresAt > now) {
        stats.expiringIn30Min++;
      }
      stats.uniquePersons.add(token.personName);
    });

    stats.uniquePersons = stats.uniquePersons.size;

    return response.success(stats);

  } catch (error) {
    logger.error('Get token stats handler error', { error: error.message });
    return response.handleError(error);
  }
}

module.exports = {
  getAllTokens,
  getPersonTokens,
  deleteExpiredTokens,
  getTokenStats
};
