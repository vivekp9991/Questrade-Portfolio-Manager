// src/routes/portfolio.js
const express = require('express');
const router = express.Router();
const portfolioCalculator = require('../services/portfolioCalculator');
const { asyncHandler } = require('../middleware/errorHandler');
const { validatePerson } = require('../middleware/validateRequest');
const logger = require('../utils/logger');

// Get portfolio summary for all persons (aggregated)
router.get('/summary', asyncHandler(async (req, res) => {
  const { viewMode = 'all', aggregate = 'true', personName, accountId } = req.query;

  logger.info(`[ROUTE] GET /portfolio/summary - viewMode: ${viewMode}, personName: ${personName}, accountId: ${accountId}, aggregate: ${aggregate}`);

  try {
    const positions = await portfolioCalculator.getAllPersonsPositions(viewMode, aggregate === 'true', personName, accountId);

    // Calculate aggregated summary
    const summary = {
      totalValue: 0,
      totalPnL: 0,
      totalPositions: positions.length,
      totalDayChange: 0,
      persons: new Set()
    };

    positions.forEach(position => {
      const marketValue = position.currentMarketValue || (position.currentPrice * position.openQuantity);
      const cost = position.totalCost || (position.averageEntryPrice * position.openQuantity);
      const pnl = marketValue - cost;

      summary.totalValue += marketValue;
      summary.totalPnL += pnl;
      summary.persons.add(position.personName);
    });

    res.json({
      success: true,
      viewMode,
      aggregate: aggregate === 'true',
      data: {
        totalValue: summary.totalValue,
        totalPnL: summary.totalPnL,
        totalPositions: summary.totalPositions,
        totalPersons: summary.persons.size,
        positions: positions
      }
    });
  } catch (error) {
    logger.error('[ROUTE] Failed to get summary:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch summary'
    });
  }
}));

// Get positions for all persons (UI compatible)
router.get('/positions', asyncHandler(async (req, res) => {
  const { viewMode = 'all', aggregate = 'true', personName, accountId } = req.query;

  logger.info(`[ROUTE] GET /portfolio/positions - viewMode: ${viewMode}, personName: ${personName}, accountId: ${accountId}, aggregate: ${aggregate}`);

  // Convert aggregate string to boolean
  const shouldAggregate = aggregate === 'true' || aggregate === true;

  try {
    const positions = await portfolioCalculator.getAllPersonsPositions(viewMode, shouldAggregate, personName, accountId);

    logger.info(`[ROUTE] Returning ${positions.length} positions`);

    res.json({
      success: true,
      viewMode,
      aggregate: shouldAggregate,
      count: positions.length,
      data: positions
    });
  } catch (error) {
    logger.error('[ROUTE] Failed to get positions:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch positions'
    });
  }
}));

// Get cash balances with account filtering
router.get('/cash-balances', asyncHandler(async (req, res) => {
  const { viewMode = 'all', personName, accountId } = req.query;

  logger.info(`[ROUTE] GET /portfolio/cash-balances - viewMode: ${viewMode}, personName: ${personName}, accountId: ${accountId}`);

  try {
    // Fetch balances from Sync API
    const balances = await portfolioCalculator.getCashBalances(viewMode, personName, accountId);

    res.json({
      success: true,
      viewMode,
      data: balances
    });
  } catch (error) {
    logger.error('[ROUTE] Failed to get cash balances:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch cash balances'
    });
  }
}));

// Get USD/CAD exchange rate (cached)
router.get('/exchange-rate', asyncHandler(async (req, res) => {
  const currencyService = require('../services/currencyService');

  try {
    const rate = await currencyService.getUSDtoCAD();

    res.json({
      success: true,
      data: {
        rate,
        pair: 'USD/CAD',
        cachedAt: currencyService.lastFetchTime ? new Date(currencyService.lastFetchTime).toISOString() : null
      }
    });
  } catch (error) {
    logger.error('[ROUTE] Failed to get exchange rate:', error);

    // Try to get from database as fallback instead of hardcoded value
    const CurrencyRate = require('../models/CurrencyRate');
    try {
      const dbRate = await CurrencyRate.getLatestRate('USD', 'CAD');
      if (dbRate) {
        logger.info('[ROUTE] Using database fallback rate:', dbRate.rate);
        return res.json({
          success: true,
          data: {
            rate: dbRate.rate,
            pair: 'USD/CAD',
            fallback: true,
            source: 'database'
          }
        });
      }
    } catch (dbError) {
      logger.error('[ROUTE] Failed to get database fallback rate:', dbError);
    }

    // Last resort: hardcoded default
    res.json({
      success: true,
      data: {
        rate: 1.35,
        pair: 'USD/CAD',
        fallback: true,
        source: 'hardcoded'
      }
    });
  }
}));

// Get complete portfolio overview for a specific person
router.get('/:personName', validatePerson, asyncHandler(async (req, res) => {
  const { personName } = req.params;

  const portfolio = await portfolioCalculator.getPortfolioSummary(personName);

  res.json({
    success: true,
    data: portfolio
  });
}));

// Get portfolio summary for a specific person
router.get('/:personName/summary', validatePerson, asyncHandler(async (req, res) => {
  const { personName } = req.params;
  
  const summary = await portfolioCalculator.getPortfolioSummary(personName);
  
  res.json({
    success: true,
    data: {
      totalValue: summary.overview.totalValue,
      dayChange: summary.overview.dayChange,
      holdingsCount: summary.holdings.count,
      accountCount: summary.accounts.length,
      lastUpdated: summary.overview.lastUpdated
    }
  });
}));

// Get all holdings for a specific person
router.get('/:personName/holdings', validatePerson, asyncHandler(async (req, res) => {
  const { personName } = req.params;
  const { sortBy = 'value', order = 'desc' } = req.query;
  
  const holdings = await portfolioCalculator.calculateHoldings(personName);
  
  // Sort holdings
  holdings.holdings.sort((a, b) => {
    let compareValue = 0;
    
    switch(sortBy) {
      case 'symbol':
        compareValue = a.symbol.localeCompare(b.symbol);
        break;
      case 'value':
        compareValue = b.marketValue - a.marketValue;
        break;
      case 'percentage':
        compareValue = b.percentage - a.percentage;
        break;
      case 'pnl':
        compareValue = b.unrealizedPnL - a.unrealizedPnL;
        break;
      default:
        compareValue = b.marketValue - a.marketValue;
    }
    
    return order === 'asc' ? -compareValue : compareValue;
  });
  
  res.json({
    success: true,
    data: holdings
  });
}));

// Get portfolio value for a specific person
router.get('/:personName/value', validatePerson, asyncHandler(async (req, res) => {
  const { personName } = req.params;
  
  const value = await portfolioCalculator.calculatePortfolioValue(personName);
  
  res.json({
    success: true,
    data: value
  });
}));

// Get positions for a specific person
router.get('/:personName/positions', validatePerson, asyncHandler(async (req, res) => {
  const { personName } = req.params;
  const { aggregate = 'true' } = req.query;
  
  // For single person, use the existing holdings calculation
  const holdings = await portfolioCalculator.calculateHoldings(personName);
  
  // Transform to match the UI interface
  const positions = holdings.holdings.map(holding => ({
    symbol: holding.symbol,
    currency: holding.symbol.includes('.TO') ? 'CAD' : 'USD',
    openQuantity: holding.quantity,
    averageEntryPrice: holding.averagePrice,
    currentPrice: holding.marketValue / holding.quantity,
    openPrice: holding.marketValue / holding.quantity, // Simplified
    isAggregated: holding.accountCount > 1,
    accountCount: holding.accountCount
  }));
  
  res.json({
    success: true,
    personName,
    aggregate: aggregate === 'true',
    data: positions
  });
}));

// Create new snapshot for a specific person
router.post('/:personName/snapshot', validatePerson, asyncHandler(async (req, res) => {
  const { personName } = req.params;
  
  const snapshot = await portfolioCalculator.createSnapshot(personName);
  
  res.json({
    success: true,
    message: 'Snapshot created successfully',
    data: snapshot
  });
}));

module.exports = router;