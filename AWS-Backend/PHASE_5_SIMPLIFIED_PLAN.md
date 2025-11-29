# Phase 5: Candles & Dividends - SIMPLIFIED (Single Source of Truth)

## 🎯 Goal

Create a **single master table** with one row per symbol containing:
- OHLC candle data (previousClose, currentClose)
- Dividend information (dividendPerShare, dividendFrequency)
- Manual override support (for incorrect data)
- Auto-population when new positions are synced

**Key Principle:** One symbol = One row. Same data for all persons.

---

## 📊 Single Table Design: `questrade-symbols-master-dev`

### Table Structure

```yaml
SymbolsMasterTable:
  Type: AWS::DynamoDB::Table
  Properties:
    TableName: !Sub questrade-symbols-master-${Environment}
    BillingMode: PAY_PER_REQUEST
    AttributeDefinitions:
      - AttributeName: symbol
        AttributeType: S
      - AttributeName: needsReview
        AttributeType: S
    KeySchema:
      - AttributeName: symbol
        KeyType: HASH
    GlobalSecondaryIndexes:
      - IndexName: needsReview-index
        KeySchema:
          - AttributeName: needsReview
            KeyType: HASH
        Projection:
          ProjectionType: ALL
```

### Data Model (Single Row per Symbol)

```javascript
{
  // PRIMARY KEY
  symbol: "HYLD.TO",                      // PK - Unique identifier

  // BASIC INFO
  symbolId: 43971827,                     // Questrade symbol ID
  description: "Hamilton Enhanced...",    // Full name
  currency: "CAD",                        // Currency

  // OHLC CANDLE DATA (Previous Close)
  previousClose: 8.52,                    // Yesterday's close price
  currentClose: 8.55,                     // Today's close price
  candleDate: "2024-01-15",              // Date of candle data
  candleLastUpdated: 1704067200000,      // Timestamp of last candle update

  // DIVIDEND DATA (Global - applies to all persons)
  dividendPerShare: 0.65,                 // Annual dividend per share
  dividendFrequency: "Monthly",           // Monthly, Quarterly, Annual, None
  lastDividendDate: "2024-01-05",        // Last ex-dividend date
  lastDividendAmount: 0.054,             // Last payment amount

  // MANUAL OVERRIDE FLAGS
  isManualOverride: false,                // If true, don't auto-update
  manualDividendPerShare: null,           // Manual override value (if set)
  manualDividendFrequency: null,          // Manual override frequency
  manualOverrideReason: null,             // Why override was needed
  manualOverrideBy: null,                 // Who made the override
  manualOverrideDate: null,               // When override was made

  // DATA QUALITY
  needsReview: "false",                   // "true" if data looks suspicious
  dataSource: "questrade-api",            // Where data came from
  lastFetchAttempt: 1704067200000,        // Last time we tried to fetch
  lastFetchSuccess: 1704067200000,        // Last successful fetch
  fetchErrorCount: 0,                     // Number of consecutive errors
  lastError: null,                        // Last error message

  // METADATA
  createdAt: 1704067200000,
  updatedAt: 1704067200000,
  firstSeenInPosition: "2024-01-01",     // When first detected in portfolio
  isActive: true                          // Still in someone's portfolio
}
```

---

## 🔄 Auto-Population Flow

### **Trigger 1: New Position Detected**

When a sync operation finds a new position with symbol "HYLD.TO":

```javascript
async function handleNewPosition(position) {
  const { symbol, symbolId } = position;

  // Check if symbol exists in master table
  const existing = await getSymbolFromMaster(symbol);

  if (!existing) {
    console.log(`New symbol detected: ${symbol}, populating master table...`);
    await populateSymbolMaster(symbol, symbolId);
  } else if (shouldRefreshData(existing)) {
    console.log(`Refreshing data for ${symbol}...`);
    await refreshSymbolData(symbol, symbolId);
  }
}

function shouldRefreshData(symbolData) {
  // Refresh if data is older than 24 hours
  const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
  return symbolData.candleLastUpdated < oneDayAgo;
}
```

### **Trigger 2: Daily Scheduled Sync**

EventBridge triggers symbol master update daily at 4:30 PM ET:

```javascript
exports.handler = async (event) => {
  console.log('Daily symbol master update started');

  // Get all active symbols from positions table
  const activeSymbols = await getUniqueSymbolsFromPositions();

  console.log(`Found ${activeSymbols.length} active symbols`);

  // Update each symbol in parallel (with rate limiting)
  const results = await Promise.all(
    activeSymbols.map((symbol, index) =>
      // Delay each request by 200ms to avoid rate limiting
      new Promise(resolve =>
        setTimeout(() => resolve(refreshSymbolData(symbol.symbol, symbol.symbolId)), index * 200)
      )
    )
  );

  return { statusCode: 200, body: JSON.stringify({ updated: results.length }) };
};
```

---

## 🛠️ Implementation Functions

### **1. Populate Symbol Master (First Time)**

```javascript
async function populateSymbolMaster(symbol, symbolId) {
  console.log(`Populating master table for ${symbol}...`);

  try {
    // Fetch candle data (last 2 days to get previous close)
    const candles = await fetchCandles(symbolId);

    // Fetch dividend data (from Questrade API or external source)
    const dividendData = await fetchDividendData(symbol);

    // Create master record
    const masterRecord = {
      symbol,
      symbolId,
      description: dividendData.description || symbol,
      currency: dividendData.currency || 'CAD',

      // Candle data
      previousClose: candles.length >= 2 ? candles[candles.length - 2].close : null,
      currentClose: candles.length >= 1 ? candles[candles.length - 1].close : null,
      candleDate: candles.length >= 1 ? candles[candles.length - 1].date : null,
      candleLastUpdated: Date.now(),

      // Dividend data
      dividendPerShare: dividendData.annualDividend || 0,
      dividendFrequency: dividendData.frequency || 'None',
      lastDividendDate: dividendData.lastDividendDate || null,
      lastDividendAmount: dividendData.lastAmount || null,

      // Flags
      isManualOverride: false,
      needsReview: 'false',
      dataSource: 'questrade-api',
      lastFetchAttempt: Date.now(),
      lastFetchSuccess: Date.now(),
      fetchErrorCount: 0,

      // Metadata
      createdAt: Date.now(),
      updatedAt: Date.now(),
      firstSeenInPosition: new Date().toISOString().split('T')[0],
      isActive: true
    };

    await putItem('questrade-symbols-master-dev', masterRecord);
    console.log(`✓ ${symbol} added to master table`);

    return masterRecord;

  } catch (error) {
    console.error(`✗ Failed to populate ${symbol}:`, error.message);

    // Create placeholder record with error
    await putItem('questrade-symbols-master-dev', {
      symbol,
      symbolId,
      needsReview: 'true',
      lastFetchAttempt: Date.now(),
      lastError: error.message,
      fetchErrorCount: 1,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    throw error;
  }
}
```

### **2. Fetch Candle Data (Previous Close)**

```javascript
async function fetchCandles(symbolId) {
  // Get token for API call
  const tokenData = await getValidAccessToken('SystemUser'); // Or any active person

  // Calculate date range (last 2 days)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 2);

  // Format dates for Questrade API
  const startTime = startDate.toISOString();
  const endTime = endDate.toISOString();

  // Call Questrade candles API
  const url = `${tokenData.apiServer}/v1/markets/candles/${symbolId}`;
  const params = {
    startTime,
    endTime,
    interval: 'OneDay'
  };

  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${tokenData.accessToken}` },
    params,
    timeout: 10000
  });

  return response.data.candles || [];
}
```

### **3. Fetch Dividend Data**

**Option A: From Questrade API (if available)**

```javascript
async function fetchDividendData(symbol) {
  // NOTE: Questrade doesn't provide dividend API
  // This would require external API or manual entry

  // Placeholder - return defaults
  return {
    description: symbol,
    currency: symbol.endsWith('.TO') ? 'CAD' : 'USD',
    annualDividend: 0,
    frequency: 'None',
    lastDividendDate: null,
    lastAmount: null
  };
}
```

**Option B: Manual Entry via API**

```javascript
// API Endpoint: POST /api/symbols/master/{symbol}/dividend
async function updateDividendManually(symbol, dividendData) {
  const existing = await getSymbolFromMaster(symbol);

  if (!existing) {
    throw new Error(`Symbol ${symbol} not found in master table`);
  }

  // Update with manual data
  await updateItem('questrade-symbols-master-dev',
    { symbol },
    {
      dividendPerShare: dividendData.dividendPerShare,
      dividendFrequency: dividendData.frequency,
      lastDividendDate: dividendData.lastDividendDate,
      isManualOverride: true,
      manualDividendPerShare: dividendData.dividendPerShare,
      manualDividendFrequency: dividendData.frequency,
      manualOverrideReason: dividendData.reason,
      manualOverrideBy: dividendData.updatedBy,
      manualOverrideDate: Date.now(),
      updatedAt: Date.now()
    }
  );

  console.log(`✓ Manual dividend updated for ${symbol}`);
}
```

### **4. Refresh Symbol Data (Daily Update)**

```javascript
async function refreshSymbolData(symbol, symbolId) {
  const existing = await getSymbolFromMaster(symbol);

  // Skip if manual override is set
  if (existing && existing.isManualOverride) {
    console.log(`Skipping ${symbol} - manual override active`);
    return { symbol, skipped: true, reason: 'manual-override' };
  }

  try {
    // Fetch fresh candle data
    const candles = await fetchCandles(symbolId);

    if (candles.length === 0) {
      throw new Error('No candle data returned');
    }

    // Update master table
    await updateItem('questrade-symbols-master-dev',
      { symbol },
      {
        previousClose: candles.length >= 2 ? candles[candles.length - 2].close : existing?.previousClose,
        currentClose: candles[candles.length - 1].close,
        candleDate: candles[candles.length - 1].date,
        candleLastUpdated: Date.now(),
        lastFetchAttempt: Date.now(),
        lastFetchSuccess: Date.now(),
        fetchErrorCount: 0,
        lastError: null,
        updatedAt: Date.now()
      }
    );

    console.log(`✓ ${symbol} updated - previousClose: ${candles[candles.length - 2]?.close}`);
    return { symbol, success: true };

  } catch (error) {
    console.error(`✗ Failed to refresh ${symbol}:`, error.message);

    // Increment error count
    const errorCount = (existing?.fetchErrorCount || 0) + 1;

    await updateItem('questrade-symbols-master-dev',
      { symbol },
      {
        lastFetchAttempt: Date.now(),
        lastError: error.message,
        fetchErrorCount: errorCount,
        needsReview: errorCount >= 3 ? 'true' : 'false', // Flag after 3 failures
        updatedAt: Date.now()
      }
    );

    return { symbol, success: false, error: error.message };
  }
}
```

---

## 📅 EventBridge Schedule

**Schedule:** Daily at 4:30 PM ET (market close + 30 min)

```yaml
  SymbolMasterUpdateFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: !Sub questrade-symbol-master-update-${Environment}
      CodeUri: lambda-functions/symbol-master-update/
      Handler: src/handler.handler
      Timeout: 300
      MemorySize: 512
      Policies:
        - DynamoDBCrudPolicy:
            TableName: !Ref SymbolsMasterTable
        - DynamoDBReadPolicy:
            TableName: !Ref PositionsTable
        - DynamoDBReadPolicy:
            TableName: !Ref TokensTable
      Events:
        DailyUpdate:
          Type: Schedule
          Properties:
            Schedule: cron(30 20 ? * MON-FRI *)  # 4:30 PM ET = 8:30 PM UTC
            Description: Daily symbol master update (candles + dividends)
            Enabled: true
```

---

## 🎨 Frontend: Manual Dividend Entry UI

### **API Endpoints**

```javascript
// GET all symbols in master table
GET /api/symbols/master?needsReview=true

// GET single symbol
GET /api/symbols/master/{symbol}

// UPDATE dividend data (manual override)
PUT /api/symbols/master/{symbol}/dividend
{
  "dividendPerShare": 0.65,
  "frequency": "Monthly",
  "lastDividendDate": "2024-01-05",
  "reason": "Confirmed from company website",
  "updatedBy": "Victor"
}

// DELETE manual override (revert to auto-fetch)
DELETE /api/symbols/master/{symbol}/dividend-override
```

### **UI Component Example**

```jsx
// Dividend Management Page
<SymbolDividendManager>
  <Table>
    <thead>
      <tr>
        <th>Symbol</th>
        <th>Previous Close</th>
        <th>Dividend/Share</th>
        <th>Frequency</th>
        <th>Last Updated</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      {symbols.map(symbol => (
        <tr key={symbol.symbol}>
          <td>{symbol.symbol}</td>
          <td>${symbol.previousClose}</td>
          <td>
            {symbol.isManualOverride && <Badge>Manual</Badge>}
            ${symbol.dividendPerShare}
          </td>
          <td>{symbol.dividendFrequency}</td>
          <td>{formatDate(symbol.updatedAt)}</td>
          <td>
            <Button onClick={() => editDividend(symbol)}>Edit</Button>
          </td>
        </tr>
      ))}
    </tbody>
  </Table>
</SymbolDividendManager>

// Edit Modal
<DividendEditModal symbol={selectedSymbol}>
  <Input label="Dividend per Share" value={dividendPerShare} />
  <Select label="Frequency" options={['Monthly', 'Quarterly', 'Annual', 'None']} />
  <Input label="Last Dividend Date" type="date" />
  <TextArea label="Reason for Override" />
  <Button onClick={saveDividend}>Save</Button>
</DividendEditModal>
```

---

## 🔍 Data Lookup Logic (Simplified)

```javascript
async function getDividendDataForSymbol(symbol) {
  // Single source of truth - just query master table
  const symbolData = await getItem('questrade-symbols-master-dev', { symbol });

  if (!symbolData) {
    console.warn(`Symbol ${symbol} not found in master table`);
    return {
      dividendPerShare: 0,
      frequency: 'None',
      source: 'not-found'
    };
  }

  // Return dividend data (respects manual override if set)
  return {
    dividendPerShare: symbolData.isManualOverride
      ? symbolData.manualDividendPerShare
      : symbolData.dividendPerShare,
    frequency: symbolData.isManualOverride
      ? symbolData.manualDividendFrequency
      : symbolData.dividendFrequency,
    lastDividendDate: symbolData.lastDividendDate,
    previousClose: symbolData.previousClose,
    source: symbolData.isManualOverride ? 'manual-override' : 'auto-fetch'
  };
}
```

---

## 📊 Example Data

### **HYLD.TO (Hamilton Enhanced Multi-Sector Covered Call ETF)**

```javascript
{
  symbol: "HYLD.TO",
  symbolId: 43971827,
  description: "Hamilton Enhanced Multi-Sector Covered Call ETF",
  currency: "CAD",

  // Candle data (auto-updated daily)
  previousClose: 8.52,
  currentClose: 8.55,
  candleDate: "2024-01-15",
  candleLastUpdated: 1704067200000,

  // Dividend data (manually set, won't auto-update)
  dividendPerShare: 0.65,           // $0.65 annual
  dividendFrequency: "Monthly",     // Pays monthly
  lastDividendDate: "2024-01-05",
  lastDividendAmount: 0.054,        // $0.65 / 12 months

  // Manual override flags
  isManualOverride: true,
  manualDividendPerShare: 0.65,
  manualDividendFrequency: "Monthly",
  manualOverrideReason: "Confirmed from Hamilton website",
  manualOverrideBy: "Victor",
  manualOverrideDate: 1704067200000,

  needsReview: "false",
  dataSource: "manual-entry",
  createdAt: 1704067200000,
  updatedAt: 1704067200000
}
```

### **TD.TO (TD Bank)**

```javascript
{
  symbol: "TD.TO",
  symbolId: 8049,
  description: "Toronto-Dominion Bank",
  currency: "CAD",

  previousClose: 82.50,
  currentClose: 83.20,
  candleDate: "2024-01-15",
  candleLastUpdated: 1704067200000,

  dividendPerShare: 3.84,           // $0.96 quarterly × 4
  dividendFrequency: "Quarterly",
  lastDividendDate: "2024-01-10",
  lastDividendAmount: 0.96,

  isManualOverride: true,
  manualDividendPerShare: 3.84,
  manualDividendFrequency: "Quarterly",
  manualOverrideReason: "Verified from TD investor relations",
  manualOverrideBy: "Victor",
  manualOverrideDate: 1704067200000,

  needsReview: "false",
  dataSource: "manual-entry"
}
```

---

## ✅ Summary

### **Simplified Architecture:**
1. ✅ **Single table:** `questrade-symbols-master-dev`
2. ✅ **One row per symbol** (e.g., HYLD.TO)
3. ✅ **Same data for all persons** (no person-specific overrides)
4. ✅ **Auto-population:** When new position synced → fetch candles → create master row
5. ✅ **Daily update:** EventBridge updates candles at 4:30 PM ET
6. ✅ **Manual override:** Admin can set dividend data via UI
7. ✅ **Protected:** Manual overrides won't be auto-updated

### **Benefits:**
- ✅ Simple data model (no hierarchy)
- ✅ Fast lookups (single table query)
- ✅ Easy to maintain
- ✅ Manual control when needed
- ✅ Auto-updates previousClose daily

### **Trade-offs:**
- ❌ No person-specific dividend customization
- ❌ Same dividend data for everyone
- ✅ **BUT:** This is exactly what you wanted!

---

## 🚀 Next Steps

**Ready to implement?**

**Order:**
1. Create symbol-master-update Lambda
2. Add auto-population logic to sync-operations
3. Create manual dividend entry API
4. Build frontend UI for dividend management
5. Add EventBridge schedule (daily 4:30 PM ET)
6. Test with HYLD.TO and other symbols

**Estimated Time:** 3-4 hours

Let me know if you want to start implementing this!
