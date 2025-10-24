const express = require('express');
const router = express.Router();
const YieldExclusion = require('../models/YieldExclusion');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');

// Get all exclusions for a person
router.get('/person/:personName', asyncHandler(async (req, res) => {
  const { personName } = req.params;

  logger.info(`[YIELD-EXCLUSION] GET /person/${personName} - Fetching YoC exclusions`);

  const exclusions = await YieldExclusion.getExclusionsForPerson(personName);

  res.json({
    success: true,
    personName,
    count: exclusions.length,
    data: exclusions
  });
}));

// Get excluded symbols list for a person (simple array)
router.get('/person/:personName/symbols', asyncHandler(async (req, res) => {
  const { personName } = req.params;

  logger.info(`[YIELD-EXCLUSION] GET /person/${personName}/symbols - Fetching excluded symbols list`);

  const symbols = await YieldExclusion.getExcludedSymbols(personName);

  res.json({
    success: true,
    personName,
    count: symbols.length,
    data: symbols
  });
}));

// Check if a specific symbol is excluded
router.get('/person/:personName/check/:symbol', asyncHandler(async (req, res) => {
  const { personName, symbol } = req.params;

  logger.info(`[YIELD-EXCLUSION] GET /person/${personName}/check/${symbol} - Checking exclusion status`);

  const isExcluded = await YieldExclusion.isSymbolExcluded(personName, symbol);

  res.json({
    success: true,
    personName,
    symbol: symbol.toUpperCase(),
    isExcluded
  });
}));

// Add exclusion
router.post('/person/:personName', asyncHandler(async (req, res) => {
  const { personName } = req.params;
  const { symbol, symbolId, name, reason } = req.body;

  if (!symbol) {
    return res.status(400).json({
      success: false,
      error: 'Symbol is required'
    });
  }

  logger.info(`[YIELD-EXCLUSION] POST /person/${personName} - Adding exclusion for ${symbol}`);

  const exclusion = await YieldExclusion.addExclusion(personName, symbol, {
    symbolId,
    name,
    reason,
    excludedBy: 'user'
  });

  res.json({
    success: true,
    message: `Successfully excluded ${symbol} from YoC calculation`,
    data: exclusion
  });
}));

// Remove exclusion
router.delete('/person/:personName/:symbol', asyncHandler(async (req, res) => {
  const { personName, symbol } = req.params;

  logger.info(`[YIELD-EXCLUSION] DELETE /person/${personName}/${symbol} - Removing exclusion`);

  const deleted = await YieldExclusion.removeExclusion(personName, symbol);

  if (!deleted) {
    return res.status(404).json({
      success: false,
      error: `Exclusion for ${symbol} not found`
    });
  }

  res.json({
    success: true,
    message: `Successfully removed ${symbol} from YoC exclusions`,
    data: deleted
  });
}));

// Bulk add exclusions
router.post('/person/:personName/bulk', asyncHandler(async (req, res) => {
  const { personName } = req.params;
  const { symbols } = req.body;

  if (!Array.isArray(symbols) || symbols.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Symbols array is required'
    });
  }

  logger.info(`[YIELD-EXCLUSION] POST /person/${personName}/bulk - Adding ${symbols.length} exclusions`);

  const results = [];
  const errors = [];

  for (const item of symbols) {
    try {
      const symbol = typeof item === 'string' ? item : item.symbol;
      const exclusion = await YieldExclusion.addExclusion(personName, symbol, item);
      results.push(exclusion);
    } catch (error) {
      errors.push({
        symbol: typeof item === 'string' ? item : item.symbol,
        error: error.message
      });
    }
  }

  res.json({
    success: true,
    message: `Successfully added ${results.length} exclusions`,
    added: results.length,
    failed: errors.length,
    data: results,
    errors: errors.length > 0 ? errors : undefined
  });
}));

// Bulk delete exclusions
router.delete('/person/:personName/bulk', asyncHandler(async (req, res) => {
  const { personName } = req.params;
  const { symbols } = req.body;

  if (!Array.isArray(symbols) || symbols.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Symbols array is required'
    });
  }

  logger.info(`[YIELD-EXCLUSION] DELETE /person/${personName}/bulk - Removing ${symbols.length} exclusions`);

  const results = [];
  const errors = [];

  for (const symbol of symbols) {
    try {
      const deleted = await YieldExclusion.removeExclusion(personName, symbol);
      if (deleted) {
        results.push(deleted);
      } else {
        errors.push({
          symbol,
          error: 'Not found'
        });
      }
    } catch (error) {
      errors.push({
        symbol,
        error: error.message
      });
    }
  }

  res.json({
    success: true,
    message: `Successfully removed ${results.length} exclusions`,
    removed: results.length,
    failed: errors.length,
    data: results,
    errors: errors.length > 0 ? errors : undefined
  });
}));

module.exports = router;
