# Questrade WebSocket Real-Time Quote Flow

**Date:** October 28, 2025
**Application:** Questrade Portfolio Manager v2.0

---

## Overview

This document details the complete request flow for establishing a WebSocket connection to Questrade for real-time stock quotes, including authentication token retrieval, symbol ID lookup, and stream port acquisition.

---

## High-Level Flow

```
User loads Holdings page
    │
    ▼
Extract all symbols from positions
    │
    ▼
Connect to Questrade WebSocket
    │
    ├─► 1. Get Auth Token (Backend)
    ├─► 2. Get Symbol IDs (Backend → MongoDB)
    ├─► 3. Get Stream Port (Backend → Questrade API)
    ├─► 4. Build WebSocket URL
    ├─► 5. Connect to WebSocket
    ├─► 6. Authenticate with token
    ├─► 7. Subscribe to symbol IDs
    │
    ▼
Receive real-time quote updates
```

---

## Detailed Request Flow

### Step 1: Initiate WebSocket Connection

**Frontend File:** `D:\Project\3\Frontend-v2\portfolio-manager-v2\src\pages\Holdings.jsx:644-668`

```javascript
// Extract symbols from positions
const symbols = positions().map(pos => pos.symbol);
// Example: ["GLD", "IMAX.TO", "HYLD.TO", "SLV", ...]

// Connect to WebSocket
questradeWebSocket.connect(symbols, handleQuoteUpdate);
```

**WebSocket Service:** `questradeWebSocket.js:45-97`

---

### Step 2: Fetch Available Persons from Database

**Frontend Request:**
```
GET /api-auth/persons
```

**Vite Proxy:** `/api-auth` → `http://localhost:4001/api`

**Full URL:** `http://localhost:4001/api/persons`

**Backend Handler:**
- **File:** `questrade-auth-api/src/routes/persons.js:9-18`
- **MongoDB Query:**
  ```javascript
  db.persons.find({ isActive: true })
            .select('-__v')
            .sort({ personName: 1 })
  ```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "personName": "Roshni",
      "displayName": "Roshni",
      "isActive": true,
      "hasValidToken": true
    },
    {
      "personName": "Victor",
      "displayName": "Victor",
      "isActive": true,
      "hasValidToken": true
    },
    {
      "personName": "Vivek",
      "displayName": "Vivek",
      "isActive": true,
      "hasValidToken": true
    }
  ]
}
```

**Frontend Processing:**
```javascript
// questradeWebSocket.js:102-132
this.availablePersons = data.data
  .filter(p => p.personName && p.isActive !== false)
  .map(p => p.personName);

// Result: ["Roshni", "Victor", "Vivek"]
```

---

### Step 3: Get Access Token (with Fallback)

**Frontend tries each person until one succeeds:**

#### Request (Try Person #1: Roshni)

```
GET /api-auth/auth/access-token/Roshni
```

**Vite Proxy:** `/api-auth` → `http://localhost:4001/api`

**Full URL:** `http://localhost:4001/api/auth/access-token/Roshni`

**Backend Handler:**
- **File:** `questrade-auth-api/src/routes/auth.js:38-61`
- **Service:** `tokenManager.js:14-80`

**Process Flow:**

1. **Check in-memory cache** (30-second buffer before expiry)
   ```javascript
   const cached = this.tokenCache.get('Roshni');
   if (cached && expiryTime > bufferTime) {
     // Return cached token (NO database/API call)
     return cached;
   }
   ```

2. **Check MongoDB for valid token**
   ```javascript
   // Query: Find access token that expires > 30 seconds from now
   db.tokens.findOne({
     personName: 'Roshni',
     type: 'access',
     isActive: true,
     expiresAt: { $gt: new Date(Date.now() + 30000) }
   }).sort({ createdAt: -1 })
   ```

   **Sample Token Document:**
   ```javascript
   {
     _id: ObjectId("..."),
     personName: "Roshni",
     type: "access",
     token: "encrypted_token_here", // Encrypted with AES-256
     apiServer: "https://api02.iq.questrade.com",
     expiresAt: ISODate("2025-10-28T11:30:00Z"), // 30 min from creation
     isActive: true,
     usageCount: 5,
     lastUsedAt: ISODate("2025-10-28T10:45:00Z"),
     createdAt: ISODate("2025-10-28T10:00:00Z")
   }
   ```

3. **If valid token found in DB:**
   ```javascript
   // Decrypt token
   const accessToken = accessToken.getDecryptedToken();

   // Mark as used
   await accessToken.markAsUsed(); // Increments usageCount

   // Cache for future requests
   this.tokenCache.set('Roshni', {
     accessToken: decryptedToken,
     apiServer: 'https://api02.iq.questrade.com',
     personName: 'Roshni',
     expiresAt: expiresAt
   });
   ```

4. **If NO valid token (expired or not found):**
   ```javascript
   // Call Questrade OAuth to refresh
   return await this.refreshAccessToken('Roshni');
   ```

**OAuth Refresh Process** (if needed):
- **File:** `tokenManager.js:82-213`

```javascript
// 1. Get refresh token from MongoDB
const refreshTokenDoc = await Token.findOne({
  personName: 'Roshni',
  type: 'refresh',
  isActive: true
}).sort({ createdAt: -1 });

// 2. Call Questrade OAuth endpoint
POST https://login.questrade.com/oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&refresh_token=REFRESH_TOKEN_HERE

// 3. Questrade Response:
{
  "access_token": "NEW_ACCESS_TOKEN_HERE",
  "refresh_token": "NEW_REFRESH_TOKEN_HERE",
  "api_server": "https://api02.iq.questrade.com/",
  "expires_in": 1800,  // 30 minutes in seconds
  "token_type": "Bearer"
}

// 4. Delete old tokens for Roshni
await Token.deleteMany({ personName: 'Roshni', isActive: true });

// 5. Save new access token to MongoDB
await Token.create({
  type: 'access',
  personName: 'Roshni',
  token: encrypt(access_token),
  apiServer: 'https://api02.iq.questrade.com',
  expiresAt: new Date(Date.now() + 1800000),
  isActive: true
});

// 6. Save new refresh token to MongoDB
await Token.create({
  type: 'refresh',
  personName: 'Roshni',
  token: encrypt(refresh_token),
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  isActive: true
});

// 7. Update person record
await Person.findOneAndUpdate(
  { personName: 'Roshni' },
  { hasValidToken: true, lastTokenRefresh: new Date() }
);
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "accessToken": "zN3fG8hK2jL9pQ4vR7wX1mY6tB5cD0eF...",
    "apiServer": "https://api02.iq.questrade.com",
    "personName": "Roshni",
    "expiresAt": "2025-10-28T11:30:00.000Z"
  }
}
```

**Response (Rate Limited - 429):**
```json
{
  "success": false,
  "error": "Rate limited"
}
```

**Frontend Fallback Logic:**
```javascript
// questradeWebSocket.js:137-155
// If Roshni fails (rate limited or error), try next person
for (const person of this.availablePersons) {
  try {
    await this.connectWithPerson(person);
    console.log(`✅ Successfully connected using ${person}'s token`);
    return; // Success!
  } catch (error) {
    console.warn(`Failed with ${person}:`, error.message);
    // Try next person (Victor, then Vivek)
  }
}
```

---

### Step 4: Get Symbol IDs

**Frontend Request:**
```
POST /api-market/symbols/lookup
Content-Type: application/json

{
  "symbols": ["GLD", "IMAX.TO", "HYLD.TO", "SLV", ...]
}
```

**Vite Proxy:** `/api-market` → `http://localhost:4004/api`

**Full URL:** `http://localhost:4004/api/symbols/lookup`

**Backend Handler:**
- **File:** `questrade-market-api/src/routes/symbols.js:8-24`
- **Service:** `symbolService.js:346-493`

**Process Flow:**

1. **Check in-memory cache first** (permanent cache - symbol IDs never change)
   ```javascript
   // symbolService.js:360-374
   const cached = this.symbolIdCache.get('GLD');
   if (cached) {
     symbolMap['GLD'] = cached;
     continue; // Skip database/API call
   }
   ```

2. **Query MongoDB for symbols not in cache**
   ```javascript
   // Query for batch of symbols
   db.symbols.find({
     symbol: { $in: ["GLD", "IMAX.TO", "HYLD.TO"] }
   })
   ```

   **Sample Symbol Document:**
   ```javascript
   {
     _id: ObjectId("..."),
     symbol: "GLD",
     symbolId: 8049,
     description: "SPDR GOLD TRUST",
     securityType: "Stock",
     exchange: "NYSE",
     currency: "USD",
     isTradable: true,
     isQuotable: true,
     hasOptions: false,
     lastUpdated: ISODate("2025-10-15T10:00:00Z")
   }
   ```

3. **If symbols NOT found in database:**
   ```javascript
   // Fetch from Questrade API
   GET https://api02.iq.questrade.com/v1/symbols/search?prefix=GLD
   Headers: Authorization: Bearer ACCESS_TOKEN

   // Questrade Response:
   {
     "symbols": [
       {
         "symbol": "GLD",
         "symbolId": 8049,
         "description": "SPDR GOLD TRUST",
         "securityType": "Stock",
         "listingExchange": "NYSE",
         "isTradable": true,
         "isQuotable": true,
         "hasOptions": false,
         "currency": "USD",
         "minTicks": [...],
         "industrySector": "Materials",
         "industryGroup": "Gold",
         "industrySubgroup": "Gold"
       }
     ]
   }

   // Save to MongoDB for future use
   await Symbol.findOneAndUpdate(
     { symbol: 'GLD' },
     { ...symbolData },
     { upsert: true }
   );

   // Cache in memory (permanent)
   this.symbolIdCache.set('GLD', {
     symbolId: 8049,
     symbol: 'GLD',
     description: 'SPDR GOLD TRUST',
     currency: 'USD'
   });
   ```

**Response:**
```json
{
  "success": true,
  "data": {
    "GLD": {
      "symbolId": 8049,
      "symbol": "GLD",
      "description": "SPDR GOLD TRUST",
      "currency": "USD",
      "securityType": "Stock",
      "exchange": "NYSE"
    },
    "IMAX.TO": {
      "symbolId": 9372670,
      "symbol": "IMAX.TO",
      "description": "PURPOSE INVESTM...",
      "currency": "CAD",
      "securityType": "Stock",
      "exchange": "TSX"
    },
    "HYLD.TO": {
      "symbolId": 9372686,
      "symbol": "HYLD.TO",
      "description": "HAMILTON CAP...",
      "currency": "CAD",
      "securityType": "Stock",
      "exchange": "TSX"
    },
    "SLV": {
      "symbolId": 8050,
      "symbol": "SLV",
      "description": "ISHARES SILVER TRUST",
      "currency": "USD",
      "securityType": "Stock",
      "exchange": "NYSE"
    }
    // ... more symbols
  }
}
```

**Frontend Processing:**
```javascript
// questradeWebSocket.js:274-308
// Build symbol ID set and map
Object.entries(data.data).forEach(([symbol, info]) => {
  if (info.symbolId) {
    this.subscribedSymbolIds.add(info.symbolId);
    this.symbolIdMap.set(info.symbolId, symbol);
  }
});

// Result:
// subscribedSymbolIds = Set(8049, 9372670, 9372686, 8050, ...)
// symbolIdMap = Map {
//   8049 => "GLD",
//   9372670 => "IMAX.TO",
//   9372686 => "HYLD.TO",
//   8050 => "SLV",
//   ...
// }
```

---

### Step 5: Get Stream Port from Questrade

**Frontend Request:**
```
POST /api-market/symbols/stream-port
Content-Type: application/json

{
  "symbolIds": [8049, 9372670, 9372686, 8050, ...],
  "personName": "Roshni"
}
```

**Full URL:** `http://localhost:4004/api/symbols/stream-port`

**Backend Handler:**
- **File:** `questrade-market-api/src/routes/symbols.js:29-45`
- **Service:** `symbolService.js:553-658`

**Process Flow:**

1. **Check 24-hour cache** (stream ports change daily)
   ```javascript
   // symbolService.js:558-563
   const cached = this.streamPortCache.get('Roshni');
   if (cached && cached.expiresAt > Date.now()) {
     console.log('✅ Using cached stream port - NO API CALL');
     return cached.streamPort; // e.g., 8237
   }
   ```

2. **Cache miss - Get fresh access token**
   ```javascript
   // Get access token (may use cache if still valid)
   const response = await axios.get(
     'http://localhost:4001/api/auth/access-token/Roshni'
   );

   const tokenData = response.data.data;
   // {
   //   accessToken: "zN3fG8hK2jL9pQ4vR7wX1mY6tB5cD0eF...",
   //   apiServer: "https://api02.iq.questrade.com"
   // }
   ```

3. **Call Questrade API to get stream port**
   ```javascript
   // Build Questrade URL with symbol IDs
   const idsParam = symbolIds.join(',');
   // "8049,9372670,9372686,8050,..."

   const url = `${apiServer}/v1/markets/quotes?ids=${idsParam}&stream=true&mode=WebSocket`;
   // Full URL: https://api02.iq.questrade.com/v1/markets/quotes?ids=8049,9372670,...&stream=true&mode=WebSocket

   // Make GET request to Questrade
   GET https://api02.iq.questrade.com/v1/markets/quotes?ids=8049,9372670,9372686,8050,...&stream=true&mode=WebSocket
   Headers:
     Authorization: Bearer zN3fG8hK2jL9pQ4vR7wX1mY6tB5cD0eF...

   // Questrade Response:
   {
     "streamPort": 8237,
     "quotes": [
       {
         "symbolId": 8049,
         "symbol": "GLD",
         "lastTradePrice": 164.75,
         "bidPrice": 164.74,
         "askPrice": 164.76,
         ...
       },
       // ... initial quotes for all symbols
     ]
   }
   ```

4. **Cache stream port for 24 hours**
   ```javascript
   const expiresAt = Date.now() + (24 * 60 * 60 * 1000);
   this.streamPortCache.set('Roshni', {
     streamPort: 8237,
     expiresAt: expiresAt
   });
   ```

5. **Handle token expiry (if 401 error)**
   ```javascript
   if (error.response && error.response.status === 401) {
     // Token expired - refresh it
     POST http://localhost:4001/api/auth/refresh-token/Roshni

     // Get new access token
     GET http://localhost:4001/api/auth/access-token/Roshni

     // Retry stream port request with new token
     GET https://api02.iq.questrade.com/v1/markets/quotes?ids=...
   }
   ```

**Response:**
```json
{
  "success": true,
  "data": {
    "streamPort": 8237
  }
}
```

---

### Step 6: Build WebSocket URL

**Frontend Processing:**
```javascript
// questradeWebSocket.js:350-361
const apiServer = "https://api02.iq.questrade.com";
const streamPort = 8237;

// Convert https:// to wss://
let wsServer = apiServer.replace('https://', 'wss://');
// Result: "wss://api02.iq.questrade.com"

// Remove trailing slash if any
wsServer = wsServer.replace(/\/$/, '');

// Build WebSocket URL
const wsUrl = `${wsServer}:${streamPort}`;
// Final URL: wss://api02.iq.questrade.com:8237
```

---

### Step 7: Connect to WebSocket

**Frontend Processing:**
```javascript
// questradeWebSocket.js:186-189
this.ws = new WebSocket('wss://api02.iq.questrade.com:8237');

// Setup event handlers
this.ws.onopen = () => { ... }
this.ws.onmessage = (event) => { ... }
this.ws.onerror = (error) => { ... }
this.ws.onclose = (event) => { ... }
```

---

### Step 8: Authenticate with Access Token

**WebSocket OPEN Event:**
```javascript
// questradeWebSocket.js:368-374
this.ws.onopen = () => {
  console.log('✅ Connection opened, authenticating...');

  // Send access token as plain string (NOT JSON)
  this.ws.send(accessToken);
  // Sends: "zN3fG8hK2jL9pQ4vR7wX1mY6tB5cD0eF..."
};
```

**Questrade Response:**
```javascript
// questradeWebSocket.js:376-394
this.ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  // Authentication success response
  if (message.success === true) {
    console.log('✅ Authenticated successfully!');
    this.isAuthenticated = true;
    // Proceed to subscribe to symbols
  }
}
```

**Authentication Response from Questrade:**
```json
{
  "success": true
}
```

**Authentication Error Response (if token invalid):**
```json
{
  "code": 1017,
  "message": "Access token is invalid"
}
```

---

### Step 9: Subscribe to Symbol IDs

**Send Subscription Message:**
```javascript
// questradeWebSocket.js:532-548
const symbolIdsArray = Array.from(this.subscribedSymbolIds);
// [8049, 9372670, 9372686, 8050, ...]

const subscribeMessage = {
  mode: 'streaming',
  ids: symbolIdsArray
};

this.ws.send(JSON.stringify(subscribeMessage));
```

**Subscription Message (JSON):**
```json
{
  "mode": "streaming",
  "ids": [8049, 9372670, 9372686, 8050, ...]
}
```

---

### Step 10: Receive Real-Time Quote Updates

**WebSocket Message Event:**
```javascript
// questradeWebSocket.js:376-526
this.ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  // Quote updates come wrapped in {quotes: Array}
  if (message.quotes && Array.isArray(message.quotes)) {
    console.log(`📦 Received ${message.quotes.length} quote updates`);
    // Process quotes...
  }
};
```

**Quote Update from Questrade:**
```json
{
  "quotes": [
    {
      "symbolId": 8049,
      "tier": "",
      "bidPrice": 164.74,
      "bidSize": 1100,
      "askPrice": 164.76,
      "askSize": 800,
      "lastTradePriceTrHrs": 164.75,
      "lastTradePrice": 164.75,
      "lastTradeSize": 100,
      "lastTradeTick": "Up",
      "lastTradeTime": "2025-10-28T14:35:22.123456-04:00",
      "volume": 12458200,
      "openPrice": 164.00,
      "highPrice": 165.10,
      "lowPrice": 163.85,
      "delay": 0,
      "isHalted": false
    },
    {
      "symbolId": 9372670,
      "tier": "",
      "bidPrice": 15.73,
      "bidSize": 500,
      "askPrice": 15.75,
      "askSize": 300,
      "lastTradePrice": 15.74,
      "lastTradeSize": 200,
      "lastTradeTick": "Up",
      "lastTradeTime": "2025-10-28T14:35:25.789012-04:00",
      "volume": 85420,
      "openPrice": 15.70,
      "highPrice": 15.80,
      "lowPrice": 15.65,
      "delay": 0,
      "isHalted": false
    }
    // ... more quote updates
  ]
}
```

**Frontend Processing:**
```javascript
// questradeWebSocket.js:487-502
const processedQuotes = message.quotes
  .filter(quote => quote.symbolId !== undefined)
  .map(quote => {
    // Add symbol name (Questrade only sends symbolId)
    const symbol = this.symbolIdMap.get(quote.symbolId);
    if (symbol) {
      return { ...quote, symbol };
    }
    return null;
  })
  .filter(quote => quote !== null);

// Call user's callback with all quotes (batch update)
if (this.onQuoteUpdate && processedQuotes.length > 0) {
  this.onQuoteUpdate(processedQuotes);
}
```

**Processed Quotes (with symbol names):**
```javascript
[
  {
    symbolId: 8049,
    symbol: "GLD",  // ← Added by frontend
    lastTradePrice: 164.75,
    bidPrice: 164.74,
    askPrice: 164.76,
    volume: 12458200,
    ...
  },
  {
    symbolId: 9372670,
    symbol: "IMAX.TO",  // ← Added by frontend
    lastTradePrice: 15.74,
    bidPrice: 15.73,
    askPrice: 15.75,
    volume: 85420,
    ...
  }
]
```

**Update Holdings UI:**
```javascript
// Holdings.jsx:236-255
function handleQuoteUpdate(quotes) {
  // Batch update all changed positions at once
  const updates = {};

  quotes.forEach(quote => {
    if (quote.symbol) {
      updates[quote.symbol] = {
        currentPrice: quote.lastTradePrice,
        bidPrice: quote.bidPrice,
        askPrice: quote.askPrice,
        volume: quote.volume
      };
    }
  });

  // Update positions store (triggers reactive re-render)
  setRawPositions(produce(positions => {
    positions.forEach((pos, index) => {
      if (updates[pos.symbol]) {
        positions[index].currentPrice = updates[pos.symbol].currentPrice;
      }
    });
  }));

  // Recalculate metrics (debounced to prevent excessive updates)
  debouncedCalculateMetrics();
}
```

---

## Connection Maintenance

### Heartbeat / Keep-Alive

**Problem:** Questrade requires "requests at least every 30 minutes" to keep session alive.

**Solution:** Re-send subscription every 20 minutes (safety margin).

```javascript
// questradeWebSocket.js:582-603
this.heartbeatInterval = setInterval(() => {
  if (this.ws && this.ws.readyState === WebSocket.OPEN) {
    console.log('💓 Refreshing subscription (30min keep-alive)...');
    // Re-send subscription message
    this.subscribeToSymbols();
  }
}, 20 * 60 * 1000); // 20 minutes
```

### Health Monitoring

**Check connection health every 30 seconds:**

```javascript
// questradeWebSocket.js:610-674
this.healthCheckInterval = setInterval(() => {
  // Check 1: Verify connection is still established
  if (!this.isConnected()) {
    return;
  }

  // Check 2: Verify WebSocket state is OPEN
  if (this.ws.readyState !== WebSocket.OPEN) {
    console.error('❌ WebSocket state invalid, reconnecting...');
    this.handleDisconnect();
    return;
  }

  // Check 3: Verify we're receiving data
  const timeSinceLastMessage = Date.now() - this.lastMessageTime;

  // Re-subscribe after 30s of no data
  if (timeSinceLastMessage > 30000) {
    console.warn('⚠️ No data for 30s - re-subscribing...');
    this.subscribeToSymbols();
  }

  // Reconnect after 1 min of no data
  if (timeSinceLastMessage > 60000) {
    console.error('❌ Connection timeout! Reconnecting...');
    this.ws.close(4000, 'Connection timeout');
  }
}, 30 * 1000); // Check every 30 seconds
```

### Auto-Reconnect

**On disconnect, reconnect with exponential backoff:**

```javascript
// questradeWebSocket.js:715-755
scheduleReconnect(forceRefresh = false) {
  // For token expiry, reconnect immediately with fresh token
  // For other errors, use exponential backoff
  const delay = forceRefresh
    ? 1000
    : Math.min(5000 * Math.pow(2, this.reconnectAttempts), 80000);

  this.reconnectAttempts++;

  console.log(`🔄 Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts}/5)...`);

  setTimeout(() => {
    this.connect(Array.from(this.allSymbols), this.onQuoteUpdate);
  }, delay);
}
```

---

## Summary Flow Diagram

```
Holdings Page Load
    │
    ▼
Extract Symbols: ["GLD", "IMAX.TO", "HYLD.TO", ...]
    │
    ▼
┌────────────────────────────────────────────────────────────┐
│  STEP 1: Get Available Persons                             │
│  GET /api-auth/persons                                     │
│  Response: ["Roshni", "Victor", "Vivek"]                   │
└───────────────────┬────────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────────────┐
│  STEP 2: Get Access Token (Try Roshni first)              │
│  GET /api-auth/auth/access-token/Roshni                    │
│                                                            │
│  Backend Process:                                          │
│  1. Check in-memory cache (30s buffer)                     │
│  2. Check MongoDB for valid token                          │
│  3. If not found, call Questrade OAuth:                    │
│     POST https://login.questrade.com/oauth2/token          │
│  4. Save new tokens to MongoDB                             │
│  5. Cache in memory                                        │
│                                                            │
│  Response: {                                               │
│    accessToken: "zN3fG8hK...",                             │
│    apiServer: "https://api02.iq.questrade.com",            │
│    expiresAt: "2025-10-28T11:30:00Z"                       │
│  }                                                         │
│                                                            │
│  If rate limited (429), try Victor, then Vivek             │
└───────────────────┬────────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────────────┐
│  STEP 3: Get Symbol IDs                                    │
│  POST /api-market/symbols/lookup                           │
│  Body: { symbols: ["GLD", "IMAX.TO", ...] }               │
│                                                            │
│  Backend Process:                                          │
│  1. Check in-memory cache (permanent)                      │
│  2. Check MongoDB symbols collection                       │
│  3. If not found, call Questrade:                          │
│     GET https://api02.iq.questrade.com/v1/symbols/search   │
│  4. Save to MongoDB                                        │
│  5. Cache in memory                                        │
│                                                            │
│  Response: {                                               │
│    "GLD": { symbolId: 8049, ... },                         │
│    "IMAX.TO": { symbolId: 9372670, ... }                   │
│  }                                                         │
└───────────────────┬────────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────────────┐
│  STEP 4: Get Stream Port                                   │
│  POST /api-market/symbols/stream-port                      │
│  Body: { symbolIds: [8049, 9372670, ...], person: "Roshni"}│
│                                                            │
│  Backend Process:                                          │
│  1. Check 24-hour cache                                    │
│  2. If cache miss:                                         │
│     GET https://api02.iq.questrade.com/v1/markets/quotes   │
│         ?ids=8049,9372670&stream=true&mode=WebSocket       │
│  3. Cache stream port for 24 hours                         │
│                                                            │
│  Response: { streamPort: 8237 }                            │
└───────────────────┬────────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────────────┐
│  STEP 5: Build WebSocket URL                               │
│  wss://api02.iq.questrade.com:8237                         │
└───────────────────┬────────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────────────┐
│  STEP 6: Connect to WebSocket                              │
│  new WebSocket('wss://api02.iq.questrade.com:8237')        │
└───────────────────┬────────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────────────┐
│  STEP 7: Authenticate                                      │
│  ws.send(accessToken)  // Plain string, NOT JSON           │
│  Questrade Response: { success: true }                     │
└───────────────────┬────────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────────────┐
│  STEP 8: Subscribe to Symbol IDs                           │
│  ws.send(JSON.stringify({                                  │
│    mode: 'streaming',                                      │
│    ids: [8049, 9372670, 9372686, ...]                      │
│  }))                                                       │
└───────────────────┬────────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────────────┐
│  STEP 9: Receive Real-Time Quotes                          │
│  ws.onmessage → { quotes: [...] }                          │
│  • Update positions with new prices                        │
│  • Recalculate metrics (debounced)                         │
│  • Update UI reactively                                    │
└────────────────────────────────────────────────────────────┘
                    │
                    ▼
    ┌───────────────────────────────────┐
    │  Maintenance (every 20 minutes):  │
    │  Re-send subscription to keep     │
    │  connection alive                 │
    └───────────────────────────────────┘
```

---

## Key Endpoints

| Endpoint | Method | Purpose | Caching |
|----------|--------|---------|---------|
| `/api-auth/persons` | GET | Get available persons | None |
| `/api-auth/auth/access-token/:person` | GET | Get access token | 30-min cache |
| `/api-market/symbols/lookup` | POST | Get symbol IDs | Permanent cache |
| `/api-market/symbols/stream-port` | POST | Get WebSocket port | 24-hour cache |

---

## Caching Strategy

### Access Token Cache
- **TTL:** 30 minutes (with 30-second buffer)
- **Storage:** In-memory + MongoDB
- **Refresh:** Automatic via Questrade OAuth when expired

### Symbol ID Cache
- **TTL:** Permanent (symbol IDs never change)
- **Storage:** In-memory + MongoDB
- **Refresh:** Never (unless manually cleared)

### Stream Port Cache
- **TTL:** 24 hours
- **Storage:** In-memory only
- **Refresh:** Automatic via Questrade API when expired

---

## Fallback Mechanism

If one person's token fails (rate limited or expired), automatically try next person:

1. Try Roshni → Rate limited (429)
2. Try Victor → Rate limited (429)
3. Try Vivek → Success! ✅

This ensures WebSocket connection succeeds even if one person hits rate limits.

---

## Error Handling

### Token Expiry (Code 1017)
```javascript
if (message.code === 1017) {
  // Access token expired
  // Close connection and reconnect with fresh token
  this.ws.close(4001, 'Access token expired');
}
```

### Rate Limiting (429)
```javascript
if (response.status === 429) {
  // Rate limited - try next person
  throw new Error('Rate limited');
}
```

### Connection Timeout
```javascript
if (timeSinceLastMessage > 60000) {
  // No data for 1 minute
  this.ws.close(4000, 'Connection timeout');
}
```

---

## Performance Optimizations

1. **Multi-level caching** reduces API calls:
   - In-memory cache (fastest)
   - MongoDB cache (fast)
   - Questrade API (slowest)

2. **Batch symbol lookup** - one request for all symbols instead of individual requests

3. **24-hour stream port cache** - reduces Questrade API calls

4. **Permanent symbol ID cache** - symbol IDs never change, never expire

5. **Person fallback** - if one person is rate limited, try another

6. **Debounced UI updates** - prevents excessive re-renders during rapid quote updates

---

**End of Questrade WebSocket Flow Documentation**
