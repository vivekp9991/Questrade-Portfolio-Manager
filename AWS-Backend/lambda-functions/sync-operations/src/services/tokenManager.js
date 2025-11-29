/**
 * Token Manager Service
 * Handles Questrade OAuth token operations (refresh, access, validation)
 * Adapted from Backend/questrade-auth-api/src/services/tokenManager.js
 */

const axios = require('axios');
const logger = require('../../shared/utils/logger');
const { query, putItem, deleteItem, updateItem } = require('../../shared/utils/dynamodb');
const { encrypt, decrypt } = require('../../shared/utils/crypto');

const TOKENS_TABLE = process.env.TOKENS_TABLE;
const PERSONS_TABLE = process.env.PERSONS_TABLE;
const QUESTRADE_AUTH_URL = process.env.QUESTRADE_AUTH_URL || 'https://login.questrade.com';

class TokenManager {
  constructor() {
    // In-memory cache for access tokens (30-min TTL)
    this.tokenCache = new Map();
  }

  /**
   * Get a valid access token (from cache, DB, or refresh)
   */
  async getValidAccessToken(personName) {
    try {
      // Check in-memory cache first (with 30-second buffer before actual expiry)
      const cached = this.tokenCache.get(personName);
      if (cached) {
        const now = Date.now();
        const expiryTime = new Date(cached.expiresAt).getTime();
        const bufferTime = now + 30000; // 30-second buffer
        const timeUntilExpiry = Math.round((expiryTime - now) / 1000);

        logger.debug(`Cache check for ${personName}`, {
          now: new Date(now).toISOString(),
          expires: cached.expiresAt,
          timeUntilExpiry
        });

        if (expiryTime > bufferTime) {
          logger.debug(`Using cached access token for ${personName} (expires in ${timeUntilExpiry}s)`);
          return {
            accessToken: cached.accessToken,
            apiServer: cached.apiServer,
            personName,
            expiresAt: cached.expiresAt
          };
        } else {
          logger.info(`Cached token for ${personName} expired or expiring soon (${timeUntilExpiry}s left), clearing cache`);
          this.tokenCache.delete(personName);
        }
      }

      // Cache miss or expired - check database
      const bufferTime = Date.now() + 30000;
      logger.debug(`Database query for ${personName}: looking for tokens expiring after ${new Date(bufferTime).toISOString()}`);

      const result = await query(
        TOKENS_TABLE,
        'personName = :personName AND tokenType = :tokenType',
        {
          ':personName': personName,
          ':tokenType': 'access',
          ':isActive': true,
          ':bufferTime': bufferTime
        },
        {
          FilterExpression: 'isActive = :isActive AND expiresAt > :bufferTime',
          ScanIndexForward: false,
          Limit: 1
        }
      );

      if (result.items.length > 0) {
        const accessToken = result.items[0];
        const timeUntilExpiry = Math.round((accessToken.expiresAt - Date.now()) / 1000);
        logger.info(`Found valid DB token for ${personName}, expires in ${timeUntilExpiry}s`);

        // Mark as used
        await updateItem(TOKENS_TABLE,
          { personName, tokenType: 'access' },
          { lastUsed: Date.now(), usageCount: (accessToken.usageCount || 0) + 1 }
        );

        const decryptedToken = decrypt(accessToken.encryptedToken);
        const tokenData = {
          accessToken: decryptedToken,
          apiServer: accessToken.apiServer,
          personName,
          expiresAt: accessToken.expiresAt
        };

        // Cache the token for future requests
        this.tokenCache.set(personName, tokenData);
        logger.info(`Cached access token for ${personName} (valid until ${new Date(accessToken.expiresAt).toISOString()})`);

        return tokenData;
      }

      // Need to refresh token - no valid token found in database
      logger.info(`No valid access token in DB for ${personName} (none found or all expire within 30s)`);
      logger.info(`Triggering OAuth refresh for ${personName}...`);
      return await this.refreshAccessToken(personName);
    } catch (error) {
      logger.error(`Error getting valid access token for ${personName}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(personName) {
    try {
      // Get refresh token from database
      const result = await query(
        TOKENS_TABLE,
        'personName = :personName AND tokenType = :tokenType',
        {
          ':personName': personName,
          ':tokenType': 'refresh',
          ':isActive': true
        },
        {
          FilterExpression: 'isActive = :isActive',
          ScanIndexForward: false,
          Limit: 1
        }
      );

      if (result.items.length === 0) {
        throw new Error(`No active refresh token found for ${personName}`);
      }

      const refreshTokenDoc = result.items[0];
      const refreshToken = decrypt(refreshTokenDoc.encryptedToken);

      if (!refreshToken || refreshToken.length < 20) {
        throw new Error(`Invalid refresh token format for ${personName}`);
      }

      logger.info(`Attempting to refresh access token for ${personName} via Questrade OAuth...`);
      logger.debug(`Using refresh token from DB (created: ${new Date(refreshTokenDoc.createdAt).toISOString()})`);

      // Call Questrade OAuth endpoint
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      });

      const response = await axios.post(
        `${QUESTRADE_AUTH_URL}/oauth2/token`,
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
      if (formattedApiServer && formattedApiServer.endsWith('/')) {
        formattedApiServer = formattedApiServer.slice(0, -1);
      }
      if (formattedApiServer && !formattedApiServer.startsWith('http://') && !formattedApiServer.startsWith('https://')) {
        formattedApiServer = `https://${formattedApiServer}`;
      }

      logger.info(`API Server for ${personName}: ${formattedApiServer}`);

      // Delete old tokens for this person
      const oldTokens = await query(
        TOKENS_TABLE,
        'personName = :personName',
        { ':personName': personName }
      );

      for (const token of oldTokens.items) {
        await updateItem(TOKENS_TABLE,
          { personName: token.personName, tokenType: token.tokenType },
          { isActive: false }
        );
      }

      logger.debug(`Deactivated ${oldTokens.items.length} old tokens for ${personName}`);

      // Save new access token
      const accessTokenExpiry = Date.now() + (expires_in * 1000);
      await putItem(TOKENS_TABLE, {
        personName,
        tokenType: 'access',
        encryptedToken: encrypt(access_token),
        apiServer: formattedApiServer,
        expiresAt: accessTokenExpiry,
        isActive: true,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        usageCount: 0,
        ttl: Math.floor(accessTokenExpiry / 1000) + (24 * 60 * 60) // TTL 24h after expiry
      });

      // Save new refresh token
      const refreshTokenExpiry = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days
      await putItem(TOKENS_TABLE, {
        personName,
        tokenType: 'refresh',
        encryptedToken: encrypt(newRefreshToken),
        expiresAt: refreshTokenExpiry,
        isActive: true,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        usageCount: 0,
        errorCount: 0,
        ttl: Math.floor(refreshTokenExpiry / 1000)
      });

      // Update person record
      await updateItem(PERSONS_TABLE, { personName }, {
        hasValidToken: true,
        lastTokenRefresh: Date.now(),
        lastTokenError: null
      });

      const expiresInSeconds = Math.round((accessTokenExpiry - Date.now()) / 1000);
      logger.info(`Token refreshed successfully for ${personName} (expires in ${expiresInSeconds}s)`);

      const tokenData = {
        accessToken: access_token,
        apiServer: formattedApiServer,
        personName,
        expiresAt: accessTokenExpiry
      };

      // Cache the new token
      this.tokenCache.set(personName, tokenData);
      logger.info(`Cached refreshed access token for ${personName} (valid until ${new Date(accessTokenExpiry).toISOString()})`);

      return tokenData;
    } catch (error) {
      await this.recordTokenError(personName, error.message);

      if (error.response) {
        logger.error(`Questrade API error for ${personName}`, {
          status: error.response.status,
          message: JSON.stringify(error.response.data)
        });

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

  /**
   * Setup initial person token
   */
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
        `${QUESTRADE_AUTH_URL}/oauth2/token`,
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
      if (formattedApiServer && formattedApiServer.endsWith('/')) {
        formattedApiServer = formattedApiServer.slice(0, -1);
      }
      if (formattedApiServer && !formattedApiServer.startsWith('http://') && !formattedApiServer.startsWith('https://')) {
        formattedApiServer = `https://${formattedApiServer}`;
      }

      logger.info(`API Server for ${personName}: ${formattedApiServer}`);

      // Delete old tokens for this person
      const oldTokens = await query(
        TOKENS_TABLE,
        'personName = :personName',
        { ':personName': personName }
      );

      for (const token of oldTokens.items) {
        await deleteItem(TOKENS_TABLE, {
          personName: token.personName,
          tokenType: token.tokenType
        });
      }

      // Save new refresh token
      const refreshTokenExpiry = Date.now() + (7 * 24 * 60 * 60 * 1000);
      await putItem(TOKENS_TABLE, {
        personName,
        tokenType: 'refresh',
        encryptedToken: encrypt(newRefreshToken),
        expiresAt: refreshTokenExpiry,
        isActive: true,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        usageCount: 0,
        errorCount: 0,
        ttl: Math.floor(refreshTokenExpiry / 1000)
      });

      // Save access token
      const accessTokenExpiry = Date.now() + (expires_in * 1000);
      await putItem(TOKENS_TABLE, {
        personName,
        tokenType: 'access',
        encryptedToken: encrypt(access_token),
        apiServer: formattedApiServer,
        expiresAt: accessTokenExpiry,
        isActive: true,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        usageCount: 0,
        ttl: Math.floor(accessTokenExpiry / 1000) + (24 * 60 * 60)
      });

      // Update person record if it exists
      await updateItem(PERSONS_TABLE, { personName }, {
        hasValidToken: true,
        lastTokenRefresh: Date.now(),
        lastTokenError: null,
        isActive: true
      });

      logger.info(`Refresh token setup successfully for ${personName}`);

      return {
        success: true,
        personName,
        apiServer: formattedApiServer
      };
    } catch (error) {
      logger.error(`Error setting up token for ${personName}`, { error: error.message });

      if (error.response) {
        logger.error(`Questrade OAuth error`, {
          status: error.response.status,
          message: JSON.stringify(error.response.data)
        });
      } else if (error.request) {
        logger.error('No response received from Questrade API');
      } else {
        logger.error(`Error making request: ${error.message}`);
      }

      throw error;
    }
  }

  /**
   * Get token status for a person
   */
  async getTokenStatus(personName) {
    try {
      const bufferTime = Date.now() + 30000;

      // Get refresh token
      const refreshResult = await query(
        TOKENS_TABLE,
        'personName = :personName AND tokenType = :tokenType',
        {
          ':personName': personName,
          ':tokenType': 'refresh'
        },
        {
          FilterExpression: 'isActive = :isActive',
          ExpressionAttributeValues: { ':isActive': true },
          ScanIndexForward: false,
          Limit: 1
        }
      );

      // Get access token
      const accessResult = await query(
        TOKENS_TABLE,
        'personName = :personName AND tokenType = :tokenType',
        {
          ':personName': personName,
          ':tokenType': 'access'
        },
        {
          FilterExpression: 'isActive = :isActive AND expiresAt > :bufferTime',
          ExpressionAttributeValues: {
            ':isActive': true,
            ':bufferTime': bufferTime
          },
          ScanIndexForward: false,
          Limit: 1
        }
      );

      const refreshToken = refreshResult.items[0];
      const accessToken = accessResult.items[0];

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
      logger.error(`Error getting token status for ${personName}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Record token error
   */
  async recordTokenError(personName, errorMessage) {
    try {
      // Update refresh token with error
      const result = await query(
        TOKENS_TABLE,
        'personName = :personName AND tokenType = :tokenType',
        {
          ':personName': personName,
          ':tokenType': 'refresh'
        },
        {
          FilterExpression: 'isActive = :isActive',
          ExpressionAttributeValues: { ':isActive': true },
          Limit: 1
        }
      );

      if (result.items.length > 0) {
        const token = result.items[0];
        await updateItem(TOKENS_TABLE,
          { personName, tokenType: 'refresh' },
          {
            errorCount: (token.errorCount || 0) + 1,
            lastError: errorMessage,
            lastUsed: Date.now()
          }
        );
      }

      // Update person record
      await updateItem(PERSONS_TABLE, { personName }, {
        hasValidToken: false,
        lastTokenError: errorMessage
      });
    } catch (error) {
      logger.error(`Error recording token error for ${personName}`, { error: error.message });
    }
  }

  /**
   * Test connection to Questrade API
   */
  async testConnection(personName) {
    try {
      const tokenData = await this.getValidAccessToken(personName);

      if (!tokenData.accessToken) {
        throw new Error('Failed to get valid access token');
      }

      // Ensure the API server URL is properly formatted
      let apiServer = tokenData.apiServer;
      if (apiServer.endsWith('/')) {
        apiServer = apiServer.slice(0, -1);
      }
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

      // Update token with successful use
      await updateItem(TOKENS_TABLE,
        { personName, tokenType: 'refresh' },
        {
          lastSuccessfulUse: Date.now(),
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

      if (error.response) {
        logger.error(`Questrade API error for ${personName}`, {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
          url: error.config?.url
        });
      } else if (error.request) {
        logger.error(`No response from Questrade API for ${personName}`, {
          url: error.config?.url
        });
      } else {
        logger.error(`Error setting up request for ${personName}`, { error: error.message });
      }

      throw error;
    }
  }

  /**
   * Delete person tokens
   */
  async deletePersonTokens(personName) {
    try {
      const tokens = await query(
        TOKENS_TABLE,
        'personName = :personName',
        { ':personName': personName }
      );

      for (const token of tokens.items) {
        await updateItem(TOKENS_TABLE,
          { personName: token.personName, tokenType: token.tokenType },
          { isActive: false }
        );
      }

      await updateItem(PERSONS_TABLE, { personName }, {
        hasValidToken: false,
        isActive: false
      });

      // Clear from cache
      this.tokenCache.delete(personName);

      logger.info(`Tokens deleted for ${personName}`);
      return { success: true };
    } catch (error) {
      logger.error(`Error deleting tokens for ${personName}`, { error: error.message });
      throw error;
    }
  }
}

module.exports = new TokenManager();
