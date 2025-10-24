// src/services/questradeWebSocketProxy.js - Questrade WebSocket Proxy Service
const WebSocket = require('ws');
const axios = require('axios');
const logger = require('../utils/logger');

const AUTH_API_URL = process.env.AUTH_API_URL || 'http://localhost:4001';
const MARKET_API_URL = process.env.MARKET_API_URL || 'http://localhost:4004';

class QuestradeWebSocketProxy {
  constructor() {
    this.clients = new Map(); // clientId -> { ws, questradeWs, symbolIds, symbols, personName }
  }

  /**
   * Handle new client connection from browser
   */
  async handleClientConnection(clientWs, request) {
    const clientId = this.generateClientId();
    logger.info(`[Proxy] New client connected: ${clientId}`);

    // Store client info
    this.clients.set(clientId, {
      ws: clientWs,
      questradeWs: null,
      symbolIds: [],
      symbols: [],
      personName: 'Vivek', // Default, can be sent by client later
      isAuthenticated: false
    });

    // Handle messages from browser client
    clientWs.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        await this.handleClientMessage(clientId, data);
      } catch (error) {
        logger.error(`[Proxy] Failed to parse client message:`, error);
        this.sendToClient(clientId, { error: 'Invalid message format' });
      }
    });

    // Handle client disconnect
    clientWs.on('close', () => {
      logger.info(`[Proxy] Client disconnected: ${clientId}`);
      this.disconnectClient(clientId);
    });

    // Handle client errors
    clientWs.on('error', (error) => {
      logger.error(`[Proxy] Client WebSocket error:`, error);
    });

    // Send welcome message
    this.sendToClient(clientId, {
      type: 'connected',
      clientId,
      message: 'Connected to Questrade WebSocket Proxy'
    });
  }

  /**
   * Handle messages from browser client
   */
  async handleClientMessage(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client) return;

    logger.debug(`[Proxy] Client ${clientId} message:`, data);

    switch (data.type) {
      case 'subscribe':
        // Client wants to subscribe to symbols
        await this.subscribeToSymbols(clientId, data.symbols, data.personName || 'Vivek');
        break;

      case 'unsubscribe':
        // Client wants to unsubscribe
        this.disconnectFromQuestrade(clientId);
        break;

      case 'ping':
        // Heartbeat from client
        this.sendToClient(clientId, { type: 'pong' });
        break;

      default:
        logger.warn(`[Proxy] Unknown message type: ${data.type}`);
        this.sendToClient(clientId, { error: 'Unknown message type' });
    }
  }

  /**
   * Subscribe to symbols by connecting to Questrade WebSocket
   */
  async subscribeToSymbols(clientId, symbols, personName = 'Vivek') {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      logger.info(`[Proxy] Client ${clientId} subscribing to ${symbols.length} symbols`);

      // Update client info
      client.symbols = symbols;
      client.personName = personName;

      // Step 1: Get access token from Auth API
      const tokenData = await this.getAccessToken(personName);
      logger.info(`[Proxy] Got access token for ${personName}`);

      // Step 2: Get symbol IDs from Market API
      const symbolIds = await this.getSymbolIds(symbols);
      logger.info(`[Proxy] Got ${symbolIds.length} symbol IDs`);

      if (symbolIds.length === 0) {
        throw new Error('No valid symbol IDs found');
      }

      client.symbolIds = symbolIds;

      // Step 3: Connect to Questrade WebSocket
      await this.connectToQuestrade(clientId, tokenData, symbolIds);

    } catch (error) {
      logger.error(`[Proxy] Failed to subscribe:`, error);
      this.sendToClient(clientId, {
        type: 'error',
        error: error.message
      });
    }
  }

  /**
   * Get access token from Auth API
   */
  async getAccessToken(personName) {
    try {
      const response = await axios.get(`${AUTH_API_URL}/api/auth/access-token/${personName}`);

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to get access token');
      }

      return {
        accessToken: response.data.data.accessToken,
        apiServer: response.data.data.apiServer,
        expiresAt: response.data.data.expiresAt
      };
    } catch (error) {
      logger.error(`[Proxy] Failed to get access token:`, error.message);
      throw error;
    }
  }

  /**
   * Get symbol IDs from Market API
   */
  async getSymbolIds(symbols) {
    try {
      const response = await axios.post(`${MARKET_API_URL}/api/symbols/lookup`, {
        symbols
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to lookup symbols');
      }

      const symbolIds = [];
      const symbolIdMap = {};

      Object.entries(response.data.data).forEach(([symbol, info]) => {
        if (info.symbolId) {
          symbolIds.push(info.symbolId);
          symbolIdMap[info.symbolId] = symbol;
        }
      });

      return symbolIds;
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || 'Unknown error';
      const errorStatus = error.response?.status;
      logger.error(`[Proxy] Failed to get symbol IDs: ${errorMessage}`, { status: errorStatus });
      throw new Error(errorMessage);
    }
  }

  /**
   * Connect to Questrade WebSocket
   */
  async connectToQuestrade(clientId, tokenData, symbolIds) {
    const client = this.clients.get(clientId);
    if (!client) return;

    return new Promise((resolve, reject) => {
      // Build WebSocket URL
      // Note: Trying without mode parameter - Questrade may reject certain modes from server-side
      const wsServer = tokenData.apiServer.replace('https://', 'wss://').replace('http://', 'ws://');
      const idsParam = symbolIds.join(',');
      const wsUrl = `${wsServer}/v1/markets/quotes/${idsParam}`;

      logger.info(`[Proxy] Connecting to Questrade: ${wsUrl}`);

      // Create WebSocket connection to Questrade with proper options
      const questradeWs = new WebSocket(wsUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Origin': 'http://localhost:5173',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        rejectUnauthorized: false // Allow self-signed certificates
      });
      client.questradeWs = questradeWs;

      // Handle connection open
      questradeWs.on('open', () => {
        logger.info(`[Proxy] Connected to Questrade WebSocket`);

        // Send access token for authentication
        questradeWs.send(tokenData.accessToken);
        logger.debug(`[Proxy] Sent access token to Questrade`);
      });

      // Handle messages from Questrade
      questradeWs.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleQuestradeMessage(clientId, data, symbolIds);

          // Resolve promise on successful authentication
          if (data.success === true && !client.isAuthenticated) {
            client.isAuthenticated = true;
            resolve();
          }
        } catch (error) {
          logger.error(`[Proxy] Failed to parse Questrade message:`, error);
        }
      });

      // Handle Questrade errors
      questradeWs.on('error', (error) => {
        logger.error(`[Proxy] Questrade WebSocket error:`, error);
        this.sendToClient(clientId, {
          type: 'error',
          error: 'Questrade connection error'
        });
        reject(error);
      });

      // Handle Questrade disconnect
      questradeWs.on('close', (code, reason) => {
        logger.info(`[Proxy] Questrade WebSocket closed: ${code} ${reason}`);
        client.isAuthenticated = false;
        this.sendToClient(clientId, {
          type: 'disconnected',
          reason: 'Questrade connection closed'
        });
      });
    });
  }

  /**
   * Handle messages from Questrade WebSocket
   */
  handleQuestradeMessage(clientId, data, symbolIds) {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Authentication response
    if (data.success === true) {
      logger.info(`[Proxy] Questrade authenticated successfully`);

      // Subscribe to symbols
      const subscribeMessage = {
        mode: 'streaming',
        ids: symbolIds
      };
      client.questradeWs.send(JSON.stringify(subscribeMessage));
      logger.info(`[Proxy] Sent subscription request for ${symbolIds.length} symbols`);

      // Notify client
      this.sendToClient(clientId, {
        type: 'authenticated',
        message: 'Successfully connected to Questrade'
      });

      return;
    }

    // Error response
    if (data.error) {
      logger.error(`[Proxy] Questrade error:`, data.error);
      this.sendToClient(clientId, {
        type: 'error',
        error: data.error
      });
      return;
    }

    // Quote update
    if (data.symbolId !== undefined) {
      logger.debug(`[Proxy] Quote update: symbolId=${data.symbolId}, price=${data.lastTradePrice}`);

      // Forward quote to client
      this.sendToClient(clientId, {
        type: 'quote',
        data: data
      });
    }
  }

  /**
   * Disconnect from Questrade WebSocket
   */
  disconnectFromQuestrade(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;

    if (client.questradeWs) {
      logger.info(`[Proxy] Disconnecting client ${clientId} from Questrade`);
      client.questradeWs.close(1000, 'Client requested disconnect');
      client.questradeWs = null;
      client.isAuthenticated = false;
    }
  }

  /**
   * Disconnect client completely
   */
  disconnectClient(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Close Questrade connection
    this.disconnectFromQuestrade(clientId);

    // Remove client
    this.clients.delete(clientId);
    logger.info(`[Proxy] Client ${clientId} removed`);
  }

  /**
   * Send message to browser client
   */
  sendToClient(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client || !client.ws) return;

    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Generate unique client ID
   */
  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get proxy statistics
   */
  getStats() {
    return {
      totalClients: this.clients.size,
      authenticatedClients: Array.from(this.clients.values()).filter(c => c.isAuthenticated).length,
      clients: Array.from(this.clients.entries()).map(([id, client]) => ({
        id,
        authenticated: client.isAuthenticated,
        symbolCount: client.symbolIds.length,
        personName: client.personName
      }))
    };
  }
}

// Export singleton instance
module.exports = new QuestradeWebSocketProxy();
