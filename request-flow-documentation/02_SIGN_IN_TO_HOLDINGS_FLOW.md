# Complete Sign-In to Holdings Page Flow

**Date:** 2025-10-28
**Application:** Questrade Portfolio Manager v2.0

---

## Overview

This document details the complete request flow from clicking "Sign In" to displaying the Holdings page with all data.

---

## Flow Diagram

```
┌────────────────────────────────────────────────────────────┐
│  STEP 1: User enters credentials and clicks "Sign In"     │
│  Username: victor                                          │
│  Password: ********                                        │
└────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────┐
│  FRONTEND: Login.jsx:10-48                                 │
│  File: Frontend-v2/portfolio-manager-v2/src/pages/Login.jsx│
│                                                            │
│  POST /api/login                                           │
│  Body: { username: "victor", password: "********" }        │
└────────────────────────────────────────────────────────────┘
                         │
                         ▼ (Vite Proxy: /api/login → :4001)
┌────────────────────────────────────────────────────────────┐
│  BACKEND: Auth API (port 4001)                             │
│  File: Backend/.../questrade-auth-api/src/routes/login.js  │
│  Route: POST /api/login (line 15-110)                      │
│                                                            │
│  Process:                                                  │
│  1. Query MongoDB users collection                         │
│     db.users.findOne({ username: "victor" })               │
│                                                            │
│  2. Verify password with bcrypt                            │
│     user.comparePassword(password)                         │
│                                                            │
│  3. Generate JWT token (24h expiry)                        │
│     jwt.sign({ userId, username, role }, secret, ...)      │
│                                                            │
│  4. Update last login time                                 │
│     user.updateLastLogin()                                 │
│                                                            │
│  Response:                                                 │
│  {                                                         │
│    success: true,                                          │
│    message: "Login successful",                            │
│    token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",       │
│    user: {                                                 │
│      id: "507f1f77bcf86cd799439011",                       │
│      username: "victor",                                   │
│      displayName: "Victor",                                │
│      email: "victor@example.com",                          │
│      role: "user",                                         │
│      lastLogin: "2025-10-28T10:30:00.000Z"                 │
│    }                                                       │
│  }                                                         │
└────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────┐
│  STEP 2: Store Authentication in localStorage              │
│  File: Login.jsx:30-33                                     │
│                                                            │
│  localStorage.setItem('authToken', data.token)             │
│  localStorage.setItem('user', JSON.stringify(data.user))   │
│  localStorage.setItem('loginTime', Date.now().toString())  │
│                                                            │
│  Stored Data:                                              │
│  - authToken: "eyJhbGciOiJIUzI1NiIs..."                    │
│  - user: '{"id":"...","username":"victor",...}'            │
│  - loginTime: "1730102400000"                              │
└────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────┐
│  STEP 3: Navigate to Holdings Page                         │
│  File: Login.jsx:36-38 + App.jsx:127-129                   │
│                                                            │
│  onLoginSuccess() → checkAuth() → setIsLoggedIn(true)      │
└────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────┐
│  STEP 4: Load Persons List                                 │
│  File: App.jsx:51-66                                       │
│                                                            │
│  GET /api/persons                                          │
└────────────────────────────────────────────────────────────┘
                         │
                         ▼ (Vite Proxy: /api/persons → :4001)
┌────────────────────────────────────────────────────────────┐
│  BACKEND: Auth API (port 4001)                             │
│  File: .../questrade-auth-api/src/routes/persons.js:9-18   │
│                                                            │
│  Query MongoDB:                                            │
│  db.persons.find({ isActive: true })                       │
│            .select('-__v')                                 │
│            .sort({ personName: 1 })                        │
│                                                            │
│  Response:                                                 │
│  {                                                         │
│    success: true,                                          │
│    data: [                                                 │
│      {                                                     │
│        _id: "...",                                         │
│        personName: "Roshni",                               │
│        displayName: "Roshni",                              │
│        isActive: true                                      │
│      },                                                    │
│      {                                                     │
│        personName: "Victor",                               │
│        displayName: "Victor",                              │
│        isActive: true                                      │
│      },                                                    │
│      {                                                     │
│        personName: "Vivek",                                │
│        displayName: "Vivek",                               │
│        isActive: true                                      │
│      }                                                     │
│    ]                                                       │
│  }                                                         │
└────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────┐
│  STEP 5: Holdings Component Mounts                         │
│  File: Holdings.jsx:628-634                                │
│                                                            │
│  onMount(() => {                                           │
│    loadData();                                             │
│    refreshInterval = setInterval(loadData, 60000);        │
│  });                                                       │
└────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────┐
│  STEP 6: Load Portfolio Data (3 Parallel Requests)         │
│  File: Holdings.jsx:192-196                                │
│                                                            │
│  const [positionsData, cashData, rate] = await Promise.all([│
│    fetchPositions(personName),        // Request A          │
│    fetchCashBalances(personName),     // Request B          │
│    fetchExchangeRate()                // Request C          │
│  ]);                                                       │
└────────────────────────────────────────────────────────────┘
           │                    │                    │
           ▼                    ▼                    ▼
    ┌──────────┐        ┌──────────┐        ┌──────────┐
    │REQUEST A │        │REQUEST B │        │REQUEST C │
    │Positions │        │   Cash   │        │ Exchange │
    └──────────┘        └──────────┘        └──────────┘
```

---

## Request A: Portfolio Positions

### Request Details
```
GET /api/portfolio/positions?viewMode=all&aggregate=true
Proxy: /api → http://localhost:4003
Full URL: http://localhost:4003/api/portfolio/positions?viewMode=all
```

### Backend Chain

#### 1. Portfolio API Route
**File:** `portfolio.js:59-86`

#### 2. Get All Active Persons
**File:** `portfolioCalculator.js:56-70`
```
GET http://localhost:4001/api/persons
Response: ["Roshni", "Victor", "Vivek"]
```

#### 3. Fetch Positions for Each Person
**File:** `portfolioCalculator.js:102-132`

For each person (Roshni, Victor, Vivek):
```
GET http://localhost:4002/api/positions/person/{personName}?aggregated=false
```

**MongoDB Queries:**
```javascript
// For Roshni
db.positions.find({ personName: "Roshni" }).sort({ currentMarketValue: -1 })

// For Victor
db.positions.find({ personName: "Victor" }).sort({ currentMarketValue: -1 })

// For Vivek
db.positions.find({ personName: "Vivek" }).sort({ currentMarketValue: -1 })
```

**Sample Position Document:**
```javascript
{
  _id: ObjectId("..."),
  accountId: "51234567",
  personName: "Victor",
  accountType: "TFSA",
  symbol: "IMAX.TO",
  symbolId: 9372670,
  openQuantity: 200,
  currentPrice: 15.74,
  previousDayClose: 15.73,
  averageEntryPrice: 14.30,
  totalCost: 2860.00,
  currentMarketValue: 3148.00,
  openPnl: 288.00,
  dayPnl: 46.00,
  isDividendStock: true,
  dividendData: {
    totalReceived: 207.45,
    monthlyDividendPerShare: 0.164,
    annualDividendPerShare: 1.968,
    annualDividend: 393.60,
    yieldOnCost: 13.76,
    currentYield: 12.50,
    dividendFrequency: 12
  },
  lastSyncedAt: ISODate("2025-10-28T10:30:00Z")
}
```

#### 4. Fetch Accounts for Each Person
**File:** `portfolioCalculator.js:119-128`

```
GET http://localhost:4002/api/accounts/Roshni
GET http://localhost:4002/api/accounts/Victor
GET http://localhost:4002/api/accounts/Vivek
```

**MongoDB Query:**
```javascript
db.accounts.find({ personName: "Victor" })
```

**Sample Account Document:**
```javascript
{
  accountId: "51234567",
  personName: "Victor",
  type: "TFSA",
  number: "****4567",
  status: "Active",
  isPrimary: true,
  clientAccountType: "Individual"
}
```

#### 5. Aggregate Positions by Symbol
**File:** `portfolioCalculator.js:153-504`

Groups all positions by symbol across all persons and accounts:
- Combines IMAX.TO from Victor's TFSA + Victor's Cash + Vivek's RRSP
- Calculates weighted averages
- Fetches current prices from Market API
- Calculates dividend data
- Marks YoC exclusions

**Market API Call:**
```
POST http://localhost:4004/api/symbols/lookup
Body: { symbols: ["IMAX.TO", "GLD", "SLV", "HYLD.TO", ...] }
```

#### 6. Final Response
```json
{
  "success": true,
  "viewMode": "all",
  "aggregate": true,
  "count": 105,
  "data": [
    {
      "symbol": "GLD",
      "companyName": "SPDR GOLD TRUST",
      "currency": "USD",
      "openQuantity": 34,
      "averageEntryPrice": 130.43,
      "currentPrice": 164.75,
      "previousClose": 164.00,
      "dayPnl": -484.36,
      "sourceAccounts": ["TFSA", "Cash"],
      "accountCount": 2,
      "excludedFromYoC": true,
      "portfolioPercentage": 20.02,
      "individualPositions": [
        {
          "accountName": "TFSA-****4567",
          "accountType": "TFSA",
          "personName": "Victor",
          "shares": 34,
          "avgCost": 130.43,
          "marketValue": 5601.50,
          "currency": "USD"
        }
      ],
      "dividendData": {
        "totalReceived": 0,
        "annualDividend": 0,
        "yieldOnCost": 0
      }
    },
    // ... 104 more symbols
  ]
}
```

---

## Request B: Cash Balances

### Request Details
```
GET /api/portfolio/cash-balances?viewMode=all
Full URL: http://localhost:4003/api/portfolio/cash-balances?viewMode=all
```

### Backend Processing

#### 1. Fetch All Balances
**File:** `portfolioCalculator.js:1003-1125`

```
GET http://localhost:4002/api/balances
```

**MongoDB Query:**
```javascript
db.balances.find({}).sort({ personName: 1, accountId: 1 })
```

**Sample Balance Document:**
```javascript
{
  _id: ObjectId("..."),
  accountId: "51234567",
  personName: "Victor",
  perCurrencyBalances: [
    {
      currency: "CAD",
      cash: 1098.71,
      marketValue: 18450.23,
      totalEquity: 19548.94,
      buyingPower: 1098.71,
      maintenanceExcess: 0
    },
    {
      currency: "USD",
      cash: 0.00,
      marketValue: 0.00,
      totalEquity: 0.00,
      buyingPower: 0.00,
      maintenanceExcess: 0
    }
  ],
  sodPerCurrencyBalances: [...],  // Start of day balances
  lastUpdated: ISODate("2025-10-28T10:30:00Z")
}
```

#### 2. Enrich with Account Details

Fetches account metadata for each balance:
```
GET http://localhost:4002/api/accounts/Roshni
GET http://localhost:4002/api/accounts/Victor
GET http://localhost:4002/api/accounts/Vivek
```

#### 3. Group and Calculate Totals

**Response:**
```json
{
  "success": true,
  "viewMode": "all",
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
      },
      // ... more accounts for all persons
    ],
    "summary": {
      "totalAccounts": 8,
      "totalPersons": 3,
      "totalCAD": 11075.00,
      "totalUSD": 0.00,
      "totalInCAD": 11075.00
    }
  }
}
```

---

## Request C: Exchange Rate

### Request Details
```
GET /api/portfolio/exchange-rate
Full URL: http://localhost:4003/api/portfolio/exchange-rate
```

### Backend Processing

**File:** `portfolio.js:113-161`

Fetches from currency service (cached, updated every 5 minutes):

**Response:**
```json
{
  "success": true,
  "data": {
    "rate": 1.3942,
    "pair": "USD/CAD",
    "cachedAt": "2025-10-28T10:25:00.000Z"
  }
}
```

---

## Frontend Processing

### 1. Store Raw Data
**File:** `Holdings.jsx:203-211`

```javascript
setRawPositions(positionsData || []);
setCashBalances(cashData || []);
setExchangeRate(rate);
```

### 2. Transform Positions
**File:** `Holdings.jsx:56-127 (transformPositions)`

Converts API response to UI format with all 17 columns.

### 3. Calculate Metrics
**File:** `Holdings.jsx:349-501 (calculateMetrics)`

```javascript
// Loop through all positions
positions.forEach(pos => {
  totalInvested += cost * qty;
  currentValue += currentPrice * qty;
  todayPnL += (currentPrice - previousClose) * qty;

  if (!pos.excludedFromYoC) {
    yocTotalInvested += cost * qty;
    yocTotalDividendIncome += annualDividend;
  }
});

// Calculate YoC
const yoc = (yocTotalDividendIncome / yocTotalInvested) * 100;
const monthlyIncome = yocTotalDividendIncome / 12;
```

**Sample Metrics:**
```javascript
{
  totalInvested: 81209.64,
  currentValue: 86248.52,
  profitLoss: 5038.88,
  profitLossPercent: 6.20,
  todayPnL: -1189.01,
  todayPnLPercent: -1.36,
  yoc: 6.20,
  monthlyIncome: 419.91,
  totalCashCAD: 11075.00,
  totalCashUSD: 0.00,
  cashAccountCount: 8,
  positionCount: 105
}
```

### 4. Format for Display
**File:** `Holdings.jsx:505-571 (formattedMetrics)`

Converts metrics to card format:
```javascript
[
  { name: "INVEST", value: "CAD: $81,209.64", info: "105 pos" },
  { name: "CURRENT", value: "CAD: $86,248.52", info: "live" },
  { name: "P&L", value: "CAD: $5,038.88", info: "+6.20%" },
  { name: "TODAY'S P&L", value: "CAD: -$1,189.01", info: "-1.36%" },
  { name: "RETURN", value: "CAD: $7,557.82", info: "+9.30%" },
  { name: "YOC", value: "6.20%", info: "CAD: $420/mo" },
  { name: "CASH", value: "Total CAD: $11,075.00\nCAD $11,075.00\nUSD $0.00", info: "8 accounts" }
]
```

### 5. WebSocket Connection
**File:** `Holdings.jsx:644-668`

```javascript
const symbols = positions.map(pos => pos.symbol);
questradeWebSocket.connect(symbols, handleQuoteUpdate);
```

Connects to WebSocket for real-time price updates.

### 6. Render UI
**File:** `Holdings.jsx:767-782`

Renders:
- **MetricsGrid**: 7 metric cards
- **HoldingsTable**: 105 positions with 17 columns

---

## Summary Timeline

| Step | Action | Time | Requests |
|------|--------|------|----------|
| 1 | User clicks Sign In | 0ms | 1 (POST /api/login) |
| 2 | Store auth in localStorage | +50ms | 0 |
| 3 | Navigate to Holdings | +100ms | 0 |
| 4 | Load persons list | +150ms | 1 (GET /api/persons) |
| 5 | Holdings component mounts | +200ms | 0 |
| 6 | Load portfolio data (parallel) | +250ms | 3 (positions, cash, rate) |
| 7 | Transform & calculate | +500ms | 0 |
| 8 | Render UI | +600ms | 0 |
| 9 | Connect WebSocket | +800ms | 0 |

**Total time from sign-in to fully loaded page: ~800ms**

---

## Database Collections Used

| Collection | Purpose | Sample Count |
|------------|---------|--------------|
| `users` | Authentication | 3 users |
| `persons` | Person metadata | 3 persons |
| `positions` | Stock positions | ~300 positions |
| `accounts` | Account details | 8 accounts |
| `balances` | Cash balances | 8 balance records |
| `yieldexclusions` | YoC exclusions | ~10 symbols |
| `symboldividends` | Manual overrides | ~5 symbols |

---

**End of Sign-In to Holdings Flow Documentation**
