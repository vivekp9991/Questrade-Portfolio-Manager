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

  _sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  /**
   * Backoff for transient failures. Honors 429 X-RateLimit-Reset / Retry-After
   * when present; otherwise exponential backoff with jitter (cap 8s).
   */
  _backoffMs(error, attempt) {
    const headers = error.response?.headers || {};
    if (error.response?.status === 429 && headers['x-ratelimit-reset']) {
      const resetMs = (Number(headers['x-ratelimit-reset']) * 1000) - Date.now();
      if (resetMs > 0 && resetMs < 60000) return resetMs + 250;
    }
    if (headers['retry-after'] && !isNaN(Number(headers['retry-after']))) {
      return Math.min(Number(headers['retry-after']) * 1000, 30000);
    }
    return Math.min(500 * Math.pow(2, attempt - 1), 8000) + Math.floor(Math.random() * 250);
  }

  /**
   * Make authenticated request to Questrade API.
   * - Refreshes token proactively (via getValidAccessToken) and once reactively on 401.
   * - Retries 429 / 5xx / network errors with exponential backoff (honoring rate-limit headers).
   */
  async makeRequest(personName, endpoint) {
    const maxTransientRetries = 4;
    let transientAttempt = 0;
    let did401Refresh = false;

    while (true) {
      await this.waitForRateLimit();
      try {
        const tokenData = await tokenManager.getValidAccessToken(personName);
        const { apiServer, accessToken } = tokenData;

        const response = await axios.get(`${apiServer}${endpoint}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
          timeout: 30000
        });

        return response.data;
      } catch (error) {
        const status = error.response?.status;

        // 401 → force a single token refresh and retry immediately.
        if (status === 401 && !did401Refresh) {
          did401Refresh = true;
          logger.info(`401 for ${personName} on ${endpoint}; forcing token refresh and retrying`);
          try {
            await tokenManager.refreshAccessToken(personName);
          } catch (refreshError) {
            const se = new Error(`Failed to refresh token: ${refreshError.message}`);
            se.status = 401;
            throw se;
          }
          continue;
        }

        // 429 / 5xx / network → exponential backoff retry.
        const isTransient = status === 429 || (status >= 500 && status < 600) || !error.response;
        if (isTransient && transientAttempt < maxTransientRetries) {
          transientAttempt++;
          const waitMs = this._backoffMs(error, transientAttempt);
          logger.warn(`Transient Questrade error (${status || error.code || 'network'}) for ${personName} on ${endpoint}; retry ${transientAttempt}/${maxTransientRetries} in ${waitMs}ms`);
          await this._sleep(waitMs);
          continue;
        }

        logger.error(`Questrade API request failed for ${personName}`, { endpoint, status, error: error.message });
        const safeError = new Error(error.message || 'Questrade API request failed');
        safeError.status = status;
        safeError.statusText = error.response?.statusText;
        safeError.data = error.response?.data;
        safeError.retryable = isTransient;
        throw safeError;
      }
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
