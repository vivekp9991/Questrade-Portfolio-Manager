// src/services/questradeWebSocket.js - Questrade WebSocket Service for Real-time Quotes
// UPDATED: Now connects to backend WebSocket proxy to avoid CORS issues

import marketHoursService from './marketHours';

const WEBSOCKET_PROXY_URL = import.meta.env.VITE_WEBSOCKET_PROXY_URL || 'ws://localhost:4005';

class QuestradeWebSocket {
  constructor() {
    this.ws = null;
    this.symbols = [];
    this.onQuoteUpdate = null;
    this.reconnectTimer = null;
    this.marketHoursCheckInterval = null;
    this.isConnecting = false;
    this.isAuthenticated = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.personName = 'Vivek'; // Default person name
  }

  /**
   * Connect to Questrade WebSocket and subscribe to symbols
   * Only connects during market hours (9:30 AM - 4:00 PM ET, Monday-Friday)
   * @param {Array<string>} symbols - Array of symbol names (e.g., ['AAPL', 'GOOG'])
   * @param {Function} onQuoteUpdate - Callback when quote is received
   */
  async connect(symbols, onQuoteUpdate) {
    if (this.isConnecting) {
      console.log('[QT WebSocket] Already connecting...');
      return;
    }

    // Check if market is currently open
    const marketStatus = await marketHoursService.isMarketOpen();
    const statusMessage = await marketHoursService.getMarketStatusMessage();

    console.log(`[QT WebSocket] ${statusMessage}`);

    if (!marketStatus.isOpen) {
      console.log(`[QT WebSocket] 🔴 Market is CLOSED - WebSocket will not connect`);
      console.log(`[QT WebSocket] Reason: ${marketStatus.reason}`);

      if (marketStatus.nextOpen) {
        const timeRemaining = marketHoursService.getTimeRemaining(
          marketStatus.nextOpen,
          marketStatus.currentTime
        );
        console.log(`[QT WebSocket] Next market open in: ${timeRemaining}`);
      }

      // Start checking for market hours periodically (every 5 minutes)
      this.startMarketHoursMonitoring(symbols, onQuoteUpdate);
      return;
    }

    console.log('[QT WebSocket] 🟢 Market is OPEN - Proceeding with WebSocket connection...');

    // Proceed with connection if market is open
    await this._performConnection(symbols, onQuoteUpdate);

    // Start monitoring market hours (will disconnect when market closes)
    this.startMarketHoursMonitoring(symbols, onQuoteUpdate);
  }

  /**
   * Perform the actual WebSocket connection
   * (separated from connect() to allow market hours checking)
   */
  async _performConnection(symbols, onQuoteUpdate) {
    if (this.isConnecting) {
      return;
    }

    if (!symbols || symbols.length === 0) {
      console.warn('[QT WebSocket] No symbols provided');
      return;
    }

    this.isConnecting = true;
    this.symbols = symbols;
    this.onQuoteUpdate = onQuoteUpdate;

    try {
      console.log(`[QT WebSocket] Starting connection for ${symbols.length} symbols...`);

      // Step 1: Get access token and API server
      const tokenData = await this.getAccessToken();
      console.log('[QT WebSocket] Access token retrieved');

      // Step 2: Get symbol IDs for the symbols
      await this.loadSymbolIds(symbols);
      console.log(`[QT WebSocket] Got ${this.symbolIds.length} symbol IDs`);

      if (this.symbolIds.length === 0) {
        throw new Error('No valid symbol IDs found');
      }

      // Step 3: Build WebSocket URL
      const wsUrl = this.buildWebSocketUrl(tokenData.apiServer);
      console.log('[QT WebSocket] Connecting to:', wsUrl);

      // Step 4: Create WebSocket connection
      this.ws = new WebSocket(wsUrl);

      // Step 5: Setup event handlers
      this.setupEventHandlers(tokenData.accessToken, tokenData.expiresAt);

    } catch (error) {
      console.error('[QT WebSocket] Connection failed:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  /**
   * Get access token from backend
   */
  async getAccessToken() {
    try {
      // TODO: Support multiple persons - for now hardcoded to Vivek
      const response = await fetch(`${AUTH_API_URL}/api/auth/access-token/Vivek`);

      // Check for rate limiting (429)
      if (response.status === 429) {
        console.warn('[QT WebSocket] ⚠️ Rate limited (429) - stopping reconnection attempts');
        this.maxReconnectAttempts = 0; // Stop retrying to avoid making it worse
        throw new Error('Rate limited - please wait 10-15 minutes');
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to get access token');
      }

      return {
        accessToken: data.data.accessToken,
        apiServer: data.data.apiServer,
        expiresAt: data.data.expiresAt
      };
    } catch (error) {
      console.error('[QT WebSocket] Failed to get access token:', error);
      throw error;
    }
  }

  /**
   * Get symbol IDs from backend
   */
  async loadSymbolIds(symbols) {
    try {
      const response = await fetch(`${MARKET_API_URL}/api/symbols/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to lookup symbols');
      }

      // Build symbol ID array and map
      this.symbolIds = [];
      this.symbolIdMap.clear();

      Object.entries(data.data).forEach(([symbol, info]) => {
        if (info.symbolId) {
          this.symbolIds.push(info.symbolId);
          this.symbolIdMap.set(info.symbolId, symbol);
        }
      });

      console.log('[QT WebSocket] Symbol ID mapping:', Object.fromEntries(this.symbolIdMap));
    } catch (error) {
      console.error('[QT WebSocket] Failed to load symbol IDs:', error);
      throw error;
    }
  }

  /**
   * Build WebSocket URL from API server
   * Format: wss://apiXX.iq.questrade.com/v1/markets/quotes?ids=123,456&stream=true&mode=RawSocket
   * Note: Using RawSocket mode for browser WebSocket compatibility
   */
  buildWebSocketUrl(apiServer) {
    // Build symbol IDs query parameter
    const idsParam = this.symbolIds.join(',');

    // Convert HTTPS to WSS for WebSocket protocol
    const wsServer = apiServer.replace('https://', 'wss://').replace('http://', 'ws://');

    // Use RawSocket mode instead of WebSocket mode
    // Include all symbol IDs in the initial connection
    const url = `${wsServer}/v1/markets/quotes?ids=${idsParam}&stream=true&mode=RawSocket`;

    return url;
  }

  /**
   * Setup WebSocket event handlers
   */
  setupEventHandlers(accessToken, expiresAt) {
    this.ws.onopen = () => {
      console.log('[QT WebSocket] Connection opened, authenticating...');

      // Send access token as plain string (NO "Bearer" prefix, NO JSON wrapper!)
      // Questrade docs: "Send the access token as a message without any delimiters"
      console.log('[QT WebSocket] Sending access token (length:', accessToken.length, ')');
      this.ws.send(accessToken);
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error('[QT WebSocket] Failed to parse message:', error, event.data);
      }
    };

    this.ws.onerror = (error) => {
      console.error('[QT WebSocket] ❌ WebSocket Error:', error);
      console.error('[QT WebSocket] This is likely a CORS issue - browsers cannot directly connect to Questrade WebSocket');
      console.error('[QT WebSocket] Error type:', error.type);
      console.error('[QT WebSocket] Error target:', error.target?.readyState);
    };

    this.ws.onclose = (event) => {
      console.log('[QT WebSocket] Connection closed');
      console.log('[QT WebSocket] Close code:', event.code);
      console.log('[QT WebSocket] Close reason:', event.reason || 'No reason provided');
      console.log('[QT WebSocket] Was clean close?:', event.wasClean);

      // Common close codes:
      // 1000 = Normal closure
      // 1006 = Abnormal closure (usually CORS/network issue, no close frame received)
      // 1015 = TLS handshake failure
      if (event.code === 1006) {
        console.error('[QT WebSocket] ⚠️ Close code 1006 = Connection failed before establishment');
        console.error('[QT WebSocket] This typically means:');
        console.error('[QT WebSocket]   1. CORS policy blocked the connection (most likely)');
        console.error('[QT WebSocket]   2. Network error or server unreachable');
        console.error('[QT WebSocket]   3. Invalid WebSocket URL or authentication');
      }

      this.handleDisconnect(event);
    };
  }

  /**
   * Handle incoming WebSocket messages
   */
  handleMessage(message) {
    // Authentication success response
    if (message.success === true) {
      console.log('[QT WebSocket] ✅ Authenticated successfully!');
      this.isAuthenticated = true;
      this.isConnecting = false;
      this.reconnectAttempts = 0;

      // Subscribe to symbol IDs
      this.subscribeToSymbols();

      // Start heartbeat to keep connection alive
      this.startHeartbeat();

      // Schedule token refresh before expiration
      this.scheduleTokenRefresh();

      return;
    }

    // Authentication failure
    if (message.error) {
      console.error('[QT WebSocket] ❌ Error:', message.error);
      this.disconnect();
      return;
    }

    // Quote update
    if (message.symbolId !== undefined) {
      this.handleQuoteUpdate(message);
    }
  }

  /**
   * Subscribe to symbols after authentication
   */
  subscribeToSymbols() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[QT WebSocket] Cannot subscribe - connection not open');
      return;
    }

    console.log(`[QT WebSocket] Subscribing to ${this.symbolIds.length} symbols:`, this.symbolIds);

    const subscribeMessage = {
      mode: 'streaming',
      ids: this.symbolIds
    };

    this.ws.send(JSON.stringify(subscribeMessage));
    console.log('[QT WebSocket] ✅ Subscription request sent');
  }

  /**
   * Handle quote update from Questrade
   */
  handleQuoteUpdate(quote) {
    // Add symbol name to quote (Questrade only sends symbolId)
    const symbol = this.symbolIdMap.get(quote.symbolId);

    if (symbol) {
      quote.symbol = symbol;

      console.log(`[QT WebSocket] Quote update: ${symbol} = $${quote.lastTradePrice}`);

      // Call user's callback
      if (this.onQuoteUpdate) {
        this.onQuoteUpdate(quote);
      }
    } else {
      console.warn('[QT WebSocket] Received quote for unknown symbolId:', quote.symbolId);
    }
  }

  /**
   * Start heartbeat to keep connection alive
   * Questrade requires a message every 30 minutes
   */
  startHeartbeat() {
    // Clear existing heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Send heartbeat every 25 minutes (safe margin)
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        console.log('[QT WebSocket] 💓 Sending heartbeat...');
        this.ws.send(JSON.stringify({ heartbeat: true }));
      }
    }, 25 * 60 * 1000); // 25 minutes

    console.log('[QT WebSocket] 💓 Heartbeat started (every 25 minutes)');
  }

  /**
   * Schedule token refresh before it expires
   * Access tokens expire after 30 minutes
   */
  scheduleTokenRefresh() {
    // Clear existing timer
    if (this.tokenExpiryTimer) {
      clearTimeout(this.tokenExpiryTimer);
    }

    // Refresh 5 minutes before expiry
    const refreshTime = 25 * 60 * 1000; // 25 minutes

    this.tokenExpiryTimer = setTimeout(() => {
      console.log('[QT WebSocket] 🔄 Token expiring soon, refreshing connection...');

      // Reconnect with new token
      this.disconnect();
      this.connect(this.symbols, this.onQuoteUpdate);
    }, refreshTime);

    console.log('[QT WebSocket] ⏰ Token refresh scheduled in 25 minutes');
  }

  /**
   * Handle disconnection
   */
  handleDisconnect(event) {
    this.isAuthenticated = false;
    this.cleanup();

    // Check if this was an intentional disconnect
    if (event.code === 1000) {
      console.log('[QT WebSocket] Normal closure, not reconnecting');
      return;
    }

    // Schedule reconnect for unexpected disconnects
    this.scheduleReconnect();
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[QT WebSocket] ❌ Max reconnect attempts reached, giving up');
      return;
    }

    // Exponential backoff: 5s, 10s, 20s, 40s, 80s
    const delay = Math.min(5000 * Math.pow(2, this.reconnectAttempts), 80000);
    this.reconnectAttempts++;

    console.log(`[QT WebSocket] 🔄 Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    this.reconnectTimer = setTimeout(() => {
      this.connect(this.symbols, this.onQuoteUpdate);
    }, delay);
  }

  /**
   * Start monitoring market hours
   * Checks every 5 minutes if market is still open
   * Disconnects WebSocket when market closes, reconnects when market opens
   */
  startMarketHoursMonitoring(symbols, onQuoteUpdate) {
    // Clear existing interval
    if (this.marketHoursCheckInterval) {
      clearInterval(this.marketHoursCheckInterval);
    }

    // Check market hours every 5 minutes
    this.marketHoursCheckInterval = setInterval(async () => {
      const marketStatus = await marketHoursService.isMarketOpen();

      if (marketStatus.isOpen && !this.isConnected()) {
        // Market just opened and we're not connected - connect!
        console.log('[QT WebSocket] 🟢 Market OPENED - Starting WebSocket connection...');
        await this._performConnection(symbols, onQuoteUpdate);
      } else if (!marketStatus.isOpen && this.isConnected()) {
        // Market just closed and we're still connected - disconnect!
        console.log('[QT WebSocket] 🔴 Market CLOSED - Disconnecting WebSocket...');
        console.log(`[QT WebSocket] Reason: ${marketStatus.reason}`);
        this.disconnect();
      }
    }, 5 * 60 * 1000); // Check every 5 minutes

    console.log('[QT WebSocket] 📅 Market hours monitoring started (checks every 5 minutes)');
  }

  /**
   * Stop monitoring market hours
   */
  stopMarketHoursMonitoring() {
    if (this.marketHoursCheckInterval) {
      clearInterval(this.marketHoursCheckInterval);
      this.marketHoursCheckInterval = null;
      console.log('[QT WebSocket] 📅 Market hours monitoring stopped');
    }
  }

  /**
   * Clean up timers and intervals
   */
  cleanup() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.tokenExpiryTimer) {
      clearTimeout(this.tokenExpiryTimer);
      this.tokenExpiryTimer = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.marketHoursCheckInterval) {
      clearInterval(this.marketHoursCheckInterval);
      this.marketHoursCheckInterval = null;
    }

    this.isConnecting = false;
    this.isAuthenticated = false;
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect() {
    console.log('[QT WebSocket] Disconnecting...');

    this.cleanup();

    if (this.ws) {
      this.ws.close(1000, 'Intentional disconnect');
      this.ws = null;
    }

    this.reconnectAttempts = 0;
  }

  /**
   * Check if currently connected
   */
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN && this.isAuthenticated;
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      connected: this.isConnected(),
      authenticated: this.isAuthenticated,
      connecting: this.isConnecting,
      symbolCount: this.symbolIds.length,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}

// Export singleton instance
export default new QuestradeWebSocket();
