# Questrade Rate Limit Fix & Configuration

## 📊 Questrade API Rate Limits (Official)

### Market Data Calls
- **20 requests per second**
- **15,000 requests per hour**
- Includes: quotes, candles, symbols, markets

### Account Calls
- **30 requests per second**
- **30,000 requests per hour**
- Includes: accounts, positions, balances, executions, orders

### Important Note
If you're NOT subscribed to **real-time data package**:
- Each quote call counts as a "snap quote"
- **Limited quota per market** (easily reached)
- Recommended: Use less frequent polling or WebSocket

---

## ⚠️ Your Current Issue

**Current Setup**:
- 44 symbols in your portfolio
- Polling every 5 seconds
- = 12 requests/minute
- = 720 requests/hour ✅ (well under 15,000 limit)

**Why 429 Error?**:
1. **Snap Quote Limits**: Without real-time data subscription, snap quotes have tighter limits
2. **Burst Requests**: Multiple API calls happening simultaneously
3. **Token Exchange**: Auth calls + Market calls happening together

---

## 🔧 Solutions

### Option 1: Increase Polling Interval (Recommended for Now)

**Change from 5 seconds to 30 seconds:**

This reduces load significantly:
- 5 seconds = 12 requests/min
- 30 seconds = 2 requests/min
- 60 seconds = 1 request/min

### Option 2: Batch Symbols in Smaller Groups

Instead of 44 symbols in one call, split into batches:
- Group 1: 15 symbols
- Group 2: 15 symbols
- Group 3: 14 symbols
- Stagger requests by 2 seconds each

### Option 3: WebSocket Streaming (Your Future Plan - BEST)

Use Questrade WebSocket API:
- Real-time updates (no polling needed!)
- No rate limit issues
- More efficient
- True live data

---

## 🚀 Quick Fix: Update Polling Interval

### Step 1: Update Constants

File: `Frontend/dividend-portfolio-manager/src/utils/constants.js`

**Change from**:
```javascript
export const POLLING_INTERVALS = {
    QUOTES: 5000,  // 5 seconds
    ...
};
```

**Change to**:
```javascript
export const POLLING_INTERVALS = {
    QUOTES: 30000,  // 30 seconds (safer for snap quotes)
    ...
};
```

### Step 2: Restart Frontend

```bash
# The frontend will auto-reload with new interval
# Or manually restart:
npm run frontend:only
```

---

## 📈 Recommended Configuration

### For Development (Practice Account)
```javascript
QUOTES: 30000,           // 30 seconds (safe)
EXCHANGE_RATE: 900000,   // 15 minutes
POSITIONS: 60000,        // 60 seconds
```

### For Production (Real-time Subscription)
```javascript
QUOTES: 5000,            // 5 seconds (if subscribed)
EXCHANGE_RATE: 900000,   // 15 minutes
POSITIONS: 30000,        // 30 seconds
```

### For Future (WebSocket Implementation)
```javascript
// No polling needed!
// WebSocket provides real-time updates
```

---

## 🔍 Rate Limit Monitoring

Questrade sends headers with every response:

```
X-RateLimit-Remaining: 19    // Requests left this second
X-RateLimit-Reset: 1704844800  // Unix timestamp when reset
```

Your app could monitor these to avoid 429 errors.

---

## 🎯 Implementation Plan

### Phase 1: Immediate Fix (Now)
1. ✅ Change polling interval to 30 seconds
2. ✅ Add exponential backoff on 429 errors
3. ✅ Monitor rate limit headers

### Phase 2: Optimization (Soon)
1. Implement WebSocket for live quotes
2. Use polling as fallback only
3. Add rate limit tracking

### Phase 3: Production (Later)
1. Subscribe to real-time data package
2. Fine-tune intervals
3. Add caching layer

---

## 💡 WebSocket Implementation (Future)

When you're ready for WebSocket, here's the approach:

### Questrade WebSocket URL
```
wss://stream01.iq.questrade.com/v1/markets/quotes
```

### Benefits
- ✅ Real-time updates (no delay)
- ✅ No rate limiting issues
- ✅ More efficient (server pushes updates)
- ✅ Lower latency

### Your streaming.js Already Has WebSocket Code!
The file already includes WebSocket implementation at lines 21-135. You just need to:
1. Get symbol IDs from backend
2. Subscribe to WebSocket
3. Handle incoming quote updates

---

## 🛠️ Let Me Fix It For You

I can make these changes right now:

1. **Update polling interval** to 30 seconds
2. **Add rate limit handling** with exponential backoff
3. **Add configuration** for easy adjustment

Would you like me to:
- **A**: Make the quick fix now (30-second polling)
- **B**: Implement proper rate limit handling with backoff
- **C**: Both A and B
- **D**: Wait until you implement WebSocket

---

## 📝 Current Polling Strategy

Your app currently uses:

```javascript
// startPollingQuotes called every 5 seconds
// With 44 symbols = 1 API call with all symbols
// Questrade treats this as 1 "snap quote" request

// Timeline:
// 0s  -> GET /api/quotes?symbols=GLD,KILO,... (44 symbols)
// 5s  -> GET /api/quotes?symbols=GLD,KILO,... (44 symbols)
// 10s -> GET /api/quotes?symbols=GLD,KILO,... (44 symbols)
// ...repeats
```

**With 30-second interval**:
```javascript
// 0s   -> GET /api/quotes?symbols=GLD,KILO,... (44 symbols)
// 30s  -> GET /api/quotes?symbols=GLD,KILO,... (44 symbols)
// 60s  -> GET /api/quotes?symbols=GLD,KILO,... (44 symbols)
// ...repeats
```

---

## 🎬 Recommended Action

**For Now**: Change to 30-second polling
- Simple one-line fix
- Eliminates 429 errors
- Still gives you "near real-time" updates
- Quotes are still fresh enough for portfolio tracking

**Later**: Implement WebSocket
- True real-time
- No rate limits
- Professional implementation
- Your code already has the structure!

---

## Quick Commands

### Check Current Rate Limit Status
```bash
# Make a test request and check headers
curl -v "http://localhost:4004/api/quotes?symbols=AAPL" 2>&1 | grep -i "rate-limit"
```

### Monitor Backend Logs for 429 Errors
```bash
tail -f Backend/questrade-portfolio-microservices/questrade-market-api/logs/app.log | grep "429"
```

### Test After Fix
```bash
# Should see no more 429 errors after interval change
tail -f Backend/questrade-portfolio-microservices/questrade-market-api/logs/app.log
```

---

## Summary

✅ **Problem**: 5-second polling hitting snap quote limits
✅ **Cause**: No real-time data subscription + frequent polling
✅ **Quick Fix**: Change to 30-second interval
✅ **Long-term**: Implement WebSocket streaming
✅ **Rate Limits**: 20 req/sec, 15,000 req/hour for market data

**Would you like me to apply the quick fix now?**
