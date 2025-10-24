const Token = require('../models/Token');
const Person = require('../models/Person');
const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config/environment');

class TokenManager {
  constructor() {
    this.authUrl = config.questrade.authUrl;
    // In-memory cache for access tokens (30-min TTL)
    this.tokenCache = new Map();
  }

  async getValidAccessToken(personName) {
    try {
      // Check in-memory cache first (with 30-second buffer before actual expiry)
      const cached = this.tokenCache.get(personName);
      if (cached) {
        const now = Date.now();
        const expiryTime = cached.expiresAt instanceof Date ? cached.expiresAt.getTime() : new Date(cached.expiresAt).getTime();
        const bufferTime = now + 30000; // 30-second buffer
        const timeUntilExpiry = Math.round((expiryTime - now) / 1000);

        logger.debug(`Cache check for ${personName}: now=${new Date(now).toISOString()}, expires=${cached.expiresAt}, timeUntilExpiry=${timeUntilExpiry}s`);

        if (expiryTime > bufferTime) {
          logger.debug(`✅ Using cached access token for ${personName} (expires in ${timeUntilExpiry}s)`);
          return {
            accessToken: cached.accessToken,
            apiServer: cached.apiServer,
            personName,
            expiresAt: cached.expiresAt
          };
        } else {
          logger.info(`❌ Cached token for ${personName} expired or expiring soon (${timeUntilExpiry}s left), clearing cache`);
          this.tokenCache.delete(personName);
        }
      }

      // Cache miss or expired - check database
      // Apply the same 30-second buffer to database query
      const bufferTime = new Date(Date.now() + 30000);
      logger.debug(`Database query for ${personName}: looking for tokens expiring after ${bufferTime.toISOString()}`);

      const accessToken = await Token.findOne({
        personName,
        type: 'access',
        isActive: true,
        expiresAt: { $gt: bufferTime }
      }).sort({ createdAt: -1 });

      if (accessToken) {
        const timeUntilExpiry = Math.round((accessToken.expiresAt.getTime() - Date.now()) / 1000);
        logger.info(`✅ Found valid DB token for ${personName}, expires in ${timeUntilExpiry}s`);

        await accessToken.markAsUsed();

        const tokenData = {
          accessToken: accessToken.getDecryptedToken(),
          apiServer: accessToken.apiServer,
          personName,
          expiresAt: accessToken.expiresAt
        };

        // Cache the token for future requests
        this.tokenCache.set(personName, tokenData);
        logger.info(`Cached access token for ${personName} (valid until ${accessToken.expiresAt.toISOString()})`);

        return tokenData;
      }

      // Need to refresh token - no valid token found in database
      logger.info(`❌ No valid access token in DB for ${personName} (none found or all expire within 30s)`);
      logger.info(`🔄 Triggering OAuth refresh for ${personName}...`);
      return await this.refreshAccessToken(personName);
    } catch (error) {
      logger.error(`Error getting valid access token for ${personName}:`, error);
      throw error;
    }
  }

async refreshAccessToken(personName) {
  try {
    const refreshTokenDoc = await Token.findOne({
      personName,
      type: 'refresh',
      isActive: true
    }).sort({ createdAt: -1 });

    if (!refreshTokenDoc) {
      throw new Error(`No active refresh token found for ${personName}`);
    }

    const refreshToken = refreshTokenDoc.getDecryptedToken();
    
    if (!refreshToken || refreshToken.length < 20) {
      throw new Error(`Invalid refresh token format for ${personName}`);
    }
    
    logger.info(`🔄 Attempting to refresh access token for ${personName} via Questrade OAuth...`);
    logger.debug(`Using refresh token from DB (created: ${refreshTokenDoc.createdAt.toISOString()})`);

    // Call Questrade OAuth endpoint
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    });

    const response = await axios.post(
      `${this.authUrl}/oauth2/token`,
      params.toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000
      }
    );

    const { 
      access_token, 
      refresh_token: newRefreshToken, 
      api_server, 
      expires_in 
    } = response.data;

    if (!access_token || !newRefreshToken) {
      throw new Error('Invalid response from Questrade API - missing tokens');
    }

    // Format the API server URL properly
    let formattedApiServer = api_server;
    
    // Remove trailing slash if present
    if (formattedApiServer && formattedApiServer.endsWith('/')) {
      formattedApiServer = formattedApiServer.slice(0, -1);
    }
    
    // Add https:// if not present
    if (formattedApiServer && !formattedApiServer.startsWith('http://') && !formattedApiServer.startsWith('https://')) {
      formattedApiServer = `https://${formattedApiServer}`;
    }

    logger.info(`API Server for ${personName}: ${formattedApiServer}`);

    // Delete old tokens for this person
    const deleteResult = await Token.deleteMany({ personName, isActive: true });
    logger.debug(`Deleted ${deleteResult.deletedCount} old tokens for ${personName}`);

    // Save new access token
    const accessTokenDoc = Token.createWithToken({
      type: 'access',
      personName,
      token: access_token,
      apiServer: formattedApiServer,
      expiresAt: new Date(Date.now() + (expires_in * 1000)),
      isActive: true
    });
    await accessTokenDoc.save();

    // Save new refresh token
    const refreshTokenNewDoc = Token.createWithToken({
      type: 'refresh',
      personName,
      token: newRefreshToken,
      expiresAt: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)), // 7 days
      isActive: true
    });
    await refreshTokenNewDoc.save();

    // Update person record
    await Person.findOneAndUpdate(
      { personName },
      { 
        hasValidToken: true,
        lastTokenRefresh: new Date(),
        lastTokenError: null
      }
    );

    const expiresInSeconds = Math.round((new Date(Date.now() + (expires_in * 1000)).getTime() - Date.now()) / 1000);
    logger.info(`✅ Token refreshed successfully for ${personName} (expires in ${expiresInSeconds}s)`);

    const tokenData = {
      accessToken: access_token,
      apiServer: formattedApiServer,
      personName,
      expiresAt: new Date(Date.now() + (expires_in * 1000))
    };

    // Cache the new token
    this.tokenCache.set(personName, tokenData);
    logger.info(`💾 Cached refreshed access token for ${personName} (valid until ${tokenData.expiresAt.toISOString()})`);

    return tokenData;
  } catch (error) {
    await this.recordTokenError(personName, error.message);

    if (error.response) {
      logger.error(`Questrade API error for ${personName} - Status: ${error.response.status}, Message: ${JSON.stringify(error.response.data)}`);

      if (error.response.status === 400) {
        throw new Error(`Invalid or expired refresh token for ${personName}. Please update the refresh token.`);
      } else if (error.response.status === 401) {
        throw new Error(`Unauthorized access for ${personName}. Token may be invalid.`);
      }
    } else {
      logger.error(`Error refreshing token for ${personName}: ${error.message}`);
    }

    throw error;
  }
}

async setupPersonToken(personName, refreshToken) {
  try {
    // Validate refresh token format
    if (!refreshToken || typeof refreshToken !== 'string' || refreshToken.length < 20) {
      throw new Error('Invalid refresh token format');
    }

    const cleanToken = refreshToken.trim();
    
    logger.info(`Setting up token for ${personName}...`);
    
    // Validate token with Questrade
    const testParams = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: cleanToken
    });

    const testResponse = await axios.post(
      `${this.authUrl}/oauth2/token`,
      testParams.toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000
      }
    );

    const { 
      access_token, 
      refresh_token: newRefreshToken, 
      api_server, 
      expires_in 
    } = testResponse.data;

    if (!access_token || !newRefreshToken) {
      throw new Error('Invalid refresh token - could not obtain new tokens');
    }

    // Format the API server URL properly
    let formattedApiServer = api_server;
    
    // Remove trailing slash if present
    if (formattedApiServer && formattedApiServer.endsWith('/')) {
      formattedApiServer = formattedApiServer.slice(0, -1);
    }
    
    // Add https:// if not present
    if (formattedApiServer && !formattedApiServer.startsWith('http://') && !formattedApiServer.startsWith('https://')) {
      formattedApiServer = `https://${formattedApiServer}`;
    }

    logger.info(`API Server for ${personName}: ${formattedApiServer}`);

    // Delete old tokens for this person
    await Token.deleteMany({ personName });

    // Save new refresh token
    const refreshTokenDoc = Token.createWithToken({
      type: 'refresh',
      personName,
      token: newRefreshToken,
      expiresAt: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)),
      isActive: true
    });
    await refreshTokenDoc.save();

    // Save access token
    const accessTokenDoc = Token.createWithToken({
      type: 'access',
      personName,
      token: access_token,
      apiServer: formattedApiServer,
      expiresAt: new Date(Date.now() + (expires_in * 1000)),
      isActive: true
    });
    await accessTokenDoc.save();

    // Update person record if it exists
    const existingPerson = await Person.findOne({ personName });
    if (existingPerson) {
      await Person.findOneAndUpdate(
        { personName },
        { 
          hasValidToken: true,
          lastTokenRefresh: new Date(),
          lastTokenError: null,
          isActive: true
        }
      );
    }

    logger.info(`Refresh token setup successfully for ${personName}`);
    
    return { 
      success: true, 
      personName,
      apiServer: formattedApiServer
    };
  } catch (error) {
    logger.error(`Error setting up token for ${personName}: ${error.message}`);

    // Log more details about the error
    if (error.response) {
      logger.error(`Questrade OAuth error - Status: ${error.response.status}, Message: ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      logger.error(`No response received from Questrade API`);
    } else {
      logger.error(`Error making request: ${error.message}`);
    }

    throw error;
  }
}

  async getTokenStatus(personName) {
    try {
      const refreshToken = await Token.findOne({
        personName,
        type: 'refresh',
        isActive: true
      }).sort({ createdAt: -1 });

      // Apply 30-second buffer to access token check (consistent with getValidAccessToken)
      const bufferTime = new Date(Date.now() + 30000);
      const accessToken = await Token.findOne({
        personName,
        type: 'access',
        isActive: true,
        expiresAt: { $gt: bufferTime }
      }).sort({ createdAt: -1 });

      return {
        personName,
        refreshToken: {
          exists: !!refreshToken,
          expiresAt: refreshToken?.expiresAt,
          lastUsed: refreshToken?.lastUsed,
          errorCount: refreshToken?.errorCount || 0,
          lastError: refreshToken?.lastError
        },
        accessToken: {
          exists: !!accessToken,
          expiresAt: accessToken?.expiresAt,
          lastUsed: accessToken?.lastUsed,
          apiServer: accessToken?.apiServer
        },
        isHealthy: !!refreshToken && (!!accessToken || !refreshToken.lastError)
      };
    } catch (error) {
      logger.error(`Error getting token status for ${personName}:`, error);
      throw error;
    }
  }

  async recordTokenError(personName, errorMessage) {
    try {
      await Token.findOneAndUpdate(
        { personName, type: 'refresh', isActive: true },
        { 
          $inc: { errorCount: 1 },
          lastError: errorMessage,
          lastUsed: new Date(),
          updatedAt: new Date()
        }
      );

      await Person.findOneAndUpdate(
        { personName },
        { 
          hasValidToken: false,
          lastTokenError: errorMessage
        }
      );
    } catch (error) {
      logger.error(`Error recording token error for ${personName}:`, error);
    }
  }

async testConnection(personName) {
  try {
    const tokenData = await this.getValidAccessToken(personName);

    if (!tokenData.accessToken) {
      throw new Error('Failed to get valid access token');
    }

    // Ensure the API server URL is properly formatted
    let apiServer = tokenData.apiServer;
    
    // Remove trailing slash if present
    if (apiServer.endsWith('/')) {
      apiServer = apiServer.slice(0, -1);
    }
    
    // Add https:// if not present
    if (!apiServer.startsWith('http://') && !apiServer.startsWith('https://')) {
      apiServer = `https://${apiServer}`;
    }

    logger.info(`Testing connection to: ${apiServer}/v1/time`);

    const response = await axios.get(`${apiServer}/v1/time`, {
      headers: {
        'Authorization': `Bearer ${tokenData.accessToken}`
      },
      timeout: 10000
    });

    await Token.findOneAndUpdate(
      { personName, type: 'refresh', isActive: true },
      { 
        lastSuccessfulUse: new Date(),
        errorCount: 0,
        lastError: null
      }
    );

    return {
      success: true,
      serverTime: response.data.time,
      personName,
      apiServer: apiServer
    };
  } catch (error) {
    await this.recordTokenError(personName, error.message);
    
    // Log more details about the error
    if (error.response) {
      logger.error(`Questrade API error for ${personName}:`, {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
        url: error.config?.url
      });
    } else if (error.request) {
      logger.error(`No response from Questrade API for ${personName}:`, {
        url: error.config?.url
      });
    } else {
      logger.error(`Error setting up request for ${personName}:`, error.message);
    }
    
    throw error;
  }
}

  async deletePersonTokens(personName) {
    try {
      await Token.updateMany(
        { personName },
        { isActive: false }
      );

      await Person.findOneAndUpdate(
        { personName },
        {
          hasValidToken: false,
          isActive: false
        }
      );

      // Clear from cache
      this.tokenCache.delete(personName);

      logger.info(`Tokens deleted for ${personName}`);
      return { success: true };
    } catch (error) {
      logger.error(`Error deleting tokens for ${personName}:`, error);
      throw error;
    }
  }
}

module.exports = new TokenManager();