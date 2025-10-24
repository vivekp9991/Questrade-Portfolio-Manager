#!/usr/bin/env node
/**
 * Sync Symbol Dividends Script
 *
 * This script syncs dividend data from Position collection (questrade-sync database)
 * to the centralized SymbolDividend collection (questrade-portfolio database).
 *
 * It extracts dividend frequency and monthly dividend per share from positions
 * and populates the SymbolDividend table for use across the application.
 *
 * Usage:
 *   node src/scripts/syncSymbolDividends.js
 */

const mongoose = require('mongoose');
const config = require('../config/environment');
const logger = require('../utils/logger');

// Connect to database
async function connectDatabase() {
  try {
    // Connection to questrade_portfolio database (both Position and SymbolDividend are in same DB)
    const dbUri = config.database.uri || 'mongodb://localhost:27017/questrade_portfolio';
    await mongoose.connect(dbUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    logger.info('[SYMBOL-DIVIDEND-SYNC] Connected to database');

    return mongoose.connection;
  } catch (error) {
    logger.error('[SYMBOL-DIVIDEND-SYNC] Database connection failed:', error);
    throw error;
  }
}

// Define Position schema
const PositionSchema = new mongoose.Schema({
  symbol: String,
  personName: String,
  accountId: String,
  openQuantity: Number,
  isDividendStock: Boolean,
  dividendData: {
    totalReceived: Number,
    monthlyDividendPerShare: Number,
    annualDividend: Number,
    annualDividendPerShare: Number,
    yieldOnCost: Number,
    currentYield: Number,
    dividendHistory: Array,
    dividendFrequency: Number,
    lastDividendAmount: Number,
    lastDividendDate: Date
  },
  isManualOverride: Boolean
}, { timestamps: true });

// Define SymbolDividend schema
const SymbolDividendSchema = new mongoose.Schema({
  symbol: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  dividendFrequency: {
    type: String,
    enum: ['monthly', 'semi-monthly', 'quarterly', 'semi-annual', 'annual', 'none'],
    default: 'monthly'
  },
  monthlyDividendPerShare: {
    type: Number,
    default: 0,
    min: 0
  },
  isManualOverride: {
    type: Boolean,
    default: false
  },
  dataSource: {
    type: String,
    enum: ['calculated', 'questrade', 'manual', 'auto-sync'],
    default: 'auto-sync'
  },
  lastModifiedBy: {
    type: String,
    default: 'system'
  },
  lastModifiedAt: {
    type: Date,
    default: Date.now
  },
  notes: String
}, { timestamps: true });

async function syncSymbolDividends() {
  try {
    // Connect to database
    const db = await connectDatabase();

    // Get models (both are in the same database)
    const Position = db.model('Position', PositionSchema);
    const SymbolDividend = db.model('SymbolDividend', SymbolDividendSchema);

    logger.info('[SYMBOL-DIVIDEND-SYNC] Starting sync process...');

    // Get all dividend-paying positions
    const positions = await Position.find({
      isDividendStock: true,
      'dividendData.monthlyDividendPerShare': { $gt: 0 }
    });

    logger.info(`[SYMBOL-DIVIDEND-SYNC] Found ${positions.length} dividend-paying positions`);

    // Group by symbol (take the first occurrence of each symbol)
    const symbolMap = new Map();

    for (const position of positions) {
      if (!symbolMap.has(position.symbol)) {
        symbolMap.set(position.symbol, position);
      }
    }

    logger.info(`[SYMBOL-DIVIDEND-SYNC] Processing ${symbolMap.size} unique symbols`);

    // Map numeric frequency to string
    const frequencyMap = {
      12: 'monthly',
      24: 'semi-monthly',
      4: 'quarterly',
      2: 'semi-annual',
      1: 'annual',
      0: 'none'
    };

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    // Process each symbol
    for (const [symbol, position] of symbolMap.entries()) {
      try {
        const monthlyDivPerShare = position.dividendData?.monthlyDividendPerShare || 0;
        const dividendFrequency = position.dividendData?.dividendFrequency || 12;
        const frequencyString = frequencyMap[dividendFrequency] || 'monthly';

        // Check if symbol already exists
        const existing = await SymbolDividend.findOne({ symbol: symbol.toUpperCase() });

        if (existing && existing.isManualOverride) {
          // Skip manual overrides - don't overwrite user's manual settings
          logger.debug(`[SYMBOL-DIVIDEND-SYNC] ⚠️  Skipping ${symbol} - manual override exists`);
          skippedCount++;
          continue;
        }

        // Upsert the symbol dividend data
        const result = await SymbolDividend.updateOne(
          { symbol: symbol.toUpperCase() },
          {
            $set: {
              dividendFrequency: frequencyString,
              monthlyDividendPerShare: monthlyDivPerShare,
              dataSource: 'auto-sync',
              lastModifiedBy: 'system',
              lastModifiedAt: new Date()
            },
            $setOnInsert: {
              isManualOverride: false,
              createdAt: new Date()
            }
          },
          { upsert: true }
        );

        if (result.upsertedCount > 0) {
          createdCount++;
          logger.debug(`[SYMBOL-DIVIDEND-SYNC] ✅ Created ${symbol}: ${frequencyString}, $${monthlyDivPerShare}/month`);
        } else if (result.modifiedCount > 0) {
          updatedCount++;
          logger.debug(`[SYMBOL-DIVIDEND-SYNC] 🔄 Updated ${symbol}: ${frequencyString}, $${monthlyDivPerShare}/month`);
        }

      } catch (error) {
        logger.error(`[SYMBOL-DIVIDEND-SYNC] ❌ Failed to process ${symbol}:`, error.message);
      }
    }

    logger.info('[SYMBOL-DIVIDEND-SYNC] ====== Sync Complete ======');
    logger.info(`[SYMBOL-DIVIDEND-SYNC] Created: ${createdCount}`);
    logger.info(`[SYMBOL-DIVIDEND-SYNC] Updated: ${updatedCount}`);
    logger.info(`[SYMBOL-DIVIDEND-SYNC] Skipped (manual overrides): ${skippedCount}`);
    logger.info(`[SYMBOL-DIVIDEND-SYNC] Total: ${symbolMap.size}`);
    logger.info('[SYMBOL-DIVIDEND-SYNC] ===========================');

  } catch (error) {
    logger.error('[SYMBOL-DIVIDEND-SYNC] Sync failed:', error);
    throw error;
  } finally {
    // Close database connections
    await mongoose.connection.close();
    logger.info('[SYMBOL-DIVIDEND-SYNC] Database connections closed');
  }
}

// Run the sync
if (require.main === module) {
  syncSymbolDividends()
    .then(() => {
      logger.info('[SYMBOL-DIVIDEND-SYNC] Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('[SYMBOL-DIVIDEND-SYNC] Script failed:', error);
      process.exit(1);
    });
}

module.exports = syncSymbolDividends;
