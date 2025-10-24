const express = require('express');
const router = express.Router();
const tokenManager = require('../services/tokenManager');
const { asyncHandler } = require('../middleware/errorHandler');
const { validatePersonAccess } = require('../middleware/validateToken');
const logger = require('../utils/logger');

// Refresh token for a person
router.post('/refresh-token/:personName', validatePersonAccess, asyncHandler(async (req, res) => {
  const { personName } = req.params;
  
  const result = await tokenManager.refreshAccessToken(personName);
  
  res.json({
    success: true,
    message: 'Token refreshed successfully',
    data: {
      personName: result.personName,
      apiServer: result.apiServer,
      expiresAt: result.expiresAt
    }
  });
}));

// Get token status for a person
router.get('/token-status/:personName', validatePersonAccess, asyncHandler(async (req, res) => {
  const { personName } = req.params;
  
  const status = await tokenManager.getTokenStatus(personName);
  
  res.json({
    success: true,
    data: status
  });
}));

// Get valid access token for a person
router.get('/access-token/:personName', validatePersonAccess, asyncHandler(async (req, res) => {
  const { personName } = req.params;
  const { force, refresh } = req.query;

  // If force or refresh parameter is present, bypass cache and force refresh
  const forceRefresh = force === 'true' || refresh !== undefined;

  let tokenData;
  if (forceRefresh) {
    logger.info(`Force refresh requested for ${personName}, clearing cache and calling OAuth...`);
    // Clear cache for this person
    tokenManager.tokenCache.delete(personName);
    // Force refresh from Questrade
    tokenData = await tokenManager.refreshAccessToken(personName);
  } else {
    // Normal flow with cache
    tokenData = await tokenManager.getValidAccessToken(personName);
  }

  res.json({
    success: true,
    data: tokenData
  });
}));

// Test connection for a person
router.post('/test-connection/:personName', validatePersonAccess, asyncHandler(async (req, res) => {
  const { personName } = req.params;
  
  const result = await tokenManager.testConnection(personName);
  
  res.json({
    success: true,
    message: 'Connection test successful',
    data: result
  });
}));

// Setup new person with token
router.post('/setup-person', asyncHandler(async (req, res) => {
  const { personName, refreshToken } = req.body;
  
  if (!personName || !refreshToken) {
    return res.status(400).json({
      success: false,
      error: 'Person name and refresh token are required'
    });
  }

  const result = await tokenManager.setupPersonToken(personName, refreshToken);
  
  res.status(201).json({
    success: true,
    message: 'Person and token setup successfully',
    data: result
  });
}));

module.exports = router;