// src/models/DividendOverride.js - Manual dividend data overrides
const mongoose = require('mongoose');

const dividendOverrideSchema = new mongoose.Schema({
    personName: {
        type: String,
        required: true,
        index: true
    },
    symbol: {
        type: String,
        required: true,
        uppercase: true,
        index: true
    },
    // Manual dividend settings
    dividendFrequency: {
        type: String,
        enum: ['monthly', 'semi-monthly', 'quarterly', 'semi-annual', 'annual', 'none', 'unknown'],
        default: 'monthly'
    },
    monthlyDividendPerShare: {
        type: Number,
        default: 0
    },
    // Metadata
    overriddenBy: {
        type: String,
        default: 'user'
    },
    overriddenAt: {
        type: Date,
        default: Date.now
    },
    notes: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

// Compound index for fast lookups
dividendOverrideSchema.index({ personName: 1, symbol: 1 }, { unique: true });

// Static methods
dividendOverrideSchema.statics.getOverride = async function(personName, symbol) {
    return await this.findOne({
        personName,
        symbol: symbol.toUpperCase()
    });
};

dividendOverrideSchema.statics.getOverridesForPerson = async function(personName) {
    return await this.find({ personName }).sort({ symbol: 1 });
};

dividendOverrideSchema.statics.setOverride = async function(personName, symbol, data) {
    const override = await this.findOneAndUpdate(
        {
            personName,
            symbol: symbol.toUpperCase()
        },
        {
            $set: {
                ...data,
                overriddenAt: new Date()
            }
        },
        {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true
        }
    );

    return override;
};

dividendOverrideSchema.statics.removeOverride = async function(personName, symbol) {
    return await this.findOneAndDelete({
        personName,
        symbol: symbol.toUpperCase()
    });
};

dividendOverrideSchema.statics.hasOverride = async function(personName, symbol) {
    const count = await this.countDocuments({
        personName,
        symbol: symbol.toUpperCase()
    });
    return count > 0;
};

module.exports = mongoose.model('DividendOverride', dividendOverrideSchema);
