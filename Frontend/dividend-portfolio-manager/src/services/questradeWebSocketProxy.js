// src/services/questradeWebSocketProxy.js - Frontend client for WebSocket Proxy
// Connects to backend WebSocket proxy (port 4005) instead of directly to Questrade

const WEBSOCKET_PROXY_URL = import.meta.env.VITE_WEBSOCKET_PROXY_URL || 'ws://localhost:4005/ws/quotes';

class QuestradeWebSocketProxyClient {
  constructor() {
    this.ws = null;
    this.symbols = [];
    this.onQuoteUpdate = null;
    this.onConnectionChange = null;
    this.reconnectTimer = null;
    this.isConnecting = false;
    this.isConnected = false;
    this.isAuthenticated = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.personName = 'Vivek';
    this.heartbeatInterval = null;
  }

  /**
   * Connect to WebSocket proxy and subscribe to symbols
   * @param {Array<string>} symbols - Array of symbol names (e.g., ['AAPL', 'GOOG.TO'])
   * @param {Function} onQuoteUpdate - Callback when quote is received
   * @param {Function} onConnectionChange - Callback when connection status changes
   */
  connect(symbols, onQuoteUpdate, onConnectionChange = null) {
    if (this.isConnecting) {
      console.log('[Proxy Client] Already connecting...');
      return;
    }

    if (!symbols || symbols.length === 0) {
      console.warn('[Proxy Client] No symbols provided');
      return;
    }

    this.isConnecting = true;
    this.symbols = symbols;
    this.onQuoteUpdate = onQuoteUpdate;
    this.onConnectionChange = onConnectionChange;

    console.log(`[Proxy Client] Connecting to WebSocket proxy: ${WEBSOCKET_PROXY_URL}`);
    console.log(`[Proxy Client] Subscribing to ${symbols.length} symbols:`, symbols);

    try {
      // Create WebSocket connection to proxy
      this.ws = new WebSocket(WEBSOCKET_PROXY_URL);

      // Setup event handlers
      this.setupEventHandlers();
    } catch (error) {
      console.error('[Proxy Client] Connection failed:', error);
      this.isConnecting = false;
      this.notifyConnectionChange('error');
      this.scheduleReconnect();
    }
  }

  /**
   * Setup WebSocket event handlers
   */
  setupEventHandlers() {
    this.ws.onopen = () => {
      console.log('[Proxy Client] ✅ Connected to WebSocket proxy');
      this.isConnected = true;
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this.notifyConnectionChange('connected');

      // Start heartbeat
      this.startHeartbeat();
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error('[Proxy Client] Failed to parse message:', error, event.data);
      }
    };

    this.ws.onerror = (error) => {
      console.error('[Proxy Client] ❌ WebSocket error:', error);
      this.notifyConnectionChange('error');
    };

    this.ws.onclose = (event) => {
      console.log('[Proxy Client] Connection closed');
      console.log('[Proxy Client] Close code:', event.code);
      console.log('[Proxy Client] Close reason:', event.reason || 'No reason provided');

      this.isConnected = false;
      this.isAuthenticated = false;
      this.cleanup();
      this.notifyConnectionChange('disconnected');

      // Don't reconnect if it was intentional (code 1000)
      if (event.code !== 1000) {
        this.scheduleReconnect();
      }
    };
  }

  /**
   * Handle incoming messages from proxy
   */
  handleMessage(message) {
    console.log('[Proxy Client] Message:', message.type || 'unknown', message);

    switch (message.type) {
      case 'connected':
        // Proxy confirmed connection, now subscribe to symbols
        console.log('[Proxy Client] Proxy ready, subscribing to symbols...');
        this.subscribeToSymbols();
        break;

      case 'authenticated':
        // Successfully authenticated with Questrade
        console.log('[Proxy Client] ✅ Authenticated with Questrade!');
        this.isAuthenticated = true;
        this.notifyConnectionChange('authenticated');
        break;

      case 'quote':
        // Quote update from Questrade
        if (message.data && message.data.symbolId) {
          this.handleQuoteUpdate(message.data);
        }
        break;

      case 'error':
        // Error from proxy or Questrade
        console.error('[Proxy Client] ❌ Error:', message.error);
        this.notifyConnectionChange('error', message.error);
        break;

      case 'disconnected':
        // Questrade disconnected
        console.log('[Proxy Client] Questrade disconnected:', message.reason);
        this.isAuthenticated = false;
        this.notifyConnectionChange('disconnected');
        break;

      case 'pong':
        // Heartbeat response
        console.log('[Proxy Client] 💓 Heartbeat acknowledged');
        break;

      default:
        console.warn('[Proxy Client] Unknown message type:', message.type);
    }
  }

  /**
   * Subscribe to symbols via the proxy
   */
  subscribeToSymbols() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[Proxy Client] Cannot subscribe - connection not open');
      return;
    }

    const subscribeMessage = {
      type: 'subscribe',
      symbols: this.symbols,
      personName: this.personName
    };

    console.log('[Proxy Client] Sending subscription request:', subscribeMessage);
    this.ws.send(JSON.stringify(subscribeMessage));
  }

  /**
   * Handle quote update
   */
  handleQuoteUpdate(quote) {
    console.log(`[Proxy Client] 📊 Quote: symbolId=${quote.symbolId}, price=${quote.lastTradePrice}`);

    // Call user's callback
    if (this.onQuoteUpdate) {
      this.onQuoteUpdate(quote);
    }
  }

  /**
   * Start heartbeat to keep connection alive
   */
  startHeartbeat() {
    // Clear existing heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Send heartbeat every 25 minutes
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        console.log('[Proxy Client] 💓 Sending heartbeat...');
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25 * 60 * 1000);

    console.log('[Proxy Client] 💓 Heartbeat started (every 25 minutes)');
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Proxy Client] ❌ Max reconnect attempts reached');
      this.notifyConnectionChange('failed');
      return;
    }

    // Exponential backoff: 5s, 10s, 20s, 40s, 80s
    const delay = Math.min(5000 * Math.pow(2, this.reconnectAttempts), 80000);
    this.reconnectAttempts++;

    console.log(`[Proxy Client] 🔄 Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    this.notifyConnectionChange('reconnecting', `Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);

    this.reconnectTimer = setTimeout(() => {
      this.connect(this.symbols, this.onQuoteUpdate, this.onConnectionChange);
    }, delay);
  }

  /**
   * Notify connection status change
   */
  notifyConnectionChange(status, details = null) {
    if (this.onConnectionChange) {
      this.onConnectionChange(status, details);
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

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.isConnecting = false;
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect() {
    console.log('[Proxy Client] Disconnecting...');

    this.cleanup();

    if (this.ws) {
      // Send unsubscribe message before closing
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'unsubscribe' }));
      }

      this.ws.close(1000, 'Intentional disconnect');
      this.ws = null;
    }

    this.isConnected = false;
    this.isAuthenticated = false;
    this.reconnectAttempts = 0;
    this.notifyConnectionChange('disconnected');
  }

  /**
   * Check if currently connected and authenticated
   */
  getConnectionStatus() {
    return {
      connected: this.isConnected,
      authenticated: this.isAuthenticated,
      connecting: this.isConnecting,
      symbolCount: this.symbols.length,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}

// Export singleton instance
export default new QuestradeWebSocketProxyClient();
