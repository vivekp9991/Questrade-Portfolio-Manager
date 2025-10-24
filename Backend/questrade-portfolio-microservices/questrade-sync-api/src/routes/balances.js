// src/routes/balances.js
const express = require('express');
const router = express.Router();
const Balance = require('../models/Balance');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

// Get all balances
router.get('/', asyncHandler(async (req, res) => {
  logger.info('[ROUTE] GET /balances - Fetching all balances');

  const balances = await Balance.find()
    .sort({ personName: 1, accountId: 1, currency: 1 });

  res.json({
    success: true,
    count: balances.length,
    data: balances
  });
}));

// Get balances for a specific account
router.get('/:accountId', asyncHandler(async (req, res) => {
  const { accountId } = req.params;

  logger.info(`[ROUTE] GET /balances/${accountId}`);

  const balances = await Balance.find({ accountId })
    .sort({ currency: 1 });

  res.json({
    success: true,
    count: balances.length,
    data: balances
  });
}));

// Get balances for a specific person
router.get('/person/:personName', asyncHandler(async (req, res) => {
  const { personName } = req.params;

  logger.info(`[ROUTE] GET /balances/person/${personName}`);

  const balances = await Balance.find({ personName })
    .sort({ accountId: 1, currency: 1 });

  res.json({
    success: true,
    count: balances.length,
    data: balances
  });
}));

module.exports = router;
