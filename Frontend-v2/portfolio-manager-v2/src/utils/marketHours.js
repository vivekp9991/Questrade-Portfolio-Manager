// Market Hours Utility
// NYSE/TSX Trading Hours: 9:30 AM - 4:00 PM EST (Monday-Friday)

/**
 * Check if the market is currently open
 * @returns {boolean} True if market is open
 */
export function isMarketOpen() {
  const now = new Date();

  // Get EST time components using toLocaleString with proper options
  const estFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'long'
  });

  const parts = estFormatter.formatToParts(now);
  const estData = {};
  parts.forEach(part => {
    estData[part.type] = part.value;
  });

  // Get day of week
  const dayOfWeek = now.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long'
  });

  // Market closed on weekends
  if (dayOfWeek === 'Saturday' || dayOfWeek === 'Sunday') {
    console.log('[MARKET] Weekend - Market closed');
    return false;
  }

  // Get hours and minutes in EST
  const hours = parseInt(estData.hour, 10);
  const minutes = parseInt(estData.minute, 10);
  const totalMinutes = hours * 60 + minutes;

  // Market hours: 9:30 AM - 4:00 PM EST
  const marketOpen = 9 * 60 + 30;  // 9:30 AM = 570 minutes
  const marketClose = 16 * 60;      // 4:00 PM = 960 minutes

  const isOpen = totalMinutes >= marketOpen && totalMinutes < marketClose;

  console.log(`[MARKET] Day: ${dayOfWeek}, EST Time: ${hours}:${minutes.toString().padStart(2, '0')}, Total Minutes: ${totalMinutes}, Market Open: ${marketOpen}-${marketClose}, Is Open: ${isOpen}`);

  return isOpen;
}

/**
 * Get the next market open/close time
 * @returns {object} { isOpen: boolean, nextChange: Date, message: string }
 */
export function getMarketStatus() {
  const isOpen = isMarketOpen();
  const now = new Date();
  const estTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));

  let message = '';
  let nextChange = null;

  if (isOpen) {
    // Market is open, find closing time
    const closeTime = new Date(estTime);
    closeTime.setHours(16, 0, 0, 0);
    nextChange = closeTime;

    const minutesUntilClose = Math.floor((closeTime - estTime) / 1000 / 60);
    message = `Market closes in ${Math.floor(minutesUntilClose / 60)}h ${minutesUntilClose % 60}m`;
  } else {
    // Market is closed, find next opening time
    const openTime = new Date(estTime);
    openTime.setHours(9, 30, 0, 0);

    // If it's past market close today, or it's weekend, move to next business day
    const dayOfWeek = estTime.getDay();
    const hours = estTime.getHours();

    if (hours >= 16 || dayOfWeek === 6) {
      // Move to next day
      openTime.setDate(openTime.getDate() + 1);
    }

    // Skip weekends
    while (openTime.getDay() === 0 || openTime.getDay() === 6) {
      openTime.setDate(openTime.getDate() + 1);
    }

    nextChange = openTime;
    message = 'Market Closed';
  }

  return {
    isOpen,
    nextChange,
    message
  };
}
