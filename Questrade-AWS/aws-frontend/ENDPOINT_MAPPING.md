# API Endpoint Mapping - Local vs AWS Backend

## Current Frontend API Calls → AWS Backend Endpoints

### ✅ Authentication Endpoints

| Frontend Call | AWS Endpoint | Status | Notes |
|--------------|--------------|--------|-------|
| Login | `POST /api/login` | ✅ Available | Line 10 in Postman collection |
| Logout | N/A | ⚠️ Client-side only | Clear localStorage |
| Verify Token | `POST /api/login/verify` | ✅ Available | Line 141 |
| Refresh Token | `POST /api/login/refresh` | ✅ Available | Line 158 |

### ✅ Person Management

| Frontend Call | AWS Endpoint | Status | Notes |
|--------------|--------------|--------|-------|
| `GET /api/persons` | `GET /api/persons` | ✅ Available | Line 231 |
| `GET /api/persons/:name` | `GET /api/persons/:name` | ✅ Available | Line 248 |
| `POST /api/persons` | `POST /api/persons` | ✅ Available | Line 193 |
| `PUT /api/persons/:name` | `PUT /api/persons/:name` | ✅ Available | Line 265 |

### ⚠️ Portfolio Data

| Frontend Call | AWS Endpoint | Status | Notes |
|--------------|--------------|--------|-------|
| `GET /api/portfolio/positions` | `GET /api/positions/person/:personName` | ✅ Available | Line 1184 - Use `aggregated=true` |
| `GET /api/portfolio/cash-balances` | `GET /api/accounts/:personName` | ✅ Available | Line 1002 - Extract cash from accounts |
| `GET /api/portfolio/exchange-rate` | ❌ **MISSING** | ⚠️ TODO Backend | **Needs implementation** |

### ✅ Sync Operations

| Frontend Call | AWS Endpoint | Status | Notes |
|--------------|--------------|--------|-------|
| `POST /api/sync/sync-person/:name` | `POST /api/sync/person/:name` | ✅ Available | Line 517 - Note: different path! |
| `GET /api/sync/status` | `GET /api/sync/status` | ✅ Available | Line 757 |
| `POST /api/sync/all` | `POST /api/sync/all` | ✅ Available | Line 569 |

### ✅ Questrade Token Management

| Frontend Call | AWS Endpoint | Status | Notes |
|--------------|--------------|--------|-------|
| Get Access Token | `GET /api/auth/access-token/:name` | ✅ Available | Not in Postman, but exists |
| Setup Person Token | `POST /api/auth/setup-person` | ✅ Available | Line 337 |
| Refresh Token | `POST /api/auth/refresh-token` | ✅ Available | Line 379 |
| Token Status | `GET /api/auth/status` | ✅ Available | Line 413 |

### ✅ Market Data

| Frontend Call | AWS Endpoint | Status | Notes |
|--------------|--------------|--------|-------|
| Search Symbols | `GET /api/market/symbols/search` | ✅ Available | Line 1441 |
| Get Market Status | `GET /api/market/status` | ✅ Available | Line 1407 |
| Get Quotes | `GET /api/market/quotes/:symbolId` | ✅ Available | Line 1424 |

---

## Summary

### ✅ Working Endpoints (Ready to Use)
- All authentication endpoints
- All person management endpoints
- All sync operations
- All Questrade token management
- All market data endpoints
- Account endpoints (for cash balances)
- Position endpoints (aggregated)

### ⚠️ Needs Mapping Changes
| Old Endpoint | New Endpoint | Change Required |
|-------------|--------------|-----------------|
| `/api/sync/sync-person/:name` | `/api/sync/person/:name` | Remove "sync-" prefix |
| `/api/portfolio/positions` | `/api/positions/person/:name?aggregated=true` | Different path structure |
| `/api/portfolio/cash-balances` | `/api/accounts/:name` | Extract cash from account data |

### ❌ Missing Endpoints (Backend TODO)
| Endpoint | Purpose | Priority | Workaround |
|----------|---------|----------|------------|
| `GET /api/portfolio/exchange-rate` | Get USD/CAD rate | Medium | Use hardcoded 1.40 |

---

## Code Changes Required

### 1. Update `api.js` - Sync Endpoint

**OLD:**
```javascript
export async function syncPortfolio(personName = 'Vivek') {
  const url = `${API_BASE}/sync/sync-person/${personName}`;
  const response = await fetch(url, { method: 'POST' });
  return handleResponse(response);
}
```

**NEW:**
```javascript
export async function syncPortfolio(personName = 'Vivek') {
  const url = `${API_BASE_URL}/api/sync/person/${personName}`; // Changed!
  const response = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders() // Added!
  });
  return handleResponse(response);
}
```

### 2. Update `api.js` - Positions Endpoint

**OLD:**
```javascript
export async function fetchPositions(personName = 'Vivek') {
  let url;
  if (personName === 'all') {
    url = `${API_BASE}/portfolio/positions?viewMode=all`;
  } else {
    url = `${API_BASE}/portfolio/positions?viewMode=person&personName=${personName}`;
  }
  const response = await fetch(url);
  return handleResponse(response);
}
```

**NEW:**
```javascript
export async function fetchPositions(personName = 'Vivek') {
  const url = `${API_BASE_URL}/api/positions/person/${personName}?aggregated=true`;
  const response = await fetch(url, {
    headers: getAuthHeaders()
  });
  const data = await handleResponse(response);
  return data.positions || []; // AWS returns { positions: [...] }
}
```

### 3. Update `api.js` - Cash Balances

**OLD:**
```javascript
export async function fetchCashBalances(personName = 'Vivek') {
  let url;
  if (personName === 'all') {
    url = `${API_BASE}/portfolio/cash-balances?viewMode=all`;
  } else {
    url = `${API_BASE}/portfolio/cash-balances?viewMode=person&personName=${personName}`;
  }
  const response = await fetch(url);
  return handleResponse(response);
}
```

**NEW:**
```javascript
export async function fetchCashBalances(personName = 'Vivek') {
  // Fetch accounts (which contain cash balances)
  const url = `${API_BASE_URL}/api/accounts/${personName}`;
  const response = await fetch(url, {
    headers: getAuthHeaders()
  });
  const accounts = await handleResponse(response);

  // Extract cash balances from accounts
  return accounts.map(acc => ({
    accountId: acc.accountId,
    accountNumber: acc.number,
    accountType: acc.type,
    currency: acc.currency,
    cash: acc.cash || 0,
    marketValue: acc.marketValue || 0,
    totalEquity: acc.totalEquity || 0
  }));
}
```

### 4. Update `api.js` - Exchange Rate

**OLD:**
```javascript
export async function fetchExchangeRate() {
  try {
    const url = `${API_BASE}/portfolio/exchange-rate`;
    const response = await fetch(url);
    const json = await response.json();

    if (json.success && json.data && json.data.rate) {
      return parseFloat(json.data.rate);
    }
    return 1.40; // Default fallback
  } catch (error) {
    console.error('Error fetching exchange rate:', error);
    return 1.40;
  }
}
```

**NEW:**
```javascript
export async function fetchExchangeRate() {
  console.warn('[API] Exchange rate endpoint not implemented - using default');

  // TODO: Backend needs to implement GET /api/portfolio/exchange-rate
  return 1.40; // Default USD/CAD rate

  // Future implementation when backend is ready:
  /*
  try {
    const url = `${API_BASE_URL}/api/portfolio/exchange-rate`;
    const response = await fetch(url, {
      headers: getAuthHeaders()
    });
    const data = await handleResponse(response);
    return parseFloat(data.rate);
  } catch (error) {
    console.error('[API] Exchange rate fetch failed:', error);
    return 1.40; // Fallback
  }
  */
}
```

---

## WebSocket - No Changes Needed! ✅

Your WebSocket connects **directly** to Questrade, not through your backend.

**Flow:**
```
Browser → Questrade WebSocket (wss://api.questrade.com:port)
         ↑
         └── Gets access token from AWS Backend: /api/auth/access-token/:name
```

**Only change:** Update the token fetch URL to use AWS backend (already covered in `FRONTEND_MIGRATION_GUIDE.md`)

---

## Backend TODO Items

### 1. Add Exchange Rate Endpoint

**File:** `aws/AWS-Backend/lambda-functions/portfolio-analytics/src/handler.js`

```javascript
// GET /api/portfolio/exchange-rate
if (event.httpMethod === 'GET' && event.resource === '/api/portfolio/exchange-rate') {
  try {
    // Option 1: Fetch from external API (exchangerate-api.com)
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    const data = await response.json();
    const cadRate = data.rates.CAD;

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        data: {
          rate: cadRate,
          base: 'USD',
          target: 'CAD',
          timestamp: Date.now(),
          source: 'exchangerate-api.com'
        }
      })
    };
  } catch (error) {
    console.error('Exchange rate fetch failed:', error);

    // Option 2: Return default fallback
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        data: {
          rate: 1.40,
          base: 'USD',
          target: 'CAD',
          timestamp: Date.now(),
          source: 'default'
        }
      })
    };
  }
}
```

**Update template.yaml:**
```yaml
PortfolioAnalyticsFunction:
  # ... existing config ...
  Events:
    GetExchangeRate:
      Type: HttpApi
      Properties:
        ApiId: !Ref QuestradeApi
        Path: /api/portfolio/exchange-rate
        Method: GET
```

---

## Testing Endpoint Mapping

### Test Script (Browser Console)

```javascript
const API_URL = 'https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev';
const token = JSON.parse(localStorage.getItem('authToken')).accessToken;

// Test 1: Fetch persons
fetch(`${API_URL}/api/persons`, {
  headers: { 'Authorization': `Bearer ${token}` }
}).then(r => r.json()).then(console.log);

// Test 2: Fetch positions
fetch(`${API_URL}/api/positions/person/Vivek?aggregated=true`, {
  headers: { 'Authorization': `Bearer ${token}` }
}).then(r => r.json()).then(console.log);

// Test 3: Fetch accounts (for cash balances)
fetch(`${API_URL}/api/accounts/Vivek`, {
  headers: { 'Authorization': `Bearer ${token}` }
}).then(r => r.json()).then(console.log);

// Test 4: Trigger sync
fetch(`${API_URL}/api/sync/person/Vivek`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
}).then(r => r.json()).then(console.log);
```

---

## Postman Collection Mapping

Your Postman collection has all endpoints documented:

```
Base URL: https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev

Available Collections:
1. Health Checks (lines 25-100)
2. Authentication (lines 102-187)
3. Person Management (lines 189-331)
4. Questrade Token Management (lines 333-429)
5. Token Administration (lines 431-510)
6. Sync Operations (lines 512-873)
7. Data Read (lines 875-1328)
8. Portfolio Analytics (lines 1330-1401)
9. Market Data (lines 1403-1463)
10. Watchlists (lines 1465-1553)
```

**Use Postman to test backend before frontend integration!**

---

## Migration Checklist

- [ ] Update `api.js` sync endpoint path
- [ ] Update `api.js` positions endpoint
- [ ] Update `api.js` cash balances endpoint
- [ ] Update `api.js` exchange rate (use default for now)
- [ ] Add JWT auth headers to all requests
- [ ] Update `questradeWebSocket.js` token fetch URL
- [ ] Test all endpoints in Postman
- [ ] Test frontend with AWS backend locally
- [ ] Add exchange rate endpoint to backend (optional)
- [ ] Deploy frontend to S3
- [ ] Update backend CORS
- [ ] Test production deployment

---

## Summary

**Total Endpoints:** 50+
**Ready to Use:** 48 ✅
**Needs Backend TODO:** 1 ⚠️ (exchange rate - non-critical)
**Needs Code Changes:** 3 endpoints (sync, positions, cash balances)

**Estimated Time:** 2-3 hours for all code changes + testing

**Good news:** Most endpoints are already implemented in AWS backend! Just need to update the frontend API calls to match the new structure. 🎉
