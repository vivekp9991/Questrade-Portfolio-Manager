# System Architecture Diagram

**Questrade Portfolio Manager v2.0**

---

## High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE (Browser)                        │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  SolidJS Frontend (Vite Dev Server - Port 5500)                   │ │
│  │  Files: D:\Project\3\Frontend-v2\portfolio-manager-v2\            │ │
│  │                                                                    │ │
│  │  Components:                                                       │ │
│  │  • Login.jsx          - Authentication UI                          │ │
│  │  • Holdings.jsx       - Main portfolio page                        │ │
│  │  • Topbar.jsx         - Account/currency selector                  │ │
│  │  • MetricsGrid.jsx    - 7 metric cards                             │ │
│  │  • HoldingsTable.jsx  - Holdings data table                        │ │
│  │                                                                    │ │
│  │  Services:                                                         │ │
│  │  • api.js             - REST API calls                             │ │
│  │  • auth.js            - JWT token management                       │ │
│  │  • questradeWebSocket.js - Real-time price updates                 │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                  │                                     │
│                                  │ HTTP/WebSocket                      │
│                                  ▼                                     │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  Vite Proxy Configuration (vite.config.js)                        │ │
│  │                                                                    │ │
│  │  /api/login        → http://localhost:4001/api/login              │ │
│  │  /api/persons      → http://localhost:4001/api/persons            │ │
│  │  /api/tokens       → http://localhost:4001/api/tokens             │ │
│  │  /api/auth         → http://localhost:4001/api/auth               │ │
│  │  /api-sync         → http://localhost:4002/api (Sync API)         │ │
│  │  /api-market       → http://localhost:4004/api (Market API)       │ │
│  │  /api              → http://localhost:4003/api (Portfolio API)    │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      BACKEND MICROSERVICES LAYER                        │
│  Files: D:\Project\3\Backend\questrade-portfolio-microservices\        │
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │
│  │  Auth API       │  │  Sync API       │  │ Portfolio API   │        │
│  │  Port: 4001     │  │  Port: 4002     │  │ Port: 4003      │        │
│  │                 │  │                 │  │                 │        │
│  │ • User login    │  │ • Questrade     │  │ • Position      │        │
│  │ • JWT tokens    │  │   data sync     │  │   aggregation   │        │
│  │ • Person CRUD   │  │ • Positions     │  │ • Dividend calc │        │
│  │ • Token mgmt    │  │ • Accounts      │  │ • Metrics calc  │        │
│  │                 │  │ • Balances      │  │ • Cash totals   │        │
│  │ Routes:         │  │ • Activities    │  │                 │        │
│  │ - login.js      │  │                 │  │ Routes:         │        │
│  │ - persons.js    │  │ Routes:         │  │ - portfolio.js  │        │
│  │ - tokens.js     │  │ - positions.js  │  │ - allocation.js │        │
│  │ - auth.js       │  │ - accounts.js   │  │ - analytics.js  │        │
│  │                 │  │ - balances.js   │  │                 │        │
│  │ Models:         │  │ - sync.js       │  │ Services:       │        │
│  │ - User.js       │  │                 │  │ - portfolioCalc │        │
│  │ - Person.js     │  │ Models:         │  │ - dividend.js   │        │
│  │                 │  │ - Position.js   │  │ - currency.js   │        │
│  │                 │  │ - Account.js    │  │                 │        │
│  │                 │  │ - Balance.js    │  │ Models:         │        │
│  │                 │  │ - Activity.js   │  │ - YieldExcl.js  │        │
│  │                 │  │                 │  │ - SymbolDiv.js  │        │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘        │
│           │                    │                     │                 │
│           │                    │                     │                 │
│  ┌────────┴────────┐  ┌────────┴────────┐                             │
│  │  Market API     │  │  WebSocket      │                             │
│  │  Port: 4004     │  │  Proxy          │                             │
│  │                 │  │                 │                             │
│  │ • Symbol lookup │  │ • Real-time     │                             │
│  │ • Current quotes│  │   price feeds   │                             │
│  │ • Batch quotes  │  │ • Live updates  │                             │
│  │                 │  │                 │                             │
│  │ Routes:         │  │                 │                             │
│  │ - symbols.js    │  │                 │                             │
│  │ - quotes.js     │  │                 │                             │
│  └─────────────────┘  └─────────────────┘                             │
│                                                                         │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      DATABASE LAYER (MongoDB)                           │
│  Connection: mongodb://localhost:27017/questrade-portfolio-db          │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  Collections:                                                      │ │
│  │                                                                    │ │
│  │  Core Data:                                                        │ │
│  │  • users            - User accounts & authentication               │ │
│  │  • persons          - Person profiles (Vivek, Victor, Roshni)      │ │
│  │  • positions        - Stock positions (~300 docs)                  │ │
│  │  • accounts         - Brokerage accounts (8 accounts)              │ │
│  │  • balances         - Cash balances per account                    │ │
│  │  • activities       - Transaction history                          │ │
│  │                                                                    │ │
│  │  Configuration:                                                    │ │
│  │  • yieldexclusions  - Stocks excluded from YoC (GLD, SLV, etc.)    │ │
│  │  • symboldividends  - Manual dividend overrides                    │ │
│  │  • currencyrates    - Exchange rates (USD/CAD)                     │ │
│  │                                                                    │ │
│  │  Market Data:                                                      │ │
│  │  • symbols          - Symbol metadata                              │ │
│  │  • dailyprices      - Historical daily prices                      │ │
│  │  • quotes           - Current market quotes                        │ │
│  │                                                                    │ │
│  │  Analytics:                                                        │ │
│  │  • portfoliosnapshots - Historical portfolio snapshots             │ │
│  │  • performancehistory - Performance tracking                       │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      EXTERNAL SERVICES                                  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  Questrade API (https://api.questrade.com)                       │  │
│  │  • OAuth authentication                                          │  │
│  │  • Account data                                                  │  │
│  │  • Positions & balances                                          │  │
│  │  • Market quotes                                                 │  │
│  │  • Historical data                                               │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  Exchange Rate API (exchangerate-api.com)                        │  │
│  │  • USD/CAD conversion rates                                      │  │
│  │  • Updated every 5 minutes                                       │  │
│  │  • Cached in database                                            │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Request Flow Architecture

### Account Selection Flow

```
┌──────────────┐
│  USER        │
│  Clicks      │
│  "TFSA"      │
└──────┬───────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND: Topbar.jsx                                       │
│  handleAccountSelection('account', accountObject)           │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND: App.jsx                                          │
│  setAccountFilter({ type: 'account', value: {...} })        │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼ (Reactive Effect)
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND: Holdings.jsx                                     │
│  createEffect(() => loadData())                             │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
        ┌───────────────┴───────────────┐
        │                               │
        ▼                               ▼
┌──────────────────┐           ┌──────────────────┐
│  API Request 1   │           │  API Request 2   │
│  Positions       │           │  Cash Balances   │
│  (Person-level)  │           │  (Person-level)  │
└────────┬─────────┘           └────────┬─────────┘
         │                              │
         ▼                              ▼
   ┌─────────────────────────────────────────┐
   │  Backend: Returns ALL person data       │
   │  (aggregated across all accounts)       │
   └─────────────────┬───────────────────────┘
                     │
                     ▼
   ┌─────────────────────────────────────────┐
   │  Frontend: filterPositionsByAccount()   │
   │  Filters individualPositions array      │
   │  by accountType === 'TFSA'              │
   └─────────────────┬───────────────────────┘
                     │
                     ▼
   ┌─────────────────────────────────────────┐
   │  Frontend: calculateMetrics()           │
   │  Calculates metrics for TFSA only       │
   └─────────────────┬───────────────────────┘
                     │
                     ▼
   ┌─────────────────────────────────────────┐
   │  Frontend: Render UI                    │
   │  Shows TFSA positions and metrics       │
   └─────────────────────────────────────────┘
```

---

## Data Aggregation Architecture

### Position Aggregation Flow

```
┌─────────────────────────────────────────────────────────────┐
│  MongoDB: Individual Position Documents                     │
│  (One document per symbol per account)                      │
│                                                             │
│  Example: IMAX.TO holdings                                  │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Doc 1: Victor's TFSA                               │    │
│  │ { symbol: "IMAX.TO", accountId: "51234567",        │    │
│  │   personName: "Victor", accountType: "TFSA",       │    │
│  │   openQuantity: 200, avgCost: 14.30 }             │    │
│  └────────────────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Doc 2: Victor's Cash                               │    │
│  │ { symbol: "IMAX.TO", accountId: "51234568",        │    │
│  │   personName: "Victor", accountType: "Cash",       │    │
│  │   openQuantity: 100, avgCost: 14.50 }             │    │
│  └────────────────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Doc 3: Vivek's RRSP                                │    │
│  │ { symbol: "IMAX.TO", accountId: "62345678",        │    │
│  │   personName: "Vivek", accountType: "RRSP",        │    │
│  │   openQuantity: 150, avgCost: 13.95 }             │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Backend: portfolioCalculator.aggregatePositions()          │
│  File: portfolioCalculator.js:153-504                       │
│                                                             │
│  Process:                                                   │
│  1. Group by symbol: Map { "IMAX.TO" => [Doc1, Doc2, Doc3] }│
│  2. Sum quantities: 200 + 100 + 150 = 450                   │
│  3. Weighted avg cost: (200*14.30 + 100*14.50 + 150*13.95)  │
│                        / 450 = 14.23                        │
│  4. Collect accounts: ["TFSA", "Cash", "RRSP"]              │
│  5. Collect persons: ["Victor", "Vivek"]                    │
│  6. Aggregate dividends: Sum annualDividend values          │
│  7. Build individualPositions array for UI filtering        │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Aggregated Position Object                                 │
│                                                             │
│  {                                                          │
│    symbol: "IMAX.TO",                                       │
│    companyName: "PURPOSE INVESTM...",                       │
│    currency: "CAD",                                         │
│    openQuantity: 450,  // Total across all accounts         │
│    averageEntryPrice: 14.23,  // Weighted average           │
│    currentPrice: 15.74,  // From Market API                 │
│    totalCost: 6403.50,                                      │
│    currentMarketValue: 7083.00,                             │
│    isAggregated: true,                                      │
│    sourceAccounts: ["TFSA", "Cash", "RRSP"],                │
│    accountCount: 3,                                         │
│    dividendData: {                                          │
│      annualDividend: 885.60,  // $1.968 * 450               │
│      yieldOnCost: 13.83                                     │
│    },                                                       │
│    individualPositions: [  // ◄── For UI filtering          │
│      {                                                      │
│        accountName: "TFSA-****4567",                        │
│        accountType: "TFSA",                                 │
│        personName: "Victor",                                │
│        shares: 200,                                         │
│        avgCost: 14.30,                                      │
│        marketValue: 3148.00,                                │
│        currency: "CAD"                                      │
│      },                                                     │
│      {                                                      │
│        accountName: "Cash-****4568",                        │
│        accountType: "Cash",                                 │
│        personName: "Victor",                                │
│        shares: 100,                                         │
│        avgCost: 14.50,                                      │
│        marketValue: 1574.00,                                │
│        currency: "CAD"                                      │
│      },                                                     │
│      {                                                      │
│        accountName: "RRSP-****5678",                        │
│        accountType: "RRSP",                                 │
│        personName: "Vivek",                                 │
│        shares: 150,                                         │
│        avgCost: 13.95,                                      │
│        marketValue: 2361.00,                                │
│        currency: "CAD"                                      │
│      }                                                      │
│    ]                                                        │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Microservices Communication Patterns

### Internal Service Communication

```
┌──────────────────────────────────────────────────────┐
│  Portfolio API (4003)                                │
│  Orchestrates data from multiple sources             │
└───────────┬─────────────┬──────────────┬─────────────┘
            │             │              │
            ▼             ▼              ▼
    ┌──────────┐  ┌──────────┐  ┌──────────────┐
    │ Auth API │  │ Sync API │  │  Market API  │
    │  (4001)  │  │  (4002)  │  │    (4004)    │
    └────┬─────┘  └────┬─────┘  └──────┬───────┘
         │             │                │
         ▼             ▼                ▼
    ┌────────────────────────────────────────┐
    │         MongoDB Database               │
    │  questrade-portfolio-db                │
    └────────────────────────────────────────┘
```

### Example: Portfolio API Calls Other Services

```javascript
// File: portfolioCalculator.js

class PortfolioCalculator {
  async getAllPersonsPositions(viewMode, aggregate, personName) {
    // 1. Get persons from Auth API
    const persons = await this.getAllPersons();
    // → GET http://localhost:4001/api/persons

    // 2. For each person, get positions from Sync API
    for (const person of persons) {
      const positions = await this.fetchFromSyncApi(
        `/positions/person/${person.personName}`
      );
      // → GET http://localhost:4002/api/positions/person/Victor
    }

    // 3. Get current prices from Market API
    const prices = await this.fetchPrices(symbols);
    // → POST http://localhost:4004/api/symbols/lookup

    // 4. Aggregate and return
    return aggregatedPositions;
  }
}
```

---

## Security Architecture

### Authentication Flow

```
┌──────────────────┐
│  User Login      │
│  (credentials)   │
└────────┬─────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  Auth API: /api/login                               │
│  1. Query MongoDB users collection                  │
│  2. Verify password with bcrypt                     │
│  3. Generate JWT token (HS256, 24h expiry)          │
│  4. Return: { token, user }                         │
└────────┬────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  Frontend: Store in localStorage                    │
│  - authToken: "eyJhbGc..."                          │
│  - user: { id, username, displayName, role }        │
│  - loginTime: timestamp                             │
└────────┬────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  Subsequent Requests: Include JWT in header         │
│  Authorization: Bearer eyJhbGc...                    │
└─────────────────────────────────────────────────────┘
```

### JWT Token Structure

```javascript
{
  header: {
    alg: "HS256",
    typ: "JWT"
  },
  payload: {
    userId: "507f1f77bcf86cd799439011",
    username: "victor",
    role: "user",
    iat: 1730102400,  // Issued at
    exp: 1730188800   // Expires (24h later)
  },
  signature: "HMACSHA256(...)"
}
```

---

## Performance Optimization Strategies

### 1. Parallel API Requests

```javascript
// Holdings.jsx:192-196
const [positionsData, cashData, rate] = await Promise.all([
  fetchPositions(personName),      // Request 1
  fetchCashBalances(personName),   // Request 2
  fetchExchangeRate()              // Request 3
]);
```

**Benefit:** Reduces load time from ~1500ms (sequential) to ~500ms (parallel)

---

### 2. Frontend Filtering (No Additional API Calls)

```javascript
// When user switches accounts:
// ❌ BAD: New API request
await fetchPositions(personName, accountId);  // Slow!

// ✅ GOOD: Filter existing data
const filtered = filterPositionsByAccount(rawPositions);  // Fast!
```

**Benefit:** Account switching is instant (no network latency)

---

### 3. Debounced Calculations

```javascript
// Holdings.jsx:49-52
const debouncedCalculateMetrics = debounce(
  (positions, cash, rate, ...) => {
    calculateMetrics(...);
  },
  300  // Wait 300ms after last update
);
```

**Benefit:** Prevents excessive recalculations during rapid WebSocket updates

---

### 4. Granular Reactivity with Solid Stores

```javascript
// Holdings.jsx:17
const [rawPositions, setRawPositions] = createStore([]);

// Update only changed positions
setRawPositions(index, { currentPrice: newPrice });
```

**Benefit:** Only changed positions trigger re-renders, not entire array

---

### 5. Backend Caching

```javascript
// currencyService.js
class CurrencyService {
  async getUSDtoCAD() {
    if (this.isCacheValid()) {
      return this.cachedRate;  // Return cached
    }
    // Fetch fresh data
    const rate = await this.fetchFromAPI();
    this.cacheRate(rate, 5 * 60 * 1000);  // Cache for 5 min
    return rate;
  }
}
```

**Benefit:** Reduces external API calls, improves response time

---

## Deployment Architecture (Future)

### AWS Deployment (Planned)

```
┌─────────────────────────────────────────────────────┐
│  CloudFront CDN                                     │
│  Static Frontend (S3 Bucket)                        │
└───────────────────┬─────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│  API Gateway                                        │
│  Routes: /auth, /portfolio, /sync, /market          │
└──────┬─────────┬──────────┬──────────┬─────────────┘
       │         │          │          │
       ▼         ▼          ▼          ▼
  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
  │ Lambda │ │ Lambda │ │ Lambda │ │ Lambda │
  │  Auth  │ │Portfolio│ │  Sync  │ │Market  │
  └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘
      │          │          │          │
      └──────────┴──────────┴──────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │  DocumentDB (MongoDB) │
        │  Multi-AZ             │
        └───────────────────────┘
```

---

**End of Architecture Diagram**
