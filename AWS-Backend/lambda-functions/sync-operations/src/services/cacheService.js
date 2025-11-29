/**
 * Cache Service
 * Handles caching logic for sync operations
 * PHASE 1.1: Account list caching (7 days)
 */

const logger = require('../../shared/utils/logger');
const { putItem, getItem } = require('../../shared/utils/dynamodb');

const CACHE_TABLE = process.env.CACHE_TABLE;

class CacheService {
  /**
   * Get cached data by key
   */
  async getCache(cacheKey) {
    try {
      const cached = await getItem(CACHE_TABLE, { cacheKey });

      if (cached && cached.expiresAt > Date.now()) {
        const minutesRemaining = Math.round((cached.expiresAt - Date.now()) / 1000 / 60);
        logger.info(`[CACHE] Hit for ${cacheKey} (expires in ${minutesRemaining} min)`);
        return cached.data;
      }

      logger.info(`[CACHE] Miss or expired for ${cacheKey}`);
      return null;
    } catch (error) {
      logger.warn(`[CACHE] Error checking cache for ${cacheKey}:`, error.message);
      return null;
    }
  }

  /**
   * Set cached data with TTL
   */
  async setCache(cacheKey, data, ttlDays = 7) {
    try {
      const expiresAt = Date.now() + (ttlDays * 24 * 60 * 60 * 1000);

      await putItem(CACHE_TABLE, {
        cacheKey,
        data,
        expiresAt,
        ttl: Math.floor(expiresAt / 1000),
        cachedAt: Date.now(),
        updatedAt: Date.now()
      });

      logger.info(`[CACHE] Stored ${cacheKey} (${ttlDays} days TTL)`);
      return true;
    } catch (error) {
      logger.warn(`[CACHE] Failed to cache ${cacheKey}:`, error.message);
      return false;
    }
  }

  /**
   * Get accounts with 7-day cache
   */
  async getCachedAccounts(personName) {
    const cacheKey = `accounts-${personName}`;
    return await this.getCache(cacheKey);
  }

  /**
   * Cache accounts for 7 days
   */
  async cacheAccounts(personName, accounts) {
    const cacheKey = `accounts-${personName}`;
    return await this.setCache(cacheKey, accounts, 7);
  }

  /**
   * Clear cache for a person (used when account list changes)
   */
  async clearAccountsCache(personName) {
    const cacheKey = `accounts-${personName}`;
    try {
      // Set expiry to past to invalidate
      await putItem(CACHE_TABLE, {
        cacheKey,
        data: null,
        expiresAt: 0,
        ttl: 0,
        updatedAt: Date.now()
      });
      logger.info(`[CACHE] Cleared cache for ${cacheKey}`);
      return true;
    } catch (error) {
      logger.warn(`[CACHE] Failed to clear cache for ${cacheKey}:`, error.message);
      return false;
    }
  }
}

module.exports = new CacheService();
