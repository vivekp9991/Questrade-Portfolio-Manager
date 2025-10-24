const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');

const config = require('./config/environment');
const database = require('./config/database');
const logger = require('./utils/logger');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const scheduledSync = require('./jobs/scheduledSync');
const marketHours = require('./utils/marketHours');
const questradeClient = require('./services/questradeClient');

// Import routes
const healthRoutes = require('./routes/health');
const syncRoutes = require('./routes/sync');
const accountsRoutes = require('./routes/accounts');
const positionsRoutes = require('./routes/positions');
const activitiesRoutes = require('./routes/activities');
const statsRoutes = require('./routes/stats');
const dividendsRoutes = require('./routes/dividends');
const balancesRoutes = require('./routes/balances');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors(config.cors));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

app.use('/api/', limiter);

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
  const dbHealth = await database.healthCheck();
  
  res.json({
    success: true,
    service: 'questrade-sync-api',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbHealth,
    syncEnabled: config.sync.enableAutoSync,
    syncInterval: config.sync.intervalMinutes
  });
});

// API routes
app.use('/api/health', healthRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/positions', positionsRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/dividends', dividendsRoutes);
app.use('/api/balances', balancesRoutes);

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    service: 'Questrade Sync API',
    version: '1.0.0',
    description: 'Data Synchronization Service',
    endpoints: {
      sync: {
        'POST /api/sync/all': 'Sync all data for all persons',
        'POST /api/sync/person/:personName': 'Sync specific person',
        'POST /api/sync/accounts/:personName': 'Sync accounts only',
        'POST /api/sync/positions/:personName': 'Sync positions only',
        'POST /api/sync/activities/:personName': 'Sync activities only',
        'GET /api/sync/status': 'Get current sync status',
        'GET /api/sync/history': 'Get sync history'
      },
      accounts: {
        'GET /api/accounts': 'List all accounts',
        'GET /api/accounts/:personName': 'Get person accounts',
        'GET /api/accounts/detail/:accountId': 'Get account details',
        'GET /api/accounts/summary/:personName': 'Get account summary',
        'GET /api/accounts/dropdown-options': 'Get accounts dropdown options (for UI)'
      },
      positions: {
        'GET /api/positions': 'List all positions',
        'GET /api/positions/:accountId': 'Get account positions'
      },
      activities: {
        'GET /api/activities': 'List all activities',
        'GET /api/activities/:accountId': 'Get account activities'
      },
      stats: {
        'GET /api/stats/sync': 'Sync statistics',
        'GET /api/stats/data': 'Data statistics',
        'GET /api/stats/errors': 'Error statistics'
      }
    }
  });
});

// 404 handler
app.use(notFound);

// Error handling middleware
app.use(errorHandler);

// Start server
async function startServer() {
  try {
    // Connect to database
    await database.connect();
    
    // Initialize market-aware scheduled sync if enabled
    if (config.sync.enableAutoSync) {
      logger.info('🔄 Initializing market-aware sync scheduler...');

      // Inject Questrade client for accurate server time
      // Get first active person from Auth API
      try {
        const axios = require('axios');
        const authResponse = await axios.get(`${config.authApi.url}/persons`);
        const activePerson = authResponse.data.data?.find(p => p.isActive);
        if (activePerson) {
          marketHours.setQuestradeClient(questradeClient, activePerson.personName);
          logger.info(`[MARKET] Using Questrade server time for ${activePerson.personName}`);
        } else {
          logger.warn('[MARKET] No active person found, using WorldTimeAPI only');
        }
      } catch (error) {
        logger.warn('[MARKET] Failed to get active person, using WorldTimeAPI only:', error.message);
      }

      // Check every minute if we should sync
      cron.schedule('* * * * *', async () => {
        try {
          const isWeekend = await marketHours.isWeekend();
          const isMarketOpen = await marketHours.isMarketOpen();
          const now = await marketHours.getCurrentEasternTime();
          const minute = now.getMinutes();

          let shouldSync = false;
          let reason = '';

          if (isWeekend) {
            // Weekend: Sync at 9 AM and 9 PM ET
            const hour = now.getHours();
            if ((hour === 9 || hour === 21) && minute === 0) {
              shouldSync = true;
              reason = `Weekend sync at ${hour === 9 ? '9 AM' : '9 PM'} ET`;
            }
          } else if (isMarketOpen) {
            // Market hours: Every 15 minutes
            if (minute % 15 === 0) {
              shouldSync = true;
              reason = 'Market hours sync (every 15 min)';
            }
          } else {
            // After hours on weekdays: Every 1 hour
            if (minute === 0) {
              shouldSync = true;
              reason = 'After-hours sync (every hour)';
            }
          }

          if (shouldSync) {
            logger.info(`📊 Starting scheduled sync: ${reason}`);
            await scheduledSync.runScheduledSync();
          }
        } catch (error) {
          logger.error('Scheduled sync check failed:', error);
        }
      });

      // Log the sync schedule
      const isWeekend = await marketHours.isWeekend();
      if (isWeekend) {
        const nextSync = await marketHours.getNextWeekendSyncTime();
        logger.info(`📅 Weekend mode: Sync at 9 AM and 9 PM ET. ${nextSync}`);
      } else {
        const isOpen = await marketHours.isMarketOpen();
        if (isOpen) {
          logger.info(`📈 Market hours: Syncing every 15 minutes`);
        } else {
          logger.info(`🌙 After hours: Syncing every 1 hour`);
        }
      }
    }
    
    // Start server
    const PORT = config.server.port;
    const server = app.listen(PORT, () => {
      logger.info(`🚀 Questrade Sync API running on port ${PORT}`);
      logger.info(`📊 Environment: ${config.server.environment}`);
      logger.info(`🔗 API available at: http://localhost:${PORT}/api`);
      logger.info(`🔄 Auto-sync: ${config.sync.enableAutoSync ? 'Enabled' : 'Disabled'}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => gracefulShutdown(server));
    process.on('SIGINT', () => gracefulShutdown(server));
    
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Graceful shutdown handler
async function gracefulShutdown(server) {
  logger.info('Received shutdown signal, shutting down gracefully...');
  
  server.close(async () => {
    logger.info('HTTP server closed');
    
    try {
      await database.disconnect();
      logger.info('Database connection closed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  });
  
  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start the server
startServer();

module.exports = app;