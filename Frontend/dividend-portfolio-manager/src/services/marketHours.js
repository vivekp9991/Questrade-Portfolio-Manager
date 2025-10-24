// src/services/marketHours.js - Market Hours Detection Service

/**
 * Market Hours Service
 * Checks if US stock market is currently open using web-based EST time
 * Market Hours: 9:30 AM - 4:00 PM ET (Monday-Friday)
 * Excludes US market holidays
 */

class MarketHoursService {
  constructor() {
    this.cachedTime = null;
    this.cacheExpiry = null;
    this.CACHE_DURATION = 60000; // Cache time for 1 minute
  }

  /**
   * Helper: Get time components in Eastern Time (fixes timezone conversion bug)
   * @param {Date} date - Date object
   * @returns {Object} { hours, minutes, dayOfWeek }
   */
  getETTimeComponents(date) {
    // Get hours and minutes in ET
    const etTimeString = date.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const [hours, minutes] = etTimeString.split(':').map(Number);

    // Get day of week in ET
    const etDayString = date.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short'
    });
    const dayMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
    const dayOfWeek = dayMap[etDayString];

    return { hours, minutes, dayOfWeek };
  }

  /**
   * Get current Eastern Time from web API (not system time)
   * Uses WorldTimeAPI as primary source
   */
  async getCurrentEasternTime() {
    try {
      // Check cache first
      if (this.cachedTime && this.cacheExpiry && Date.now() < this.cacheExpiry) {
        // Return cached time plus elapsed milliseconds
        const elapsed = Date.now() - this.cacheExpiry + this.CACHE_DURATION;
        return new Date(this.cachedTime.getTime() + elapsed);
      }

      console.log('[Market Hours] Fetching current Eastern Time from web...');

      // Fetch current time from WorldTimeAPI
      const response = await fetch('https://worldtimeapi.org/api/timezone/America/New_York');

      if (!response.ok) {
        throw new Error(`WorldTimeAPI returned ${response.status}`);
      }

      const data = await response.json();
      const easternTime = new Date(data.datetime);

      // Cache the time
      this.cachedTime = easternTime;
      this.cacheExpiry = Date.now() + this.CACHE_DURATION;

      console.log('[Market Hours] Current Eastern Time:', easternTime.toLocaleString('en-US', {
        timeZone: 'America/New_York',
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      }));

      return easternTime;

    } catch (error) {
      console.error('[Market Hours] Failed to fetch Eastern Time from web:', error);

      // Fallback: Try alternate API
      try {
        const response = await fetch('http://worldclockapi.com/api/json/est/now');
        const data = await response.json();
        const easternTime = new Date(data.currentDateTime);

        console.log('[Market Hours] Using fallback time API');
        return easternTime;
      } catch (fallbackError) {
        console.error('[Market Hours] Fallback API also failed:', fallbackError);

        // Last resort: Use browser time with timezone conversion
        // This is less reliable but better than nothing
        console.warn('[Market Hours] Using browser time with EST conversion (less reliable)');
        return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
      }
    }
  }

  /**
   * Check if current time is within market hours
   * Market Hours: 9:30 AM - 4:00 PM ET (Monday-Friday)
   * @returns {Promise<Object>} { isOpen: boolean, reason: string, currentTime: Date }
   */
  async isMarketOpen() {
    try {
      const easternTime = await this.getCurrentEasternTime();

      // FIXED: Get time components in Eastern Time (not local timezone)
      const { hours, minutes, dayOfWeek } = this.getETTimeComponents(easternTime);

      // Check if weekend
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        return {
          isOpen: false,
          reason: 'Weekend - Markets closed',
          currentTime: easternTime,
          nextOpen: this.getNextMarketOpen(easternTime)
        };
      }

      const timeInMinutes = hours * 60 + minutes;

      // Market opens at 9:30 AM (570 minutes)
      const marketOpen = 9 * 60 + 30; // 570 minutes
      // Market closes at 4:00 PM (960 minutes)
      const marketClose = 16 * 60; // 960 minutes

      // DEBUG: Log detailed time information
      console.log(`[Market Hours DEBUG] Current ET: ${easternTime.toLocaleString('en-US', { timeZone: 'America/New_York' })}`);
      console.log(`[Market Hours DEBUG] Day: ${dayOfWeek} (0=Sun, 1=Mon, 5=Fri, 6=Sat)`);
      console.log(`[Market Hours DEBUG] Hour: ${hours}, Minutes: ${minutes}`);
      console.log(`[Market Hours DEBUG] Time in minutes: ${timeInMinutes} (market: ${marketOpen}-${marketClose})`);
      console.log(`[Market Hours DEBUG] Is ${timeInMinutes} >= ${marketOpen}? ${timeInMinutes >= marketOpen}`);
      console.log(`[Market Hours DEBUG] Is ${timeInMinutes} < ${marketClose}? ${timeInMinutes < marketClose}`);

      // Check if within market hours
      const isOpen = timeInMinutes >= marketOpen && timeInMinutes < marketClose;

      console.log(`[Market Hours DEBUG] Market is OPEN? ${isOpen}`);

      let reason;
      if (isOpen) {
        reason = 'Market is OPEN';
      } else if (timeInMinutes < marketOpen) {
        reason = `Pre-market - Opens at 9:30 AM ET`;
      } else {
        reason = `After-hours - Closed at 4:00 PM ET`;
      }

      // Check for US market holidays (simplified - can be enhanced)
      const isHoliday = this.isMarketHoliday(easternTime);
      if (isHoliday) {
        return {
          isOpen: false,
          reason: `Market Holiday - ${isHoliday}`,
          currentTime: easternTime,
          nextOpen: this.getNextMarketOpen(easternTime)
        };
      }

      return {
        isOpen,
        reason,
        currentTime: easternTime,
        nextOpen: isOpen ? null : this.getNextMarketOpen(easternTime),
        closesAt: isOpen ? this.getMarketClose(easternTime) : null
      };

    } catch (error) {
      console.error('[Market Hours] Failed to check market hours:', error);

      // On error, return conservative response (assume market closed)
      return {
        isOpen: false,
        reason: 'Unable to determine market hours (assuming closed)',
        currentTime: null,
        error: error.message
      };
    }
  }

  /**
   * Check if date is a US market holiday
   * @param {Date} date - Eastern Time date to check
   * @returns {string|null} Holiday name if holiday, null otherwise
   */
  isMarketHoliday(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // 1-12
    const day = date.getDate();

    // Fixed holidays
    const fixedHolidays = [
      { month: 1, day: 1, name: "New Year's Day" },
      { month: 7, day: 4, name: "Independence Day" },
      { month: 12, day: 25, name: "Christmas Day" }
    ];

    for (const holiday of fixedHolidays) {
      if (month === holiday.month && day === holiday.day) {
        return holiday.name;
      }
    }

    // Observed holidays (if holiday falls on weekend, observed on Friday/Monday)
    // This is simplified - real implementation would need more logic

    return null; // Not a holiday
  }

  /**
   * Get next market open time
   * @param {Date} currentTime - Current Eastern Time
   * @returns {Date} Next market open time
   */
  getNextMarketOpen(currentTime) {
    const nextOpen = new Date(currentTime);

    // FIXED: Use ET time components
    const { hours, minutes, dayOfWeek } = this.getETTimeComponents(currentTime);
    const timeInMinutes = hours * 60 + minutes;

    // If before 9:30 AM on a weekday, market opens today at 9:30 AM
    if (dayOfWeek >= 1 && dayOfWeek <= 5 && timeInMinutes < 9 * 60 + 30) {
      nextOpen.setHours(9, 30, 0, 0);
      return nextOpen;
    }

    // Otherwise, find next weekday at 9:30 AM
    let daysToAdd = 1;
    if (dayOfWeek === 5) daysToAdd = 3; // Friday -> Monday
    if (dayOfWeek === 6) daysToAdd = 2; // Saturday -> Monday

    nextOpen.setDate(nextOpen.getDate() + daysToAdd);
    nextOpen.setHours(9, 30, 0, 0);

    return nextOpen;
  }

  /**
   * Get market close time for current day
   * @param {Date} currentTime - Current Eastern Time
   * @returns {Date} Market close time (4:00 PM ET)
   */
  getMarketClose(currentTime) {
    const closeTime = new Date(currentTime);
    closeTime.setHours(16, 0, 0, 0);
    return closeTime;
  }

  /**
   * Format time remaining until market opens/closes
   * @param {Date} targetTime - Target time
   * @param {Date} currentTime - Current time
   * @returns {string} Human-readable time remaining
   */
  getTimeRemaining(targetTime, currentTime) {
    const diff = targetTime - currentTime;

    if (diff <= 0) return 'now';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days} day${days > 1 ? 's' : ''}`;
    }

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }

    return `${minutes}m`;
  }

  /**
   * Get human-readable market status
   * @returns {Promise<string>} Market status message
   */
  async getMarketStatusMessage() {
    const status = await this.isMarketOpen();

    if (!status.currentTime) {
      return '⚠️ Unable to determine market status';
    }

    const timeStr = status.currentTime.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/New_York',
      hour12: true
    });

    if (status.isOpen) {
      const remaining = this.getTimeRemaining(status.closesAt, status.currentTime);
      return `🟢 Market OPEN (closes in ${remaining}) - ${timeStr} ET`;
    } else {
      if (status.nextOpen) {
        const remaining = this.getTimeRemaining(status.nextOpen, status.currentTime);
        return `🔴 Market CLOSED (opens in ${remaining}) - ${timeStr} ET`;
      }
      return `🔴 Market CLOSED - ${status.reason} - ${timeStr} ET`;
    }
  }
}

// Export singleton instance
const marketHoursService = new MarketHoursService();
export default marketHoursService;
