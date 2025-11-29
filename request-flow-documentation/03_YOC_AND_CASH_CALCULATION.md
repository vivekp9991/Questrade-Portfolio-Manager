# YOC (Yield on Cost) and CASH Metric Calculation

**Date:** 2025-10-28
**Application:** Questrade Portfolio Manager v2.0

---

## Overview

This document explains how YOC and CASH metrics are calculated from database data through to UI display.

---

## YOC Calculation Flow

### What is YOC?

**Yield on Cost (YoC)** = (Annual Dividend Income / Original Investment Cost) × 100

This shows the dividend yield based on your original purchase price, not current market price.

---

### Sample Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: Fetch Positions from Database                     │
│  MongoDB Collection: positions                              │
│  Query: { personName: "Victor" }                            │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Sample Position Documents from MongoDB                     │
│                                                             │
│  Position 1: GLD (SPDR Gold Trust)                          │
│  {                                                          │
│    symbol: "GLD",                                           │
│    accountId: "51234567",                                   │
│    accountType: "TFSA",                                     │
│    personName: "Victor",                                    │
│    openQuantity: 34,                                        │
│    currentPrice: 164.75,                                    │
│    averageEntryPrice: 130.43,                               │
│    totalCost: 4434.62,  // 34 * 130.43                      │
│    currentMarketValue: 5601.50,  // 34 * 164.75             │
│    isDividendStock: false,  // ◄── No dividends             │
│    dividendData: {                                          │
│      annualDividend: 0,                                     │
│      annualDividendPerShare: 0                              │
│    }                                                        │
│  }                                                          │
│                                                             │
│  Position 2: IMAX.TO (Purpose Investment)                   │
│  {                                                          │
│    symbol: "IMAX.TO",                                       │
│    accountId: "51234567",                                   │
│    accountType: "TFSA",                                     │
│    personName: "Victor",                                    │
│    openQuantity: 200,                                       │
│    currentPrice: 15.74,                                     │
│    averageEntryPrice: 14.30,                                │
│    totalCost: 2860.00,  // 200 * 14.30                      │
│    currentMarketValue: 3148.00,  // 200 * 15.74             │
│    isDividendStock: true,  // ◄── Pays dividends            │
│    dividendData: {                                          │
│      totalReceived: 207.45,  // Historical dividends        │
│      lastDividendAmount: 0.54,                              │
│      lastDividendDate: "2024-09-15",                        │
│      monthlyDividendPerShare: 0.164,  // $0.164/month       │
│      annualDividendPerShare: 1.968,   // $0.164 * 12        │
│      annualDividend: 393.60,  // $1.968 * 200 shares        │
│      yieldOnCost: 13.76,  // (1.968 / 14.30) * 100          │
│      currentYield: 12.50,  // (1.968 / 15.74) * 100         │
│      dividendFrequency: 12  // Monthly                      │
│    }                                                        │
│  }                                                          │
│                                                             │
│  Position 3: HYLD.TO (Hamilton High Yield ETF)              │
│  {                                                          │
│    symbol: "HYLD.TO",                                       │
│    accountId: "51234568",                                   │
│    accountType: "Cash",                                     │
│    personName: "Victor",                                    │
│    openQuantity: 185,                                       │
│    currentPrice: 18.29,                                     │
│    averageEntryPrice: 13.41,                                │
│    totalCost: 2480.85,                                      │
│    currentMarketValue: 3383.65,                             │
│    isDividendStock: true,                                   │
│    dividendData: {                                          │
│      totalReceived: 285.30,                                 │
│      monthlyDividendPerShare: 0.2040,  // $0.204/month      │
│      annualDividendPerShare: 2.4480,   // $0.204 * 12       │
│      annualDividend: 452.90,  // $2.448 * 185 shares        │
│      yieldOnCost: 18.25,  // (2.448 / 13.41) * 100          │
│      dividendFrequency: 12                                  │
│    }                                                        │
│  }                                                          │
│                                                             │
│  ... continue for ~100 more positions ...                   │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 2: Fetch YoC Exclusions from Database                │
│  MongoDB Collection: yieldexclusions                        │
│  Query: { personName: "Victor" }                            │
│                                                             │
│  Sample Documents:                                          │
│  [                                                          │
│    {                                                        │
│      _id: ObjectId("..."),                                  │
│      personName: "Victor",                                  │
│      symbol: "GLD",                                         │
│      reason: "Non-dividend producing gold ETF",             │
│      excludeFromYoC: true,                                  │
│      createdAt: "2024-10-15T10:00:00Z"                      │
│    },                                                       │
│    {                                                        │
│      personName: "Victor",                                  │
│      symbol: "SLV",                                         │
│      reason: "Non-dividend producing silver ETF",           │
│      excludeFromYoC: true                                   │
│    },                                                       │
│    {                                                        │
│      personName: "Victor",                                  │
│      symbol: "IBIT",                                        │
│      reason: "Bitcoin ETF - no dividends",                  │
│      excludeFromYoC: true                                   │
│    }                                                        │
│  ]                                                          │
│                                                             │
│  Result: excludedSymbols = ["GLD", "SLV", "IBIT"]           │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 3: Fetch Manual Dividend Overrides                   │
│  MongoDB Collection: symboldividends                        │
│  Query: {}  (global overrides for all persons)              │
│                                                             │
│  Sample Documents:                                          │
│  [                                                          │
│    {                                                        │
│      _id: ObjectId("..."),                                  │
│      symbol: "HYLD.TO",                                     │
│      monthlyDividendPerShare: 0.2040,                       │
│      dividendFrequency: "monthly",                          │
│      notes: "Manual override - Questrade data incorrect",   │
│      lastUpdated: "2024-10-20T15:30:00Z"                    │
│    }                                                        │
│  ]                                                          │
│                                                             │
│  Result: manualDividendOverrides = Map {                    │
│    "HYLD.TO" => { monthlyDividendPerShare: 0.204, ... }     │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 4: Backend Aggregates Positions by Symbol            │
│  File: portfolioCalculator.js:153-504                       │
│                                                             │
│  For each symbol:                                           │
│  1. Group positions across all accounts                     │
│  2. Apply manual dividend overrides (if any)                │
│  3. Mark excluded symbols                                   │
│  4. Calculate totals                                        │
│                                                             │
│  Example: IMAX.TO aggregation (if held in multiple accts)  │
│  {                                                          │
│    symbol: "IMAX.TO",                                       │
│    openQuantity: 200,  // Total shares                      │
│    averageEntryPrice: 14.30,                                │
│    totalCost: 2860.00,                                      │
│    dividendData: {                                          │
│      annualDividend: 393.60,  // $1.968 * 200               │
│      annualDividendPerShare: 1.968,                         │
│      yieldOnCost: 13.76,                                    │
│      dataSource: "auto"  // From Questrade                  │
│    },                                                       │
│    excludedFromYoC: false  // ◄── NOT EXCLUDED              │
│  }                                                          │
│                                                             │
│  Example: GLD aggregation                                   │
│  {                                                          │
│    symbol: "GLD",                                           │
│    openQuantity: 34,                                        │
│    averageEntryPrice: 130.43,                               │
│    totalCost: 4434.62,                                      │
│    dividendData: {                                          │
│      annualDividend: 0,  // No dividends                    │
│      yieldOnCost: 0                                         │
│    },                                                       │
│    excludedFromYoC: true  // ◄── EXCLUDED!                  │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 5: Frontend Calculates YoC Metric                    │
│  File: Holdings.jsx:349-435 (calculateMetrics function)     │
│                                                             │
│  Initialize:                                                │
│    yocTotalInvested = 0                                     │
│    yocTotalDividendIncome = 0                               │
│                                                             │
│  Loop through each position:                                │
│                                                             │
│  ┌──────────────────────────────────────────────────┐      │
│  │ Position 1: GLD                                  │      │
│  │   totalCost: $4,434.62                           │      │
│  │   annualDividend: $0.00                          │      │
│  │   excludedFromYoC: TRUE                          │      │
│  │                                                  │      │
│  │   → SKIP (excluded from YoC calculation)         │      │
│  └──────────────────────────────────────────────────┘      │
│                                                             │
│  ┌──────────────────────────────────────────────────┐      │
│  │ Position 2: IMAX.TO                              │      │
│  │   totalCost: $2,860.00                           │      │
│  │   annualDividend: $393.60                        │      │
│  │   excludedFromYoC: FALSE                         │      │
│  │                                                  │      │
│  │   → INCLUDE in YoC calculation                   │      │
│  │   yocTotalInvested += $2,860.00                  │      │
│  │   yocTotalDividendIncome += $393.60              │      │
│  └──────────────────────────────────────────────────┘      │
│                                                             │
│  ┌──────────────────────────────────────────────────┐      │
│  │ Position 3: HYLD.TO                              │      │
│  │   totalCost: $2,480.85                           │      │
│  │   annualDividend: $452.90                        │      │
│  │   excludedFromYoC: FALSE                         │      │
│  │                                                  │      │
│  │   → INCLUDE in YoC calculation                   │      │
│  │   yocTotalInvested += $2,480.85                  │      │
│  │   yocTotalDividendIncome += $452.90              │      │
│  └──────────────────────────────────────────────────┘      │
│                                                             │
│  ... Continue for all positions ...                         │
│                                                             │
│  Final Totals (example):                                    │
│    yocTotalInvested = $81,209.64                            │
│    yocTotalDividendIncome = $5,038.88                       │
│                                                             │
│  Calculate YoC:                                             │
│    YoC = (yocTotalDividendIncome / yocTotalInvested) * 100  │
│        = ($5,038.88 / $81,209.64) * 100                     │
│        = 6.20%                                              │
│                                                             │
│  Calculate Monthly Income:                                  │
│    monthlyIncome = yocTotalDividendIncome / 12              │
│                  = $5,038.88 / 12                           │
│                  = $419.91/month                            │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 6: Format YoC Metric for Display                     │
│  File: Holdings.jsx:505-571 (formattedMetrics memo)         │
│                                                             │
│  {                                                          │
│    name: "YOC",                                             │
│    value: "6.20%",                                          │
│    info: "CAD: $420/mo",                                    │
│    successTag: null                                         │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## CASH Calculation Flow

```
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: Fetch Cash Balances from Database                 │
│  MongoDB Collection: balances                               │
│  Query: { personName: "Victor" }                            │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Sample Balance Documents from MongoDB                      │
│                                                             │
│  Balance 1: TFSA Account                                    │
│  {                                                          │
│    _id: ObjectId("..."),                                    │
│    accountId: "51234567",                                   │
│    personName: "Victor",                                    │
│    perCurrencyBalances: [                                   │
│      {                                                      │
│        currency: "CAD",                                     │
│        cash: 1098.71,  // ◄── Available CAD cash            │
│        marketValue: 18450.23,                               │
│        totalEquity: 19548.94,                               │
│        buyingPower: 1098.71,                                │
│        maintenanceExcess: 0                                 │
│      },                                                     │
│      {                                                      │
│        currency: "USD",                                     │
│        cash: 0.00,  // ◄── No USD cash                      │
│        marketValue: 0.00,                                   │
│        totalEquity: 0.00,                                   │
│        buyingPower: 0.00,                                   │
│        maintenanceExcess: 0                                 │
│      }                                                      │
│    ],                                                       │
│    lastUpdated: "2025-10-28T10:30:00Z"                      │
│  }                                                          │
│                                                             │
│  Balance 2: Cash Account                                    │
│  {                                                          │
│    accountId: "51234568",                                   │
│    personName: "Victor",                                    │
│    perCurrencyBalances: [                                   │
│      {                                                      │
│        currency: "CAD",                                     │
│        cash: 990.60,  // ◄── Available CAD cash             │
│        marketValue: 63798.29,                               │
│        totalEquity: 64788.89                                │
│      },                                                     │
│      {                                                      │
│        currency: "USD",                                     │
│        cash: 0.00,  // ◄── No USD cash                      │
│        marketValue: 0.00,                                   │
│        totalEquity: 0.00                                    │
│      }                                                      │
│    ],                                                       │
│    lastUpdated: "2025-10-28T10:30:00Z"                      │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 2: Fetch Account Metadata                            │
│  MongoDB Collection: accounts                               │
│  Query: { personName: "Victor" }                            │
│                                                             │
│  Sample Documents:                                          │
│  [                                                          │
│    {                                                        │
│      accountId: "51234567",                                 │
│      personName: "Victor",                                  │
│      type: "TFSA",  // ◄── Account type                     │
│      number: "****4567",                                    │
│      status: "Active"                                       │
│    },                                                       │
│    {                                                        │
│      accountId: "51234568",                                 │
│      personName: "Victor",                                  │
│      type: "Cash",  // ◄── Account type                     │
│      number: "****4568",                                    │
│      status: "Active"                                       │
│    }                                                        │
│  ]                                                          │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 3: Backend Groups Balances by Account                │
│  File: portfolioCalculator.js:1055-1085                     │
│                                                             │
│  accountBalances = [                                        │
│    {                                                        │
│      accountId: "51234567",                                 │
│      accountName: "****4567",                               │
│      accountType: "TFSA",  // ◄── From account metadata     │
│      personName: "Victor",                                  │
│      cashBalances: [                                        │
│        { currency: "CAD", cash: 1098.71 },                  │
│        { currency: "USD", cash: 0.00 }                      │
│      ]                                                      │
│    },                                                       │
│    {                                                        │
│      accountId: "51234568",                                 │
│      accountName: "****4568",                               │
│      accountType: "Cash",                                   │
│      personName: "Victor",                                  │
│      cashBalances: [                                        │
│        { currency: "CAD", cash: 990.60 },                   │
│        { currency: "USD", cash: 0.00 }                      │
│      ]                                                      │
│    }                                                        │
│  ]                                                          │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 4: Backend Calculates Cash Totals                    │
│  File: portfolioCalculator.js:1090-1105                     │
│                                                             │
│  Loop through accounts and sum by currency:                 │
│                                                             │
│  Account 1 (TFSA):                                          │
│    CAD: $1,098.71                                           │
│    USD: $0.00                                               │
│                                                             │
│  Account 2 (Cash):                                          │
│    CAD: $990.60                                             │
│    USD: $0.00                                               │
│                                                             │
│  Totals:                                                    │
│    totalCAD = 1098.71 + 990.60 = $2,089.31                  │
│    totalUSD = 0.00 + 0.00 = $0.00                           │
│    totalAccounts = 2                                        │
│    totalPersons = 1 (Victor)                                │
│                                                             │
│  Response:                                                  │
│  {                                                          │
│    accounts: [...],  // Detailed breakdown                  │
│    summary: {                                               │
│      totalAccounts: 2,                                      │
│      totalPersons: 1,                                       │
│      totalCAD: 2089.31,  // ◄── Used in CASH metric         │
│      totalUSD: 0.00,                                        │
│      totalInCAD: 2089.31                                    │
│    }                                                        │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 5: Frontend Stores Cash Data                         │
│  File: Holdings.jsx:437-476                                 │
│                                                             │
│  const cash = cashBalances();  // From API response         │
│                                                             │
│  // Extract totals from summary                             │
│  totalCashCAD = cash.summary.totalCAD;  // $2,089.31        │
│  totalCashUSD = cash.summary.totalUSD;  // $0.00            │
│  accountCount = cash.summary.totalAccounts;  // 2           │
│                                                             │
│  // Store in metrics                                        │
│  setMetrics({                                               │
│    ...                                                      │
│    totalCashCAD: 2089.31,                                   │
│    totalCashUSD: 0.00,                                      │
│    cashAccountCount: 2                                      │
│  });                                                        │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 6: Format CASH Metric for Display                    │
│  File: Holdings.jsx:514-524                                 │
│                                                             │
│  // Calculate total cash in display currency                │
│  if (displayCurrency === 'USD') {                           │
│    totalCash = totalCashUSD + (totalCashCAD / exchangeRate);│
│  } else {                                                   │
│    totalCash = totalCashCAD + (totalCashUSD * exchangeRate);│
│  }                                                          │
│                                                             │
│  // For Victor (displayCurrency = CAD):                     │
│  totalCash = $2,089.31 + ($0.00 * 1.3942) = $2,089.31       │
│                                                             │
│  // Format for card                                         │
│  cashValue = `Total CAD: $2,089.31                          │
│                CAD $2,089.31                                │
│                USD $0.00`                                   │
│                                                             │
│  {                                                          │
│    name: "CASH",                                            │
│    value: "Total CAD: $2,089.31\nCAD $2,089.31\nUSD $0.00", │
│    info: "2 accounts",                                      │
│    successTag: null                                         │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Flow Summary

### YOC Metric
```
MongoDB positions (dividendData.annualDividend)
    ↓
MongoDB yieldexclusions (excludedFromYoC flag)
    ↓
Backend aggregation (sum dividends, exclude flagged)
    ↓
Frontend calculation (total dividends / total cost * 100)
    ↓
Display: "6.20%" with "CAD: $420/mo"
```

### CASH Metric
```
MongoDB balances (perCurrencyBalances[].cash)
    ↓
MongoDB accounts (type metadata)
    ↓
Backend grouping (sum CAD and USD separately)
    ↓
Frontend formatting (convert to display currency)
    ↓
Display: "Total CAD: $2,089.31\nCAD $2,089.31\nUSD $0.00"
         "2 accounts"
```

---

## Key MongoDB Collections

### positions
```javascript
{
  personName: "Victor",
  symbol: "IMAX.TO",
  accountType: "TFSA",
  openQuantity: 200,
  averageEntryPrice: 14.30,
  totalCost: 2860.00,
  isDividendStock: true,
  dividendData: {
    annualDividend: 393.60,  // ◄── Used in YoC
    annualDividendPerShare: 1.968,
    yieldOnCost: 13.76
  }
}
```

### yieldexclusions
```javascript
{
  personName: "Victor",
  symbol: "GLD",
  excludeFromYoC: true,  // ◄── Excludes from YoC calc
  reason: "Non-dividend producing gold ETF"
}
```

### balances
```javascript
{
  accountId: "51234567",
  personName: "Victor",
  perCurrencyBalances: [
    {
      currency: "CAD",
      cash: 1098.71,  // ◄── Used in CASH metric
      marketValue: 18450.23,
      totalEquity: 19548.94
    },
    {
      currency: "USD",
      cash: 0.00,  // ◄── Used in CASH metric
      marketValue: 0.00,
      totalEquity: 0.00
    }
  ]
}
```

### accounts
```javascript
{
  accountId: "51234567",
  personName: "Victor",
  type: "TFSA",  // ◄── Used to enrich balance data
  number: "****4567",
  status: "Active"
}
```

---

## Calculation Examples

### Example 1: Victor's YoC Calculation

**Dividend-Paying Stocks (NOT Excluded):**
| Symbol | Shares | Avg Cost | Total Cost | Annual Div/Share | Annual Dividend | YoC |
|--------|--------|----------|------------|------------------|-----------------|-----|
| IMAX.TO | 200 | $14.30 | $2,860.00 | $1.968 | $393.60 | 13.76% |
| HYLD.TO | 185 | $13.41 | $2,480.85 | $2.448 | $452.90 | 18.25% |
| HYLD.TO | 26 | $11.81 | $307.06 | $2.448 | $63.65 | 20.73% |
| ... | ... | ... | ... | ... | ... | ... |

**Excluded Stocks (NOT Included in YoC):**
| Symbol | Shares | Avg Cost | Total Cost | Reason |
|--------|--------|----------|------------|--------|
| GLD | 34 | $130.43 | $4,434.62 | Non-dividend gold ETF |
| SLV | 122 | $47.28 | $5,768.16 | Non-dividend silver ETF |
| IBIT | ... | ... | ... | Bitcoin ETF - no dividends |

**Final YoC:**
```
Total Invested (dividend stocks only): $81,209.64
Total Annual Dividends: $5,038.88
YoC = ($5,038.88 / $81,209.64) × 100 = 6.20%
Monthly Income = $5,038.88 / 12 = $419.91/month
```

---

### Example 2: Victor's Cash Calculation

**Accounts:**
| Account | Type | CAD Cash | USD Cash |
|---------|------|----------|----------|
| ****4567 | TFSA | $1,098.71 | $0.00 |
| ****4568 | Cash | $990.60 | $0.00 |

**Totals:**
```
Total CAD Cash: $1,098.71 + $990.60 = $2,089.31
Total USD Cash: $0.00 + $0.00 = $0.00
Account Count: 2

Display (in CAD):
Total CAD: $2,089.31
CAD $2,089.31
USD $0.00
2 accounts
```

---

**End of YOC and CASH Calculation Documentation**
