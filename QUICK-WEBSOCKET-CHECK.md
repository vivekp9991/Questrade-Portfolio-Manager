# ⚡ Quick WebSocket Check (30 seconds)

## 3-Step Verification

### Step 1: Open Browser Console (F12)
- Go to: **http://localhost:5000**
- Press **F12**
- Click **Console** tab

### Step 2: Look for These Messages

**✅ WebSocket WORKING**:
```
[QT WebSocket] ✅ Authenticated successfully!
[QT WebSocket] ✅ Subscription request sent
[useQuoteStreaming] ✅ WebSocket connected for 44 symbols
```

**❌ WebSocket FAILED** (using polling fallback):
```
[useQuoteStreaming] ❌ WebSocket connection failed, falling back to polling
```

### Step 3: Check Network Tab
- Click **Network** tab in DevTools
- Click **WS** (WebSocket filter)
- Look for: **`stream05.iq.questrade.com`**

**✅ If you see it** = WebSocket is connected!

---

## Quick Visual Test

**During market hours** (9:30 AM - 4:00 PM ET):
- Go to **Holdings** tab
- Watch prices update in **real-time** (every few seconds)
- See green/red flash on updated rows

**After hours**:
- WebSocket connects but no quote updates (market closed)

---

## One-Line Terminal Check

```bash
curl -s http://localhost:5000 > /dev/null && echo "✅ Frontend running" || echo "❌ Frontend not running"
```

---

## What You Should See

### In Browser Console (when WebSocket working):
```
[useQuoteStreaming] 🚀 Starting WebSocket connection
[QT WebSocket] Access token retrieved
[QT WebSocket] Got 44 symbol IDs
[QT WebSocket] Connecting to: wss://stream05.iq.questrade.com...
[QT WebSocket] ✅ Authenticated successfully!
[QT WebSocket] ✅ WebSocket connected for 44 symbols
[QT WebSocket] Quote update: AAPL = $225.50  ← Real-time quotes!
```

### In Network Tab → WS:
![WebSocket Connection](data:image/png;base64,...)
- **Name**: stream05.iq.questrade.com
- **Status**: 101 Switching Protocols (green)
- **Type**: websocket

---

## Troubleshooting (if not working)

### Check 1: Are services running?
```bash
curl http://localhost:4001/api/persons  # Auth API
curl http://localhost:4004/health       # Market API
```

### Check 2: Rate limited?
Wait 10-15 minutes, then reload page

### Check 3: Feature flag enabled?
Check `src/hooks/useQuoteStreaming.js` line 9:
```javascript
const USE_WEBSOCKET = true; // Should be true
```

---

## Expected Behavior

| Scenario | WebSocket | Polling (Fallback) |
|----------|-----------|-------------------|
| **Connection** | 2-3 seconds | N/A |
| **Quote Updates** | <1 second | Every 30 seconds |
| **Console Logs** | Continuous during market hours | Every 30 seconds |
| **Network Tab** | Shows WS connection | No WS connection |

---

**Bottom Line**: If you see `✅ WebSocket connected` in the console, it's working! 🎉

For detailed troubleshooting, see: `WEBSOCKET-VERIFICATION-GUIDE.md`
