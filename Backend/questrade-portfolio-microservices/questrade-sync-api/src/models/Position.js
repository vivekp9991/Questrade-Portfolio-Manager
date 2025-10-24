const mongoose = require('mongoose');
const Decimal = require('decimal.js');

const positionSchema = new mongoose.Schema({
  // Account reference
  accountId: {
    type: String,
    required: true,
    index: true
  },
  personName: {
    type: String,
    required: true,
    index: true
  },
  
  // Account type (TFSA, RRSP, FHSA, etc.)
  accountType: {
    type: String,
    index: true
  },
  
  // Security information
  symbol: {
    type: String,
    required: true,
    index: true
  },
  symbolId: {
    type: Number,
    required: true
  },
  
  // Position details
  openQuantity: {
    type: Number,
    required: true
  },
  closedQuantity: {
    type: Number,
    default: 0
  },
  currentMarketValue: {
    type: Number,
    default: 0
  },
  currentPrice: {
    type: Number,
    default: 0
  },
  previousDayClose: {
    type: Number,
    default: 0,
    index: true
  },
  openPrice: {
    type: Number,
    default: 0
  },
  averageEntryPrice: {
    type: Number,
    default: 0
  },
  totalCost: {
    type: Number,
    default: 0
  },

  // Profit/Loss calculations
  openPnl: {
    type: Number,
    default: 0
  },
  closedPnl: {
    type: Number,
    default: 0
  },
  dayPnl: {
    type: Number,
    default: 0
  },

  // Dividend information
  isDividendStock: {
    type: Boolean,
    default: false
  },
  isManualOverride: {
    type: Boolean,
    default: false
  },
  dividendData: {
    totalReceived: {
      type: Number,
      default: 0
    },
    lastDividendAmount: {
      type: Number,
      default: 0
    },
    lastDividendDate: {
      type: Date,
      default: null
    },
    dividendReturnPercent: {
      type: Number,
      default: 0
    },
    yieldOnCost: {
      type: Number,
      default: 0
    },
    dividendAdjustedCost: {
      type: Number,
      default: 0
    },
    dividendAdjustedCostPerShare: {
      type: Number,
      default: 0
    },
    monthlyDividend: {
      type: Number,
      default: 0
    },
    monthlyDividendPerShare: {
      type: Number,
      default: 0
    },
    annualDividend: {
      type: Number,
      default: 0
    },
    annualDividendPerShare: {
      type: Number,
      default: 0
    },
    currentYield: {
      type: Number,
      default: 0
    },
    dividendFrequency: {
      type: Number,
      default: 0
    },
    dividendHistory: {
      type: Array,
      default: []
    }
  },

  // Additional fields
  isRealTime: {
    type: Boolean,
    default: false
  },
  isUnderReorg: {
    type: Boolean,
    default: false
  },

  // Sync metadata
  lastSyncedAt: Date,
  lastPriceUpdate: Date,
  lastDividendUpdate: Date,
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp on save
positionSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Calculate total cost if not set
  if (this.openQuantity && this.averageEntryPrice && !this.totalCost) {
    this.totalCost = new Decimal(this.openQuantity)
      .mul(this.averageEntryPrice)
      .toNumber();
  }
  
  // Calculate open P&L
  if (this.currentMarketValue && this.totalCost) {
    this.openPnl = new Decimal(this.currentMarketValue)
      .minus(this.totalCost)
      .toNumber();
  }
  
  next();
});

// Indexes
positionSchema.index({ accountId: 1, symbol: 1 }, { unique: true });
positionSchema.index({ personName: 1, symbol: 1 });
positionSchema.index({ currentMarketValue: -1 });
positionSchema.index({ openPnl: -1 });

// Virtual for P&L percentage
positionSchema.virtual('openPnlPercent').get(function() {
  if (!this.totalCost || this.totalCost === 0) return 0;
  return (this.openPnl / this.totalCost) * 100;
});

// Method to update from Questrade data
positionSchema.methods.updateFromQuestrade = function(questradeData, accountType = null) {
  Object.assign(this, {
    openQuantity: questradeData.openQuantity,
    closedQuantity: questradeData.closedQuantity || 0,
    currentMarketValue: questradeData.currentMarketValue,
    currentPrice: questradeData.currentPrice,
    averageEntryPrice: questradeData.averageEntryPrice,
    totalCost: questradeData.totalCost,
    openPnl: questradeData.openPnl,
    closedPnl: questradeData.closedPnl || 0,
    dayPnl: questradeData.dayPnl || 0,
    isRealTime: questradeData.isRealTime || false,
    isUnderReorg: questradeData.isUnderReorg || false,
    lastSyncedAt: new Date(),
    lastPriceUpdate: new Date()
  });
  
  if (accountType) {
    this.accountType = accountType;
  }
  
  return this.save();
};

// Static method to get positions by account
positionSchema.statics.getByAccount = function(accountId) {
  return this.find({ accountId })
    .sort({ currentMarketValue: -1 });
};

// Static method to get all positions for a person
positionSchema.statics.getByPerson = function(personName) {
  return this.find({ personName })
    .sort({ currentMarketValue: -1 });
};

// Static method to get aggregated positions across all persons
positionSchema.statics.getAggregatedPositions = async function(filter = {}) {
  const positions = await this.find(filter);
  
  // Get account types from Account model
  const Account = require('./Account');
  const accountIds = [...new Set(positions.map(p => p.accountId))];
  const accounts = await Account.find({ accountId: { $in: accountIds } })
    .select('accountId type');
  
  // Create a map of accountId to account type
  const accountTypeMap = new Map();
  accounts.forEach(acc => {
    accountTypeMap.set(acc.accountId, acc.type);
  });
  
  // Group positions by symbol
  const aggregatedMap = new Map();
  
  positions.forEach(position => {
    if (!aggregatedMap.has(position.symbol)) {
      aggregatedMap.set(position.symbol, {
        symbol: position.symbol,
        symbolId: position.symbolId,
        persons: new Set(),
        accounts: [],
        totalQuantity: new Decimal(0),
        totalCost: new Decimal(0),
        totalMarketValue: new Decimal(0),
        totalOpenPnl: new Decimal(0),
        totalClosedPnl: new Decimal(0),
        totalDayPnl: new Decimal(0),
        currentPrice: 0,
        previousDayClose: 0,
        openPrice: 0,
        isRealTime: false
      });
    }

    const agg = aggregatedMap.get(position.symbol);
    agg.persons.add(position.personName);

    // Get account type from the map
    const accountType = accountTypeMap.get(position.accountId) || position.accountType || 'Unknown';

    agg.accounts.push({
      accountId: position.accountId,
      accountType: accountType,
      quantity: position.openQuantity,
      averagePrice: position.averageEntryPrice,
      cost: position.totalCost,
      marketValue: position.currentMarketValue,
      openPnl: position.openPnl
    });

    agg.totalQuantity = agg.totalQuantity.plus(position.openQuantity || 0);
    agg.totalCost = agg.totalCost.plus(position.totalCost || 0);
    agg.totalMarketValue = agg.totalMarketValue.plus(position.currentMarketValue || 0);
    agg.totalOpenPnl = agg.totalOpenPnl.plus(position.openPnl || 0);
    agg.totalClosedPnl = agg.totalClosedPnl.plus(position.closedPnl || 0);
    agg.totalDayPnl = agg.totalDayPnl.plus(position.dayPnl || 0);

    // Use the most recent price
    if (position.currentPrice) {
      agg.currentPrice = position.currentPrice;
    }

    // Store previousDayClose and openPrice from any position (they should be the same for all positions of the same symbol)
    if (position.previousDayClose) {
      agg.previousDayClose = position.previousDayClose;
    }
    if (position.openPrice) {
      agg.openPrice = position.openPrice;
    }

    // Mark as real-time if any position is real-time
    if (position.isRealTime) {
      agg.isRealTime = true;
    }
  });
  
  // Convert to array and calculate weighted average price
  const aggregatedPositions = [];

  aggregatedMap.forEach((agg, symbol) => {
    const totalQuantity = agg.totalQuantity.toNumber();
    const totalCost = agg.totalCost.toNumber();
    const avgEntryPrice = totalQuantity > 0 ? totalCost / totalQuantity : 0;

    // Aggregate dividend data from the first position with dividend data
    const positionsForSymbol = positions.filter(p => p.symbol === symbol);
    const firstDividendPosition = positionsForSymbol.find(p => p.isDividendStock && p.dividendData);

    let aggregatedDividendData = null;
    let isDividendStock = false;

    if (firstDividendPosition && firstDividendPosition.dividendData) {
      isDividendStock = true;
      const dividendPerShare = firstDividendPosition.dividendData.annualDividendPerShare || 0;
      const monthlyDividendPerShare = firstDividendPosition.dividendData.monthlyDividendPerShare || 0;
      const frequency = firstDividendPosition.dividendData.dividendFrequency || 0;

      // Sum up total dividends received across all positions
      const totalDividendsReceived = positionsForSymbol.reduce((sum, p) =>
        sum + (p.dividendData?.totalReceived || 0), 0
      );

      // Calculate aggregated dividend metrics
      const annualDividend = dividendPerShare * totalQuantity;
      const monthlyDividend = monthlyDividendPerShare * totalQuantity;
      const yieldOnCost = avgEntryPrice > 0 ? (dividendPerShare / avgEntryPrice) * 100 : 0;
      const currentYield = agg.currentPrice > 0 ? (dividendPerShare / agg.currentPrice) * 100 : 0;

      aggregatedDividendData = {
        totalReceived: totalDividendsReceived,
        lastDividendAmount: firstDividendPosition.dividendData.lastDividendAmount || 0,
        lastDividendDate: firstDividendPosition.dividendData.lastDividendDate || null,
        dividendReturnPercent: totalCost > 0 ? (totalDividendsReceived / totalCost) * 100 : 0,
        yieldOnCost: Math.round(yieldOnCost * 100) / 100,
        currentYield: Math.round(currentYield * 100) / 100,
        dividendAdjustedCost: totalCost - totalDividendsReceived,
        dividendAdjustedCostPerShare: totalQuantity > 0 ? (totalCost - totalDividendsReceived) / totalQuantity : avgEntryPrice,
        monthlyDividend: Math.round(monthlyDividend * 10000) / 10000, // 4 decimal places
        monthlyDividendPerShare: Math.round(monthlyDividendPerShare * 10000) / 10000, // 4 decimal places
        annualDividend: Math.round(annualDividend * 10000) / 10000, // 4 decimal places
        annualDividendPerShare: Math.round(dividendPerShare * 10000) / 10000, // 4 decimal places
        dividendFrequency: frequency,
        dividendHistory: firstDividendPosition.dividendData.dividendHistory || []
      };
    }

    aggregatedPositions.push({
      symbol: symbol,
      symbolId: agg.symbolId,
      personName: Array.from(agg.persons).join(', '),
      openQuantity: totalQuantity,
      averageEntryPrice: avgEntryPrice,
      currentMarketValue: agg.totalMarketValue.toNumber(),
      totalCost: totalCost,
      currentPrice: agg.currentPrice,
      previousDayClose: agg.previousDayClose,
      openPrice: agg.openPrice,
      openPnl: agg.totalOpenPnl.toNumber(),
      closedPnl: agg.totalClosedPnl.toNumber(),
      dayPnl: agg.totalDayPnl.toNumber(),
      accounts: agg.accounts,
      isRealTime: agg.isRealTime,
      isDividendStock: isDividendStock,
      dividendData: aggregatedDividendData
    });
  });
  
  return aggregatedPositions.sort((a, b) => b.currentMarketValue - a.currentMarketValue);
};

// Static method to get aggregated positions for a specific person
positionSchema.statics.getAggregatedByPerson = async function(personName) {
  const positions = await this.find({ personName });
  
  // Get account types from Account model
  const Account = require('./Account');
  const accountIds = [...new Set(positions.map(p => p.accountId))];
  const accounts = await Account.find({ accountId: { $in: accountIds } })
    .select('accountId type');
  
  // Create a map of accountId to account type
  const accountTypeMap = new Map();
  accounts.forEach(acc => {
    accountTypeMap.set(acc.accountId, acc.type);
  });
  
  // Group positions by symbol
  const aggregatedMap = new Map();
  
  positions.forEach(position => {
    if (!aggregatedMap.has(position.symbol)) {
      aggregatedMap.set(position.symbol, {
        symbol: position.symbol,
        symbolId: position.symbolId,
        personName: personName,
        accounts: [],
        totalQuantity: new Decimal(0),
        totalCost: new Decimal(0),
        totalMarketValue: new Decimal(0),
        totalOpenPnl: new Decimal(0),
        totalClosedPnl: new Decimal(0),
        totalDayPnl: new Decimal(0),
        currentPrice: 0,
        previousDayClose: 0,
        openPrice: 0,
        isRealTime: false
      });
    }

    const agg = aggregatedMap.get(position.symbol);

    // Get account type from the map
    const accountType = accountTypeMap.get(position.accountId) || position.accountType || 'Unknown';

    agg.accounts.push({
      accountId: position.accountId,
      accountType: accountType,
      quantity: position.openQuantity,
      averagePrice: position.averageEntryPrice,
      cost: position.totalCost,
      marketValue: position.currentMarketValue,
      openPnl: position.openPnl
    });

    agg.totalQuantity = agg.totalQuantity.plus(position.openQuantity || 0);
    agg.totalCost = agg.totalCost.plus(position.totalCost || 0);
    agg.totalMarketValue = agg.totalMarketValue.plus(position.currentMarketValue || 0);
    agg.totalOpenPnl = agg.totalOpenPnl.plus(position.openPnl || 0);
    agg.totalClosedPnl = agg.totalClosedPnl.plus(position.closedPnl || 0);
    agg.totalDayPnl = agg.totalDayPnl.plus(position.dayPnl || 0);

    // Use the most recent price
    if (position.currentPrice) {
      agg.currentPrice = position.currentPrice;
    }

    // Store previousDayClose and openPrice from any position (they should be the same for all positions of the same symbol)
    if (position.previousDayClose) {
      agg.previousDayClose = position.previousDayClose;
    }
    if (position.openPrice) {
      agg.openPrice = position.openPrice;
    }

    // Mark as real-time if any position is real-time
    if (position.isRealTime) {
      agg.isRealTime = true;
    }
  });
  
  // Convert to array and calculate weighted average price
  const aggregatedPositions = [];

  aggregatedMap.forEach((agg, symbol) => {
    const totalQuantity = agg.totalQuantity.toNumber();
    const totalCost = agg.totalCost.toNumber();
    const avgEntryPrice = totalQuantity > 0 ? totalCost / totalQuantity : 0;

    // Aggregate dividend data from the first position with dividend data
    const positionsForSymbol = positions.filter(p => p.symbol === symbol);
    const firstDividendPosition = positionsForSymbol.find(p => p.isDividendStock && p.dividendData);

    let aggregatedDividendData = null;
    let isDividendStock = false;

    if (firstDividendPosition && firstDividendPosition.dividendData) {
      isDividendStock = true;
      const dividendPerShare = firstDividendPosition.dividendData.annualDividendPerShare || 0;
      const monthlyDividendPerShare = firstDividendPosition.dividendData.monthlyDividendPerShare || 0;
      const frequency = firstDividendPosition.dividendData.dividendFrequency || 0;

      // Sum up total dividends received across all positions for this person
      const totalDividendsReceived = positionsForSymbol.reduce((sum, p) =>
        sum + (p.dividendData?.totalReceived || 0), 0
      );

      // Calculate aggregated dividend metrics
      const annualDividend = dividendPerShare * totalQuantity;
      const monthlyDividend = monthlyDividendPerShare * totalQuantity;
      const yieldOnCost = avgEntryPrice > 0 ? (dividendPerShare / avgEntryPrice) * 100 : 0;
      const currentYield = agg.currentPrice > 0 ? (dividendPerShare / agg.currentPrice) * 100 : 0;

      aggregatedDividendData = {
        totalReceived: totalDividendsReceived,
        lastDividendAmount: firstDividendPosition.dividendData.lastDividendAmount || 0,
        lastDividendDate: firstDividendPosition.dividendData.lastDividendDate || null,
        dividendReturnPercent: totalCost > 0 ? (totalDividendsReceived / totalCost) * 100 : 0,
        yieldOnCost: Math.round(yieldOnCost * 100) / 100,
        currentYield: Math.round(currentYield * 100) / 100,
        dividendAdjustedCost: totalCost - totalDividendsReceived,
        dividendAdjustedCostPerShare: totalQuantity > 0 ? (totalCost - totalDividendsReceived) / totalQuantity : avgEntryPrice,
        monthlyDividend: Math.round(monthlyDividend * 10000) / 10000, // 4 decimal places
        monthlyDividendPerShare: Math.round(monthlyDividendPerShare * 10000) / 10000, // 4 decimal places
        annualDividend: Math.round(annualDividend * 10000) / 10000, // 4 decimal places
        annualDividendPerShare: Math.round(dividendPerShare * 10000) / 10000, // 4 decimal places
        dividendFrequency: frequency,
        dividendHistory: firstDividendPosition.dividendData.dividendHistory || []
      };
    }

    aggregatedPositions.push({
      symbol: symbol,
      symbolId: agg.symbolId,
      personName: personName,
      openQuantity: totalQuantity,
      averageEntryPrice: avgEntryPrice,
      currentMarketValue: agg.totalMarketValue.toNumber(),
      totalCost: totalCost,
      currentPrice: agg.currentPrice,
      previousDayClose: agg.previousDayClose,
      openPrice: agg.openPrice,
      openPnl: agg.totalOpenPnl.toNumber(),
      closedPnl: agg.totalClosedPnl.toNumber(),
      dayPnl: agg.totalDayPnl.toNumber(),
      accounts: agg.accounts,
      isRealTime: agg.isRealTime,
      isDividendStock: isDividendStock,
      dividendData: aggregatedDividendData
    });
  });
  
  return aggregatedPositions.sort((a, b) => b.currentMarketValue - a.currentMarketValue);
};

// Static method to calculate portfolio summary
positionSchema.statics.getPortfolioSummary = async function(filter = {}) {
  const positions = await this.find(filter);
  
  const summary = positions.reduce((acc, pos) => {
    acc.totalMarketValue = new Decimal(acc.totalMarketValue)
      .plus(pos.currentMarketValue || 0)
      .toNumber();
    acc.totalCost = new Decimal(acc.totalCost)
      .plus(pos.totalCost || 0)
      .toNumber();
    acc.totalOpenPnl = new Decimal(acc.totalOpenPnl)
      .plus(pos.openPnl || 0)
      .toNumber();
    acc.totalDayPnl = new Decimal(acc.totalDayPnl)
      .plus(pos.dayPnl || 0)
      .toNumber();
    acc.positionCount++;
    
    return acc;
  }, {
    totalMarketValue: 0,
    totalCost: 0,
    totalOpenPnl: 0,
    totalDayPnl: 0,
    positionCount: 0
  });
  
  // Calculate percentage
  if (summary.totalCost > 0) {
    summary.totalOpenPnlPercent = (summary.totalOpenPnl / summary.totalCost) * 100;
  } else {
    summary.totalOpenPnlPercent = 0;
  }
  
  return summary;
};

module.exports = mongoose.model('Position', positionSchema);