const mongoose = require('mongoose');

const yieldExclusionSchema = new mongoose.Schema({
  personName: {
    type: String,
    required: true,
    index: true
  },
  symbol: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  symbolId: {
    type: Number,
    required: false
  },
  name: {
    type: String,
    default: ''
  },
  reason: {
    type: String,
    default: ''
  },
  excludedBy: {
    type: String,
    default: 'user'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index for unique person-symbol combination
yieldExclusionSchema.index({ personName: 1, symbol: 1 }, { unique: true });

// Update timestamp on save
yieldExclusionSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Static method to get all exclusions for a person
yieldExclusionSchema.statics.getExclusionsForPerson = async function(personName) {
  return this.find({ personName }).sort({ symbol: 1 });
};

// Static method to check if symbol is excluded
yieldExclusionSchema.statics.isSymbolExcluded = async function(personName, symbol) {
  const exclusion = await this.findOne({
    personName,
    symbol: symbol.toUpperCase()
  });
  return !!exclusion;
};

// Static method to add exclusion
yieldExclusionSchema.statics.addExclusion = async function(personName, symbol, data = {}) {
  return this.findOneAndUpdate(
    {
      personName,
      symbol: symbol.toUpperCase()
    },
    {
      personName,
      symbol: symbol.toUpperCase(),
      symbolId: data.symbolId,
      name: data.name || '',
      reason: data.reason || '',
      excludedBy: data.excludedBy || 'user',
      updatedAt: new Date()
    },
    { upsert: true, new: true }
  );
};

// Static method to remove exclusion
yieldExclusionSchema.statics.removeExclusion = async function(personName, symbol) {
  return this.findOneAndDelete({
    personName,
    symbol: symbol.toUpperCase()
  });
};

// Static method to get excluded symbols list for a person
yieldExclusionSchema.statics.getExcludedSymbols = async function(personName) {
  const exclusions = await this.find({ personName }).select('symbol');
  return exclusions.map(e => e.symbol);
};

module.exports = mongoose.model('YieldExclusion', yieldExclusionSchema);
