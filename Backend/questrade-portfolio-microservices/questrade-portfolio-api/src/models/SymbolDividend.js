// src/models/SymbolDividend.js - Universal dividend data per symbol
const mongoose = require('mongoose');

const symbolDividendSchema = new mongoose.Schema({
    symbol: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true,
        index: true
    },

    // Dividend payment details
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

    // Payment dates (optional - for tracking)
    lastPaymentDate: {
        type: Date,
        default: null
    },

    nextPaymentDate: {
        type: Date,
        default: null
    },

    // Override tracking
    isManualOverride: {
        type: Boolean,
        default: false
    },

    lastModifiedBy: {
        type: String,
        default: 'system'
    },

    lastModifiedAt: {
        type: Date,
        default: Date.now
    },

    // Additional info
    notes: {
        type: String,
        default: ''
    },

    // Source of data
    dataSource: {
        type: String,
        enum: ['questrade', 'manual', 'calculated'],
        default: 'calculated'
    }
}, {
    timestamps: true
});

// Indexes
symbolDividendSchema.index({ symbol: 1 }, { unique: true });
symbolDividendSchema.index({ isManualOverride: 1 });
symbolDividendSchema.index({ dividendFrequency: 1 });

// Update timestamp on save
symbolDividendSchema.pre('save', function(next) {
    this.lastModifiedAt = new Date();
    next();
});

// Static method to get dividend data for a symbol
symbolDividendSchema.statics.getDividendData = async function(symbol) {
    return await this.findOne({ symbol: symbol.toUpperCase() });
};

// Static method to get all symbols with dividends
symbolDividendSchema.statics.getAllDividendSymbols = async function() {
    return await this.find({}).sort({ symbol: 1 });
};

// Static method to get symbols with manual overrides
symbolDividendSchema.statics.getManualOverrides = async function() {
    return await this.find({ isManualOverride: true }).sort({ symbol: 1 });
};

// Static method to set/update dividend data
symbolDividendSchema.statics.setDividendData = async function(symbol, data, modifiedBy = 'user') {
    const updateData = {
        ...data,
        lastModifiedBy: modifiedBy,
        lastModifiedAt: new Date()
    };

    // If manually setting, mark as override
    if (modifiedBy === 'user') {
        updateData.isManualOverride = true;
        updateData.dataSource = 'manual';
    }

    const dividend = await this.findOneAndUpdate(
        { symbol: symbol.toUpperCase() },
        { $set: updateData },
        {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true
        }
    );

    return dividend;
};

// Static method to remove dividend data
symbolDividendSchema.statics.removeDividendData = async function(symbol) {
    return await this.findOneAndDelete({ symbol: symbol.toUpperCase() });
};

// Static method to bulk update dividends
symbolDividendSchema.statics.bulkUpdateDividends = async function(dividends, modifiedBy = 'user') {
    const operations = dividends.map(div => ({
        updateOne: {
            filter: { symbol: div.symbol.toUpperCase() },
            update: {
                $set: {
                    ...div,
                    lastModifiedBy: modifiedBy,
                    lastModifiedAt: new Date(),
                    isManualOverride: modifiedBy === 'user',
                    dataSource: modifiedBy === 'user' ? 'manual' : 'calculated'
                }
            },
            upsert: true
        }
    }));

    return await this.bulkWrite(operations);
};

// Static method to sync from Questrade (only if not manually overridden)
symbolDividendSchema.statics.syncFromQuestrade = async function(symbol, questradeData) {
    const existing = await this.findOne({ symbol: symbol.toUpperCase() });

    // Don't overwrite manual overrides
    if (existing && existing.isManualOverride) {
        return existing;
    }

    return await this.findOneAndUpdate(
        { symbol: symbol.toUpperCase() },
        {
            $set: {
                dividendFrequency: questradeData.dividendFrequency || 'monthly',
                monthlyDividendPerShare: questradeData.monthlyDividendPerShare || 0,
                lastPaymentDate: questradeData.lastPaymentDate || null,
                dataSource: 'questrade',
                lastModifiedBy: 'questrade-sync',
                lastModifiedAt: new Date()
            }
        },
        {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true
        }
    );
};

module.exports = mongoose.model('SymbolDividend', symbolDividendSchema);
