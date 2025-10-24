// src/routes/symbolDividend.js - Universal dividend data management
const express = require('express');
const router = express.Router();
const SymbolDividend = require('../models/SymbolDividend');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');

// Get all dividend data
router.get('/all', asyncHandler(async (req, res) => {
    logger.info('[SYMBOL-DIVIDEND] GET /all - Fetching all dividend data');

    const dividends = await SymbolDividend.getAllDividendSymbols();

    res.json({
        success: true,
        count: dividends.length,
        data: dividends
    });
}));

// Get dividend data for a specific symbol
router.get('/symbol/:symbol', asyncHandler(async (req, res) => {
    const { symbol } = req.params;

    logger.info(`[SYMBOL-DIVIDEND] GET /symbol/${symbol} - Fetching dividend data`);

    const dividend = await SymbolDividend.getDividendData(symbol);

    if (!dividend) {
        return res.status(404).json({
            success: false,
            error: `No dividend data found for ${symbol}`
        });
    }

    res.json({
        success: true,
        data: dividend
    });
}));

// Get symbols with manual overrides
router.get('/manual-overrides', asyncHandler(async (req, res) => {
    logger.info('[SYMBOL-DIVIDEND] GET /manual-overrides - Fetching manual overrides');

    const overrides = await SymbolDividend.getManualOverrides();

    res.json({
        success: true,
        count: overrides.length,
        data: overrides
    });
}));

// Set/Update dividend data for a symbol
router.post('/symbol/:symbol', asyncHandler(async (req, res) => {
    const { symbol } = req.params;
    const { dividendFrequency, monthlyDividendPerShare, notes } = req.body;

    logger.info(`[SYMBOL-DIVIDEND] POST /symbol/${symbol} - Setting dividend data`);

    // Validate frequency
    const validFrequencies = ['monthly', 'semi-monthly', 'quarterly', 'semi-annual', 'annual', 'none'];
    if (dividendFrequency && !validFrequencies.includes(dividendFrequency)) {
        return res.status(400).json({
            success: false,
            error: `Invalid dividend frequency. Must be one of: ${validFrequencies.join(', ')}`
        });
    }

    const dividend = await SymbolDividend.setDividendData(
        symbol,
        {
            dividendFrequency,
            monthlyDividendPerShare,
            notes
        },
        'user'
    );

    res.json({
        success: true,
        message: `Dividend data updated for ${symbol}`,
        data: dividend
    });
}));

// Bulk update dividend data
router.post('/bulk', asyncHandler(async (req, res) => {
    const { dividends } = req.body;

    if (!Array.isArray(dividends) || dividends.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'Dividends array is required and must not be empty'
        });
    }

    logger.info(`[SYMBOL-DIVIDEND] POST /bulk - Bulk updating ${dividends.length} dividends`);

    const result = await SymbolDividend.bulkUpdateDividends(dividends, 'user');

    res.json({
        success: true,
        message: `Bulk updated ${result.modifiedCount} dividend records`,
        data: {
            upsertedCount: result.upsertedCount,
            modifiedCount: result.modifiedCount,
            matchedCount: result.matchedCount
        }
    });
}));

// Delete dividend data for a symbol
router.delete('/symbol/:symbol', asyncHandler(async (req, res) => {
    const { symbol } = req.params;

    logger.info(`[SYMBOL-DIVIDEND] DELETE /symbol/${symbol} - Removing dividend data`);

    const deleted = await SymbolDividend.removeDividendData(symbol);

    if (!deleted) {
        return res.status(404).json({
            success: false,
            error: `No dividend data found for ${symbol}`
        });
    }

    res.json({
        success: true,
        message: `Dividend data removed for ${symbol}`,
        data: deleted
    });
}));

// Reset manual override (allow sync to update again)
router.post('/symbol/:symbol/reset-override', asyncHandler(async (req, res) => {
    const { symbol } = req.params;

    logger.info(`[SYMBOL-DIVIDEND] POST /symbol/${symbol}/reset-override - Resetting manual override`);

    const dividend = await SymbolDividend.findOneAndUpdate(
        { symbol: symbol.toUpperCase() },
        {
            $set: {
                isManualOverride: false,
                dataSource: 'calculated',
                lastModifiedBy: 'user',
                lastModifiedAt: new Date()
            }
        },
        { new: true }
    );

    if (!dividend) {
        return res.status(404).json({
            success: false,
            error: `No dividend data found for ${symbol}`
        });
    }

    res.json({
        success: true,
        message: `Manual override reset for ${symbol}. Sync can now update this symbol.`,
        data: dividend
    });
}));

module.exports = router;
