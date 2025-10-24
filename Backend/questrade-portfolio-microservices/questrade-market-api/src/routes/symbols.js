const express = require('express');
const router = express.Router();
const symbolService = require('../services/symbolService');
const { asyncHandler } = require('../middleware/errorHandler');
const cache = require('../middleware/cache');

// Batch lookup symbols - for WebSocket subscription
router.post('/lookup', asyncHandler(async (req, res) => {
  const { symbols } = req.body;

  if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'symbols must be a non-empty array'
    });
  }

  const symbolMap = await symbolService.lookupSymbols(symbols);

  res.json({
    success: true,
    data: symbolMap
  });
}));

// Get WebSocket stream port from Questrade
// This proxies the request to avoid CORS issues in the browser
// IMPORTANT: Must be before /:symbolId route to avoid route conflict
router.post('/stream-port', asyncHandler(async (req, res) => {
  const { symbolIds, personName = 'Vivek' } = req.body;

  if (!symbolIds || !Array.isArray(symbolIds) || symbolIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'symbolIds must be a non-empty array'
    });
  }

  const streamPort = await symbolService.getStreamPort(symbolIds, personName);

  res.json({
    success: true,
    data: { streamPort }
  });
}));

// GET method for stream-port (for backwards compatibility)
router.get('/stream-port', asyncHandler(async (req, res) => {
  const { symbolIds, personName = 'Vivek' } = req.query;

  // Parse symbolIds if it's a string (comma-separated or JSON)
  let parsedSymbolIds = symbolIds;
  if (typeof symbolIds === 'string') {
    try {
      parsedSymbolIds = JSON.parse(symbolIds);
    } catch (e) {
      parsedSymbolIds = symbolIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
    }
  }

  if (!parsedSymbolIds || !Array.isArray(parsedSymbolIds) || parsedSymbolIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'symbolIds must be a non-empty array (provide as JSON array or comma-separated string)'
    });
  }

  const streamPort = await symbolService.getStreamPort(parsedSymbolIds, personName);

  res.json({
    success: true,
    data: { streamPort }
  });
}));

// Search symbols
router.get('/search', cache.middleware, asyncHandler(async (req, res) => {
  const { prefix, limit = 10 } = req.query;
  
  if (!prefix || prefix.length < 1) {
    return res.status(400).json({
      success: false,
      error: 'Search prefix must be at least 1 character'
    });
  }
  
  req.cacheTTL = 3600; // Cache for 1 hour
  
  const symbols = await symbolService.searchSymbols(prefix, parseInt(limit));
  
  res.json({
    success: true,
    data: symbols
  });
}));

// Get symbol details
router.get('/:symbolId', cache.middleware, asyncHandler(async (req, res) => {
  const { symbolId } = req.params;
  
  req.cacheTTL = 86400; // Cache for 24 hours
  
  const symbol = await symbolService.getSymbolDetails(symbolId);
  
  res.json({
    success: true,
    data: symbol
  });
}));

// Get options chain
router.get('/:symbol/options', cache.middleware, asyncHandler(async (req, res) => {
  const { symbol } = req.params;
  const { expiry } = req.query;
  
  req.cacheTTL = 300; // Cache for 5 minutes
  
  const options = await symbolService.getOptionsChain(symbol.toUpperCase(), expiry);
  
  res.json({
    success: true,
    data: options
  });
}));

// Get symbol fundamentals
router.get('/:symbol/fundamentals', cache.middleware, asyncHandler(async (req, res) => {
  const { symbol } = req.params;
  
  req.cacheTTL = 3600; // Cache for 1 hour
  
  const fundamentals = await symbolService.getSymbolFundamentals(symbol.toUpperCase());
  
  res.json({
    success: true,
    data: fundamentals
  });
}));

// Sync symbol from Questrade
router.post('/:symbol/sync', asyncHandler(async (req, res) => {
  const { symbol } = req.params;
  
  const symbolData = await symbolService.syncSymbolFromQuestrade(symbol.toUpperCase());
  
  res.json({
    success: true,
    data: symbolData,
    message: 'Symbol synced successfully'
  });
}));

module.exports = router;