/**
 * Questrade API Service
 * Handles API calls to Questrade with automatic token refresh
 */

const axios = require('axios');
const logger = require('../../shared/utils/logger');
const tokenManager = require('./tokenManager');

class QuestradeApiService {
  constructor() {
    this.requestsThisSecond = 0;
    this.lastResetTime = Date.now();
    this.maxRequestsPerSecond = 10; // Questrade: 30/sec for account calls, using 10 to be safe
  }

  async waitForRateLimit() {
    const now = Date.now();
    if (now - this.lastResetTime >= 1000) {
      this.requestsThisSecond = 0;
      this.lastResetTime = now;
    }
    if (this.requestsThisSecond >= this.maxRequestsPerSecond) {
      const waitTime = 1000 - (now - this.lastResetTime);
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
        this.requestsThisSecond = 0;
        this.lastResetTime = Date.now();
      }
    }
    this.requestsThisSecond++;
  }

  /**
   * Get server time from Questrade API
   */
  async getServerTime(personName) {
    try {
      const data = await this.makeRequest(personName, '/v1/time');
      return new Date(data.time);
    } catch (error) {
      logger.error('Failed to get Questrade server time', { error: error.message });
      return new Date();
    }
  }

  /**
   * Make authenticated request to Questrade API
   * Automatically refreshes token if expired (proactive)
   * Retries once on 401 Unauthorized (reactive)
   */
  async makeRequest(personName, endpoint, retryCount = 0) {
    await this.waitForRateLimit();
    try {
      // Use TokenManager's getValidAccessToken - automatically refreshes if expired
      const tokenData = await tokenManager.getValidAccessToken(personName);
      const { apiServer, accessToken } = tokenData;

      logger.debug(`Questrade API request: ${endpoint}`, {
        personName,
        tokenExpiresAt: new Date(tokenData.expiresAt).toISOString()
      });

      const response = await axios.get(`${apiServer}${endpoint}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        timeout: 30000
      });

      return response.data;

    } catch (error) {
      // Handle 401 Unauthorized - token might have expired during request
      if (error.response?.status === 401 && retryCount === 0) {
        logger.info(`Received 401 for ${personName}, refreshing token and retrying...`);

        try {
          // Force refresh the token
          await tokenManager.refreshAccessToken(personName);

          // Retry the request once with new token
          return await this.makeRequest(personName, endpoint, retryCount + 1);

        } catch (refreshError) {
          logger.error(`Token refresh failed for ${personName}`, {
            error: refreshError.message
          });
          throw new Error(`Failed to refresh token: ${refreshError.message}`);
        }
      }

      // Log and re-throw other errors
      logger.error(`Questrade API request failed for ${personName}`, {
        endpoint,
        status: error.response?.status,
        error: error.message
      });
      // Create a safe error object without circular references
      const safeError = new Error(error.message || "Questrade API request failed");
      safeError.status = error.response?.status;
      safeError.statusText = error.response?.statusText;
      safeError.data = error.response?.data;
      throw safeError;
    }
  }

  /**
   * Get accounts for person
   */
  async getAccounts(personName) {
    try {
      const data = await this.makeRequest(personName, '/v1/accounts');
      return data.accounts || [];
    } catch (error) {
      logger.error(`Failed to get accounts for ${personName}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Get positions for account
   */
  async getPositions(personName, accountNumber) {
    try {
      const data = await this.makeRequest(personName, `/v1/accounts/${accountNumber}/positions`);
      return data.positions || [];
    } catch (error) {
      logger.error(`Failed to get positions for ${personName}/${accountNumber}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Get activities for account
   */
  async getActivities(personName, accountNumber, startDate = null, endDate = null) {
    try {
      let endpoint = `/v1/accounts/${accountNumber}/activities`;

      const params = new URLSearchParams();
      if (startDate) params.append('startTime', startDate);
      if (endDate) params.append('endTime', endDate);

      if (params.toString()) {
        endpoint += `?${params.toString()}`;
      }

      const data = await this.makeRequest(personName, endpoint);
      return data.activities || [];
    } catch (error) {
      logger.error(`Failed to get activities for ${personName}/${accountNumber}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Get balances for account
   */
  async getBalances(personName, accountNumber) {
    try {
      const data = await this.makeRequest(personName, `/v1/accounts/${accountNumber}/balances`);
      return data.perCurrencyBalances || [];
    } catch (error) {
      logger.error(`Failed to get balances for ${personName}/${accountNumber}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Get executions for account
   */
  async getExecutions(personName, accountNumber, startDate = null, endDate = null) {
    try {
      let endpoint = `/v1/accounts/${accountNumber}/executions`;

      const params = new URLSearchParams();
      if (startDate) params.append('startTime', startDate);
      if (endDate) params.append('endTime', endDate);

      if (params.toString()) {
        endpoint += `?${params.toString()}`;
      }

      const data = await this.makeRequest(personName, endpoint);
      return data.executions || [];
    } catch (error) {
      logger.error(`Failed to get executions for ${personName}/${accountNumber}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Get symbol information by symbolId
   * Returns symbol details including description (company name)
   */
  async getSymbolInfo(personName, symbolId) {
    try {
      const data = await this.makeRequest(personName, `/v1/symbols/${symbolId}`);
      return data.symbols && data.symbols.length > 0 ? data.symbols[0] : null;
    } catch (error) {
      logger.error(`Failed to get symbol info for ${symbolId}`, { error: error.message });
      return null;
    }
  }

  /**
   * Get symbol information by symbol name
   * Returns symbol details including description (company name)
   */
  async getSymbolByName(personName, symbolName) {
    try {
      const data = await this.makeRequest(personName, `/v1/symbols/search?prefix=${symbolName}`);
      return data.symbols && data.symbols.length > 0 ? data.symbols[0] : null;
    } catch (error) {
      logger.error(`Failed to get symbol by name ${symbolName}`, { error: error.message });
      return null;
    }
  }
}

module.exports = new QuestradeApiService();
