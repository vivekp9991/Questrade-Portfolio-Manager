# Backend Integration Guide - AWS Frontend

## Overview
This guide maps the current local backend API calls to the new AWS Lambda backend endpoints.

---

## API Endpoint Migration Map

### Current Setup (Local Development)
```
Frontend Vite Proxy:
  /api           → http://localhost:4003  (Main API)
  /api-auth      → http://localhost:4001  (Auth Service)
  /api-data      → http://localhost:4002  (Data Service)
  /api-sync      → http://localhost:4003  (Sync Service)
  /api-market    → http://localhost:4004  (Market Data)
```

### New Setup (AWS Production)
```
Frontend → API Gateway:
  Base URL: https://abc123.execute-api.us-east-1.amazonaws.com/dev
  All endpoints: /api/*
```

---

## Endpoint Mapping

### 1. Authentication Endpoints

| Current Endpoint | AWS Endpoint | Lambda | Method | Auth Required |
|-----------------|--------------|--------|--------|---------------|
| `/api-auth/login` | `/api/login` | AuthServiceFunction | POST | No |
| `/api-auth/login/verify` | `/api/login/verify` | AuthServiceFunction | POST | No |
| `/api-auth/login/refresh` | `/api/login/refresh` | AuthServiceFunction | POST | No |
| `/api-auth/persons` | `/api/persons` | AuthServiceFunction | GET | Yes |
| `/api-auth/persons` | `/api/persons` | AuthServiceFunction | POST | Yes |
| `/api-auth/persons/{name}` | `/api/persons/{name}` | AuthServiceFunction | GET/PUT/DELETE | Yes |
| `/api-auth/auth/access-token/{name}` | `/api/auth/access-token/{name}` | AuthServiceFunction | GET | Yes |
| `/api-auth/auth/token-status/{name}` | `/api/auth/token-status/{name}` | AuthServiceFunction | GET | Yes |
| `/api-auth/auth/refresh-token/{name}` | `/api/auth/refresh-token/{name}` | AuthServiceFunction | POST | Yes |

**Example Change:**
```javascript
// OLD (Local)
const response = await fetch('/api-auth/persons');

// NEW (AWS)
const response = await fetch(`${API_BASE_URL}/api/persons`, {
  headers: {
    'Authorization': `Bearer ${getJWTToken()}`
  }
});
```

---

### 2. Portfolio Data Endpoints

| Current Endpoint | AWS Endpoint | Lambda | Method | Auth |
|-----------------|--------------|--------|--------|------|
| `/api/portfolio/positions` | `/api/data/positions` | DataReadServiceFunction | GET | Yes |
| `/api/portfolio/cash-balances` | `/api/data/accounts` | DataReadServiceFunction | GET | Yes |
| `/api/accounts/{personName}` | `/api/accounts/{personName}` | DataReadServiceFunction | GET | Yes |
| `/api/accounts/summary/{personName}` | `/api/accounts/summary/{personName}` | DataReadServiceFunction | GET | Yes |
| `/api/positions/person/{personName}` | `/api/positions/person/{personName}` | DataReadServiceFunction | GET | Yes |
| `/api/activities/person/{personName}` | `/api/activities/person/{personName}` | DataReadServiceFunction | GET | Yes |
| `/api/data/stats` | `/api/data/stats` | DataReadServiceFunction | GET | Yes |

**Example Change:**
```javascript
// OLD (Local)
async function fetchPositions(personName = 'Vivek') {
  const url = `/api/portfolio/positions?viewMode=person&personName=${personName}`;
  const response = await fetch(url);
  return handleResponse(response);
}

// NEW (AWS)
async function fetchPositions(personName = 'Vivek') {
  const url = `${API_BASE_URL}/api/data/positions?personName=${personName}`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${getJWTToken()}`,
      'Content-Type': 'application/json'
    }
  });
  return handleResponse(response);
}
```

---

### 3. Sync Operations

| Current Endpoint | AWS Endpoint | Lambda | Method | Auth |
|-----------------|--------------|--------|--------|------|
| `/api/sync/sync-person/{name}` | `/api/sync/person/{name}` | SyncOperationsFunction | POST | Yes |
| `/api/sync/accounts/{name}` | `/api/sync/accounts/{name}` | SyncOperationsFunction | POST | Yes |
| `/api/sync/positions/{name}` | `/api/sync/positions/{name}` | SyncOperationsFunction | POST | Yes |
| `/api/sync/activities/{name}` | `/api/sync/activities/{name}` | SyncOperationsFunction | POST | Yes |
| `/api/sync/all` | `/api/sync/all` | SyncOperationsFunction | POST | Yes |
| `/api/sync/status` | `/api/sync/status` | SyncOperationsFunction | GET | Yes |
| `/api/sync/history` | `/api/sync/history` | SyncOperationsFunction | GET | Yes |

**Example Change:**
```javascript
// OLD (Local)
async function syncPortfolio(personName = 'Vivek') {
  const url = `/api/sync/sync-person/${personName}`;
  const response = await fetch(url, { method: 'POST' });
  return handleResponse(response);
}

// NEW (AWS)
async function syncPortfolio(personName = 'Vivek') {
  const url = `${API_BASE_URL}/api/sync/person/${personName}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getJWTToken()}`,
      'Content-Type': 'application/json'
    }
  });
  return handleResponse(response);
}
```

---

### 4. Portfolio Analytics

| Current Endpoint | AWS Endpoint | Lambda | Method | Auth |
|-----------------|--------------|--------|--------|------|
| N/A (not implemented) | `/api/portfolio/{personName}` | PortfolioAnalyticsFunction | GET | Yes |
| N/A | `/api/performance/{personName}` | PortfolioAnalyticsFunction | GET | Yes |
| N/A | `/api/allocation/{personName}` | PortfolioAnalyticsFunction | GET | Yes |
| N/A | `/api/analytics/{personName}` | PortfolioAnalyticsFunction | GET | Yes |
| N/A | `/api/reports/{personName}` | PortfolioAnalyticsFunction | GET | Yes |

**These are NEW endpoints available in AWS backend.**

---

### 5. Market Data

| Current Endpoint | AWS Endpoint | Lambda | Method | Auth |
|-----------------|--------------|--------|--------|------|
| `/api-market/symbols/lookup` | `/api/symbols` | MarketDataServiceFunction | POST | Yes |
| `/api-market/symbols/search` | `/api/symbols/search` | MarketDataServiceFunction | GET | Yes |
| `/api-market/symbols/stream-port` | `/api/markets` (different approach) | MarketDataServiceFunction | POST | Yes |
| N/A | `/api/quotes/{symbols}` | MarketDataServiceFunction | GET | Yes |

**Note:** WebSocket implementation needs review - AWS Lambda doesn't support persistent WebSocket connections in the same way. See WebSocket section below.

---

## Code Changes Required

### 1. Update `src/services/api.js`

**Current:**
```javascript
const API_BASE = '/api';

// No auth headers
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

**New:**
```javascript
const API_BASE_URL = import.meta.env.VITE_API_GATEWAY_URL;

// Helper to get JWT token
function getJWTToken() {
  const tokenData = JSON.parse(localStorage.getItem('authToken'));
  if (!tokenData || !tokenData.accessToken) {
    throw new Error('No auth token found');
  }

  // Check if token is expired
  if (Date.now() >= tokenData.expiresAt) {
    throw new Error('Token expired');
  }

  return tokenData.accessToken;
}

// Helper to add auth headers
function getAuthHeaders() {
  return {
    'Authorization': `Bearer ${getJWTToken()}`,
    'Content-Type': 'application/json'
  };
}

// Updated fetch with auth
export async function fetchPositions(personName = 'Vivek') {
  const url = `${API_BASE_URL}/api/data/positions?personName=${personName}`;
  const response = await fetch(url, {
    headers: getAuthHeaders()
  });
  return handleResponse(response);
}

export async function fetchCashBalances(personName = 'Vivek') {
  const url = `${API_BASE_URL}/api/data/accounts?personName=${personName}`;
  const response = await fetch(url, {
    headers: getAuthHeaders()
  });
  return handleResponse(response);
}

export async function fetchPersons() {
  const url = `${API_BASE_URL}/api/persons`;
  const response = await fetch(url, {
    headers: getAuthHeaders()
  });
  return handleResponse(response);
}

export async function syncPortfolio(personName = 'Vivek') {
  const url = `${API_BASE_URL}/api/sync/person/${personName}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders()
  });
  return handleResponse(response);
}
```

---

### 2. Update `src/services/questradeWebSocket.js`

**WebSocket Architecture Change:**
AWS Lambda doesn't support long-lived WebSocket connections like your current implementation. We have two options:

#### Option A: Keep Direct Questrade WebSocket (Recommended)
**No changes needed!** Your current implementation connects directly from browser to Questrade, which is perfect.

```javascript
// Your current code already works perfectly
Browser → Questrade WebSocket (wss://api.questrade.com:port)
```

**Only change:** Update token fetching to use AWS API Gateway
```javascript
async getAccessToken(personName, forceRefresh = false) {
  // OLD: const url = `/api-auth/auth/access-token/${personName}`;
  const url = `${API_BASE_URL}/api/auth/access-token/${personName}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${getJWTToken()}`
    }
  });

  // Rest of code stays the same
  const data = await response.json();
  if (data.success) {
    tokenCache.setToken(personName, data.data);
    return data.data;
  }
}
```

#### Option B: Use AWS API Gateway WebSocket (More Complex, Not Recommended)
If you want to route WebSocket through AWS (for logging/monitoring):
```
Browser → API Gateway WebSocket → Lambda → Questrade
```

This requires:
1. Create API Gateway WebSocket API
2. Create connection Lambda (stores connectionId in DynamoDB)
3. Create message Lambda (forwards to Questrade)
4. Create disconnect Lambda (cleans up)

**Recommendation:** Stick with Option A (direct browser → Questrade). It's simpler, faster, and cheaper.

---

### 3. Create Token Management Service

**File:** `src/services/authToken.js`

```javascript
// JWT Token Management
class AuthTokenManager {
  constructor() {
    this.tokenKey = 'authToken';
    this.refreshThreshold = 5 * 60 * 1000; // Refresh 5 min before expiry
  }

  // Store JWT token after login
  storeToken(tokenData) {
    const data = {
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      expiresAt: tokenData.expiresAt,
      issuedAt: Date.now(),
      userId: tokenData.userId,
      username: tokenData.username
    };

    localStorage.setItem(this.tokenKey, JSON.stringify(data));
    console.log('Token stored, expires at:', new Date(data.expiresAt));
  }

  // Get current token
  getToken() {
    const stored = localStorage.getItem(this.tokenKey);
    if (!stored) return null;

    try {
      return JSON.parse(stored);
    } catch (error) {
      console.error('Failed to parse token:', error);
      return null;
    }
  }

  // Check if token is valid
  isTokenValid() {
    const token = this.getToken();
    if (!token) return false;

    // Check if expired
    if (Date.now() >= token.expiresAt) {
      console.warn('Token expired');
      return false;
    }

    return true;
  }

  // Check if token needs refresh (within 5 min of expiry)
  shouldRefreshToken() {
    const token = this.getToken();
    if (!token) return false;

    const timeUntilExpiry = token.expiresAt - Date.now();
    return timeUntilExpiry < this.refreshThreshold && timeUntilExpiry > 0;
  }

  // Refresh token
  async refreshToken() {
    const token = this.getToken();
    if (!token || !token.refreshToken) {
      throw new Error('No refresh token available');
    }

    console.log('Refreshing JWT token...');

    const response = await fetch(`${API_BASE_URL}/api/login/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: token.refreshToken })
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    const data = await response.json();
    if (data.success && data.data) {
      this.storeToken(data.data);
      console.log('Token refreshed successfully');
      return data.data;
    }

    throw new Error('Invalid refresh response');
  }

  // Clear token (logout)
  clearToken() {
    localStorage.removeItem(this.tokenKey);
    console.log('Token cleared');
  }

  // Auto-refresh logic (call this on app startup)
  startAutoRefresh() {
    // Check every minute if token needs refresh
    setInterval(async () => {
      if (this.shouldRefreshToken()) {
        try {
          await this.refreshToken();
        } catch (error) {
          console.error('Auto-refresh failed:', error);
          // Redirect to login if refresh fails
          window.location.href = '/login';
        }
      }
    }, 60 * 1000); // Check every minute

    console.log('Auto-refresh started');
  }
}

export default new AuthTokenManager();
```

---

### 4. Create Questrade Token Cache

**File:** `src/services/questradeTokenCache.js`

```javascript
// Questrade Access Token Cache
// Separate from JWT tokens - these are for Questrade API
class QuestradeTokenCache {
  constructor() {
    this.cache = new Map();
    this.refreshTimers = new Map();
    this.API_BASE_URL = import.meta.env.VITE_API_GATEWAY_URL;
  }

  // Store Questrade access token
  setToken(personName, tokenData) {
    this.cache.set(personName, {
      accessToken: tokenData.accessToken,
      apiServer: tokenData.apiServer,
      expiresAt: tokenData.expiresAt,
      cachedAt: Date.now()
    });

    console.log(`Cached Questrade token for ${personName}, expires:`, new Date(tokenData.expiresAt));

    // Schedule auto-refresh 2 min before expiry
    this.scheduleRefresh(personName, tokenData.expiresAt);
  }

  // Get cached token (check expiry)
  getToken(personName) {
    const cached = this.cache.get(personName);
    if (!cached) return null;

    // Check if token expires within 1 minute
    const timeUntilExpiry = cached.expiresAt - Date.now();
    if (timeUntilExpiry < 60000) {
      console.warn(`Questrade token for ${personName} expires soon (${Math.floor(timeUntilExpiry / 1000)}s)`);
      return null; // Force refresh
    }

    return cached;
  }

  // Schedule background refresh
  scheduleRefresh(personName, expiresAt) {
    // Clear existing timer
    if (this.refreshTimers.has(personName)) {
      clearTimeout(this.refreshTimers.get(personName));
    }

    // Refresh 2 minutes before expiry
    const refreshTime = expiresAt - Date.now() - (2 * 60 * 1000);

    if (refreshTime > 0) {
      const timer = setTimeout(async () => {
        console.log(`Auto-refreshing Questrade token for ${personName}...`);
        await this.refreshToken(personName);
      }, refreshTime);

      this.refreshTimers.set(personName, timer);
      console.log(`Scheduled refresh for ${personName} in ${Math.floor(refreshTime / 1000 / 60)} minutes`);
    }
  }

  // Refresh token from AWS backend
  async refreshToken(personName) {
    try {
      const jwtToken = authTokenManager.getToken();
      if (!jwtToken) {
        throw new Error('No JWT token for API call');
      }

      const url = `${this.API_BASE_URL}/api/auth/access-token/${personName}?refresh=true`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${jwtToken.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      if (data.success && data.data) {
        this.setToken(personName, data.data);
        console.log(`Questrade token refreshed for ${personName}`);
        return data.data;
      }

      throw new Error('Failed to refresh Questrade token');
    } catch (error) {
      console.error(`Failed to refresh Questrade token for ${personName}:`, error);
      // Clear cached token on failure
      this.cache.delete(personName);
      throw error;
    }
  }

  // Clear cache
  clear() {
    this.cache.clear();
    this.refreshTimers.forEach(timer => clearTimeout(timer));
    this.refreshTimers.clear();
  }
}

export default new QuestradeTokenCache();
```

---

### 5. Update App Entry Point

**File:** `src/App.jsx`

```javascript
import { Router, Route } from '@solidjs/router';
import { onMount } from 'solid-js';
import authTokenManager from './services/authToken';

// Import pages
import Login from './pages/Login';
import Holdings from './pages/Holdings';
import Analysis from './pages/Analysis';
import Settings from './pages/Settings';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  onMount(() => {
    // Start auto-refresh for JWT tokens
    authTokenManager.startAutoRefresh();

    // Log current token status
    const token = authTokenManager.getToken();
    if (token) {
      const expiresIn = Math.floor((token.expiresAt - Date.now()) / 1000 / 60);
      console.log(`JWT token valid, expires in ${expiresIn} minutes`);
    } else {
      console.log('No JWT token found');
    }
  });

  return (
    <Router>
      <Route path="/login" component={Login} />

      <Route path="/" component={() => (
        <ProtectedRoute>
          <Holdings />
        </ProtectedRoute>
      )} />

      <Route path="/analysis" component={() => (
        <ProtectedRoute>
          <Analysis />
        </ProtectedRoute>
      )} />

      <Route path="/settings" component={() => (
        <ProtectedRoute>
          <Settings />
        </ProtectedRoute>
      )} />
    </Router>
  );
}

export default App;
```

---

### 6. Update Protected Route

**File:** `src/components/ProtectedRoute.jsx`

```javascript
import { createEffect } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import authTokenManager from '../services/authToken';

export default function ProtectedRoute(props) {
  const navigate = useNavigate();

  createEffect(() => {
    // Check if token is valid
    if (!authTokenManager.isTokenValid()) {
      console.warn('No valid token, redirecting to login');
      navigate('/login', { replace: true });
    }
  });

  return <>{props.children}</>;
}
```

---

### 7. Update Login Page

**File:** `src/pages/Login.jsx`

```javascript
import { createSignal } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import authTokenManager from '../services/authToken';

const API_BASE_URL = import.meta.env.VITE_API_GATEWAY_URL;

export default function Login() {
  const [username, setUsername] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [error, setError] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const navigate = useNavigate();

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username(),
          password: password()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      if (data.success && data.data) {
        // Store JWT token
        authTokenManager.storeToken(data.data);

        // Start auto-refresh
        authTokenManager.startAutoRefresh();

        console.log('Login successful, redirecting...');
        navigate('/', { replace: true });
      } else {
        throw new Error('Invalid login response');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div class="login-container">
      <h1>Portfolio Manager</h1>
      <form onSubmit={handleLogin}>
        <input
          type="text"
          placeholder="Username"
          value={username()}
          onInput={(e) => setUsername(e.target.value)}
          disabled={loading()}
        />
        <input
          type="password"
          placeholder="Password"
          value={password()}
          onInput={(e) => setPassword(e.target.value)}
          disabled={loading()}
        />
        {error() && <div class="error">{error()}</div>}
        <button type="submit" disabled={loading()}>
          {loading() ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </div>
  );
}
```

---

## Environment Variables

### `.env.production`
```env
# AWS API Gateway Base URL
VITE_API_GATEWAY_URL=https://your-api-id.execute-api.us-east-1.amazonaws.com/dev

# WebSocket Configuration
VITE_WS_RECONNECT_INTERVAL=5000
VITE_WS_MAX_RECONNECT_ATTEMPTS=10

# Token Cache Settings
VITE_JWT_REFRESH_THRESHOLD=300000  # 5 minutes in ms
VITE_QUESTRADE_TOKEN_REFRESH_THRESHOLD=120000  # 2 minutes in ms
```

### `.env.development`
```env
# Local development (existing setup)
VITE_API_GATEWAY_URL=http://localhost:4003
```

---

## Testing Checklist

### Unit Tests
- [ ] `authTokenManager.storeToken()` stores correctly
- [ ] `authTokenManager.isTokenValid()` detects expiry
- [ ] `authTokenManager.shouldRefreshToken()` triggers at threshold
- [ ] `questradeTokenCache.getToken()` returns valid cached token
- [ ] `questradeTokenCache.scheduleRefresh()` sets timer correctly

### Integration Tests
- [ ] Login flow stores JWT token
- [ ] Protected routes redirect to login if no token
- [ ] API calls include Authorization header
- [ ] Token refresh happens automatically
- [ ] Logout clears all tokens

### End-to-End Tests
- [ ] User can login with username/password
- [ ] Holdings page loads positions from AWS backend
- [ ] WebSocket connects and shows real-time quotes
- [ ] Sync button triggers AWS Lambda sync
- [ ] Token refresh works in background (no disconnections)
- [ ] Logout returns to login page

---

## Migration Steps

### Step 1: Copy Code to aws-frontend
```bash
cd D:\Project\3
cp -r Frontend-v2/portfolio-manager-v2/* aws-frontend/
cd aws-frontend
npm install
```

### Step 2: Create Environment File
```bash
echo "VITE_API_GATEWAY_URL=https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/dev" > .env.production
```

### Step 3: Update Service Files
- [ ] Create `src/services/authToken.js` (new file)
- [ ] Create `src/services/questradeTokenCache.js` (new file)
- [ ] Update `src/services/api.js` (add auth headers, change endpoints)
- [ ] Update `src/services/questradeWebSocket.js` (use token cache)
- [ ] Update `src/App.jsx` (start auto-refresh)
- [ ] Update `src/pages/Login.jsx` (call AWS login endpoint)
- [ ] Update `src/components/ProtectedRoute.jsx` (check JWT validity)

### Step 4: Test Locally with AWS Backend
```bash
# Point to AWS backend in .env.development
echo "VITE_API_GATEWAY_URL=https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/dev" > .env.development

# Run dev server
npm run dev

# Test in browser
# - Login should work
# - Holdings should load
# - WebSocket should connect
```

### Step 5: Build for Production
```bash
npm run build
# Check dist/ folder size (should be < 2MB)
ls -lh dist/
```

### Step 6: Deploy to S3
```bash
aws s3 sync dist/ s3://portfolio-manager-frontend --delete
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

### Step 7: Verify Production Deployment
- [ ] Open CloudFront URL: `https://d1234567890.cloudfront.net`
- [ ] Login works
- [ ] Data loads from AWS DynamoDB
- [ ] WebSocket connects
- [ ] No CORS errors in browser console

---

## Rollback Plan

If something breaks after migration:

### Option 1: Quick Fix (Frontend Only)
```bash
# Revert to old code
cd D:\Project\3\aws-frontend
git checkout HEAD~1  # Revert to previous commit

# Rebuild and redeploy
npm run build
aws s3 sync dist/ s3://portfolio-manager-frontend --delete
```

### Option 2: Switch Back to Local Backend
```env
# Update .env.production to point to local backend
VITE_API_GATEWAY_URL=http://localhost:4003
```

### Option 3: Full Rollback
- Keep old `Frontend-v2/` folder intact until AWS deployment is stable
- Can run old version on `localhost:3000` while debugging AWS version

---

## Common Issues & Solutions

### Issue 1: CORS Errors
**Symptom:** Browser console shows "CORS policy blocked"

**Solution:**
```yaml
# Update template.yaml in AWS-Backend
Globals:
  Api:
    Cors:
      AllowOrigins:
        - 'https://d1234567890.cloudfront.net'
        - 'https://portfolio.yourdomain.com'
      AllowHeaders:
        - 'Content-Type'
        - 'Authorization'
      AllowMethods:
        - 'GET'
        - 'POST'
        - 'PUT'
        - 'DELETE'
        - 'OPTIONS'
```

### Issue 2: 401 Unauthorized
**Symptom:** API calls return 401 even after login

**Solution:**
- Check JWT token is stored: `localStorage.getItem('authToken')`
- Check token expiry: `new Date(JSON.parse(localStorage.getItem('authToken')).expiresAt)`
- Check Authorization header is included in request
- Check JWT secret matches between frontend and backend

### Issue 3: WebSocket Won't Connect
**Symptom:** WebSocket connection fails or immediately disconnects

**Solution:**
- Check Questrade token is being fetched: `/api/auth/access-token/Vivek`
- Check token cache is working: `console.log(questradeTokenCache.getToken('Vivek'))`
- Check Questrade API rate limits (max 1 request/second)
- Try different person if current person's token is rate-limited

### Issue 4: Slow API Responses
**Symptom:** API calls take > 2 seconds

**Solution:**
- Check Lambda cold start times in CloudWatch
- Consider Provisioned Concurrency for frequently used functions
- Optimize DynamoDB queries (use partition key + GSI)
- Enable CloudFront caching for static responses

---

## Performance Benchmarks

### Target Metrics
- **Initial Load Time:** < 2 seconds
- **Login Time:** < 1 second
- **Data Fetch Time:** < 500ms
- **WebSocket Connection Time:** < 2 seconds
- **JWT Token Refresh:** < 300ms (background)
- **Questrade Token Refresh:** < 1 second (background)

### Monitoring
```javascript
// Add performance logging
console.time('login');
await authTokenManager.login(username, password);
console.timeEnd('login');

console.time('fetchPositions');
const positions = await fetchPositions('Vivek');
console.timeEnd('fetchPositions');
```

---

## Next Steps

1. ✅ **Read this guide thoroughly**
2. ⏳ **Get AWS API Gateway URL** from backend deployment
3. ⏳ **Copy frontend code** to `aws-frontend/`
4. ⏳ **Implement token management** (authToken.js, questradeTokenCache.js)
5. ⏳ **Update API calls** (api.js with auth headers)
6. ⏳ **Test locally** with AWS backend
7. ⏳ **Deploy to S3 + CloudFront**
8. ⏳ **Verify production** deployment

**Ready to start? Let me know when you have the AWS API Gateway URL!**
