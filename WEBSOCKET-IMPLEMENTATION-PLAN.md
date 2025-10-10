# WebSocket Implementation Plan - Direct Questrade Connection

## 🎯 Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│ UI (Browser)                                            │
│                                                         │
│  1. Get access token from Backend                      │
│  2. Connect WebSocket directly to Questrade            │
│  3. Subscribe to symbol IDs                            │
│  4. Receive real-time quote updates                    │
└─────────────────────────────────────────────────────────┘
                        ↓
                        ↓ WebSocket Connection
                        ↓
┌─────────────────────────────────────────────────────────┐
│ Questrade Streaming API                                 │
│ wss://stream01.iq.questrade.com/v1/markets/quotes       │
│                                                         │
│ - Pushes L1 market data (bid/ask/last)                │
│ - Real-time updates (no polling!)                      │
│ - Requires keepalive every 30 minutes                  │
└─────────────────────────────────────────────────────────┘
```

**Benefits**:
- ✅ True real-time quotes (instant updates)
- ✅ No rate limiting issues
- ✅ No backend polling needed
- ✅ Direct connection to source
- ✅ More efficient than REST polling

---

## 📋 Implementation Steps

### Step 1: Get Access Token & API Server from Backend

**New Backend Endpoint** (Already exists!):
```
GET http://localhost:4001/api/auth/access-token/Vivek
```

**Response**:
```json
{
  "success": true,
  "data": {
    "accessToken": "C3lTUKuNQrAAmSD/TPjuV/HI7aNrAwDp",
    "apiServer": "https://api05.iq.questrade.com",
    "expiresAt": "2025-01-09T22:30:00Z"
  }
}
```

**Frontend Function**:
```javascript
async function getQuestradeToken() {
  const response = await fetch('http://localhost:4001/api/auth/access-token/Vivek');
  const data = await response.json();
  return {
    token: data.data.accessToken,
    apiServer: data.data.apiServer,
    expiresAt: new Date(data.data.expiresAt)
  };
}
```

---

### Step 2: Get Symbol IDs from Backend

Questrade WebSocket requires **symbol IDs** (not symbol names).

**Backend Endpoint** (Need to create):
```
POST http://localhost:4004/api/symbols/lookup
Body: { "symbols": ["AAPL", "GOOG", "TSLA"] }
```

**Response**:
```json
{
  "success": true,
  "data": {
    "AAPL": { "symbolId": 8049, "symbol": "AAPL" },
    "GOOG": { "symbolId": 9291, "symbol": "GOOG" },
    "TSLA": { "symbolId": 11234, "symbol": "TSLA" }
  }
}
```

**Why?**: Questrade WebSocket subscribes by symbol ID, not ticker symbol.

---

### Step 3: Establish WebSocket Connection

**Questrade WebSocket URL Format**:
```
wss://stream{XX}.iq.questrade.com/v1/markets/quotes
```

Where `{XX}` is extracted from `apiServer`:
- `https://api05.iq.questrade.com` → `wss://stream05.iq.questrade.com`

**Connection Code**:
```javascript
async function connectToQuestradeWebSocket() {
  const { token, apiServer } = await getQuestradeToken();

  // Convert API server to stream server
  // api05.iq.questrade.com → stream05.iq.questrade.com
  const streamServer = apiServer.replace('https://api', 'wss://stream').replace(':443', '');
  const wsUrl = `${streamServer}/v1/markets/quotes`;

  console.log('Connecting to:', wsUrl);
  const ws = new WebSocket(wsUrl);

  return { ws, token };
}
```

---

### Step 4: Authenticate with Access Token

**After Connection Opens**:
```javascript
ws.onopen = () => {
  console.log('WebSocket connected, authenticating...');

  // Send access token as first message (NO "Bearer" prefix!)
  ws.send(token);
};
```

**Authentication Response**:
```json
// Success
{"success": true}

// Failure
{"error": "Invalid token"}
```

---

### Step 5: Subscribe to Symbol IDs

**After Successful Authentication**:
```javascript
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  if (message.success === true) {
    console.log('Authenticated successfully!');

    // Subscribe to symbol IDs
    const symbolIds = [8049, 9291, 11234]; // AAPL, GOOG, TSLA
    ws.send(JSON.stringify({
      mode: 'streaming',
      ids: symbolIds
    }));
  }
};
```

**Subscription Request Format**:
```json
{
  "mode": "streaming",
  "ids": [8049, 9291, 11234]
}
```

---

### Step 6: Receive Quote Updates

**Quote Message Format** (From Questrade):
```json
{
  "symbolId": 8049,
  "symbol": "AAPL",
  "bidPrice": 150.20,
  "askPrice": 150.30,
  "lastTradePrice": 150.25,
  "bidSize": 100,
  "askSize": 200,
  "lastTradeSize": 50,
  "lastTradeTime": "2025-01-09T21:30:45.123Z",
  "volume": 1234567,
  "openPrice": 147.75,
  "highPrice": 151.00,
  "lowPrice": 147.50,
  "delay": 0
}
```

**Handle Updates**:
```javascript
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  // Check if it's a quote update
  if (message.symbolId) {
    console.log('Quote update:', message);
    updateUIWithQuote(message);
  }
};
```

---

### Step 7: Keepalive (Heartbeat)

**Critical**: Must send a message every **30 minutes** to prevent disconnection.

```javascript
let heartbeatInterval;

function startHeartbeat(ws) {
  // Send heartbeat every 25 minutes (safe margin)
  heartbeatInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      console.log('Sending heartbeat...');
      ws.send(JSON.stringify({ heartbeat: true }));
    }
  }, 25 * 60 * 1000); // 25 minutes
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }
}
```

---

### Step 8: Handle Token Expiration

Access tokens expire after **30 minutes**.

**Strategy**:
1. Monitor token expiration time
2. Before expiration (e.g., at 25 minutes), refresh token
3. Close old WebSocket
4. Open new WebSocket with new token

```javascript
let tokenExpiryTimer;

function scheduleTokenRefresh(expiresAt, ws) {
  const now = Date.now();
  const expiryTime = new Date(expiresAt).getTime();
  const timeUntilExpiry = expiryTime - now;
  const refreshTime = timeUntilExpiry - (5 * 60 * 1000); // 5 min before expiry

  tokenExpiryTimer = setTimeout(async () => {
    console.log('Token expiring soon, refreshing...');

    // Close current connection
    ws.close();

    // Reconnect with new token
    await connectToQuestradeWebSocket();
  }, refreshTime);
}
```

---

### Step 9: Error Handling & Reconnection

```javascript
ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = (event) => {
  console.log('WebSocket closed:', event.code, event.reason);

  // Clean up
  stopHeartbeat();
  clearTimeout(tokenExpiryTimer);

  // Reconnect after 5 seconds (if not intentional close)
  if (event.code !== 1000) { // 1000 = normal closure
    setTimeout(() => {
      console.log('Reconnecting...');
      connectToQuestradeWebSocket();
    }, 5000);
  }
};
```

---

## 🔧 Complete Implementation Code

### `src/services/questradeWebSocket.js` (New File)

```javascript
class QuestradeWebSocket {
  constructor() {
    this.ws = null;
    this.symbolIds = [];
    this.onQuoteUpdate = null;
    this.heartbeatInterval = null;
    this.tokenExpiryTimer = null;
    this.isConnecting = false;
  }

  async connect(symbols, onQuoteUpdate) {
    if (this.isConnecting) {
      console.log('Already connecting...');
      return;
    }

    this.isConnecting = true;
    this.onQuoteUpdate = onQuoteUpdate;

    try {
      // Step 1: Get access token
      const { token, apiServer, expiresAt } = await this.getToken();

      // Step 2: Get symbol IDs
      this.symbolIds = await this.getSymbolIds(symbols);

      if (this.symbolIds.length === 0) {
        throw new Error('No symbol IDs found');
      }

      // Step 3: Build WebSocket URL
      const streamServer = apiServer
        .replace('https://', 'wss://')
        .replace('api', 'stream');
      const wsUrl = `${streamServer}/v1/markets/quotes`;

      console.log('Connecting to Questrade WebSocket:', wsUrl);

      // Step 4: Connect
      this.ws = new WebSocket(wsUrl);

      // Step 5: Setup handlers
      this.setupHandlers(token, expiresAt);

    } catch (error) {
      console.error('Failed to connect to Questrade WebSocket:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  setupHandlers(token, expiresAt) {
    this.ws.onopen = () => {
      console.log('WebSocket opened, authenticating...');
      this.ws.send(token); // Send token (no Bearer prefix)
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      // Authentication response
      if (message.success === true) {
        console.log('Authenticated! Subscribing to symbols...');
        this.isConnecting = false;

        // Subscribe to symbols
        this.ws.send(JSON.stringify({
          mode: 'streaming',
          ids: this.symbolIds
        }));

        // Start heartbeat
        this.startHeartbeat();

        // Schedule token refresh
        this.scheduleTokenRefresh(expiresAt);

        return;
      }

      // Quote update
      if (message.symbolId) {
        if (this.onQuoteUpdate) {
          this.onQuoteUpdate(message);
        }
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = (event) => {
      console.log('WebSocket closed:', event.code, event.reason);
      this.cleanup();

      // Reconnect if not normal closure
      if (event.code !== 1000) {
        this.scheduleReconnect();
      }
    };
  }

  async getToken() {
    const response = await fetch('http://localhost:4001/api/auth/access-token/Vivek');
    const data = await response.json();

    if (!data.success) {
      throw new Error('Failed to get access token');
    }

    return {
      token: data.data.accessToken,
      apiServer: data.data.apiServer,
      expiresAt: data.data.expiresAt
    };
  }

  async getSymbolIds(symbols) {
    // First try to get from your Market API
    const response = await fetch('http://localhost:4004/api/symbols/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols })
    });

    const data = await response.json();

    if (data.success) {
      return Object.values(data.data).map(s => s.symbolId);
    }

    return [];
  }

  startHeartbeat() {
    // Send heartbeat every 25 minutes
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        console.log('Sending heartbeat...');
        this.ws.send(JSON.stringify({ heartbeat: true }));
      }
    }, 25 * 60 * 1000);
  }

  scheduleTokenRefresh(expiresAt) {
    const now = Date.now();
    const expiryTime = new Date(expiresAt).getTime();
    const refreshTime = expiryTime - now - (5 * 60 * 1000); // 5 min before

    if (refreshTime > 0) {
      this.tokenExpiryTimer = setTimeout(() => {
        console.log('Token expiring, refreshing connection...');
        this.disconnect();
        this.connect(this.symbols, this.onQuoteUpdate);
      }, refreshTime);
    }
  }

  scheduleReconnect() {
    setTimeout(() => {
      console.log('Attempting to reconnect...');
      this.connect(this.symbols, this.onQuoteUpdate);
    }, 5000);
  }

  cleanup() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.tokenExpiryTimer) {
      clearTimeout(this.tokenExpiryTimer);
      this.tokenExpiryTimer = null;
    }

    this.isConnecting = false;
  }

  disconnect() {
    this.cleanup();

    if (this.ws) {
      this.ws.close(1000, 'Intentional disconnect');
      this.ws = null;
    }
  }
}

export default new QuestradeWebSocket();
```

---

## 📱 Usage in Your App

### Update `src/hooks/useQuoteStreaming.js`

```javascript
import { onMount, onCleanup } from 'solid-js';
import questradeWebSocket from '../services/questradeWebSocket';

export function useQuoteStreaming(symbols, onQuoteUpdate) {
  onMount(() => {
    // Connect to Questrade WebSocket
    questradeWebSocket.connect(symbols(), (quote) => {
      console.log('Quote update:', quote);
      onQuoteUpdate(quote);
    });
  });

  onCleanup(() => {
    questradeWebSocket.disconnect();
  });
}
```

---

## 🔨 Backend Changes Needed

### 1. Create Symbol Lookup Endpoint

**File**: `Backend/questrade-portfolio-microservices/questrade-market-api/src/routes/symbols.js`

```javascript
// POST /api/symbols/lookup
router.post('/lookup', asyncHandler(async (req, res) => {
  const { symbols } = req.body;

  if (!symbols || !Array.isArray(symbols)) {
    return res.status(400).json({
      success: false,
      error: 'symbols array is required'
    });
  }

  const symbolMap = {};

  for (const symbol of symbols) {
    const result = await symbolService.searchSymbol(symbol);
    if (result && result.symbolId) {
      symbolMap[symbol] = {
        symbolId: result.symbolId,
        symbol: result.symbol,
        description: result.description
      };
    }
  }

  res.json({
    success: true,
    data: symbolMap
  });
}));
```

### 2. Expose Access Token Endpoint

**Already exists!** ✅
```
GET /api/auth/access-token/:personName
```

---

## ⚠️ Important Considerations

### 1. **Browser Limitations**
- ✅ Most browsers support WebSocket
- ⚠️ Some corporate firewalls block WebSocket
- 💡 **Solution**: Have REST polling as fallback

### 2. **CORS Issues**
- Questrade WebSocket should work (no CORS for WebSocket)
- If issues, may need proxy through backend

### 3. **Connection Management**
- Only one WebSocket per user
- Close old connection before opening new
- Handle page refresh (auto-reconnect)

### 4. **Token Security**
- Access token exposed in browser (acceptable for read-only)
- No refresh token in frontend (security risk)
- Token expires after 30 minutes (auto-refresh)

### 5. **Symbol ID Mapping**
- Need to maintain symbol → symbolId mapping
- Cache in localStorage for performance
- Refresh mapping when symbols change

---

## 🎯 Migration Strategy

### Phase 1: Implement WebSocket (Parallel)
- Create `questradeWebSocket.js`
- Create symbol lookup endpoint
- Test with a few symbols
- Keep existing polling as fallback

### Phase 2: Switch to WebSocket
- Use WebSocket as primary
- Keep polling for initial load
- Fallback to polling if WebSocket fails

### Phase 3: Remove Polling
- Once WebSocket is stable
- Remove polling code
- Clean up old endpoints

---

## 📊 Expected Results

| Metric | Current (REST Polling) | With WebSocket |
|--------|------------------------|----------------|
| **Latency** | 0-30 seconds | <100ms (real-time) |
| **API Calls** | 120/hour | 0 (after connection) |
| **Data Freshness** | Up to 30s old | Real-time |
| **Bandwidth** | ~100KB/min | ~10KB/min |
| **User Experience** | Good | Excellent |

---

## ✅ Checklist

### Backend Tasks
- [ ] Create `/api/symbols/lookup` endpoint
- [ ] Test access token endpoint
- [ ] Add symbol ID caching

### Frontend Tasks
- [ ] Create `questradeWebSocket.js` service
- [ ] Implement connection logic
- [ ] Handle authentication
- [ ] Subscribe to symbols
- [ ] Process quote updates
- [ ] Implement heartbeat
- [ ] Handle token refresh
- [ ] Add error handling
- [ ] Add reconnection logic
- [ ] Update UI components

### Testing Tasks
- [ ] Test with 1 symbol
- [ ] Test with 44 symbols
- [ ] Test token expiration
- [ ] Test connection loss
- [ ] Test page refresh
- [ ] Test multiple tabs

---

## 🚀 Ready to Implement?

This plan gives you:
- ✅ True real-time quotes
- ✅ No rate limiting
- ✅ Professional implementation
- ✅ Direct connection to Questrade
- ✅ Automatic reconnection
- ✅ Token management

**Shall I start implementing the code?**

Let me know and I'll:
1. Create the WebSocket service
2. Create the symbol lookup endpoint
3. Integrate with your existing UI
4. Test the implementation
