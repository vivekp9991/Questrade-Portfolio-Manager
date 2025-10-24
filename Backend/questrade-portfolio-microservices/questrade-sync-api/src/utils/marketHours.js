const axios = require('axios');
const logger = require('./logger');

class MarketHoursService {
  constructor() {
    this.cachedTime = null;
    this.lastTimeFetch = null;
    this.timeCacheTimeout = 60 * 60 * 1000; // 1 hour cache for time
    this.questradeClient = null; // Will be injected
    this.personName = null; // Will be injected
  }

  /**
   * Set Questrade client for fetching server time
   */
  setQuestradeClient(client, personName) {
    this.questradeClient = client;
    this.personName = personName;
  }

  /**
   * Get current Eastern Time from Questrade server (primary) or WorldTimeAPI (fallback)
   * Uses online time to avoid system timezone issues
   */
  async getCurrentEasternTime() {
    try {
      // Check cache first
      if (this.cachedTime && this.lastTimeFetch &&
          (Date.now() - this.lastTimeFetch < this.timeCacheTimeout)) {
        const offset = Date.now() - this.lastTimeFetch;
        return new Date(this.cachedTime.getTime() + offset);
      }

      // Try Questrade server time first (most reliable for trading)
      if (this.questradeClient && this.personName) {
        try {
          const timeResponse = await this.questradeClient.getServerTime(this.personName);
          if (timeResponse && timeResponse.time) {
            const etTime = new Date(timeResponse.time);
            this.cachedTime = etTime;
            this.lastTimeFetch = Date.now();
            logger.info(`[MARKET] Fetched Eastern Time from Questrade: ${etTime.toISOString()}`);
            return etTime;
          }
        } catch (questradeError) {
          logger.warn('[MARKET] Failed to fetch time from Questrade, falling back to WorldTimeAPI:', questradeError.message);
        }
      }

      // Fallback to WorldTimeAPI
      const response = await axios.get('http://worldtimeapi.org/api/timezone/America/New_York', {
        timeout: 5000
      });

      if (response.data && response.data.datetime) {
        const etTime = new Date(response.data.datetime);
        this.cachedTime = etTime;
        this.lastTimeFetch = Date.now();
        logger.info(`[MARKET] Fetched Eastern Time from WorldTimeAPI: ${etTime.toISOString()}`);
        return etTime;
      }

      throw new Error('Invalid response from time API');
    } catch (error) {
      logger.error('[MARKET] Failed to fetch Eastern Time:', error.message);
      // Fallback to system time (with warning)
      logger.warn('[MARKET] Using system time as fallback (may be incorrect timezone)');
      return new Date();
    }
  }

  /**
   * Check if current time is a weekend
   */
  async isWeekend() {
    const now = await this.getCurrentEasternTime();
    const day = now.getDay();
    return day === 0 || day === 6; // Sunday = 0, Saturday = 6
  }

  /**
   * Check if market is currently open
   * TSX/NYSE hours: 9:30 AM - 4:00 PM ET on weekdays
   */
  async isMarketOpen() {
    const now = await this.getCurrentEasternTime();
    const day = now.getDay();

    // Weekend - market closed
    if (day === 0 || day === 6) {
      return false;
    }

    const hour = now.getHours();
    const minute = now.getMinutes();
    const timeInMinutes = hour * 60 + minute;

    // Market hours: 9:30 AM (570 min) to 4:00 PM (960 min)
    const marketOpen = 9 * 60 + 30; // 9:30 AM
    const marketClose = 16 * 60; // 4:00 PM

    return timeInMinutes >= marketOpen && timeInMinutes < marketClose;
  }

  /**
   * Get recommended sync interval based on market status
   */
  async getRecommendedSyncInterval() {
    const isWeekend = await this.isWeekend();
    const isOpen = await this.isMarketOpen();

    if (isWeekend) {
      return {
        type: 'weekend',
        interval: null, // Use cron schedule
        description: 'Weekend schedule: 9 AM and 9 PM ET'
      };
    } else if (isOpen) {
      return {
        type: 'market-hours',
        interval: 15, // Every 15 minutes during market hours
        description: 'Market hours: Every 15 minutes'
      };
    } else {
      return {
        type: 'after-hours',
        interval: 60, // Every 1 hour after market hours
        description: 'After hours: Every 1 hour'
      };
    }
  }

  /**
   * Check if it's time for scheduled weekend sync (9 AM or 9 PM ET)
   */
  async isWeekendSyncTime() {
    const now = await this.getCurrentEasternTime();
    const hour = now.getHours();
    const minute = now.getMinutes();

    // 9 AM (hour 9, minute 0-14) or 9 PM (hour 21, minute 0-14)
    return (hour === 9 || hour === 21) && minute < 15;
  }

  /**
   * Get next weekend sync time description
   */
  async getNextWeekendSyncTime() {
    const now = await this.getCurrentEasternTime();
    const hour = now.getHours();

    if (hour < 9) {
      return 'Next sync: Today at 9:00 AM ET';
    } else if (hour < 21) {
      return 'Next sync: Today at 9:00 PM ET';
    } else {
      return 'Next sync: Tomorrow at 9:00 AM ET';
    }
  }
}

module.exports = new MarketHoursService();
