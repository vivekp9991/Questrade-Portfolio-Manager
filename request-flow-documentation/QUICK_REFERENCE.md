# Quick Reference Guide

**Questrade Portfolio Manager v2.0**

---

## For Developers: Common Tasks

### Starting the Application

**Frontend:**
```bash
cd D:\Project\3\Frontend-v2\portfolio-manager-v2
npm run dev
# Runs on http://localhost:5500
```

**Backend Services:**
```bash
# Terminal 1: Auth API
cd D:\Project\3\Backend\questrade-portfolio-microservices\questrade-auth-api
npm run dev

# Terminal 2: Sync API
cd D:\Project\3\Backend\questrade-portfolio-microservices\questrade-sync-api
npm run dev

# Terminal 3: Portfolio API
cd D:\Project\3\Backend\questrade-portfolio-microservices\questrade-portfolio-api
npm run dev

# Terminal 4: Market API
cd D:\Project\3\Backend\questrade-portfolio-microservices\questrade-market-api
npm run dev
```

**MongoDB:**
```bash
# Ensure MongoDB is running
mongod --dbpath /path/to/data
```

---

## Key API Endpoints

| Endpoint | Method | Service | Purpose |
|----------|--------|---------|---------|
| `/api/login` | POST | Auth (4001) | User authentication |
| `/api/persons` | GET | Auth (4001) | Get all persons |
| `/api/portfolio/positions` | GET | Portfolio (4003) | Get positions |
| `/api/portfolio/cash-balances` | GET | Portfolio (4003) | Get cash |
| `/api/portfolio/exchange-rate` | GET | Portfolio (4003) | Get USD/CAD rate |
| `/api/yield-exclusions/:personName` | GET | Portfolio (4003) | Get YoC exclusions |
| `/api-sync/sync/trigger` | POST | Sync (4002) | Sync from Questrade |

---

## Common Request Examples

### 1. Login
```javascript
POST http://localhost:4001/api/login
Content-Type: application/json

{
  "username": "victor",
  "password": "password123"
}

// Response:
{
  "success": true,
  "token": "eyJhbGc...",
  "user": {
    "id": "...",
    "username": "victor",
    "displayName": "Victor",
    "role": "user"
  }
}
```

### 2. Get All Positions (All Persons)
```javascript
GET http://localhost:4003/api/portfolio/positions?viewMode=all&aggregate=true

// Response:
{
  "success": true,
  "viewMode": "all",
  "aggregate": true,
  "count": 105,
  "data": [
    {
      "symbol": "GLD",
      "openQuantity": 34,
      "averageEntryPrice": 130.43,
      "currentPrice": 164.75,
      "sourceAccounts": ["TFSA"],
      "dividendData": { ... }
    },
    // ... more positions
  ]
}
```

### 3. Get Positions for Victor
```javascript
GET http://localhost:4003/api/portfolio/positions?viewMode=person&personName=Victor&aggregate=true

// Response: Same structure, filtered to Victor's positions only
```

### 4. Get Cash Balances for Victor
```javascript
GET http://localhost:4003/api/portfolio/cash-balances?viewMode=person&personName=Victor

// Response:
{
  "success": true,
  "viewMode": "person",
  "data": {
    "accounts": [
      {
        "accountId": "51234567",
        "accountType": "TFSA",
        "personName": "Victor",
        "cashBalances": [
          { "currency": "CAD", "cash": 1098.71 },
          { "currency": "USD", "cash": 0.00 }
        ]
      }
    ],
    "summary": {
      "totalCAD": 2089.31,
      "totalUSD": 0.00,
      "totalAccounts": 2
    }
  }
}
```

### 5. Sync Person Data from Questrade
```javascript
POST http://localhost:4002/api/sync/sync-person/Victor

// Response:
{
  "success": true,
  "message": "Sync completed for Victor",
  "summary": {
    "positions": 45,
    "accounts": 2,
    "balances": 2,
    "activities": 150
  }
}
```

---

## MongoDB Quick Queries

### Check Login Credentials
```javascript
// In MongoDB shell
use questrade-portfolio-db

// Find user
db.users.findOne({ username: "victor" })

// Check if password hash exists
db.users.findOne({ username: "victor" }, { password: 1 })
```

### View Positions for a Person
```javascript
// Get all positions for Victor
db.positions.find({ personName: "Victor" }).limit(5)

// Get positions with dividend data
db.positions.find({
  personName: "Victor",
  isDividendStock: true
}).limit(5)

// Count total positions
db.positions.countDocuments({ personName: "Victor" })
```

### View Cash Balances
```javascript
// Get cash balances for Victor
db.balances.find({ personName: "Victor" })

// Get balance for specific account
db.balances.findOne({ accountId: "51234567" })
```

### Check YoC Exclusions
```javascript
// Get all YoC exclusions for Victor
db.yieldexclusions.find({ personName: "Victor" })

// Add YoC exclusion
db.yieldexclusions.insertOne({
  personName: "Victor",
  symbol: "GLD",
  excludeFromYoC: true,
  reason: "Non-dividend producing gold ETF",
  createdAt: new Date()
})

// Remove YoC exclusion
db.yieldexclusions.deleteOne({
  personName: "Victor",
  symbol: "GLD"
})
```

### Manual Dividend Overrides
```javascript
// Get all manual dividend overrides
db.symboldividends.find({})

// Add manual override
db.symboldividends.insertOne({
  symbol: "HYLD.TO",
  monthlyDividendPerShare: 0.2040,
  dividendFrequency: "monthly",
  notes: "Manual override - Questrade data incorrect",
  lastUpdated: new Date()
})
```

---

## Common Issues & Solutions

### Issue: Cannot login
**Solution:**
1. Check Auth API is running on port 4001
2. Check MongoDB is running
3. Verify user exists: `db.users.findOne({ username: "victor" })`
4. Check browser console for errors

### Issue: No positions displayed
**Solution:**
1. Check Portfolio API is running on port 4003
2. Check Sync API is running on port 4002
3. Verify positions exist: `db.positions.countDocuments({ personName: "Victor" })`
4. Check browser network tab for failed requests

### Issue: YoC calculation seems wrong
**Solution:**
1. Check YoC exclusions: `db.yieldexclusions.find({ personName: "Victor" })`
2. Verify dividend data: `db.positions.findOne({ symbol: "IMAX.TO", personName: "Victor" })`
3. Check manual overrides: `db.symboldividends.find({})`
4. Review calculation in browser console logs

### Issue: Account filter not working
**Solution:**
1. Check `individualPositions` array exists in position data
2. Verify `accountType` field is set
3. Check browser console for filter logs
4. Review `Holdings.jsx:130-157` (filterPositionsByAccount function)

---

## File Locations Quick Reference

### Frontend Files
```
D:\Project\3\Frontend-v2\portfolio-manager-v2\src\
├── pages\
│   ├── Login.jsx              - Login page
│   ├── Holdings.jsx           - Main portfolio page
│   └── Settings.jsx           - Settings page
├── components\
│   ├── layout\
│   │   ├── Topbar.jsx         - Top navigation bar
│   │   └── Sidebar.jsx        - Side navigation
│   ├── holdings\
│   │   └── HoldingsTable.jsx  - Holdings table
│   └── metrics\
│       └── MetricsGrid.jsx    - Metric cards
├── services\
│   ├── api.js                 - API client
│   ├── authToken.js           - Token management
│   └── questradeWebSocket.js  - WebSocket client
└── utils\
    └── auth.js                - Auth utilities
```

### Backend Files
```
D:\Project\3\Backend\questrade-portfolio-microservices\
├── questrade-auth-api\
│   └── src\
│       ├── routes\
│       │   ├── login.js       - Login endpoints
│       │   ├── persons.js     - Person management
│       │   └── tokens.js      - Token management
│       └── models\
│           ├── User.js        - User model
│           └── Person.js      - Person model
├── questrade-sync-api\
│   └── src\
│       ├── routes\
│       │   ├── positions.js   - Position endpoints
│       │   ├── accounts.js    - Account endpoints
│       │   └── balances.js    - Balance endpoints
│       └── models\
│           ├── Position.js    - Position model
│           ├── Account.js     - Account model
│           └── Balance.js     - Balance model
├── questrade-portfolio-api\
│   └── src\
│       ├── routes\
│       │   └── portfolio.js   - Portfolio endpoints
│       ├── services\
│       │   ├── portfolioCalculator.js  - Main calculator
│       │   ├── dividendService.js      - Dividend logic
│       │   └── currencyService.js      - Exchange rates
│       └── models\
│           ├── YieldExclusion.js       - YoC exclusions
│           └── SymbolDividend.js       - Dividend overrides
└── questrade-market-api\
    └── src\
        └── routes\
            ├── symbols.js     - Symbol lookup
            └── quotes.js      - Market quotes
```

---

## Environment Variables

### Frontend (.env)
```bash
VITE_API_URL=http://localhost:5500
```

### Backend (.env for each service)
```bash
# Auth API
PORT=4001
MONGODB_URI=mongodb://localhost:27017/questrade-portfolio-db
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=24h

# Sync API
PORT=4002
MONGODB_URI=mongodb://localhost:27017/questrade-portfolio-db
QUESTRADE_API_URL=https://api.questrade.com/v1

# Portfolio API
PORT=4003
MONGODB_URI=mongodb://localhost:27017/questrade-portfolio-db
AUTH_API_URL=http://localhost:4001/api
SYNC_API_URL=http://localhost:4002/api
MARKET_API_URL=http://localhost:4004/api

# Market API
PORT=4004
MONGODB_URI=mongodb://localhost:27017/questrade-portfolio-db
```

---

## Testing Credentials

### Test Users
| Username | Password | Display Name | Person Access |
|----------|----------|--------------|---------------|
| victor | test1234 | Victor | Victor's accounts |
| vivek | test1234 | Vivek | Vivek's accounts |
| admin | admin1234 | Admin | All accounts |

---

## Metrics Calculation Formulas

### YOC (Yield on Cost)
```
YoC = (Total Annual Dividend Income / Total Original Investment) × 100

Where:
- Total Annual Dividend Income = Σ(annualDividend for all dividend stocks)
- Total Original Investment = Σ(totalCost for stocks NOT excluded from YoC)
- Excludes: GLD, SLV, IBIT (non-dividend ETFs)
```

### Monthly Income
```
Monthly Income = Total Annual Dividend Income / 12
```

### Total Invested
```
Total Invested = Σ(averageEntryPrice × openQuantity) for all positions
```

### Current Value
```
Current Value = Σ(currentPrice × openQuantity) for all positions
```

### P&L (Profit & Loss)
```
P&L = Current Value - Total Invested
P&L % = (P&L / Total Invested) × 100
```

### Today's P&L
```
Today's P&L = Σ((currentPrice - previousDayClose) × openQuantity)
Today's P&L % = (Today's P&L / Opening Value) × 100
```

### Cash Total
```
Total Cash (CAD) = Σ(cash for currency='CAD')
Total Cash (USD) = Σ(cash for currency='USD')

If displaying in CAD:
  Total = CAD cash + (USD cash × exchange rate)

If displaying in USD:
  Total = USD cash + (CAD cash / exchange rate)
```

---

## WebSocket Connection

### Connect to Real-Time Quotes
```javascript
// Holdings.jsx:644-668
const symbols = positions.map(pos => pos.symbol);
questradeWebSocket.connect(symbols, handleQuoteUpdate);

// When quote updates arrive:
handleQuoteUpdate(quotes) {
  // Update currentPrice for changed symbols
  // Recalculate metrics (debounced)
  // Update UI
}
```

---

## Data Refresh Timing

| Type | Frequency | Trigger |
|------|-----------|---------|
| Manual Refresh | On demand | User clicks SYNC button |
| Auto Refresh | Every 60s | setInterval in Holdings.jsx |
| WebSocket Updates | Real-time | Market hours only |
| Exchange Rate | Every 5 min | Backend cache expiry |
| Auth Token Check | Every 60s | Verify not expired |

---

## Browser Console Debugging

### Useful Console Commands

```javascript
// Check authentication
localStorage.getItem('authToken')
localStorage.getItem('user')
localStorage.getItem('loginTime')

// Clear auth and force re-login
localStorage.clear()
location.reload()

// Check WebSocket connection
connectionState()  // From questradeWebSocket.js

// View current account filter
accountFilter()  // If in Holdings.jsx context

// View positions
rawPositions  // If in Holdings.jsx context
```

---

## Performance Monitoring

### Frontend Performance
```javascript
// In browser console
performance.mark('start');
// ... operation ...
performance.mark('end');
performance.measure('operation', 'start', 'end');
console.table(performance.getEntriesByType('measure'));
```

### Backend Logging
```javascript
// Check backend console for:
// [ROUTE] GET /portfolio/positions - viewMode: person, personName: Victor
// [PORTFOLIO] Processing 45 positions for Victor
// [PORTFOLIO] Aggregated 45 positions into 35 symbols
```

---

## Additional Documentation

For detailed information, see:
- [Account Selection Flow](01_ACCOUNT_SELECTION_FLOW.md)
- [Sign-In to Holdings Flow](02_SIGN_IN_TO_HOLDINGS_FLOW.md)
- [YOC and CASH Calculation](03_YOC_AND_CASH_CALCULATION.md)
- [Architecture Diagram](ARCHITECTURE_DIAGRAM.md)

---

**End of Quick Reference Guide**
