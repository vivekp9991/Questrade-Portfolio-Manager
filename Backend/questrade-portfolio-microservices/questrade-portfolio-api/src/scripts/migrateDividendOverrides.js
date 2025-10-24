// scripts/migrateDividendOverrides.js - Migrate person-specific dividend overrides to universal
const mongoose = require('mongoose');
const config = require('../config/environment');

// Old model (person-specific)
const DividendOverride = require('../models/DividendOverride');

// New model (universal)
const SymbolDividend = require('../models/SymbolDividend');

async function migrateDividendOverrides() {
    try {
        console.log('[MIGRATION] Starting dividend override migration...');
        console.log('[MIGRATION] Connecting to database...');

        await mongoose.connect(config.database.uri, config.database.options);
        console.log('[MIGRATION] Connected to database');

        // Get all person-specific overrides
        const oldOverrides = await DividendOverride.find({});
        console.log(`[MIGRATION] Found ${oldOverrides.length} person-specific dividend overrides`);

        if (oldOverrides.length === 0) {
            console.log('[MIGRATION] No overrides to migrate. Exiting.');
            process.exit(0);
        }

        // Group by symbol (take the most recent override for each symbol)
        const symbolMap = new Map();

        for (const override of oldOverrides) {
            const existing = symbolMap.get(override.symbol);

            if (!existing || override.overriddenAt > existing.overriddenAt) {
                symbolMap.set(override.symbol, {
                    symbol: override.symbol,
                    dividendFrequency: override.dividendFrequency,
                    monthlyDividendPerShare: override.monthlyDividendPerShare,
                    isManualOverride: true,
                    dataSource: 'manual',
                    lastModifiedBy: override.overriddenBy,
                    lastModifiedAt: override.overriddenAt,
                    notes: `Migrated from person-specific override (${override.personName})`
                });
            }
        }

        console.log(`[MIGRATION] Consolidated to ${symbolMap.size} unique symbols`);

        // Insert into new universal collection
        const migratedCount = [];
        const errors = [];

        for (const [symbol, data] of symbolMap.entries()) {
            try {
                await SymbolDividend.setDividendData(
                    symbol,
                    data,
                    data.lastModifiedBy
                );
                migratedCount.push(symbol);
                console.log(`[MIGRATION] ✓ Migrated ${symbol}`);
            } catch (error) {
                errors.push({ symbol, error: error.message });
                console.error(`[MIGRATION] ✗ Failed to migrate ${symbol}:`, error.message);
            }
        }

        console.log('\n[MIGRATION] Migration complete!');
        console.log(`[MIGRATION] Successfully migrated: ${migratedCount.length} symbols`);
        console.log(`[MIGRATION] Errors: ${errors.length}`);

        if (errors.length > 0) {
            console.log('\n[MIGRATION] Failed symbols:');
            errors.forEach(err => console.log(`  - ${err.symbol}: ${err.error}`));
        }

        console.log('\n[MIGRATION] Old person-specific overrides are still in the database.');
        console.log('[MIGRATION] You can safely delete them after verifying the migration.');
        console.log('[MIGRATION] To delete old overrides, run:');
        console.log('[MIGRATION]   db.dividendoverrides.deleteMany({})');

        process.exit(0);

    } catch (error) {
        console.error('[MIGRATION] Migration failed:', error);
        process.exit(1);
    }
}

// Run migration
migrateDividendOverrides();
