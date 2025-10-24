// src/streaming.js - FIXED VERSION with correct Market API port and market hours support
import { fetchAccessToken } from './api';
import marketHoursService from './services/marketHours';

// FIXED: Use Market API (Port 4004) for market data
const MARKET_API_URL = import.meta.env.VITE_MARKET_API_URL || 'http://localhost:4004';

let ws = null;
let reconnectInterval = null;
let subscribedSymbols = [];

async function getQuestradeStreamUrl() {
  // Get access token and API server from your backend
  const tokenData = await fetchAccessToken();
  
  // Questrade WebSocket URL format
  // Replace 'api' with 'stream' in the API server URL
  const streamUrl = tokenData.apiServer.replace('api', 'stream');
  return `${streamUrl}v1/markets/quotes?mode=WebSocket&access_token=${tokenData.token}`;
}

export async function startQuoteStream(symbols, onQuote) {
  // Filter out empty symbols and format for Questrade
  subscribedSymbols = symbols.filter(s => s && s.length > 0);
  
  if (subscribedSymbols.length === 0) {
    console.log('No symbols to subscribe to');
    return null;
  }

  // Close existing connection if any
  if (ws) {
    ws.close();
  }

  try {
    const url = await getQuestradeStreamUrl();
    ws = new WebSocket(url);

    ws.onopen = () => {
      console.log('WebSocket connected, subscribing to:', subscribedSymbols);
      
      // Questrade WebSocket subscription format
      // You need to send symbol IDs, not symbols
      // First, get symbol IDs from your backend
      fetchSymbolIds(subscribedSymbols).then(symbolIds => {
        if (symbolIds && symbolIds.length > 0) {
          const subscribeMessage = {
            ids: symbolIds,
            mode: 'streaming'
          };
          ws.send(JSON.stringify(subscribeMessage));
        }
      });
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Questrade sends quotes in an array
        if (data.quotes && Array.isArray(data.quotes)) {
          data.quotes.forEach(quote => {
            if (onQuote) {
              // Enhanced quote data with calculated fields
              onQuote({
                symbol: quote.symbol,
                lastTradePrice: quote.lastTradePrice,
                bidPrice: quote.bidPrice,
                askPrice: quote.askPrice,
                volume: quote.volume,
                openPrice: quote.openPrice,
                highPrice: quote.highPrice,
                lowPrice: quote.lowPrice,
                delay: quote.delay,
                // Calculate today's change
                todayChangeValue: quote.lastTradePrice && quote.openPrice 
                  ? quote.lastTradePrice - quote.openPrice 
                  : 0,
                todayChangePercent: quote.lastTradePrice && quote.openPrice && quote.openPrice > 0
                  ? ((quote.lastTradePrice - quote.openPrice) / quote.openPrice) * 100 
                  : 0,
                timestamp: Date.now()
              });
            }
          });
        }
      } catch (err) {
        console.error('Failed to parse stream message:', err);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      scheduleReconnect(symbols, onQuote);
    };

    ws.onclose = () => {
      console.log('WebSocket closed');
      scheduleReconnect(symbols, onQuote);
    };

    return ws;
  } catch (error) {
    console.error('Failed to start quote stream:', error);
    scheduleReconnect(symbols, onQuote);
    return null;
  }
}

function scheduleReconnect(symbols, onQuote) {
  if (reconnectInterval) {
    clearTimeout(reconnectInterval);
  }
  
  reconnectInterval = setTimeout(() => {
    console.log('Attempting to reconnect WebSocket...');
    startQuoteStream(symbols, onQuote);
  }, 5000); // Reconnect after 5 seconds
}

// Helper function to get symbol IDs from backend
async function fetchSymbolIds(symbols) {
  try {
    // FIXED: Use correct endpoint - /api/symbols/search
    const symbolPromises = symbols.map(async (symbol) => {
      const response = await fetch(`${MARKET_API_URL}/api/symbols/search?prefix=${encodeURIComponent(symbol)}&limit=1`);
      const data = await response.json();

      if (data.success && data.data && data.data.length > 0) {
        return data.data[0].symbolId;
      }
      return null;
    });

    const symbolIds = await Promise.all(symbolPromises);
    return symbolIds.filter(id => id !== null);
  } catch (error) {
    console.error('Failed to fetch symbol IDs:', error);
    return [];
  }
}

// ENHANCED: Polling with change detection, market hours check, and proper today change calculation
export async function startPollingQuotes(symbols, onQuote, interval = 5000) {
  let lastQuotes = new Map(); // Store last quotes for comparison

  const pollQuotes = async () => {
    if (!symbols || symbols.length === 0) return;

    // Check if market is open before polling
    const marketStatus = await marketHoursService.isMarketOpen();

    if (!marketStatus.isOpen) {
      console.log(`[Polling] ⏸️ Skipping quote poll - Market is CLOSED (${marketStatus.reason})`);
      return; // Skip this poll cycle
    }

    try {
      console.log(`[Polling] 🔄 Fetching quotes - Market is OPEN`);

      // FIXED: Use correct endpoint - /api/quotes with query parameter
      const response = await fetch(`${MARKET_API_URL}/api/quotes?symbols=${symbols.join(',')}`);
      const data = await response.json();

      // FIXED: Backend returns { success: true, data: [quotes array] }
      if (data.success && data.data && Array.isArray(data.data)) {
        data.data.forEach(quote => {
          if (onQuote && quote.symbol) {
            const lastQuote = lastQuotes.get(quote.symbol);
            const hasChanged = !lastQuote ||
              lastQuote.lastTradePrice !== quote.lastTradePrice ||
              lastQuote.bidPrice !== quote.bidPrice ||
              lastQuote.askPrice !== quote.askPrice;

            // Only process if quote has actually changed OR it's the first time
            if (hasChanged) {
              console.log(`Quote updated for ${quote.symbol}: ${quote.lastTradePrice}`);

              // Store current quote for next comparison
              lastQuotes.set(quote.symbol, { ...quote });

              // Use day change from backend (already calculated from previous close)
              const todayChangeValue = quote.dayChange || 0;
              const todayChangePercent = quote.dayChangePercent || 0;

              onQuote({
                symbol: quote.symbol,
                lastTradePrice: quote.lastTradePrice,
                bidPrice: quote.bidPrice,
                askPrice: quote.askPrice,
                volume: quote.volume,
                openPrice: quote.openPrice,
                highPrice: quote.highPrice,
                lowPrice: quote.lowPrice,
                previousClosePrice: quote.previousClosePrice,
                // Use backend-calculated day change (from previous close, not open)
                todayChangeValue,
                todayChangePercent,
                dayChange: todayChangeValue,  // Add for compatibility
                dayChangePercent: todayChangePercent,  // Add for compatibility
                timestamp: Date.now()
              });
            }
          }
        });
      }
    } catch (error) {
      console.error('Failed to poll quotes:', error);
    }
  };

  // Initial poll
  await pollQuotes();
  
  // Set up interval - runs every `interval` milliseconds regardless of changes
  // The change detection happens INSIDE the polling function
  const intervalId = setInterval(pollQuotes, interval);
  
  // Return cleanup function
  return () => {
    clearInterval(intervalId);
    lastQuotes.clear();
  };
}

/**
 * Manually fetch quotes (for sync button outside market hours)
 * Does NOT check market hours - allows manual sync anytime
 */
export async function manualFetchQuotes(symbols, onQuote) {
  if (!symbols || symbols.length === 0) {
    console.warn('[Manual Fetch] No symbols provided');
    return;
  }

  try {
    console.log(`[Manual Fetch] 🔄 Manually fetching ${symbols.length} quotes...`);

    const response = await fetch(`${MARKET_API_URL}/api/quotes?symbols=${symbols.join(',')}`);
    const data = await response.json();

    if (data.success && data.data && Array.isArray(data.data)) {
      console.log(`[Manual Fetch] ✅ Received ${data.data.length} quotes`);

      data.data.forEach(quote => {
        if (onQuote && quote.symbol) {
          const todayChangeValue = quote.dayChange || 0;
          const todayChangePercent = quote.dayChangePercent || 0;

          onQuote({
            symbol: quote.symbol,
            lastTradePrice: quote.lastTradePrice,
            bidPrice: quote.bidPrice,
            askPrice: quote.askPrice,
            volume: quote.volume,
            dayChange: todayChangeValue,
            dayChangePercent: todayChangePercent,
            high: quote.high52w,
            low: quote.low52w,
            lastTradeTime: quote.lastTradeTime,
            price: quote.lastTradePrice
          });
        }
      });

      return { success: true, count: data.data.length };
    } else {
      console.error('[Manual Fetch] Invalid response format:', data);
      return { success: false, error: 'Invalid response format' };
    }
  } catch (error) {
    console.error('[Manual Fetch] Failed to fetch quotes:', error);
    return { success: false, error: error.message };
  }
}

export function stopQuoteStream() {
  if (ws) {
    ws.close();
    ws = null;
  }
  if (reconnectInterval) {
    clearTimeout(reconnectInterval);
    reconnectInterval = null;
  }
}