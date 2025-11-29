# Lambda Optimization Plan - Complete Implementation Guide

## Current State Analysis

### Existing Infrastructure
- ✅ **questrade-symbols-master-dev** table exists (for dividend data and symbol metadata)
- ✅ **questrade-symbol-dividends-dev** table exists (for dividend per share data)
- ✅ **questrade-dividend-overrides-dev** table exists (manual overrides per person)
- ✅ **questrade-yield-exclusions-dev** table exists (symbols to exclude from yield calculations)
- ✅ **questrade-positions-dev** table exists (current positions with previousClose data)
- ✅ **questrade-sync-operations-dev** Lambda exists (needs optimization)

### Current Problem
- **Sync Duration:** 28+ seconds (timeout risk)
- **Activities Sync:** Fetches 30 days every time (slow)
- **Market Quotes:** Fetches all symbols even if WebSocket is updating them
- **No Caching:** Account list fetched on every sync
- **No Schedule:** Manual trigger only

---

## 📋 PHASE-BY-PHASE IMPLEMENTATION

---

## 🎯 PHASE 1: Optimize Existing questrade-sync-operations Lambda

**Goal:** Reduce 28s → 10-12s with quick wins

**Files to Modify:**
- `AWS-Backend/lambda-functions/sync-operations/src/handlers/sync.js`
- `AWS-Backend/lambda-functions/sync-operations/src/services/syncService.js`
- `AWS-Backend/template.yaml`

### PHASE 1.1: Add Account List Caching (7 days)

**Why:** Account list rarely changes, no need to fetch every sync

**Implementation:**
```javascript
// In syncService.js
async function getAccountsWithCache(personName, apiServer, accessToken) {
  const cacheKey = `accounts-cache-${personName}`;

  // Check DynamoDB cache
  const cached = await getItem(CACHE_TABLE, { cacheKey });
  if (cached && cached.expiresAt > Date.now()) {
    logger.info(`Using cached accounts for ${personName}`);
    return cached.accounts;
  }

  // Fetch from Questrade API
  const accounts = await questradeApi.getAccounts(apiServer, accessToken);

  // Store in cache (7 days TTL)
  await putItem(CACHE_TABLE, {
    cacheKey,
    accounts,
    expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000),
    ttl: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)
  });

  return accounts;
}
```

**Database Change:**
- Create new table `questrade-cache-dev` (or reuse existing table with cacheKey attribute)

### PHASE 1.2: Optimize Activities Sync (Yesterday Only)

**Why:** Daily sync only needs yesterday's activities, not 30 days

**Implementation:**
```javascript
// In syncService.js
async function syncActivities(personName, isInitialSetup = false) {
  if (isInitialSetup) {
    // First-time setup: Fetch last 5 years in 1-year chunks
    return await syncActivitiesHistorical(personName);
  } else {
    // Daily sync: Fetch yesterday only
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return await fetchActivitiesRange(personName, yesterday, today);
  }
}

async function syncActivitiesHistorical(personName) {
  const results = [];
  const currentYear = new Date().getFullYear();

  // Fetch 5 years back in 1-year chunks
  for (let year = currentYear - 5; year <= currentYear; year++) {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);

    logger.info(`Fetching activities for ${personName} - Year ${year}`);
    const activities = await fetchActivitiesRange(personName, startDate, endDate);
    results.push(...activities);

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return results;
}
```

**API Documentation Check:**
- ✅ Questrade GET /v1/accounts/{accountId}/activities supports `startTime` and `endTime` parameters
- Format: ISO 8601 (e.g., "2024-01-01T00:00:00-05:00")

### PHASE 1.3: Skip Market Quotes for WebSocket Symbols

**Why:** WebSocket already provides real-time quotes for active positions

**Implementation:**
```javascript
// In syncService.js
async function getQuotesOptimized(symbols, personName) {
  // Get list of symbols active in WebSocket
  const wsSymbols = await getWebSocketActiveSymbols(personName);

  // Filter out WebSocket symbols
  const symbolsToFetch = symbols.filter(s => !wsSymbols.includes(s));

  if (symbolsToFetch.length === 0) {
    logger.info('All symbols covered by WebSocket, skipping quote fetch');
    return [];
  }

  logger.info(`Fetching quotes for ${symbolsToFetch.length} non-WebSocket symbols`);
  return await questradeApi.getQuotes(apiServer, accessToken, symbolsToFetch);
}
```

### PHASE 1.4: Add EventBridge Schedule (Mon-Fri 6:00 PM ET)

**Implementation in template.yaml:**
```yaml
  SyncOperationsFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: !Sub questrade-sync-operations-${Environment}
      # ... existing config ...
      Events:
        # ... existing HTTP API events ...
        DailySync:
          Type: Schedule
          Properties:
            Schedule: cron(0 22 ? * MON-FRI *)  # 6:00 PM ET = 10:00 PM UTC
            Description: Daily sync Mon-Fri at 6:00 PM ET
            Enabled: true
            Input: '{"action": "daily-sync"}'
```

### PHASE 1.5: Test and Verify

**Success Criteria:**
- Duration: < 12 seconds
- All data accurate
- No timeouts

---

## 🎯 PHASE 2: Create questrade-daily-sync Lambda (NEW)

**Goal:** Lightweight daily sync (5-8s) for core data

**Files to Create:**
- `AWS-Backend/lambda-functions/daily-sync/src/handler.js`
- `AWS-Backend/lambda-functions/daily-sync/src/services/syncService.js`
- `AWS-Backend/lambda-functions/daily-sync/package.json`

### PHASE 2.1-2.5: Implementation

**handler.js:**
```javascript
exports.handler = async (event) => {
  const startTime = Date.now();
  logger.info('Daily sync started');

  try {
    // Get all active persons
    const persons = await getAllActivePersons();

    // Sync each person in parallel
    const results = await Promise.all(
      persons.map(person => syncPersonDaily(person.personName))
    );

    const duration = (Date.now() - startTime) / 1000;
    logger.info(`Daily sync completed in ${duration}s`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        duration,
        results
      })
    };
  } catch (error) {
    logger.error('Daily sync failed', error);
    throw error;
  }
};

async function syncPersonDaily(personName) {
  // 1. Get accounts (cached 7 days)
  const accounts = await getAccountsWithCache(personName);

  // 2. Get positions (all accounts)
  const positions = await Promise.all(
    accounts.map(acc => getPositions(acc.accountId))
  );

  // 3. Get balances (all accounts)
  const balances = await Promise.all(
    accounts.map(acc => getBalances(acc.accountId))
  );

  // 4. Get quotes (non-WebSocket symbols only)
  const symbols = extractUniqueSymbols(positions);
  const quotes = await getQuotesOptimized(symbols, personName);

  // 5. Update DynamoDB
  await updatePositionsTable(positions, quotes);
  await updateAccountsTable(accounts, balances);

  return { personName, success: true };
}
```

### PHASE 2.6: EventBridge Schedule

```yaml
  DailySyncFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: !Sub questrade-daily-sync-${Environment}
      CodeUri: lambda-functions/daily-sync/
      Handler: src/handler.handler
      Timeout: 30
      Events:
        DailySync:
          Type: Schedule
          Properties:
            Schedule: cron(0 22 ? * MON-FRI *)  # 6:00 PM ET
            Enabled: true
```

---

## 🎯 PHASE 3: Create questrade-activities-sync Lambda (NEW)

**Goal:** Handle heavy activities sync separately (10-15s)

**Key Features:**
1. **First-time setup:** Fetch last 5 years in 1-year chunks
2. **Daily sync:** Fetch yesterday only
3. **Questrade API Check:** Verify date range limits

### PHASE 3.2: Activities Sync Logic

```javascript
async function syncActivities(personName, isInitialSetup = false) {
  const person = await getPerson(personName);

  // Check if this is first-time setup
  if (!person.activitiesInitialized || isInitialSetup) {
    logger.info(`Initial activities sync for ${personName} - Last 5 years`);
    await syncActivitiesHistorical(personName);

    // Mark as initialized
    await updatePerson(personName, {
      activitiesInitialized: true,
      lastActivitiesSync: Date.now()
    });
  } else {
    // Daily sync - yesterday only
    logger.info(`Daily activities sync for ${personName} - Yesterday`);
    await syncActivitiesYesterday(personName);
  }
}

async function syncActivitiesHistorical(personName) {
  const currentYear = new Date().getFullYear();
  const startYear = currentYear - 5;

  for (let year = startYear; year <= currentYear; year++) {
    const startDate = new Date(year, 0, 1); // Jan 1
    const endDate = new Date(year, 11, 31, 23, 59, 59); // Dec 31

    logger.info(`Syncing activities for ${personName} - ${year}`);

    // Get all accounts for person
    const accounts = await getAccountsForPerson(personName);

    // Sync activities for each account
    for (const account of accounts) {
      await syncActivitiesForAccount(
        account.accountId,
        personName,
        startDate,
        endDate
      );

      // Rate limiting delay (500ms between accounts)
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

async function syncActivitiesYesterday(personName) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const accounts = await getAccountsForPerson(personName);

  for (const account of accounts) {
    await syncActivitiesForAccount(
      account.accountId,
      personName,
      yesterday,
      today
    );
  }
}
```

### PHASE 3.3: Questrade API Date Format

**API Endpoint:** `GET /v1/accounts/{accountId}/activities`

**Parameters:**
- `startTime`: ISO 8601 format (e.g., "2024-01-01T00:00:00-05:00")
- `endTime`: ISO 8601 format (e.g., "2024-12-31T23:59:59-05:00")

**Example:**
```
GET /v1/accounts/12345678/activities?startTime=2024-01-01T00:00:00-05:00&endTime=2024-12-31T23:59:59-05:00
```

### PHASE 3.4: EventBridge Schedule

```yaml
  ActivitiesSyncFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: !Sub questrade-activities-sync-${Environment}
      CodeUri: lambda-functions/activities-sync/
      Handler: src/handler.handler
      Timeout: 300  # 5 minutes for historical sync
      Events:
        DailySync:
          Type: Schedule
          Properties:
            Schedule: cron(30 22 ? * MON-FRI *)  # 6:30 PM ET (after daily sync)
            Enabled: true
```

---

## 🎯 PHASE 4: Create questrade-callback-handler Lambda (NEW)

**Goal:** Real-time position updates on trade execution

**IMPORTANT:** Callback should only update **current positions**, not create new historical activities.

### PHASE 4.1: Research Questrade Callback Format

**Expected Callback Payload:**
```json
{
  "orders": [{
    "orderId": 123456,
    "accountNumber": "12345678",
    "symbol": "AAPL",
    "symbolId": 8049,
    "orderType": "Market",
    "side": "Buy",
    "orderState": "Executed",
    "totalQuantity": 100,
    "filledQuantity": 100,
    "averageExecPrice": 150.25,
    "commission": 4.95,
    "executionDate": "2024-01-15T14:30:00-05:00"
  }]
}
```

### PHASE 4.4: Position Update Logic

**CRITICAL:** Callback ONLY updates positions table, NOT activities table.

```javascript
async function handleOrderCallback(order) {
  // Only process executed orders
  if (order.orderState !== 'Executed') {
    logger.info(`Order ${order.orderId} not executed, skipping`);
    return;
  }

  const { accountNumber, symbolId, symbol, side, filledQuantity, averageExecPrice } = order;

  // Get current position
  const position = await getPosition(accountNumber, symbolId);

  if (!position) {
    // New position
    await createPosition({
      accountId: accountNumber,
      symbolId,
      symbol,
      quantity: side === 'Buy' ? filledQuantity : -filledQuantity,
      averageEntryPrice: averageExecPrice,
      currentValue: filledQuantity * averageExecPrice,
      updatedAt: Date.now()
    });
  } else {
    // Update existing position
    let newQuantity, newAvgPrice;

    if (side === 'Buy') {
      // Buying more
      const totalCost = (position.quantity * position.averageEntryPrice) + (filledQuantity * averageExecPrice);
      newQuantity = position.quantity + filledQuantity;
      newAvgPrice = totalCost / newQuantity;
    } else {
      // Selling
      newQuantity = position.quantity - filledQuantity;
      newAvgPrice = position.averageEntryPrice; // Keep same avg price
    }

    // Update position
    await updatePosition(accountNumber, symbolId, {
      quantity: newQuantity,
      averageEntryPrice: newAvgPrice,
      currentValue: newQuantity * averageExecPrice,
      updatedAt: Date.now()
    });

    // If position closed, mark as inactive
    if (newQuantity === 0) {
      await updatePosition(accountNumber, symbolId, { isActive: false });
    }
  }

  logger.info(`Position updated for ${symbol} in account ${accountNumber}`);
}
```

**NOTE:** Activities table is updated during daily activities sync (PHASE 3), not by callback.

---

## 🎯 PHASE 5: Optimize Market Data Service (Candles & Dividends)

**Goal:** Ensure OHLC candles and dividend data are comprehensive

### PHASE 5.1: Symbols Master Table Review

**Current Structure:**
```
questrade-symbols-master-dev:
  - symbol (PK)
  - symbolId
  - dividendPerShare (annual)
  - dividendFrequency (quarterly, monthly, annual)
  - lastDividendDate
  - isManualOverride
  - needsReview
  - previousClose (from candles)
  - updatedAt
```

### PHASE 5.2: OHLC Candle Sync

**Trigger:** When new position is synced or callback received

```javascript
async function syncCandlesForPosition(symbol, symbolId) {
  // Check if symbol already in master table
  const existing = await getSymbolFromMaster(symbol);

  if (existing && existing.updatedAt > Date.now() - 86400000) {
    logger.info(`Candles for ${symbol} already up to date`);
    return;
  }

  // Fetch daily candles (last 2 days to get previous close)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 2);

  const candles = await questradeApi.getCandles(
    symbolId,
    startDate,
    endDate,
    'OneDay'
  );

  if (candles.length >= 2) {
    const previousClose = candles[candles.length - 2].close;
    const currentClose = candles[candles.length - 1].close;

    // Update master table
    await updateSymbolMaster(symbol, {
      symbolId,
      previousClose,
      currentClose,
      updatedAt: Date.now()
    });
  }
}
```

### PHASE 5.3: Dividend Data Management

**Two-Level System:**

1. **questrade-symbol-dividends-dev** (Global dividend data)
   - symbol (PK)
   - dividendPerShare
   - dividendFrequency
   - lastDividendDate
   - isManualOverride

2. **questrade-dividend-overrides-dev** (Person-specific overrides)
   - personName (PK)
   - symbol (SK)
   - customDividendPerShare
   - customDividendFrequency
   - reason

**Dividend Calculation Logic:**
```javascript
async function getDividendDataForSymbol(symbol, personName) {
  // Check person-specific override first
  const override = await getDividendOverride(personName, symbol);
  if (override) {
    return override;
  }

  // Check symbol-dividends table
  const symbolDiv = await getSymbolDividend(symbol);
  if (symbolDiv) {
    return symbolDiv;
  }

  // Fallback to symbols-master table
  const master = await getSymbolFromMaster(symbol);
  return master;
}
```

---

## 📊 Database Tables Summary

### Existing Tables:
1. ✅ **questrade-symbols-master-dev** - Master symbol data (dividends, previousClose, OHLC)
2. ✅ **questrade-symbol-dividends-dev** - Global dividend data per symbol
3. ✅ **questrade-dividend-overrides-dev** - Person-specific dividend overrides
4. ✅ **questrade-yield-exclusions-dev** - Symbols to exclude from yield calculations
5. ✅ **questrade-positions-dev** - Current positions with previousClose

### New Table Needed:
6. ⚠️ **questrade-cache-dev** - For account list caching (7 days)

```yaml
CacheTable:
  Type: AWS::DynamoDB::Table
  Properties:
    TableName: !Sub questrade-cache-${Environment}
    BillingMode: PAY_PER_REQUEST
    AttributeDefinitions:
      - AttributeName: cacheKey
        AttributeType: S
    KeySchema:
      - AttributeName: cacheKey
        KeyType: HASH
    TimeToLiveSpecification:
      AttributeName: ttl
      Enabled: true
```

---

## 🚀 Deployment Order

1. **Phase 1:** Optimize existing sync-operations (2-3 hours)
2. **Phase 2:** Create daily-sync Lambda (4-5 hours)
3. **Phase 3:** Create activities-sync Lambda (2-3 hours)
4. **Phase 5:** Optimize candles/dividends (2-3 hours)
5. **Phase 4:** Create callback-handler (6-8 hours) - OPTIONAL

**Total Time:** 10-14 hours (without Phase 4)
**With Callbacks:** 16-22 hours

---

## ✅ Success Criteria

| Metric | Before | After |
|--------|--------|-------|
| Daily Sync Duration | 28s | 5-8s |
| Activities Sync | 30 days | Yesterday only |
| API Calls/Day | 60+ | 25 |
| Timeout Risk | High ⚠️ | Low ✅ |
| Historical Activities | ❌ | 5 years ✅ |
| Real-time Updates | ❌ | Via callback (optional) ✅ |

---

## 📝 Next Steps

**Ready to start?** Let me know which phase you want to begin with!

**Recommended:** Start with Phase 1 (quick wins, low risk)
