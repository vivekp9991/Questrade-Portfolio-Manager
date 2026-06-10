/**
 * Watchlist Handlers
 * CRUD operations for watchlists
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../../shared/utils/logger');
const response = require('../../shared/utils/response');
const { query, getItem, putItem, updateItem, deleteItem, batchWrite } = require('../../shared/utils/dynamodb');

const WATCHLISTS_TABLE = process.env.WATCHLISTS_TABLE;
const WATCHLIST_SYMBOLS_TABLE = process.env.WATCHLIST_SYMBOLS_TABLE;

/**
 * GET /api/watchlists/:personName
 * Get all watchlists for a person
 */
async function getWatchlists(event) {
  try {
    const personName = event.pathParameters?.personName;

    if (!personName) {
      return response.badRequest('personName is required');
    }

    // Get watchlists
    const result = await query(
      WATCHLISTS_TABLE,
      'personName = :personName',
      { ':personName': personName },
      { IndexName: 'personName-index' }
    );

    // Get symbols for each watchlist
    const watchlists = await Promise.all(
      result.items.map(async (watchlist) => {
        const symbolsResult = await query(
          WATCHLIST_SYMBOLS_TABLE,
          'watchlistId = :watchlistId',
          { ':watchlistId': watchlist.watchlistId }
        );

        return {
          ...watchlist,
          symbols: symbolsResult.items.map(s => s.symbol),
          symbolCount: symbolsResult.items.length
        };
      })
    );

    return response.success({
      personName,
      watchlists,
      count: watchlists.length
    });

  } catch (error) {
    logger.error('Get watchlists handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * POST /api/watchlists/:personName
 * Create a new watchlist
 */
async function createWatchlist(event) {
  try {
    const personName = event.pathParameters?.personName;
    const body = JSON.parse(event.body || '{}');
    const { name, description, symbols } = body;

    if (!personName || !name) {
      return response.badRequest('personName and name are required');
    }

    const watchlistId = uuidv4();
    const watchlist = {
      watchlistId,
      personName,
      name,
      description: description || '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await putItem(WATCHLISTS_TABLE, watchlist);

    // Add symbols if provided
    if (symbols && Array.isArray(symbols) && symbols.length > 0) {
      const symbolItems = symbols.map(symbol => ({
        watchlistId,
        symbol,
        addedAt: Date.now()
      }));

      await batchWrite(WATCHLIST_SYMBOLS_TABLE, symbolItems, 'put');
    }

    return response.created({
      ...watchlist,
      symbols: symbols || [],
      symbolCount: symbols?.length || 0
    }, 'Watchlist created successfully');

  } catch (error) {
    logger.error('Create watchlist handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * PUT /api/watchlists/:personName/:watchlistId
 * Update a watchlist
 */
async function updateWatchlist(event) {
  try {
    const personName = event.pathParameters?.personName;
    const watchlistId = event.pathParameters?.watchlistId;
    const body = JSON.parse(event.body || '{}');
    const { name, description, symbols } = body;

    if (!personName || !watchlistId) {
      return response.badRequest('personName and watchlistId are required');
    }

    // Get existing watchlist
    const watchlist = await getItem(WATCHLISTS_TABLE, { watchlistId });

    if (!watchlist) {
      return response.notFound('Watchlist not found');
    }

    if (watchlist.personName !== personName) {
      return response.forbidden('Watchlist does not belong to this person');
    }

    // Update watchlist
    const updates = { updatedAt: Date.now() };
    if (name) updates.name = name;
    if (description !== undefined) updates.description = description;

    await updateItem(WATCHLISTS_TABLE, { watchlistId }, updates);

    // Update symbols if provided
    if (symbols && Array.isArray(symbols)) {
      // Delete existing symbols
      const existingSymbols = await query(
        WATCHLIST_SYMBOLS_TABLE,
        'watchlistId = :watchlistId',
        { ':watchlistId': watchlistId }
      );

      for (const item of existingSymbols.items) {
        await deleteItem(WATCHLIST_SYMBOLS_TABLE, {
          watchlistId: item.watchlistId,
          symbol: item.symbol
        });
      }

      // Add new symbols
      if (symbols.length > 0) {
        const symbolItems = symbols.map(symbol => ({
          watchlistId,
          symbol,
          addedAt: Date.now()
        }));

        await batchWrite(WATCHLIST_SYMBOLS_TABLE, symbolItems, 'put');
      }
    }

    return response.success({
      watchlistId,
      ...updates,
      symbols: symbols || []
    }, 'Watchlist updated successfully');

  } catch (error) {
    logger.error('Update watchlist handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * DELETE /api/watchlists/:personName/:watchlistId
 * Delete a watchlist
 */
async function deleteWatchlist(event) {
  try {
    const personName = event.pathParameters?.personName;
    const watchlistId = event.pathParameters?.watchlistId;

    if (!personName || !watchlistId) {
      return response.badRequest('personName and watchlistId are required');
    }

    // Get existing watchlist
    const watchlist = await getItem(WATCHLISTS_TABLE, { watchlistId });

    if (!watchlist) {
      return response.notFound('Watchlist not found');
    }

    if (watchlist.personName !== personName) {
      return response.forbidden('Watchlist does not belong to this person');
    }

    // Delete symbols
    const symbolsResult = await query(
      WATCHLIST_SYMBOLS_TABLE,
      'watchlistId = :watchlistId',
      { ':watchlistId': watchlistId }
    );

    for (const item of symbolsResult.items) {
      await deleteItem(WATCHLIST_SYMBOLS_TABLE, {
        watchlistId: item.watchlistId,
        symbol: item.symbol
      });
    }

    // Delete watchlist
    await deleteItem(WATCHLISTS_TABLE, { watchlistId });

    return response.success({
      watchlistId,
      message: 'Watchlist deleted successfully'
    });

  } catch (error) {
    logger.error('Delete watchlist handler error', { error: error.message });
    return response.handleError(error);
  }
}

module.exports = {
  getWatchlists,
  createWatchlist,
  updateWatchlist,
  deleteWatchlist
};
