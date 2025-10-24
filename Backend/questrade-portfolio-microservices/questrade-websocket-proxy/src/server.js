// src/server.js - WebSocket Proxy Server
require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const helmet = require('helmet');
const logger = require('./utils/logger');
const questradeWebSocketProxy = require('./services/questradeWebSocketProxy');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'questrade-websocket-proxy',
    status: 'healthy',
    uptime: process.uptime(),
    stats: questradeWebSocketProxy.getStats()
  });
});

// Stats endpoint
app.get('/api/stats', (req, res) => {
  res.json({
    success: true,
    data: questradeWebSocketProxy.getStats()
  });
});

// Create WebSocket server
const wss = new WebSocket.Server({
  server,
  path: '/ws/quotes'
});

// Handle WebSocket connections
wss.on('connection', (ws, request) => {
  const clientIp = request.socket.remoteAddress;
  logger.info(`[Server] New WebSocket connection from ${clientIp}`);

  // Pass connection to proxy service
  questradeWebSocketProxy.handleClientConnection(ws, request);
});

// Handle WebSocket server errors
wss.on('error', (error) => {
  logger.error('[Server] WebSocket server error:', error);
});

// Start server
const PORT = process.env.PORT || 4005;
server.listen(PORT, () => {
  logger.info(`🚀 Questrade WebSocket Proxy running on port ${PORT}`);
  logger.info(`   WebSocket endpoint: ws://localhost:${PORT}/ws/quotes`);
  logger.info(`   Health check: http://localhost:${PORT}/health`);
  logger.info(`   Stats: http://localhost:${PORT}/api/stats`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, closing server...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, closing server...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});
