# Questrade Portfolio Manager - Request Flow Documentation

**Application:** Questrade Portfolio Manager v2.0
**Created:** October 28, 2025
**Frontend Path:** `D:\Project\3\Frontend-v2`
**Backend Path:** `D:\Project\3\Backend`

---

## Overview

This folder contains comprehensive documentation of all request flows, data processing, and calculations in the Questrade Portfolio Manager application. These documents can be shared with developers, stakeholders, or anyone needing to understand how the application works.

---

## Documentation Files

### 1. [Account Selection Flow](01_ACCOUNT_SELECTION_FLOW.md)
**What it covers:**
- Complete flow when user selects an account from the dropdown (e.g., "TFSA - ****4567")
- How backend aggregates positions across all accounts
- How frontend filters positions by account type
- Why switching accounts doesn't trigger new API calls
- Sample data at each step

**Key Topics:**
- Account dropdown interaction
- API requests for person-level data
- Frontend filtering logic
- Position aggregation and individual breakdown
- Cash balance filtering by account

**Use this when:** You need to understand how account-level filtering works and why it's done in the UI layer.

---

### 2. [Sign-In to Holdings Flow](02_SIGN_IN_TO_HOLDINGS_FLOW.md)
**What it covers:**
- Complete authentication flow from login to displaying holdings
- JWT token generation and storage
- Parallel data loading (positions, cash, exchange rate)
- Initial page load sequence
- WebSocket connection for real-time updates

**Key Topics:**
- User authentication with bcrypt
- JWT token creation (24h expiry)
- Person list fetching
- Portfolio data loading
- MongoDB queries at each step
- Timing and performance

**Use this when:** You need to understand the entire flow from sign-in to a fully loaded holdings page.

---

### 3. [YOC and CASH Calculation](03_YOC_AND_CASH_CALCULATION.md)
**What it covers:**
- Yield on Cost (YoC) calculation methodology
- CASH metric calculation
- How dividend data flows from MongoDB to UI
- YoC exclusion mechanism
- Sample calculations with real data

**Key Topics:**
- Dividend data structure in MongoDB
- YoC exclusion flags (GLD, SLV, IBIT)
- Manual dividend overrides
- Cash balance per currency
- Step-by-step calculation examples

**Use this when:** You need to understand how YoC and CASH metrics are calculated from raw database data.

---

### 4. [Questrade WebSocket Flow](04_QUESTRADE_WEBSOCKET_FLOW.md)
**What it covers:**
- Complete WebSocket connection flow for real-time quotes
- Authentication token retrieval and caching
- Symbol ID lookup process
- Stream port acquisition from Questrade API
- WebSocket message handling
- Connection maintenance and health monitoring

**Key Topics:**
- Multi-person fallback mechanism (Roshni → Victor → Vivek)
- Access token caching (30-min TTL)
- Symbol ID caching (permanent)
- Stream port caching (24-hour TTL)
- Real-time quote processing
- Heartbeat and auto-reconnect logic

**Use this when:** You need to understand how real-time stock quotes are received via WebSocket.

---

## Architecture Overview

### Technology Stack

**Frontend:**
- Framework: SolidJS
- Dev Server: Vite (port 5500)
- Proxy: Routes API requests to backend microservices
- State Management: Solid Signals and Stores
- Real-time Updates: WebSocket

**Backend Microservices:**
| Service | Port | Purpose | Database |
|---------|------|---------|----------|
| Auth API | 4001 | User authentication, JWT tokens, person management | MongoDB (users, persons) |
| Sync API | 4002 | Questrade data sync, positions, accounts, balances | MongoDB (positions, accounts, balances) |
| Portfolio API | 4003 | Portfolio calculations, aggregations, analytics | MongoDB (read-only) |
| Market API | 4004 | Market data, symbol lookup, current prices | MongoDB (symbols, prices) |

**Database:**
- MongoDB (questrade-portfolio-db)
- Collections: users, persons, positions, accounts, balances, yieldexclusions, symboldividends, activities, etc.

---

## Key Request Patterns

### Pattern 1: Person-Level Data Fetch
**Use Case:** User views all holdings for a person (e.g., Victor)
```
Frontend → GET /api/portfolio/positions?viewMode=person&personName=Victor
         → Portfolio API (4003)
         → GET http://localhost:4002/api/positions/person/Victor (Sync API)
         → MongoDB positions.find({ personName: "Victor" })
         → Returns: All positions for Victor across all accounts
         → Backend aggregates by symbol
         → Frontend displays aggregated data
```

### Pattern 2: Account-Level Filtering
**Use Case:** User selects a specific account (e.g., TFSA)
```
Frontend → Same as Pattern 1 (gets ALL person data)
         → Frontend filters by accountType in UI layer
         → Extracts individualPositions array
         → Filters: indivPos.accountType === 'TFSA'
         → Displays: Only TFSA positions
```

### Pattern 3: Cash Balance Fetch
**Use Case:** Display cash metrics
```
Frontend → GET /api/portfolio/cash-balances?viewMode=person&personName=Victor
         → Portfolio API (4003)
         → GET http://localhost:4002/api/balances/person/Victor (Sync API)
         → MongoDB balances.find({ personName: "Victor" })
         → Returns: Cash balances for all Victor's accounts
         → Backend sums by currency (CAD, USD)
         → Frontend displays totals
```

---

## MongoDB Collections Reference

### Core Collections

#### positions
```javascript
{
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
  }
}
```

#### accounts
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

#### balances
```javascript
{
  accountId: "51234567",
  personName: "Victor",
  perCurrencyBalances: [
    {
      currency: "CAD",
      cash: 1098.71,
      marketValue: 18450.23,
      totalEquity: 19548.94
    },
    {
      currency: "USD",
      cash: 0.00,
      marketValue: 0.00,
      totalEquity: 0.00
    }
  ]
}
```

#### yieldexclusions
```javascript
{
  personName: "Victor",
  symbol: "GLD",
  excludeFromYoC: true,
  reason: "Non-dividend producing gold ETF"
}
```

#### symboldividends
```javascript
{
  symbol: "HYLD.TO",
  monthlyDividendPerShare: 0.2040,
  dividendFrequency: "monthly",
  notes: "Manual override"
}
```

---

## API Endpoint Reference

### Auth API (port 4001)
- `POST /api/login` - User authentication, returns JWT token
- `POST /api/login/verify` - Verify JWT token validity
- `POST /api/login/refresh` - Refresh JWT token
- `GET /api/persons` - Get all active persons
- `GET /api/persons/:personName` - Get specific person with token status
- `POST /api/persons` - Create new person
- `PUT /api/persons/:personName` - Update person
- `DELETE /api/persons/:personName` - Deactivate person
- `POST /api/persons/:personName/token` - Update Questrade refresh token

### Portfolio API (port 4003)
- `GET /api/portfolio/positions` - Get positions (aggregated or individual)
- `GET /api/portfolio/cash-balances` - Get cash balances
- `GET /api/portfolio/exchange-rate` - Get USD/CAD exchange rate
- `GET /api/portfolio/:personName` - Get complete portfolio overview
- `GET /api/portfolio/:personName/summary` - Get portfolio summary
- `GET /api/portfolio/:personName/holdings` - Get all holdings
- `GET /api/yield-exclusions/:personName` - Get YoC exclusions
- `POST /api/yield-exclusions/:personName` - Add YoC exclusion
- `DELETE /api/yield-exclusions/:personName/:symbol` - Remove YoC exclusion

### Sync API (port 4002)
- `GET /api/positions/person/:personName` - Get positions for person
- `GET /api/accounts/:personName` - Get accounts for person
- `GET /api/balances/person/:personName` - Get balances for person
- `POST /api/sync/sync-person/:personName` - Sync person's data from Questrade
- `GET /api/activities/person/:personName` - Get account activities

### Market API (port 4004)
- `POST /api/symbols/lookup` - Lookup symbol details
- `GET /api/quotes/:symbol` - Get current quote for symbol
- `POST /api/quotes/batch` - Get quotes for multiple symbols

---

## Common Workflows

### Workflow 1: Login and View Portfolio
1. User enters credentials → `POST /api/login`
2. Store JWT token in localStorage
3. Fetch persons list → `GET /api/persons`
4. Load holdings page data (3 parallel requests):
   - `GET /api/portfolio/positions?viewMode=all`
   - `GET /api/portfolio/cash-balances?viewMode=all`
   - `GET /api/portfolio/exchange-rate`
5. Transform data and calculate metrics
6. Render UI with metrics cards and holdings table
7. Connect WebSocket for real-time price updates

### Workflow 2: Switch to Account View
1. User clicks account dropdown
2. User selects "TFSA - ****4567"
3. Frontend updates accountFilter state
4. Holdings page re-filters existing data:
   - Extract individualPositions array
   - Filter by accountType === 'TFSA'
5. Recalculate metrics for TFSA only
6. Re-render UI with filtered data
7. **No new API calls!**

### Workflow 3: Sync Data from Questrade
1. User clicks "SYNC" button
2. Frontend → `POST /api-sync/sync/trigger` (port 4002)
3. Sync API:
   - Fetches latest data from Questrade API
   - Updates MongoDB positions, accounts, balances
   - Syncs dividend data
   - Updates prices
4. Frontend reloads page to show new data

---

## Performance Optimization

### Data Loading Strategy
- **Initial Load:** 3 parallel requests (positions, cash, rate)
- **Account Switching:** No new requests (filter in UI)
- **Person Switching:** Triggers new data load
- **Auto-refresh:** Every 60 seconds (configurable)

### Caching
- **Exchange Rate:** Cached for 5 minutes
- **Symbol Metadata:** Cached in backend
- **Market Prices:** Updated via WebSocket in real-time

### Reactive Updates
- **SolidJS Signals:** Fine-grained reactivity
- **Debounced Calculations:** Metrics calculated max once per 300ms
- **Batch Updates:** WebSocket updates batched to prevent excessive renders

---

## Development Notes

### File Structure
```
D:\Project\3\
├── Frontend-v2/
│   └── portfolio-manager-v2/
│       ├── src/
│       │   ├── pages/
│       │   │   ├── Login.jsx
│       │   │   └── Holdings.jsx
│       │   ├── components/
│       │   │   └── layout/
│       │   │       └── Topbar.jsx
│       │   ├── services/
│       │   │   ├── api.js
│       │   │   └── questradeWebSocket.js
│       │   └── utils/
│       │       └── auth.js
│       └── vite.config.js
│
├── Backend/
│   └── questrade-portfolio-microservices/
│       ├── questrade-auth-api/ (port 4001)
│       │   └── src/
│       │       └── routes/
│       │           ├── login.js
│       │           └── persons.js
│       ├── questrade-sync-api/ (port 4002)
│       │   └── src/
│       │       ├── models/
│       │       │   ├── Position.js
│       │       │   ├── Account.js
│       │       │   └── Balance.js
│       │       └── routes/
│       ├── questrade-portfolio-api/ (port 4003)
│       │   └── src/
│       │       ├── routes/
│       │       │   └── portfolio.js
│       │       └── services/
│       │           └── portfolioCalculator.js
│       └── questrade-market-api/ (port 4004)
│
└── request-flow-documentation/  ◄── THIS FOLDER
    ├── README.md  ◄── YOU ARE HERE
    ├── 01_ACCOUNT_SELECTION_FLOW.md
    ├── 02_SIGN_IN_TO_HOLDINGS_FLOW.md
    └── 03_YOC_AND_CASH_CALCULATION.md
```

### Environment Configuration
- **Development:** All services run on localhost
- **Frontend:** http://localhost:5500
- **Backend Services:** Ports 4001-4004
- **MongoDB:** localhost:27017
- **Database:** questrade-portfolio-db

---

## Troubleshooting Guide

### Common Issues

**Issue:** "Unable to connect to server" on login
- **Check:** Auth API is running on port 4001
- **Check:** MongoDB is running
- **Check:** Vite proxy is configured correctly

**Issue:** Holdings page shows no data
- **Check:** Portfolio API is running on port 4003
- **Check:** Sync API is running on port 4002
- **Check:** Data exists in MongoDB positions collection

**Issue:** YoC calculation seems incorrect
- **Check:** Dividend data is synced in positions collection
- **Check:** YoC exclusions are set correctly (GLD, SLV, etc.)
- **Check:** Manual dividend overrides if any

**Issue:** Account filter doesn't work
- **Check:** Positions have individualPositions array
- **Check:** individualPositions includes accountType field
- **Check:** accountFilter state is set correctly

---

## Additional Resources

### MongoDB Queries for Debugging

**Check positions for a person:**
```javascript
db.positions.find({ personName: "Victor" }).limit(5)
```

**Check cash balances:**
```javascript
db.balances.find({ personName: "Victor" })
```

**Check YoC exclusions:**
```javascript
db.yieldexclusions.find({ personName: "Victor" })
```

**Check manual dividend overrides:**
```javascript
db.symboldividends.find({})
```

**Count total positions:**
```javascript
db.positions.countDocuments()
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-10-28 | Initial documentation created |

---

## Contact & Support

For questions about this documentation or the application:
- Review the detailed flow documents in this folder
- Check the MongoDB collections for sample data
- Examine the source code in Frontend-v2 and Backend folders

---

**End of README**
