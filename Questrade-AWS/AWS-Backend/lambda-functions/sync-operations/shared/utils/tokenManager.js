/**
 * Token Manager Service (canonical, shared)
 * Handles Questrade OAuth tokens: serialized on-demand refresh with a DynamoDB
 * lock, transient-vs-fatal error classification, and correct (3-day) refresh-token
 * lifetime. See Questrade-AWS/docs/01-phase-1-token-service.md.
 *
 * Questrade facts: access token = 30 min; refresh token = 3 days, SINGLE-USE
 * (rotated on every refresh — the old one is invalidated immediately).
 */

const crypto = require('crypto');
const axios = require('axios');
const logger = require('./logger');
const { getItem, putItem, query, updateItem, deleteItem, conditionalUpdate } = require('./dynamodb');
const { encrypt, decrypt } = require('./crypto');

const TOKENS_TABLE = process.env.TOKENS_TABLE;
const PERSONS_TABLE = process.env.PERSONS_TABLE;
const QUESTRADE_AUTH_URL = process.env.QUESTRADE_AUTH_URL || 'https://login.questrade.com';

// --- Tunables ---
const ACCESS_BUFFER_MS = 60 * 1000;                    // refresh access token when <60s remain
const REFRESH_TOKEN_LIFETIME_MS = 3 * 24 * 60 * 60 * 1000; // Questrade: 3 days
const KEEPALIVE_MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000;  // keepalive rotates if refresh token older than 2 days
const KEEPALIVE_EXPIRING_SOON_MS = 36 * 60 * 60 * 1000; // ...or expiring within 36h
const LOCK_LEASE_MS = 20 * 1000;                        // one OAuth call
const LOCK_POLL_INTERVAL_MS = 500;
const LOCK_POLL_MAX_ATTEMPTS = 24;                      // ~12s waiting for a concurrent refresh
// Refresh cooldown: cap refreshes to ~1 per this window per person. Questrade ROTATES the
// single-use refresh token on every refresh and INVALIDATES the prior access token, so rapid
// 401-driven refreshes from multiple consumers invalidate each other (a storm where no token
// stays valid). The cooldown keeps the latest minted token stable for its lifetime.
const REFRESH_COOLDOWN_MS = 120 * 1000;

/** Transient failure (network / 429 / 5xx) — caller should retry; login NOT disabled. */
class RetryableTokenError extends Error {
  constructor(message) { super(message); this.name = 'RetryableTokenError'; this.retryable = true; }
}
/** Fatal — refresh token is dead (invalid_grant); needs manual re-auth. */
class ReauthRequiredError extends Error {
  constructor(message) { super(message); this.name = 'ReauthRequiredError'; this.needsReauth = true; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function formatApiServer(apiServer) {
  let s = apiServer;
  if (s && s.endsWith('/')) s = s.slice(0, -1);
  if (s && !s.startsWith('http://') && !s.startsWith('https://')) s = `https://${s}`;
  return s;
}

class TokenManager {
  constructor() {
    // Per-instance access-token cache (warm-instance optimization only).
    this.tokenCache = new Map();
    this.RetryableTokenError = RetryableTokenError;
    this.ReauthRequiredError = ReauthRequiredError;
  }

  _accessKey(personName) { return { personName, tokenType: 'access' }; }
  _refreshKey(personName) { return { personName, tokenType: 'refresh' }; }

  /**
   * Get a valid access token (cache -> DB -> serialized refresh).
   */
  async getValidAccessToken(personName) {
    const now = Date.now();

    // Always serve the DB access row (the LATEST minted token). We deliberately do NOT use a
    // per-instance in-memory cache here: with refresh-token rotation, another Lambda instance's
    // refresh invalidates a cached token, so a stale cache would serve a Questrade-dead token.
    const dbAccess = await getItem(TOKENS_TABLE, this._accessKey(personName));
    if (dbAccess && dbAccess.expiresAt > now + ACCESS_BUFFER_MS && dbAccess.encryptedToken) {
      const tokenData = {
        accessToken: decrypt(dbAccess.encryptedToken),
        apiServer: dbAccess.apiServer,
        personName,
        expiresAt: dbAccess.expiresAt
      };
      this.tokenCache.set(personName, tokenData);
      return tokenData;
    }

    // 3) Need a refresh — serialized via DynamoDB lock
    logger.info(`No valid access token for ${personName}; refreshing (locked)`);
    return await this._refreshWithLock(personName);
  }

  /**
   * Public refresh entry point (kept for API compatibility). Always serialized.
   */
  async refreshAccessToken(personName) {
    // Explicit/forced refresh — always perform a real OAuth refresh (skip the double-check).
    return this._refreshWithLock(personName, { force: true });
  }

  /**
   * Serialized refresh: acquire the per-person DynamoDB lock, refresh once, persist
   * the rotated tokens atomically (refresh row first), and release. If another
   * instance holds the lock, wait for it to publish a fresh access token instead of
   * refreshing again (which would invalidate the single-use refresh token).
   */
  async _refreshWithLock(personName, { force = false } = {}) {
    const refreshRow = await getItem(TOKENS_TABLE, this._refreshKey(personName));
    if (!refreshRow || !refreshRow.encryptedToken) {
      await this._markNeedsReauth(personName, 'No refresh token on file');
      throw new ReauthRequiredError(`No refresh token for ${personName}. Please re-authorize.`);
    }

    // Cooldown: if a refresh happened very recently and the current access token is still valid,
    // do NOT rotate again — return the current DB token. This breaks 401-driven refresh storms
    // (each rotation invalidates the prior access token). Applies even to forced refreshes.
    const cdRow = await getItem(TOKENS_TABLE, this._accessKey(personName));
    if (cdRow && cdRow.encryptedToken && cdRow.createdAt &&
        (Date.now() - cdRow.createdAt) < REFRESH_COOLDOWN_MS &&
        cdRow.expiresAt > Date.now() + ACCESS_BUFFER_MS) {
      logger.info(`Refresh suppressed for ${personName} (cooldown: last refresh ${Math.round((Date.now() - cdRow.createdAt) / 1000)}s ago)`);
      return { accessToken: decrypt(cdRow.encryptedToken), apiServer: cdRow.apiServer, personName, expiresAt: cdRow.expiresAt };
    }

    const now = Date.now();
    const owner = `${process.env.AWS_LAMBDA_LOG_STREAM_NAME || 'local'}:${crypto.randomUUID()}`;

    const lock = await conditionalUpdate(
      TOKENS_TABLE,
      this._refreshKey(personName),
      { lockUntil: now + LOCK_LEASE_MS, lockOwner: owner },
      'attribute_not_exists(lockUntil) OR lockUntil < :now',
      { ':now': now }
    );

    if (!lock.success) {
      // Someone else is refreshing — wait for them to publish a fresh access token.
      return await this._waitForFreshToken(personName);
    }

    // We hold the lock.
    try {
      // Double-check (on-demand path only): a refresh may have completed just before
      // we acquired the lock. Skipped when force=true so an explicit refresh always
      // mints a brand-new token (e.g. to recover from a Questrade-invalidated token).
      if (!force) {
        const fresh = await getItem(TOKENS_TABLE, this._accessKey(personName));
        if (fresh && fresh.expiresAt > Date.now() + ACCESS_BUFFER_MS && fresh.encryptedToken) {
          await this._releaseLock(personName);
          const tokenData = { accessToken: decrypt(fresh.encryptedToken), apiServer: fresh.apiServer, personName, expiresAt: fresh.expiresAt };
          this.tokenCache.set(personName, tokenData);
          return tokenData;
        }
      }

      const refreshToken = decrypt(refreshRow.encryptedToken);
      if (!refreshToken || refreshToken.length < 20) {
        await this._releaseLock(personName);
        await this._markNeedsReauth(personName, 'Invalid refresh token format');
        throw new ReauthRequiredError(`Invalid refresh token for ${personName}.`);
      }

      const data = await this._callOAuthRefresh(refreshToken);
      const tokenData = await this._persistRotatedTokens(personName, data);
      return tokenData;
    } catch (error) {
      if (error instanceof ReauthRequiredError || error instanceof RetryableTokenError) throw error;
      // Unexpected error during refresh — release lock, classify, rethrow.
      await this._handleRefreshError(personName, error, refreshRow);
      throw error; // _handleRefreshError rethrows; this is unreachable but explicit
    }
  }

  async _callOAuthRefresh(refreshToken) {
    const params = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken });
    let response;
    try {
      response = await axios.post(`${QUESTRADE_AUTH_URL}/oauth2/token`, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000
      });
    } catch (error) {
      // Re-thrown to caller's catch; classification happens in _handleRefreshError.
      error.__oauthCall = true;
      throw error;
    }
    const { access_token, refresh_token: newRefreshToken, api_server, expires_in } = response.data || {};
    if (!access_token || !newRefreshToken) {
      const e = new Error('Invalid response from Questrade OAuth - missing tokens');
      e.__oauthCall = true;
      throw e;
    }
    return { access_token, newRefreshToken, apiServer: formatApiServer(api_server), expires_in };
  }

  /**
   * Persist rotated tokens. Refresh row FIRST (most critical — single-use), which
   * also releases the lock (lockUntil:0). Then the access row, then the person record.
   */
  async _persistRotatedTokens(personName, { access_token, newRefreshToken, apiServer, expires_in }) {
    const now = Date.now();
    const refreshExpiry = now + REFRESH_TOKEN_LIFETIME_MS;
    const accessExpiry = now + (expires_in * 1000);

    // Refresh row first (and release lock).
    await updateItem(TOKENS_TABLE, this._refreshKey(personName), {
      encryptedToken: encrypt(newRefreshToken),
      expiresAt: refreshExpiry,
      ttl: Math.floor(refreshExpiry / 1000),
      isActive: true,
      createdAt: now,
      updatedAt: now,
      usageCount: 0,
      errorCount: 0,
      lastError: null,
      lockUntil: 0,
      lockOwner: null
    });

    // Access row.
    await updateItem(TOKENS_TABLE, this._accessKey(personName), {
      encryptedToken: encrypt(access_token),
      apiServer,
      expiresAt: accessExpiry,
      ttl: Math.floor(accessExpiry / 1000) + (24 * 60 * 60),
      isActive: true,
      createdAt: now,
      updatedAt: now,
      lastUsed: now,
      usageCount: 0
    });

    // Person record — clear any reauth/error flags.
    await updateItem(PERSONS_TABLE, { personName }, {
      hasValidToken: true,
      needsReauth: false,
      lastTokenRefresh: now,
      lastTokenError: null
    });

    const tokenData = { accessToken: access_token, apiServer, personName, expiresAt: accessExpiry };
    this.tokenCache.set(personName, tokenData);
    logger.info(`Token refreshed for ${personName} (access expires in ${Math.round(expires_in)}s)`);
    return tokenData;
  }

  /**
   * Classify a refresh failure and release the lock. Fatal (invalid_grant) -> needsReauth.
   * Transient (network/429/5xx/other) -> keep the existing refresh token, do NOT disable login.
   */
  async _handleRefreshError(personName, error, refreshRow) {
    const status = error.response?.status;
    const body = error.response?.data || {};
    const isInvalidGrant = status === 400 && (body.error === 'invalid_grant' ||
      (typeof body === 'string' && body.includes('invalid_grant')));

    // Release the lock without touching the (still-valid) refresh token on transient errors.
    const errCount = (refreshRow?.errorCount || 0) + 1;

    if (isInvalidGrant) {
      logger.error(`Fatal token error for ${personName}: invalid_grant (refresh token dead)`);
      await updateItem(TOKENS_TABLE, this._refreshKey(personName), {
        lockUntil: 0, lockOwner: null, errorCount: errCount, lastError: 'invalid_grant'
      }).catch(() => {});
      await this._markNeedsReauth(personName, 'invalid_grant: refresh token expired/used. Re-authorize required.');
      throw new ReauthRequiredError(`Refresh token for ${personName} is invalid. Please re-authorize.`);
    }

    const msg = error.response
      ? `Questrade OAuth ${status}: ${JSON.stringify(body)}`
      : (error.message || 'network error');
    logger.warn(`Transient token error for ${personName}: ${msg} (will retry; login NOT disabled)`);
    await updateItem(TOKENS_TABLE, this._refreshKey(personName), {
      lockUntil: 0, lockOwner: null, errorCount: errCount, lastError: msg
    }).catch(() => {});
    // Note: do NOT touch persons.needsReauth / hasValidToken here.
    throw new RetryableTokenError(`Transient token refresh failure for ${personName}: ${msg}`);
  }

  async _waitForFreshToken(personName) {
    for (let i = 0; i < LOCK_POLL_MAX_ATTEMPTS; i++) {
      await sleep(LOCK_POLL_INTERVAL_MS);
      const row = await getItem(TOKENS_TABLE, this._accessKey(personName));
      if (row && row.expiresAt > Date.now() + ACCESS_BUFFER_MS && row.encryptedToken) {
        const tokenData = { accessToken: decrypt(row.encryptedToken), apiServer: row.apiServer, personName, expiresAt: row.expiresAt };
        this.tokenCache.set(personName, tokenData);
        return tokenData;
      }
    }
    throw new RetryableTokenError(`Timed out waiting for concurrent token refresh for ${personName}`);
  }

  async _releaseLock(personName) {
    await updateItem(TOKENS_TABLE, this._refreshKey(personName), { lockUntil: 0, lockOwner: null }).catch(() => {});
  }

  async _markNeedsReauth(personName, message) {
    await updateItem(PERSONS_TABLE, { personName }, {
      needsReauth: true,
      hasValidToken: false,
      lastTokenError: message
    }).catch((e) => logger.error(`Failed to mark needsReauth for ${personName}: ${e.message}`));
  }

  /**
   * Keepalive: rotate the refresh token only if it's getting old, so the 3-day
   * window never lapses during idle periods. Uses the same locked refresh path.
   */
  async keepAliveIfStale(personName, maxAgeMs = KEEPALIVE_MAX_AGE_MS) {
    const refreshRow = await getItem(TOKENS_TABLE, this._refreshKey(personName));
    if (!refreshRow || !refreshRow.encryptedToken) {
      return { personName, skipped: true, reason: 'no refresh token' };
    }
    const now = Date.now();
    const age = now - (refreshRow.createdAt || refreshRow.updatedAt || 0);
    const expiringSoon = refreshRow.expiresAt && (refreshRow.expiresAt - now) < KEEPALIVE_EXPIRING_SOON_MS;
    if (age <= maxAgeMs && !expiringSoon) {
      return { personName, skipped: true, ageHours: Math.round(age / 3600000) };
    }
    await this._refreshWithLock(personName);
    return { personName, refreshed: true, ageHours: Math.round(age / 3600000), expiringSoon };
  }

  /**
   * Setup a person's initial refresh token (from the Questrade app hub).
   */
  async setupPersonToken(personName, refreshToken) {
    if (!refreshToken || typeof refreshToken !== 'string' || refreshToken.trim().length < 20) {
      throw new Error('Invalid refresh token format');
    }
    const data = await this._callOAuthRefresh(refreshToken.trim());
    await this._persistRotatedTokens(personName, data);
    // Ensure person is active.
    await updateItem(PERSONS_TABLE, { personName }, { isActive: true });
    logger.info(`Refresh token set up for ${personName}`);
    return { success: true, personName, apiServer: data.apiServer };
  }

  async getTokenStatus(personName) {
    const now = Date.now();
    const refreshRow = await getItem(TOKENS_TABLE, this._refreshKey(personName));
    const accessRow = await getItem(TOKENS_TABLE, this._accessKey(personName));
    const person = await getItem(PERSONS_TABLE, { personName });
    return {
      personName,
      needsReauth: person?.needsReauth === true,
      refreshToken: {
        exists: !!refreshRow,
        expiresAt: refreshRow?.expiresAt,
        ageHours: refreshRow ? Math.round((now - (refreshRow.createdAt || 0)) / 3600000) : null,
        errorCount: refreshRow?.errorCount || 0,
        lastError: refreshRow?.lastError
      },
      accessToken: {
        exists: !!accessRow,
        valid: !!accessRow && accessRow.expiresAt > now + ACCESS_BUFFER_MS,
        expiresAt: accessRow?.expiresAt,
        apiServer: accessRow?.apiServer
      },
      isHealthy: !!refreshRow && person?.needsReauth !== true
    };
  }

  /**
   * Test connectivity. Surfaces token errors via getValidAccessToken's classification
   * (does not blanket-disable the login on transient failures).
   */
  async testConnection(personName) {
    const tokenData = await this.getValidAccessToken(personName);
    const apiServer = formatApiServer(tokenData.apiServer);
    const response = await axios.get(`${apiServer}/v1/time`, {
      headers: { Authorization: `Bearer ${tokenData.accessToken}` },
      timeout: 10000
    });
    return { success: true, serverTime: response.data.time, personName, apiServer };
  }

  async deletePersonTokens(personName) {
    const tokens = await query(TOKENS_TABLE, 'personName = :personName', { ':personName': personName });
    for (const token of tokens.items) {
      await deleteItem(TOKENS_TABLE, { personName: token.personName, tokenType: token.tokenType });
    }
    await updateItem(PERSONS_TABLE, { personName }, { hasValidToken: false, isActive: false });
    this.tokenCache.delete(personName);
    return { success: true };
  }
}

const instance = new TokenManager();
instance.RetryableTokenError = RetryableTokenError;
instance.ReauthRequiredError = ReauthRequiredError;
module.exports = instance;
