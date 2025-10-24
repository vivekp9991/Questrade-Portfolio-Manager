// src/routes/dividendOverride.js - Manual dividend override management
const express = require('express');
const router = express.Router();
const DividendOverride = require('../models/DividendOverride');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');

// Get all dividend overrides for a person
router.get('/person/:personName', asyncHandler(async (req, res) => {
    const { personName } = req.params;

    logger.info(`[DIVIDEND-OVERRIDE] GET /person/${personName} - Fetching dividend overrides`);

    const overrides = await DividendOverride.getOverridesForPerson(personName);

    res.json({
        success: true,
        personName,
        count: overrides.length,
        data: overrides
    });
}));

// Get override for a specific symbol
router.get('/person/:personName/:symbol', asyncHandler(async (req, res) => {
    const { personName, symbol } = req.params;

    logger.info(`[DIVIDEND-OVERRIDE] GET /person/${personName}/${symbol} - Fetching override`);

    const override = await DividendOverride.getOverride(personName, symbol);

    if (!override) {
        return res.json({
            success: true,
            personName,
            symbol: symbol.toUpperCase(),
            hasOverride: false,
            data: null
        });
    }

    res.json({
        success: true,
        personName,
        symbol: symbol.toUpperCase(),
        hasOverride: true,
        data: override
    });
}));

// Set/Update dividend override
router.post('/person/:personName/:symbol', asyncHandler(async (req, res) => {
    const { personName, symbol } = req.params;
    const { dividendFrequency, monthlyDividendPerShare, notes } = req.body;

    if (dividendFrequency && !['monthly', 'semi-monthly', 'quarterly', 'semi-annual', 'annual', 'none', 'unknown'].includes(dividendFrequency)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid dividend frequency'
        });
    }

    logger.info(`[DIVIDEND-OVERRIDE] POST /person/${personName}/${symbol} - Setting override`, {
        dividendFrequency,
        monthlyDividendPerShare
    });

    const override = await DividendOverride.setOverride(personName, symbol, {
        dividendFrequency,
        monthlyDividendPerShare,
        notes
    });

    res.json({
        success: true,
        message: `Dividend override set for ${symbol}`,
        data: override
    });
}));

// Delete dividend override
router.delete('/person/:personName/:symbol', asyncHandler(async (req, res) => {
    const { personName, symbol } = req.params;

    logger.info(`[DIVIDEND-OVERRIDE] DELETE /person/${personName}/${symbol} - Removing override`);

    const deleted = await DividendOverride.removeOverride(personName, symbol);

    if (!deleted) {
        return res.status(404).json({
            success: false,
            error: `No override found for ${symbol}`
        });
    }

    res.json({
        success: true,
        message: `Dividend override removed for ${symbol}`,
        data: deleted
    });
}));

// Bulk update overrides
router.post('/person/:personName/bulk', asyncHandler(async (req, res) => {
    const { personName } = req.params;
    const { overrides } = req.body;

    if (!Array.isArray(overrides) || overrides.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'Overrides array is required'
        });
    }

    logger.info(`[DIVIDEND-OVERRIDE] POST /person/${personName}/bulk - Updating ${overrides.length} overrides`);

    const results = [];
    const errors = [];

    for (const item of overrides) {
        try {
            const override = await DividendOverride.setOverride(personName, item.symbol, item);
            results.push(override);
        } catch (error) {
            errors.push({
                symbol: item.symbol,
                error: error.message
            });
        }
    }

    res.json({
        success: true,
        message: `Processed ${overrides.length} overrides`,
        updated: results.length,
        failed: errors.length,
        data: results,
        errors: errors.length > 0 ? errors : undefined
    });
}));

module.exports = router;

