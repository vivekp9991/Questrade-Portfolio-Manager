# Account Selection Request Flow

**Date:** 2025-10-28
**Application:** Questrade Portfolio Manager v2.0
**Frontend:** D:\Project\3\Frontend-v2
**Backend:** D:\Project\3\Backend

---

## Overview

When a user selects an account from the dropdown (e.g., "TFSA - ****4567" for Victor), the application makes specific API requests to filter and display data for that account only.

---

## Visual Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  USER ACTION: Click Account Dropdown → Select "TFSA - ****4567" │
│  Location: Top bar of Holdings page                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  FRONTEND: Topbar.jsx                                           │
│  Event Handler: handleAccountSelection()                        │
│  Line: 73-81                                                    │
│                                                                 │
│  Function Call:                                                 │
│    handleAccountSelection('account', {                          │
│      accountId: "51234567",                                     │
│      accountType: "TFSA",                                       │
│      accountNumber: "****4567",                                 │
│      personName: "Victor"                                       │
│    })                                                           │
│                                                                 │
│  Actions:                                                       │
│    1. setSelectedView('account')                                │
│    2. setSelectedAccount(accountObject)                         │
│    3. setShowAccountDropdown(false)  // Close dropdown          │
│    4. props.onAccountChange('account', accountObject)           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  FRONTEND: App.jsx                                              │
│  Event Handler: handleAccountChange()                           │
│  Line: 110-118                                                  │
│                                                                 │
│  Function Call:                                                 │
│    handleAccountChange('account', {                             │
│      accountId: "51234567",                                     │
│      accountType: "TFSA",                                       │
│      accountNumber: "****4567",                                 │
│      personName: "Victor"                                       │
│    })                                                           │
│                                                                 │
│  Actions:                                                       │
│    1. setAccountFilter({                                        │
│         type: 'account',                                        │
│         value: {                                                │
│           accountId: "51234567",                                │
│           accountType: "TFSA",                                  │
│           accountNumber: "****4567",                            │
│           personName: "Victor"                                  │
│         }                                                       │
│       })                                                        │
│    2. setSelectedPerson('Victor')  // Update person too         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  FRONTEND: Holdings.jsx                                         │
│  Reactive Effect: Triggered by accountFilter change             │
│  Line: 221-225                                                  │
│                                                                 │
│  createEffect(() => {                                           │
│    const filter = props.accountFilter() || {                    │
│      type: 'person',                                            │
│      value: 'Vivek'                                             │
│    };                                                           │
│    console.log('🔄 Account filter changed, reloading data');    │
│    loadData();  // ◄── TRIGGERS DATA RELOAD                     │
│  });                                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  FRONTEND: Holdings.jsx - loadData() Function                  │
│  Line: 160-218                                                  │
│                                                                 │
│  Extract account filter:                                        │
│    filter = {                                                   │
│      type: 'account',                                           │
│      value: {                                                   │
│        accountId: "51234567",                                   │
│        accountType: "TFSA"                                      │
│      }                                                          │
│    }                                                            │
│                                                                 │
│  Determine requests:                                            │
│    Since type === 'account', fetch data for Victor             │
│    (filtering happens in UI layer)                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
      ┌───────────────────────┼───────────────────────┐
      │                       │                       │
      ▼                       ▼                       ▼
┌──────────────┐    ┌──────────────────┐    ┌──────────────┐
│  REQUEST 1   │    │    REQUEST 2     │    │  REQUEST 3   │
│  Positions   │    │  Cash Balances   │    │Exchange Rate │
└──────────────┘    └──────────────────┘    └──────────────┘
```

---

## Request 1: Portfolio Positions

### Frontend Request
**File:** `D:\Project\3\Frontend-v2\portfolio-manager-v2\src\services\api.js:28-39`

```javascript
// When account type = 'account', still fetch person's data
// Filtering by accountType happens in the UI
const person = personName();  // 'Victor'
const response = await fetch(
  '/api/portfolio/positions?viewMode=person&personName=Victor&aggregate=true'
);
```

**Proxy Route:** `/api` → `http://localhost:4003` (vite.config.js:40-43)

**Full URL:** `http://localhost:4003/api/portfolio/positions?viewMode=person&personName=Victor&aggregate=true`

---

### Backend Processing

#### Step 1: Portfolio API Route Handler
**File:** `D:\Project\3\Backend\questrade-portfolio-microservices\questrade-portfolio-api\src\routes\portfolio.js:59-86`

```javascript
router.get('/portfolio/positions', async (req, res) => {
  const { viewMode = 'all', aggregate = 'true', personName, accountId } = req.query;

  logger.info('[ROUTE] GET /portfolio/positions - viewMode: person, personName: Victor');

  const positions = await portfolioCalculator.getAllPersonsPositions(
    'person',    // viewMode
    true,        // aggregate
    'Victor',    // personName
    null         // accountId (not used, filtering happens in UI)
  );

  res.json({
    success: true,
    viewMode: 'person',
    aggregate: true,
    count: positions.length,
    data: positions
  });
});
```

---

#### Step 2: Fetch Positions from Sync API
**File:** `D:\Project\3\Backend\questrade-portfolio-microservices\questrade-portfolio-api\src\services\portfolioCalculator.js:79-151`

**Request to Sync API:**
```
GET http://localhost:4002/api/positions/person/Victor?aggregated=false
```

**MongoDB Query (in Sync API):**
```javascript
db.positions.find({
  personName: "Victor"
}).sort({ currentMarketValue: -1 })
```

**Sample Response from Sync API:**
```json
{
  "success": true,
  "data": [
    {
      "symbol": "IMAX.TO",
      "accountId": "51234567",
      "accountType": "TFSA",
      "personName": "Victor",
      "openQuantity": 200,
      "currentPrice": 15.74,
      "averageEntryPrice": 14.30,
      "totalCost": 2860.00,
      "currentMarketValue": 3148.00,
      "dividendData": { ... }
    },
    {
      "symbol": "IMAX.TO",
      "accountId": "51234568",
      "accountType": "Cash",
      "personName": "Victor",
      "openQuantity": 100,
      "currentPrice": 15.74,
      "averageEntryPrice": 14.50,
      "totalCost": 1450.00,
      "currentMarketValue": 1574.00,
      "dividendData": { ... }
    },
    // ... more positions for Victor across all accounts
  ]
}
```

**Note:** The response includes positions from **ALL of Victor's accounts** (TFSA, Cash, RRSP, etc.). The backend aggregates by symbol across accounts.

---

#### Step 3: Aggregate Positions by Symbol
**File:** `portfolioCalculator.js:153-504 (aggregatePositions method)`

The backend aggregates positions **across all accounts** for Victor:

```javascript
// Example: IMAX.TO in TFSA + IMAX.TO in Cash = One aggregated position
{
  symbol: "IMAX.TO",
  companyName: "PURPOSE INVESTM...",
  currency: "CAD",
  openQuantity: 300,  // 200 (TFSA) + 100 (Cash)
  averageEntryPrice: 14.37,  // Weighted average
  currentPrice: 15.74,
  totalCost: 4310.00,  // 2860 + 1450
  currentMarketValue: 4722.00,  // 3148 + 1574
  isAggregated: true,
  sourceAccounts: ["TFSA", "Cash"],  // ◄── IMPORTANT
  accountCount: 2,
  individualPositions: [  // ◄── DETAILED BREAKDOWN
    {
      accountName: "TFSA-****4567",
      accountType: "TFSA",
      personName: "Victor",
      shares: 200,
      avgCost: 14.30,
      marketValue: 3148.00,
      currency: "CAD"
    },
    {
      accountName: "Cash-****4568",
      accountType: "Cash",
      personName: "Victor",
      shares: 100,
      avgCost: 14.50,
      marketValue: 1574.00,
      currency: "CAD"
    }
  ],
  dividendData: {
    annualDividend: 590.40,  // $1.968 * 300 shares
    monthlyDividendPerShare: 0.164,
    annualDividendPerShare: 1.968,
    yieldOnCost: 13.69
  }
}
```

**Response sent to Frontend:**
```json
{
  "success": true,
  "viewMode": "person",
  "aggregate": true,
  "count": 105,
  "data": [
    { /* IMAX.TO aggregated position */ },
    { /* HYLD.TO aggregated position */ },
    { /* GLD aggregated position */ },
    // ... 105 total symbols
  ]
}
```

---

## Request 2: Cash Balances

### Frontend Request
**File:** `D:\Project\3\Frontend-v2\portfolio-manager-v2\src\services\api.js:42-53`

```javascript
const response = await fetch(
  '/api/portfolio/cash-balances?viewMode=person&personName=Victor'
);
```

**Full URL:** `http://localhost:4003/api/portfolio/cash-balances?viewMode=person&personName=Victor`

---

### Backend Processing

#### Fetch Balances from Sync API
**File:** `portfolioCalculator.js:1003-1125 (getCashBalances method)`

**Request to Sync API:**
```
GET http://localhost:4002/api/balances/person/Victor
```

**MongoDB Query (in Sync API):**
```javascript
db.balances.find({ personName: "Victor" })
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accounts": [
      {
        "accountId": "51234567",
        "accountName": "****4567",
        "accountType": "TFSA",
        "personName": "Victor",
        "cashBalances": [
          { "currency": "CAD", "cash": 1098.71 },
          { "currency": "USD", "cash": 0.00 }
        ]
      },
      {
        "accountId": "51234568",
        "accountName": "****4568",
        "accountType": "Cash",
        "personName": "Victor",
        "cashBalances": [
          { "currency": "CAD", "cash": 990.60 },
          { "currency": "USD", "cash": 0.00 }
        ]
      }
    ],
    "summary": {
      "totalAccounts": 2,
      "totalPersons": 1,
      "totalCAD": 2089.31,
      "totalUSD": 0.00,
      "totalInCAD": 2089.31
    }
  }
}
```

---

## Request 3: Exchange Rate

**Request:** `GET /api/portfolio/exchange-rate`
**Response:**
```json
{
  "success": true,
  "data": {
    "rate": 1.3942,
    "pair": "USD/CAD"
  }
}
```

---

## Frontend: Account-Level Filtering

After receiving aggregated data from the backend, the **frontend filters by accountType** in the UI layer.

### File: `Holdings.jsx:130-157 (filterPositionsByAccount function)`

```javascript
function filterPositionsByAccount(positions) {
  const filter = accountFilter();  // { type: 'account', value: { accountType: 'TFSA' } }

  if (filter.type === 'account' && filter.value?.accountType) {
    const accountType = filter.value.accountType;  // 'TFSA'
    console.log('🏦 Filtering by account type:', accountType);

    const filtered = [];

    // Expand individualPositions into separate position objects
    positions.forEach(pos => {
      if (pos.individualPositions && Array.isArray(pos.individualPositions)) {
        const accountPositions = pos.individualPositions.filter(
          indivPos => indivPos.accountType === accountType  // Filter by TFSA
        );

        accountPositions.forEach(indivPos => {
          filtered.push({
            ...pos,
            currency: indivPos.currency || pos.currency,
            openQuantity: indivPos.shares,
            averageEntryPrice: indivPos.avgCost,
            accountName: indivPos.accountName,
            sourceAccounts: [indivPos.accountType],
            isAggregated: false
          });
        });
      }
    });

    console.log(`✅ Filtered ${filtered.length} positions for TFSA`);
    return filtered;
  }

  return positions;
}
```

---

## Example: IMAX.TO Account Filtering

### Before Filtering (Aggregated across all accounts)
```javascript
{
  symbol: "IMAX.TO",
  openQuantity: 300,  // Total across TFSA + Cash
  averageEntryPrice: 14.37,
  sourceAccounts: ["TFSA", "Cash"],
  individualPositions: [
    { accountType: "TFSA", shares: 200, avgCost: 14.30 },
    { accountType: "Cash", shares: 100, avgCost: 14.50 }
  ]
}
```

### After Filtering (TFSA only)
```javascript
{
  symbol: "IMAX.TO",
  openQuantity: 200,  // Only TFSA shares
  averageEntryPrice: 14.30,  // Only TFSA avg cost
  sourceAccounts: ["TFSA"],
  accountName: "TFSA-****4567",
  isAggregated: false
}
```

**The Cash account position (100 shares @ $14.50) is removed from the display.**

---

## Summary Flow

```
User selects "TFSA - ****4567"
    │
    ▼
Topbar → handleAccountSelection('account', { accountType: 'TFSA', ... })
    │
    ▼
App → setAccountFilter({ type: 'account', value: { accountType: 'TFSA' } })
    │
    ▼
Holdings → Reactive effect triggers loadData()
    │
    ▼
API Requests:
    1. GET /api/portfolio/positions?viewMode=person&personName=Victor
       → Returns ALL Victor's positions (aggregated across all accounts)
       → Each position includes individualPositions array breakdown

    2. GET /api/portfolio/cash-balances?viewMode=person&personName=Victor
       → Returns cash for ALL Victor's accounts (TFSA, Cash, etc.)

    3. GET /api/portfolio/exchange-rate
       → Returns USD/CAD rate
    │
    ▼
Frontend Filtering (Holdings.jsx):
    - Loop through positions
    - For each position, extract individualPositions
    - Filter by accountType === 'TFSA'
    - Create separate position objects for TFSA holdings only
    │
    ▼
Calculate Metrics (only for TFSA positions):
    - Total Invested (TFSA only)
    - Current Value (TFSA only)
    - P&L (TFSA only)
    - YoC (TFSA dividend-paying stocks only)
    - Cash (TFSA cash balance only)
    │
    ▼
Render Holdings Table:
    - Shows only TFSA positions
    - Metrics cards reflect TFSA-only data
```

---

## Key Points

1. **Backend sends ALL positions for the person** - The backend always returns aggregated positions across all accounts for the selected person.

2. **Frontend filters by account type** - The `filterPositionsByAccount` function in Holdings.jsx extracts and filters `individualPositions` by `accountType`.

3. **No additional API calls** - Switching between accounts (TFSA → Cash → RRSP) does NOT trigger new API requests. The data is already loaded.

4. **Efficient design** - This approach minimizes API calls while providing flexible account-level filtering in the UI.

5. **Cash balances are also filtered** - The metrics calculation filters cash balances to show only the selected account's cash.

---

## File References

| Component | File Path | Key Lines |
|-----------|-----------|-----------|
| Account Dropdown | `Frontend-v2/portfolio-manager-v2/src/components/layout/Topbar.jsx` | 73-81 |
| Account Filter Handler | `Frontend-v2/portfolio-manager-v2/src/App.jsx` | 110-118 |
| Data Loading | `Frontend-v2/portfolio-manager-v2/src/pages/Holdings.jsx` | 160-218 |
| Account Filtering | `Frontend-v2/portfolio-manager-v2/src/pages/Holdings.jsx` | 130-157 |
| Portfolio Route | `Backend/questrade-portfolio-microservices/questrade-portfolio-api/src/routes/portfolio.js` | 59-86 |
| Position Aggregation | `Backend/questrade-portfolio-microservices/questrade-portfolio-api/src/services/portfolioCalculator.js` | 153-504 |
| Cash Balances | `Backend/questrade-portfolio-microservices/questrade-portfolio-api/src/services/portfolioCalculator.js` | 1003-1125 |

---

**End of Account Selection Flow Documentation**
