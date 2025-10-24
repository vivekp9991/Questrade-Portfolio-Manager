const express = require('express');
const router = express.Router();
const dividendSync = require('../services/dividendSync');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

// Sync all dividend data
router.post('/sync/all', asyncHandler(async (req, res) => {
  logger.info('[DIVIDEND API] Syncing all dividend data');

  const result = await dividendSync.syncAllDividendData();

  res.json({
    success: true,
    message: 'Dividend sync completed',
    data: result
  });
}));

// Sync dividend data for a specific person
router.post('/sync/person/:personName', asyncHandler(async (req, res) => {
  const { personName } = req.params;

  logger.info(`[DIVIDEND API] Syncing dividends for ${personName}`);

  const result = await dividendSync.syncPersonDividendData(personName);

  res.json({
    success: true,
    message: `Dividend sync completed for ${personName}`,
    data: result
  });
}));

// Sync dividend data for a specific symbol
router.post('/sync/symbol/:symbol', asyncHandler(async (req, res) => {
  const { symbol } = req.params;

  logger.info(`[DIVIDEND API] Syncing dividends for ${symbol}`);

  const result = await dividendSync.syncSymbolDividendData(symbol);

  res.json({
    success: true,
    message: `Dividend sync completed for ${symbol}`,
    data: result
  });
}));

module.exports = router;
