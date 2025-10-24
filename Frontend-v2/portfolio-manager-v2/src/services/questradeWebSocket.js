// Questrade WebSocket Service - Frontend V2
// SINGLE PERSISTENT CONNECTION ARCHITECTURE:
// Browser → Questrade WebSocket (Direct)
// - ONE connection handles ALL persons (Vivek, Reshma, etc.)
// - Subscribes to ALL symbols from database
// - Connection persists across person/account switching
// - If one person's token fails, automatically tries another person

import { createSignal } from 'solid-js';

// Export reactive connection state for UI
// Components can import this to show connection status
export const [connectionState, setConnectionState] = createSignal({
  status: 'disconnected', // 'disconnected' | 'connecting' | 'connected' | 'error'
  lastUpdate: null,
  person: null,
  symbolCount: 0
});

class QuestradeWebSocket {
  constructor() {
    this.ws = null;
    this.allSymbols = new Set(); // All symbols we want to track
    this.subscribedSymbolIds = new Set(); // Currently subscribed symbol IDs
    this.symbolIdMap = new Map(); // symbolId -> symbol name
    this.onQuoteUpdate = null;
    this.isConnecting = false;
    this.isAuthenticated = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.heartbeatInterval = null;
    this.reconnectTimer = null;
    this.healthCheckInterval = null; // NEW: Connection health monitoring
    this.lastMessageTime = null; // NEW: Track last received message
    this.currentPerson = null; // Which person's token we're using
    this.availablePersons = null; // List of persons from database (loaded dynamically)
  }

  /**
   * Connect to Questrade WebSocket - SINGLE PERSISTENT CONNECTION
   * This is called ONCE and maintains connection for ALL persons/symbols
   * @param {Array<string>} symbols - Array of symbol names (e.g., ['AAPL', 'GOOG'])
   * @param {Function} onQuoteUpdate - Callback when quote is received
   */
  async connect(symbols, onQuoteUpdate) {
    // If already connected, just update symbols
    if (this.isConnected()) {
      console.log('[QT WebSocket] Already connected, updating symbols...');
      this.onQuoteUpdate = onQuoteUpdate;
      await this.updateSymbols(symbols);
      return;
    }

    if (this.isConnecting) {
      console.log('[QT WebSocket] Already connecting...');
      return;
    }

    if (!symbols || symbols.length === 0) {
      console.warn('[QT WebSocket] No symbols provided');
      return;
    }

    this.isConnecting = true;
    this.allSymbols = new Set(symbols);
    this.onQuoteUpdate = onQuoteUpdate;

    // Update connection state to connecting
    setConnectionState({
      status: 'connecting',
      lastUpdate: Date.now(),
      person: null,
      symbolCount: symbols.length
    });

    try {
      console.log(`[QT WebSocket] Starting SINGLE PERSISTENT connection for ${symbols.length} symbols...`);
      console.log('[QT WebSocket] Symbols:', symbols.join(', '));

      // Try to connect using available persons (fallback mechanism)
      await this.connectWithFallback();

    } catch (error) {
      console.error('[QT WebSocket] ❌ Connection failed:', error);
      this.isConnecting = false;

      // Update connection state to error
      setConnectionState({
        status: 'error',
        lastUpdate: Date.now(),
        person: this.currentPerson,
        symbolCount: symbols.length
      });

      this.scheduleReconnect();
    }
  }

  /**
   * Fetch available persons from database
   */
  async fetchAvailablePersons() {
    try {
      const response = await fetch('/api-auth/persons');

      if (!response.ok) {
        throw new Error(`Failed to fetch persons: ${response.status}`);
      }

      const data = await response.json();

      if (!data.success || !data.data || !Array.isArray(data.data)) {
        throw new Error('Invalid response from persons API');
      }

      // Extract person names from database response
      this.availablePersons = data.data
        .filter(p => p.personName && p.isActive !== false)
        .map(p => p.personName);

      console.log('[QT WebSocket] 📋 Fetched available persons from database:', this.availablePersons);

      if (this.availablePersons.length === 0) {
        throw new Error('No active persons found in database');
      }

      return this.availablePersons;
    } catch (error) {
      console.error('[QT WebSocket] Failed to fetch persons:', error);
      throw error;
    }
  }

  /**
   * Try connecting with different person tokens (fallback mechanism)
   */
  async connectWithFallback() {
    // Fetch available persons from database if not already loaded
    if (!this.availablePersons || this.availablePersons.length === 0) {
      await this.fetchAvailablePersons();
    }

    for (const person of this.availablePersons) {
      try {
        console.log(`[QT WebSocket] Trying to connect with ${person}'s token...`);
        await this.connectWithPerson(person);
        console.log(`[QT WebSocket] ✅ Successfully connected using ${person}'s token`);
        return; // Success!
      } catch (error) {
        console.warn(`[QT WebSocket] Failed with ${person}:`, error.message);
        // Try next person
      }
    }
    throw new Error('Failed to connect with any person token');
  }

  /**
   * Connect using a specific person's token
   * @param {boolean} forceRefresh - Force token refresh (used after token expiry)
   */
  async connectWithPerson(personName, forceRefresh = false) {
    this.currentPerson = personName;

    // Step 1: Get access token and API server
    // Force refresh if we're reconnecting after a token expiry error
    const tokenData = await this.getAccessToken(personName, forceRefresh);
    console.log(`[QT WebSocket] ✅ Access token retrieved for ${personName}`);

    // Step 2: Get symbol IDs for ALL symbols
    await this.loadSymbolIds(Array.from(this.allSymbols));
    console.log(`[QT WebSocket] ✅ Got ${this.subscribedSymbolIds.size} symbol IDs`);

    if (this.subscribedSymbolIds.size === 0) {
      throw new Error('No valid symbol IDs found');
    }

    // Step 3: Get stream port
    const streamPort = await this.getStreamPort(tokenData.apiServer, tokenData.accessToken, personName);
    console.log(`[QT WebSocket] ✅ Got stream port: ${streamPort}`);

    // Step 4: Build WebSocket URL using stream port
    const wsUrl = this.buildWebSocketUrl(tokenData.apiServer, streamPort);
    console.log('[QT WebSocket] Connecting to:', wsUrl);

    // Step 5: Create WebSocket connection
    this.ws = new WebSocket(wsUrl);

    // Step 6: Setup event handlers
    await this.setupEventHandlers(tokenData.accessToken);
  }

  /**
   * Update symbols dynamically without reconnecting
   * @param {Array<string>} newSymbols - New list of symbols
   */
  async updateSymbols(newSymbols) {
    if (!this.isConnected()) {
      console.warn('[QT WebSocket] Not connected, cannot update symbols');
      return;
    }

    console.log(`[QT WebSocket] Updating symbols from ${this.allSymbols.size} to ${newSymbols.length}...`);

    const newSymbolSet = new Set(newSymbols);
    const currentSymbols = this.allSymbols;

    // Find symbols to add and remove
    const toAdd = newSymbols.filter(s => !currentSymbols.has(s));
    const toRemove = Array.from(currentSymbols).filter(s => !newSymbolSet.has(s));

    console.log('[QT WebSocket] Symbols to add:', toAdd);
    console.log('[QT WebSocket] Symbols to remove:', toRemove);

    // Update tracked symbols
    this.allSymbols = newSymbolSet;

    // Get symbol IDs for new symbols
    if (toAdd.length > 0) {
      await this.loadSymbolIds(toAdd, true); // true = append mode
    }

    // Re-subscribe with updated symbol list
    if (toAdd.length > 0 || toRemove.length > 0) {
      this.subscribeToSymbols();
    }
  }

  /**
   * Get access token from backend
   * @param {string} personName - Person name
   * @param {boolean} forceRefresh - Force backend to refresh token instead of using cache
   */
  async getAccessToken(personName, forceRefresh = false) {
    try {
      // Use /api-auth proxy to route to Auth API (port 4001)
      // Add timestamp to bypass cache if forcing refresh
      const url = forceRefresh
        ? `/api-auth/auth/access-token/${personName}?refresh=${Date.now()}`
        : `/api-auth/auth/access-token/${personName}`;

      console.log(`[QT WebSocket] ${forceRefresh ? '🔄 Force refreshing' : 'Getting'} access token for ${personName}...`);

      const response = await fetch(url);

      // Check for rate limiting (429)
      if (response.status === 429) {
        console.warn(`[QT WebSocket] ⚠️ Rate limited (429) for ${personName} - trying next person`);
        throw new Error('Rate limited');
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to get access token');
      }

      console.log(`[QT WebSocket] ✅ Got access token for ${personName} (expires: ${new Date(data.data.expiresAt).toLocaleTimeString()})`);

      return {
        accessToken: data.data.accessToken,
        apiServer: data.data.apiServer,
        expiresAt: data.data.expiresAt
      };
    } catch (error) {
      console.error(`[QT WebSocket] Failed to get access token for ${personName}:`, error);
      throw error;
    }
  }

  /**
   * Get symbol IDs from backend
   * @param {boolean} append - If true, append to existing symbol IDs instead of replacing
   */
  async loadSymbolIds(symbols, append = false) {
    try {
      // Use /api-market proxy to route to Market API (port 4004)
      const response = await fetch(`/api-market/symbols/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to lookup symbols');
      }

      // Clear existing if not appending
      if (!append) {
        this.subscribedSymbolIds.clear();
        this.symbolIdMap.clear();
      }

      // Build symbol ID set and map
      Object.entries(data.data).forEach(([symbol, info]) => {
        if (info.symbolId) {
          this.subscribedSymbolIds.add(info.symbolId);
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
   * Get stream port from backend
   */
  async getStreamPort(apiServer, accessToken, personName) {
    try {
      console.log('[QT WebSocket] Getting stream port via backend proxy...');

      const symbolIdsArray = Array.from(this.subscribedSymbolIds);

      // Call backend endpoint to get stream port (avoids CORS)
      const response = await fetch(`/api-market/symbols/stream-port`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbolIds: symbolIdsArray,
          personName: personName
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to get stream port: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success || !data.data || !data.data.streamPort) {
        throw new Error('No streamPort in response');
      }

      console.log('[QT WebSocket] Received stream port:', data.data.streamPort);
      return data.data.streamPort;
    } catch (error) {
      console.error('[QT WebSocket] Failed to get stream port:', error);
      throw error;
    }
  }

  /**
   * Build WebSocket URL from API server and stream port
   */
  buildWebSocketUrl(apiServer, streamPort) {
    // Convert https://api02.iq.questrade.com/ to wss://api02.iq.questrade.com
    let wsServer = apiServer.replace('https://', 'wss://').replace('http://', 'ws://');

    // Remove trailing slash
    wsServer = wsServer.replace(/\/$/, '');

    // Add stream port
    const wsUrl = `${wsServer}:${streamPort}`;

    return wsUrl;
  }

  /**
   * Setup WebSocket event handlers
   */
  setupEventHandlers(accessToken) {
    return new Promise((resolve, reject) => {
      this.ws.onopen = () => {
        console.log('[QT WebSocket] ✅ Connection opened, authenticating...');

        // Send access token as plain string
        console.log('[QT WebSocket] Sending access token (length:', accessToken.length, ')');
        this.ws.send(accessToken);
      };

      this.ws.onmessage = (event) => {
        try {
          // Update last message time for health monitoring
          this.lastMessageTime = Date.now();

          const message = JSON.parse(event.data);
          const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
          console.log(`[QT WebSocket] [${timestamp}] 📥 Received message:`, message);

          const result = this.handleMessage(message);

          // Resolve on successful authentication
          if (result === 'authenticated') {
            resolve();
          }
        } catch (error) {
          console.error('[QT WebSocket] Failed to parse message:', error, event.data);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[QT WebSocket] ❌ WebSocket Error:', error);
        reject(error);
      };

      this.ws.onclose = (event) => {
        console.log('[QT WebSocket] Connection closed');
        console.log('[QT WebSocket] Close code:', event.code);
        console.log('[QT WebSocket] Close reason:', event.reason || 'No reason provided');
        console.log('[QT WebSocket] Was clean close?:', event.wasClean);

        this.handleDisconnect(event);
      };

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!this.isAuthenticated) {
          reject(new Error('Authentication timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Handle incoming WebSocket messages
   * @returns {string} 'authenticated' if authentication succeeded
   */
  handleMessage(message) {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Authentication success response
    if (message.success === true) {
      console.log(`[QT WebSocket] [${timestamp}] ✅ Authenticated successfully with ${this.currentPerson}'s token!`);
      this.isAuthenticated = true;
      this.isConnecting = false;
      this.reconnectAttempts = 0;

      // Update connection state to connected
      setConnectionState({
        status: 'connected',
        lastUpdate: Date.now(),
        person: this.currentPerson,
        symbolCount: this.subscribedSymbolIds.size
      });

      // Subscribe to symbol IDs
      this.subscribeToSymbols();

      // Start heartbeat to keep connection alive
      this.startHeartbeat();

      return 'authenticated';
    }

    // Handle Questrade error codes
    if (message.code !== undefined && message.message) {
      console.error(`[QT WebSocket] [${timestamp}] ❌ Questrade Error ${message.code}:`, message.message);

      // Code 1017 = Access token is invalid/expired
      if (message.code === 1017) {
        console.log('[QT WebSocket] 🔄 Access token expired, will reconnect with fresh token...');
        // Close connection to trigger reconnection with fresh token
        if (this.ws) {
          this.ws.close(4001, 'Access token expired');
        }
        return 'token_expired';
      }

      // Other error codes
      this.disconnect();
      return 'error';
    }

    // Authentication failure (legacy error format)
    if (message.error) {
      console.error(`[QT WebSocket] [${timestamp}] ❌ Error:`, message.error);
      this.disconnect();
      return 'error';
    }

    // Quote updates come wrapped in a {quotes: Array} object
    if (message.quotes && Array.isArray(message.quotes) && message.quotes.length > 0) {
      console.log(`[QT WebSocket] [${timestamp}] 📦 Received ${message.quotes.length} quote updates`);

      // Update connection state lastUpdate timestamp
      setConnectionState(prev => ({
        ...prev,
        lastUpdate: Date.now()
      }));

      // Process all quotes and add symbol names
      const processedQuotes = message.quotes
        .filter(quote => quote.symbolId !== undefined)
        .map(quote => {
          const symbol = this.symbolIdMap.get(quote.symbolId);
          if (symbol) {
            return { ...quote, symbol };
          }
          return null;
        })
        .filter(quote => quote !== null);

      // Call callback ONCE with all quotes (batch update)
      if (this.onQuoteUpdate && processedQuotes.length > 0) {
        console.log(`[QT WebSocket] [${timestamp}] 🔄 Calling onQuoteUpdate callback with ${processedQuotes.length} quotes`);
        this.onQuoteUpdate(processedQuotes);
      }

      return 'quote';
    }

    // Quote updates come as direct ARRAY of quotes (alternative format)
    if (Array.isArray(message) && message.length > 0) {
      console.log(`[QT WebSocket] [${timestamp}] 📦 Received ${message.length} quote updates (array format)`);
      message.forEach(quote => {
        if (quote.symbolId !== undefined) {
          this.handleQuoteUpdate(quote);
        }
      });
      return 'quote';
    }

    // Single quote update (fallback)
    if (message.symbolId !== undefined) {
      this.handleQuoteUpdate(message);
      return 'quote';
    }

    // Unknown message type - log for debugging
    console.warn(`[QT WebSocket] [${timestamp}] ⚠️ Unknown message type:`, message);
    return 'unknown';
  }

  /**
   * Subscribe to symbols after authentication
   */
  subscribeToSymbols() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[QT WebSocket] Cannot subscribe - connection not open');
      return;
    }

    const symbolIdsArray = Array.from(this.subscribedSymbolIds);
    console.log(`[QT WebSocket] Subscribing to ${symbolIdsArray.length} symbols:`, symbolIdsArray);

    const subscribeMessage = {
      mode: 'streaming',
      ids: symbolIdsArray
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
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    if (symbol) {
      quote.symbol = symbol;

      // Questrade uses 'lastTradePrice' for the current price
      const price = quote.lastTradePrice || quote.askPrice || quote.bidPrice || 'N/A';
      console.log(`[QT WebSocket] [${timestamp}] 📊 Quote update: ${symbol} = $${price}`);

      // Call user's callback
      if (this.onQuoteUpdate) {
        console.log(`[QT WebSocket] [${timestamp}] 🔄 Calling onQuoteUpdate callback for ${symbol}`);
        this.onQuoteUpdate(quote);
      } else {
        console.warn(`[QT WebSocket] [${timestamp}] ⚠️ No onQuoteUpdate callback registered!`);
      }
    } else {
      console.warn(`[QT WebSocket] [${timestamp}] Received quote for unknown symbolId:`, quote.symbolId);
    }
  }

  /**
   * Start heartbeat to keep connection alive
   * NOTE: Questrade requires "requests at least every 30 minutes" to keep session alive
   * We refresh subscription every 20 minutes as a safety margin
   */
  startHeartbeat() {
    // Clear existing heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Refresh subscription every 20 minutes (safe margin before 30min timeout)
    // This keeps the session alive by sending the subscription request
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        console.log('[QT WebSocket] 💓 Refreshing subscription (30min keep-alive)...');
        // Re-send subscription instead of custom heartbeat message
        // This is a documented message format that keeps the session alive
        this.subscribeToSymbols();
      }
    }, 20 * 60 * 1000); // 20 minutes (safe margin before 30min session timeout)

    console.log('[QT WebSocket] 💓 Subscription refresh started (every 20 minutes to prevent 30min timeout)');

    // Start health monitoring
    this.startHealthMonitoring();
  }

  /**
   * Start connection health monitoring
   * Detects if connection is alive but not receiving data (zombie connection)
   * NOTE: Market data only updates when prices change, so timeout must be generous
   */
  startHealthMonitoring() {
    // Clear existing health check
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Initialize last message time
    this.lastMessageTime = Date.now();

    // Check connection health every 30 seconds (to detect 30s re-subscribe threshold)
    this.healthCheckInterval = setInterval(() => {
      // Check 1: Verify connection is still established
      if (!this.isConnected()) {
        console.warn('[QT WebSocket] ⚠️ Health check: Not connected');
        return;
      }

      // Check 2: Verify WebSocket readyState is still OPEN
      if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
        console.error(`[QT WebSocket] ❌ Health check: WebSocket state is ${this.ws.readyState} (expected 1=OPEN)`);
        console.log('[QT WebSocket] 🔄 Forcing reconnection due to invalid state...');
        this.handleDisconnect({ code: 4002, reason: 'Invalid WebSocket state', wasClean: false });
        return;
      }

      // Check 3: Verify we're receiving data (or connection is truly dead)
      const now = Date.now();
      const timeSinceLastMessage = now - this.lastMessageTime;

      // Re-subscribe after 30 seconds of no data (subscription may have expired)
      const resubscribeThreshold = 30 * 1000; // 30 seconds

      // Reconnect after 1 minute of no data (connection truly dead)
      const reconnectThreshold = 1 * 60 * 1000; // 1 minute

      if (timeSinceLastMessage > reconnectThreshold) {
        console.error(`[QT WebSocket] ❌ Connection timeout! No messages for ${Math.floor(timeSinceLastMessage / 1000 / 60)}min`);
        console.log('[QT WebSocket] 🔄 Forcing reconnection due to timeout...');

        // Close the zombie connection and trigger reconnect
        if (this.ws) {
          this.ws.close(4000, 'Connection timeout - no data received');
        }
      } else if (timeSinceLastMessage > resubscribeThreshold) {
        // No data for 30+ seconds - subscription may have silently expired
        // Re-subscribe to symbols to refresh the subscription
        const secondsSinceLastMessage = Math.floor(timeSinceLastMessage / 1000);
        console.warn(`[QT WebSocket] ⚠️ No data for ${secondsSinceLastMessage}s - re-subscribing...`);

        // Re-subscribe to all symbols (this may refresh expired subscription)
        this.subscribeToSymbols();
      } else {
        // Connection is healthy (or market is just quiet)
        const minutesSinceLastMessage = Math.floor(timeSinceLastMessage / 1000 / 60);
        const secondsSinceLastMessage = Math.floor((timeSinceLastMessage / 1000) % 60);
        if (minutesSinceLastMessage > 0) {
          console.log(`[QT WebSocket] ✅ Health check: Connected, last message ${minutesSinceLastMessage}m ${secondsSinceLastMessage}s ago`);
        } else {
          console.log(`[QT WebSocket] ✅ Health check: Connected, last message ${secondsSinceLastMessage}s ago`);
        }
      }
    }, 30 * 1000); // Check every 30 seconds

    console.log('[QT WebSocket] 🏥 Health monitoring started (checking every 30s, re-subscribe after 30s, reconnect after 1min)');
  }

  /**
   * Handle disconnection
   */
  handleDisconnect(event) {
    this.isAuthenticated = false;
    this.cleanup();

    // Update connection state to disconnected
    setConnectionState({
      status: 'disconnected',
      lastUpdate: Date.now(),
      person: this.currentPerson,
      symbolCount: 0
    });

    // Check if this was an intentional disconnect
    if (event.code === 1000) {
      console.log('[QT WebSocket] Normal closure, not reconnecting');
      return;
    }

    // Check if this was a token expiry disconnect
    const isTokenExpiry = event.code === 4001 || event.reason === 'Access token expired';

    if (isTokenExpiry) {
      console.log('[QT WebSocket] 🔄 Token expired, forcing token refresh on reconnection');
      // Reset reconnection attempts for token expiry (this is a known, recoverable error)
      this.reconnectAttempts = 0;
      this.scheduleReconnect(true); // Pass true to force refresh
    } else {
      // Schedule reconnect for unexpected disconnects
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   * @param {boolean} forceRefresh - Force token refresh on reconnection
   */
  scheduleReconnect(forceRefresh = false) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[QT WebSocket] ❌ Max reconnect attempts reached, giving up');
      return;
    }

    // For token expiry, reconnect immediately with fresh token
    // For other errors, use exponential backoff
    const delay = forceRefresh ? 1000 : Math.min(5000 * Math.pow(2, this.reconnectAttempts), 80000);
    this.reconnectAttempts++;

    console.log(`[QT WebSocket] 🔄 Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})${forceRefresh ? ' with fresh token' : ''}...`);

    this.reconnectTimer = setTimeout(async () => {
      // If forcing refresh, try to reconnect with the current person first (with fresh token)
      if (forceRefresh && this.currentPerson) {
        try {
          console.log(`[QT WebSocket] 🔄 Reconnecting with fresh token for ${this.currentPerson}...`);

          // Reset flag to allow new connection
          this.isConnecting = false;

          await this.connectWithPerson(this.currentPerson, true); // true = force refresh
          console.log(`[QT WebSocket] ✅ Reconnected successfully with fresh token`);

          // Reset reconnection attempts on success
          this.reconnectAttempts = 0;
          return;
        } catch (error) {
          console.warn(`[QT WebSocket] Failed to reconnect with ${this.currentPerson}:`, error.message);
          // Fall through to normal fallback mechanism
        }
      }

      // Reset flag to allow new connection
      this.isConnecting = false;

      // Normal reconnection with fallback
      this.connect(Array.from(this.allSymbols), this.onQuoteUpdate);
    }, delay);
  }

  /**
   * Clean up timers and intervals
   */
  cleanup() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.isConnecting = false;
    this.isAuthenticated = false;
    this.lastMessageTime = null;
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
      symbolCount: this.subscribedSymbolIds.size,
      reconnectAttempts: this.reconnectAttempts,
      currentPerson: this.currentPerson
    };
  }
}

// Export singleton instance
export default new QuestradeWebSocket();
