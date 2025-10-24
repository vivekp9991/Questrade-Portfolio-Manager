#!/usr/bin/env node
/**
 * Cleanup Symbol Dividends Script
 *
 * Removes SymbolDividend entries with monthlyDividendPerShare = 0
 * so that dividend sync can recalculate them properly
 */

const mongoose = require('mongoose');
const config = require('../config/environment');
const logger = require('../utils/logger');

async function cleanup() {
  try {
    // Connect to database
    const dbUri = config.database.uri || 'mongodb://localhost:27017/questrade_portfolio';
    await mongoose.connect(dbUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    logger.info('[CLEANUP] Connected to database');

    // Delete all SymbolDividend entries with monthlyDividendPerShare = 0
    const result = await mongoose.connection.db.collection('symboldividends').deleteMany({
      monthlyDividendPerShare: 0
    });

    logger.info(`[CLEANUP] Deleted ${result.deletedCount} SymbolDividend entries with monthlyDividendPerShare = 0`);

    await mongoose.connection.close();
    logger.info('[CLEANUP] Database connection closed');

    return result.deletedCount;
  } catch (error) {
    logger.error('[CLEANUP] Failed:', error);
    throw error;
  }
}

if (require.main === module) {
  cleanup()
    .then((count) => {
      logger.info(`[CLEANUP] Successfully deleted ${count} entries`);
      process.exit(0);
    })
    .catch((error) => {
      logger.error('[CLEANUP] Script failed:', error);
      process.exit(1);
    });
}

module.exports = cleanup;
