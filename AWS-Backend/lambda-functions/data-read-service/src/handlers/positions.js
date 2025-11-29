/**
 * Position Handlers
 * Read position data
 */

const logger = require('../../shared/utils/logger');
const response = require('../../shared/utils/response');
const { query } = require('../../shared/utils/dynamodb');

const POSITIONS_TABLE = process.env.POSITIONS_TABLE;

/**
 * GET /api/data/positions?personName=xxx
 * Get all positions for a person (across all accounts)
 */
async function getPositions(event) {
  try {
    const personName = event.queryStringParameters?.personName;

    if (!personName) {
      return response.badRequest('personName query parameter is required');
    }

    const result = await query(
      POSITIONS_TABLE,
      'personName = :personName',
      { ':personName': personName },
      { IndexName: 'personName-symbol-index' }
    );

    return response.success({
      personName,
      positions: result.items,
      count: result.items.length
    });

  } catch (error) {
    logger.error('Get positions handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * GET /api/data/positions/account/:accountId
 * Get positions for a specific account
 */
async function getAccountPositions(event) {
  try {
    const accountId = event.pathParameters?.accountId;

    if (!accountId) {
      return response.badRequest('accountId is required');
    }

    const result = await query(
      POSITIONS_TABLE,
      'accountId = :accountId',
      { ':accountId': accountId }
    );

    // Get personName from first position if available
    const personName = result.items.length > 0 ? result.items[0].personName : null;

    return response.success({
      personName,
      accountId,
      positions: result.items,
      count: result.items.length
    });

  } catch (error) {
    logger.error('Get account positions handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * GET /api/positions/person/:personName
 * Get all positions for a person (Phase 2 endpoint)
 */
async function getPersonPositions(event) {
  try {
    const personName = event.pathParameters?.personName;
    const aggregated = event.queryStringParameters?.aggregated !== 'false'; // Default true

    if (!personName) {
      return response.badRequest('personName is required');
    }

    const result = await query(
      POSITIONS_TABLE,
      'personName = :personName',
      { ':personName': personName },
      { IndexName: 'personName-symbol-index' }
    );

    // Sort by market value descending
    const positions = result.items.sort((a, b) => {
      return (b.currentMarketValue || 0) - (a.currentMarketValue || 0);
    });

    if (aggregated) {
      // Aggregate positions by symbol across all accounts
      const aggregatedPositions = {};

      positions.forEach(position => {
        const symbol = position.symbol;
        if (!aggregatedPositions[symbol]) {
          aggregatedPositions[symbol] = {
            symbol,
            personName,
            openQuantity: 0,
            currentMarketValue: 0,
            currentPrice: position.currentPrice,
            averageEntryPrice: 0,
            totalCost: 0,
            openPnl: 0,
            accounts: []
          };
        }

        const agg = aggregatedPositions[symbol];
        agg.openQuantity += position.openQuantity || 0;
        agg.currentMarketValue += position.currentMarketValue || 0;
        agg.totalCost += position.totalCost || 0;
        agg.openPnl += position.openPnl || 0;
        agg.accounts.push({
          accountId: position.accountId,
          openQuantity: position.openQuantity,
          currentMarketValue: position.currentMarketValue
        });
      });

      // Calculate weighted average entry price
      Object.values(aggregatedPositions).forEach(agg => {
        if (agg.openQuantity > 0) {
          agg.averageEntryPrice = agg.totalCost / agg.openQuantity;
        }
      });

      const aggregatedArray = Object.values(aggregatedPositions)
        .sort((a, b) => b.currentMarketValue - a.currentMarketValue);

      return response.success({
        aggregated: true,
        personName,
        positions: aggregatedArray,
        count: aggregatedArray.length
      }, `Retrieved ${aggregatedArray.length} aggregated positions for ${personName}`);
    } else {
      // Return raw positions without aggregation
      return response.success({
        aggregated: false,
        personName,
        positions,
        count: positions.length
      }, `Retrieved ${positions.length} positions for ${personName}`);
    }

  } catch (error) {
    logger.error('Get person positions handler error', { error: error.message });
    return response.handleError(error);
  }
}

module.exports = {
  getPositions,
  getAccountPositions,
  getPersonPositions
};
