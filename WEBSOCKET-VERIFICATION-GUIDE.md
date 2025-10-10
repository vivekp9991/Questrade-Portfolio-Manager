# 🔍 WebSocket Verification Guide

## How to Verify WebSocket is Working

Follow these steps to confirm the WebSocket connection is functioning correctly.

---

## Step 1: Open Browser Developer Console

1. Open your browser and go to: **http://localhost:5000**
2. Press **F12** (or Right-click → Inspect)
3. Click on the **Console** tab

---

## Step 2: Check WebSocket Connection Logs

When the app loads your portfolio, look for these specific log messages:

### ✅ **SUCCESS - WebSocket Working**

You should see this sequence:

```
[useQuoteStreaming] 🚀 Starting WebSocket connection for real-time quotes
[QT WebSocket] Starting connection for 44 symbols: AAPL, TD.TO, ...
[QT WebSocket] Fetching access token from Auth API...
[QT WebSocket] Access token retrieved, expires at: 2025-10-09T22:45:00.000Z
[QT WebSocket] Looking up symbol IDs for 44 symbols...
[QT WebSocket] Got 44 symbol IDs from Market API
[QT WebSocket] Symbol mapping: {"AAPL": 8049, "TD.TO": 1234, ...}
[QT WebSocket] Connecting to: wss://stream05.iq.questrade.com/v1/markets/quotes
[QT WebSocket] Connection opened, authenticating...
[QT WebSocket] Sent authentication message
[QT WebSocket] Message from server: {"success":true}
[QT WebSocket] ✅ Authenticated successfully!
[QT WebSocket] Subscribing to 44 symbols: [8049, 1234, 5678, ...]
[QT WebSocket] ✅ Subscription request sent
[useQuoteStreaming] ✅ WebSocket connected for 44 symbols
```

**During Market Hours** (9:30 AM - 4:00 PM ET), you'll also see:

```
[QT WebSocket] Message from server: {"symbolId":8049,"lastTradePrice":225.50,...}
[QT WebSocket] Quote update: AAPL = $225.50
📈 Processing quote update for AAPL: 225.50
💰 Price change detected for AAPL: 225.30 → 225.50
✅ Stock data updated with new prices
```

---

### ❌ **FAILURE - WebSocket Not Working**

If you see this, WebSocket failed (but polling fallback should work):

```
[useQuoteStreaming] 🚀 Starting WebSocket connection for real-time quotes
[QT WebSocket] ❌ Error: Failed to fetch access token
[useQuoteStreaming] ❌ WebSocket connection failed, falling back to polling
[useQuoteStreaming] Using polling mode for quotes
```

**Common Failure Reasons**:
- Auth API not running (localhost:4001)
- Market API not running (localhost:4004)
- Rate limited (429 error) - wait 10-15 minutes
- Invalid/expired Questrade token

---

## Step 3: Check Network Tab (WebSocket Connection)

### Option A: Use Network Tab Filter

1. In DevTools, click **Network** tab
2. Click **WS** filter (WebSocket filter)
3. Refresh the page
4. You should see: **`stream05.iq.questrade.com`** in the list

![WebSocket in Network Tab](https://i.imgur.com/example.png)

### Option B: Detailed WebSocket Inspection

1. Click on the WebSocket connection: **`stream05.iq.questrade.com`**
2. Click **Messages** sub-tab
3. You should see:

**Sent Messages** (from your app):
```json
{"access_token":"abc123xyz789..."}
{"mode":"streaming","ids":[8049,1234,5678,...]}
{"heartbeat":true}
```

**Received Messages** (from Questrade):
```json
{"success":true}
{"symbolId":8049,"lastTradePrice":225.50,"bidPrice":225.45,...}
{"symbolId":1234,"lastTradePrice":78.25,"askPrice":78.30,...}
```

---

## Step 4: Visual Verification in UI

### Check 1: Real-Time Price Updates

1. Go to **Holdings** tab
2. During market hours, watch the **Current Price** column
3. Prices should update **instantly** (not every 30 seconds)

**WebSocket Working**:
- Prices update < 1 second after market change
- You'll see green/red flash animation on updated rows

**Polling (Fallback)**:
- Prices update every 30 seconds
- Still works, but slower

### Check 2: Console Frequency

**WebSocket Working**:
```
3:45:01 PM - [QT WebSocket] Quote update: AAPL = $225.50
3:45:03 PM - [QT WebSocket] Quote update: GOOG = $2850.00
3:45:04 PM - [QT WebSocket] Quote update: AAPL = $225.52  ← Only 3 seconds!
```

**Polling**:
```
3:45:00 PM - 📈 Processing quote update for AAPL: 225.50
3:45:30 PM - 📈 Processing quote update for AAPL: 225.52  ← 30 seconds later
```

---

## Step 5: Backend API Verification

### Test Symbol Lookup Endpoint

Open a **new terminal** and run:

```bash
curl -X POST http://localhost:4004/api/symbols/lookup \
  -H "Content-Type: application/json" \
  -d "{\"symbols\": [\"AAPL\", \"TD.TO\"]}"
```

**✅ Expected Response** (if not rate-limited):
```json
{
  "success": true,
  "data": {
    "AAPL": {
      "symbolId": 8049,
      "symbol": "AAPL",
      "description": "Apple Inc",
      "currency": "USD"
    },
    "TD.TO": {
      "symbolId": 1234,
      "symbol": "TD.TO",
      "description": "Toronto-Dominion Bank",
      "currency": "CAD"
    }
  }
}
```

**⚠️ If Rate Limited**:
```json
{
  "success": false,
  "error": "Request failed with status code 429"
}
```

**Solution**: Wait 10-15 minutes. The WebSocket service will use cached symbol IDs from the database, so this is only needed once.

---

## Step 6: Check Backend Services Status

### Verify All Services Running

```bash
# Auth API (should return token info)
curl http://localhost:4001/api/auth/access-token/Vivek

# Market API (should return "Market API is running")
curl http://localhost:4004/health

# Portfolio API
curl http://localhost:4003/health

# Sync API
curl http://localhost:4002/health
```

**All should return successful responses** (not "connection refused").

---

## Step 7: Database Verification (Optional)

Check if symbol IDs are being cached:

### Using MongoDB Compass or CLI:

```javascript
// Connect to: mongodb://localhost:27017
// Database: questrade-market
// Collection: symbols

db.symbols.find({symbol: "AAPL"})
```

**Expected**:
```json
{
  "_id": "...",
  "symbol": "AAPL",
  "symbolId": 8049,
  "description": "Apple Inc",
  "currency": "USD",
  "lastUpdated": "2025-10-09T21:30:00.000Z"
}
```

If symbols are cached, future lookups are instant (no API calls).

---

## 🎯 Quick Visual Checklist

### ✅ WebSocket is WORKING if you see:

- [ ] `✅ Authenticated successfully!` in console
- [ ] `✅ WebSocket connected for 44 symbols` in console
- [ ] WebSocket connection in Network → WS tab
- [ ] Quote updates appearing every few seconds (market hours)
- [ ] Prices updating instantly in UI (not every 30 seconds)
- [ ] Green/red flash animations on price changes

### ⚠️ WebSocket is NOT working (using fallback) if you see:

- [ ] `❌ WebSocket connection failed` in console
- [ ] `falling back to polling` in console
- [ ] Prices updating every 30 seconds (not instantly)
- [ ] No WebSocket connection in Network → WS tab
- [ ] Backend service errors (Auth/Market API down)

---

## 🐛 Troubleshooting Common Issues

### Issue 1: "Failed to fetch access token"

**Cause**: Auth API not running or token expired

**Fix**:
```bash
# Check if Auth API is running
curl http://localhost:4001/api/persons

# If not running, restart services
cd /d/Project/3
npm run dev
```

### Issue 2: "Symbol lookup failed" or "Got 0 symbol IDs"

**Cause**: Market API not running or rate limited

**Fix**:
```bash
# Check if Market API is running
curl http://localhost:4004/health

# If rate limited, wait 10-15 minutes
# Or manually add symbols to database (see below)
```

### Issue 3: "WebSocket connection closed unexpectedly"

**Cause**: Questrade WebSocket server issue or network problem

**Fix**: The service will auto-reconnect with exponential backoff
- Wait 5 seconds → reconnect attempt 1
- Wait 10 seconds → reconnect attempt 2
- Wait 20 seconds → reconnect attempt 3
- If all fail → fallback to polling

### Issue 4: No quote updates during market hours

**Cause**: Symbols not subscribed or subscription failed

**Check Console**:
```
[QT WebSocket] ✅ Subscription request sent  ← Should see this
```

If you see "Subscription failed", check:
- Are symbol IDs valid? (should be numbers like 8049, not null)
- Is WebSocket still connected? (should not be closed)

---

## 📊 Performance Monitoring

### WebSocket Metrics to Watch

**In Browser Console**:

1. **Connection Time**: Should see "✅ Authenticated successfully!" within 2-3 seconds
2. **Symbol Lookup Time**: "Got 44 symbol IDs" should appear within 1-2 seconds (or instant if cached)
3. **Quote Frequency**: During active market, expect 5-20 updates per second
4. **Reconnection**: If disconnected, should reconnect within 5-10 seconds

**In Network Tab** (WebSocket):
- **Frames Sent**: Should show ~3 (auth, subscribe, heartbeat every 25 min)
- **Frames Received**: Should show continuous stream during market hours
- **Connection Status**: Should stay "green" (open)

---

## 🎨 Manual Testing Scenarios

### Scenario 1: First Load (Cold Start)

1. Clear browser cache
2. Reload page
3. **Expected**: Symbol lookup from Questrade API (might fail if rate-limited)
4. **Fallback**: Uses polling if symbol lookup fails

### Scenario 2: Subsequent Loads (Warm Start)

1. Reload page (don't clear cache)
2. **Expected**: Symbol lookup from database cache (instant)
3. WebSocket connects within 2-3 seconds

### Scenario 3: Market Hours

1. Load app during 9:30 AM - 4:00 PM ET
2. **Expected**: Continuous quote updates every few seconds
3. Watch UI for real-time price changes

### Scenario 4: After Hours

1. Load app after 4:00 PM ET
2. **Expected**: WebSocket connects successfully
3. **No quote updates** (market closed, but connection stays alive)

### Scenario 5: Network Interruption

1. Load app, wait for WebSocket to connect
2. Disconnect internet for 10 seconds
3. Reconnect internet
4. **Expected**: Auto-reconnect within 5-10 seconds

---

## 🔧 Enable/Disable WebSocket for Testing

To test the polling fallback:

**File**: `Frontend/dividend-portfolio-manager/src/hooks/useQuoteStreaming.js`

```javascript
// Line 9: Change from true to false
const USE_WEBSOCKET = false; // Disable WebSocket, use polling
```

Save, reload browser → Should use polling (30-second updates)

**Re-enable**:
```javascript
const USE_WEBSOCKET = true; // Enable WebSocket
```

---

## 📝 What to Report

If WebSocket is not working, please share:

1. **Console Logs** (copy first 20 lines after page load)
2. **Error Messages** (any red text in console)
3. **Network Tab** (screenshot of WS tab)
4. **Backend Status**:
   ```bash
   curl http://localhost:4001/api/persons
   curl http://localhost:4004/health
   ```
5. **Time of Day** (are markets open?)

---

## ✅ Final Verification Command

Run this all-in-one check:

```bash
echo "=== Frontend ==="
curl -s http://localhost:5000 > /dev/null && echo "✅ Frontend running" || echo "❌ Frontend not running"

echo ""
echo "=== Backend Services ==="
curl -s http://localhost:4001/api/persons > /dev/null && echo "✅ Auth API running" || echo "❌ Auth API not running"
curl -s http://localhost:4004/health > /dev/null && echo "✅ Market API running" || echo "❌ Market API not running"

echo ""
echo "=== Symbol Lookup Test ==="
curl -X POST http://localhost:4004/api/symbols/lookup \
  -H "Content-Type: application/json" \
  -d '{"symbols": ["AAPL"]}' 2>/dev/null | grep -q "success" && echo "✅ Symbol lookup working" || echo "⚠️ Symbol lookup failed (might be rate-limited)"

echo ""
echo "=== Ready to test! ==="
echo "Open http://localhost:5000 and check browser console for WebSocket logs"
```

---

**Summary**: Open http://localhost:5000, press F12, go to Console tab, and look for `✅ WebSocket connected for XX symbols`. That's your confirmation! 🚀
