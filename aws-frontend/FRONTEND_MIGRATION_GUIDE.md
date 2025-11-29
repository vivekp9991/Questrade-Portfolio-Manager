# Frontend Migration Guide - Step by Step

## Overview
This guide provides detailed steps to migrate your Frontend-v2 to aws-frontend with AWS Backend integration.

**AWS Backend API:** `https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev`

---

## 📋 Migration Phases

### Phase 1: Project Setup (Day 1 - 2 hours)
### Phase 2: Authentication Integration (Day 1-2 - 4 hours)
### Phase 3: API Service Layer (Day 2-3 - 6 hours)
### Phase 4: Component Updates (Day 3-4 - 4 hours)
### Phase 5: Testing (Day 4-5 - 4 hours)
### Phase 6: AWS Deployment (Day 5 - 2 hours)

**Total Time: 5 days**

---

## Phase 1: Project Setup ✅

### Step 1.1: Copy Frontend Code
```bash
cd D:\Project\3\aws-frontend

# Copy all files from Frontend-v2
xcopy /E /I /Y ..\Frontend-v2\portfolio-manager-v2\* .

# Verify copy
dir
# Should see: src/, public/, package.json, vite.config.js, etc.
```

### Step 1.2: Create Environment Files

**File: `.env.production`**
```env
# AWS Backend API Gateway
VITE_API_GATEWAY_URL=https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev

# WebSocket Configuration
VITE_WS_RECONNECT_INTERVAL=5000
VITE_WS_MAX_RECONNECT_ATTEMPTS=10

# Token Refresh Settings
VITE_JWT_REFRESH_THRESHOLD=300000
VITE_QUESTRADE_TOKEN_REFRESH_THRESHOLD=120000
```

**File: `.env.development`**
```env
# Point to AWS backend for local development too
VITE_API_GATEWAY_URL=https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev
```

### Step 1.3: Install Dependencies & Test Build
```bash
# Install dependencies
npm install

# Test build
npm run build

# Check output
dir dist\
# Should see: index.html, assets/ folder
```

**Expected Output:**
```
dist/
├── index.html
├── assets/
│   ├── index-abc123.js
│   └── index-xyz789.css
```

---

## Phase 2: Authentication Integration 🔐

### Step 2.1: Create JWT Token Manager

**File: `src/services/authToken.js`** (NEW FILE)

```javascript
// JWT Token Management Service
const API_BASE_URL = import.meta.env.VITE_API_GATEWAY_URL;

class AuthTokenManager {
  constructor() {
    this.tokenKey = 'authToken';
    this.refreshThreshold = parseInt(import.meta.env.VITE_JWT_REFRESH_THRESHOLD) || 300000; // 5 min
  }

  /**
   * Store JWT token after login
   */
  storeToken(tokenData) {
    const data = {
      accessToken: tokenData.token || tokenData.accessToken,
      userId: tokenData.userId,
      username: tokenData.username,
      expiresAt: tokenData.expiresAt || (Date.now() + 3600000), // 1 hour default
      issuedAt: Date.now()
    };

    localStorage.setItem(this.tokenKey, JSON.stringify(data));
    console.log('[Auth] Token stored, expires at:', new Date(data.expiresAt).toLocaleTimeString());
  }

  /**
   * Get current token
   */
  getToken() {
    const stored = localStorage.getItem(this.tokenKey);
    if (!stored) return null;

    try {
      return JSON.parse(stored);
    } catch (error) {
      console.error('[Auth] Failed to parse token:', error);
      return null;
    }
  }

  /**
   * Check if token is valid
   */
  isTokenValid() {
    const token = this.getToken();
    if (!token) {
      console.warn('[Auth] No token found');
      return false;
    }

    // Check if expired
    if (Date.now() >= token.expiresAt) {
      console.warn('[Auth] Token expired');
      return false;
    }

    return true;
  }

  /**
   * Check if token needs refresh (within threshold of expiry)
   */
  shouldRefreshToken() {
    const token = this.getToken();
    if (!token) return false;

    const timeUntilExpiry = token.expiresAt - Date.now();
    return timeUntilExpiry < this.refreshThreshold && timeUntilExpiry > 0;
  }

  /**
   * Refresh JWT token
   */
  async refreshToken() {
    const token = this.getToken();
    if (!token || !token.accessToken) {
      throw new Error('No token available to refresh');
    }

    console.log('[Auth] Refreshing JWT token...');

    const response = await fetch(`${API_BASE_URL}/api/login/refresh`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token.accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    const data = await response.json();
    if (data.success && data.data) {
      this.storeToken(data.data);
      console.log('[Auth] Token refreshed successfully');
      return data.data;
    }

    throw new Error('Invalid refresh response');
  }

  /**
   * Clear token (logout)
   */
  clearToken() {
    localStorage.removeItem(this.tokenKey);
    console.log('[Auth] Token cleared');
  }

  /**
   * Start auto-refresh interval
   */
  startAutoRefresh() {
    // Check every minute if token needs refresh
    this.refreshInterval = setInterval(async () => {
      if (this.shouldRefreshToken()) {
        try {
          await this.refreshToken();
        } catch (error) {
          console.error('[Auth] Auto-refresh failed:', error);
          // Redirect to login if refresh fails
          this.clearToken();
          window.location.href = '/login';
        }
      }
    }, 60 * 1000); // Check every minute

    console.log('[Auth] Auto-refresh started');
  }

  /**
   * Stop auto-refresh
   */
  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
      console.log('[Auth] Auto-refresh stopped');
    }
  }
}

export default new AuthTokenManager();
```

### Step 2.2: Create Questrade Token Cache

**File: `src/services/questradeTokenCache.js`** (NEW FILE)

```javascript
// Questrade Access Token Cache
import authTokenManager from './authToken';

const API_BASE_URL = import.meta.env.VITE_API_GATEWAY_URL;

class QuestradeTokenCache {
  constructor() {
    this.cache = new Map();
    this.refreshTimers = new Map();
    this.refreshThreshold = parseInt(import.meta.env.VITE_QUESTRADE_TOKEN_REFRESH_THRESHOLD) || 120000; // 2 min
  }

  /**
   * Store Questrade access token with auto-refresh
   */
  setToken(personName, tokenData) {
    this.cache.set(personName, {
      accessToken: tokenData.accessToken,
      apiServer: tokenData.apiServer,
      expiresAt: tokenData.expiresAt,
      cachedAt: Date.now()
    });

    console.log(`[QT Cache] Cached token for ${personName}, expires:`, new Date(tokenData.expiresAt).toLocaleTimeString());

    // Schedule auto-refresh
    this.scheduleRefresh(personName, tokenData.expiresAt);
  }

  /**
   * Get cached token (returns null if expired or near expiry)
   */
  getToken(personName) {
    const cached = this.cache.get(personName);
    if (!cached) return null;

    // Check if token expires within threshold
    const timeUntilExpiry = cached.expiresAt - Date.now();
    if (timeUntilExpiry < this.refreshThreshold) {
      console.warn(`[QT Cache] Token for ${personName} expires soon (${Math.floor(timeUntilExpiry / 1000)}s)`);
      return null; // Force refresh
    }

    return cached;
  }

  /**
   * Schedule background token refresh
   */
  scheduleRefresh(personName, expiresAt) {
    // Clear existing timer
    if (this.refreshTimers.has(personName)) {
      clearTimeout(this.refreshTimers.get(personName));
    }

    // Refresh 2 minutes before expiry
    const refreshTime = expiresAt - Date.now() - this.refreshThreshold;

    if (refreshTime > 0) {
      const timer = setTimeout(async () => {
        console.log(`[QT Cache] Auto-refreshing token for ${personName}...`);
        await this.refreshToken(personName);
      }, refreshTime);

      this.refreshTimers.set(personName, timer);
      console.log(`[QT Cache] Scheduled refresh for ${personName} in ${Math.floor(refreshTime / 1000 / 60)} minutes`);
    }
  }

  /**
   * Refresh Questrade token from AWS backend
   */
  async refreshToken(personName) {
    try {
      const jwtToken = authTokenManager.getToken();
      if (!jwtToken) {
        throw new Error('No JWT token for API call');
      }

      // Call AWS backend to get fresh Questrade token
      const url = `${API_BASE_URL}/api/auth/access-token/${personName}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${jwtToken.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      if (data.success && data.data) {
        this.setToken(personName, data.data);
        console.log(`[QT Cache] Token refreshed for ${personName}`);
        return data.data;
      }

      throw new Error('Failed to refresh Questrade token');
    } catch (error) {
      console.error(`[QT Cache] Failed to refresh token for ${personName}:`, error);
      // Clear cached token on failure
      this.cache.delete(personName);
      throw error;
    }
  }

  /**
   * Clear cache
   */
  clear() {
    this.cache.clear();
    this.refreshTimers.forEach(timer => clearTimeout(timer));
    this.refreshTimers.clear();
    console.log('[QT Cache] Cache cleared');
  }
}

export default new QuestradeTokenCache();
```

### Step 2.3: Update Login Page

**File: `src/pages/Login.jsx`** (MODIFY EXISTING)

```javascript
import { createSignal, onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import authTokenManager from '../services/authToken';

const API_BASE_URL = import.meta.env.VITE_API_GATEWAY_URL;

export default function Login() {
  const [username, setUsername] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [error, setError] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const navigate = useNavigate();

  onMount(() => {
    // Check if already logged in
    if (authTokenManager.isTokenValid()) {
      console.log('[Login] Already logged in, redirecting...');
      navigate('/', { replace: true });
    }
  });

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      console.log('[Login] Attempting login...');

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
        throw new Error(data.error || data.message || 'Login failed');
      }

      if (data.success && data.data) {
        console.log('[Login] Login successful:', data.data);

        // Store JWT token
        authTokenManager.storeToken(data.data);

        // Start auto-refresh
        authTokenManager.startAutoRefresh();

        console.log('[Login] Redirecting to dashboard...');
        navigate('/', { replace: true });
      } else {
        throw new Error('Invalid login response');
      }
    } catch (err) {
      console.error('[Login] Login error:', err);
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
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password()}
          onInput={(e) => setPassword(e.target.value)}
          disabled={loading()}
          required
        />
        {error() && <div class="error">{error()}</div>}
        <button type="submit" disabled={loading()}>
          {loading() ? 'Logging in...' : 'Login'}
        </button>
      </form>
      <div class="login-info">
        <p>Use your credentials to access the portfolio manager</p>
        <p class="api-endpoint">Backend: {API_BASE_URL}</p>
      </div>
    </div>
  );
}
```

### Step 2.4: Update ProtectedRoute Component

**File: `src/components/ProtectedRoute.jsx`** (MODIFY EXISTING)

```javascript
import { createEffect } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import authTokenManager from '../services/authToken';

export default function ProtectedRoute(props) {
  const navigate = useNavigate();

  createEffect(() => {
    // Check if token is valid
    if (!authTokenManager.isTokenValid()) {
      console.warn('[ProtectedRoute] No valid token, redirecting to login');
      navigate('/login', { replace: true });
    }
  });

  return <>{props.children}</>;
}
```

---

## Phase 3: API Service Layer 🔌

### Step 3.1: Update Main API Service

**File: `src/services/api.js`** (REPLACE ENTIRE FILE)

```javascript
// API Service - AWS Backend Integration
const API_BASE_URL = import.meta.env.VITE_API_GATEWAY_URL;

// Import auth manager
import authTokenManager from './authToken';

// Get JWT token for authenticated requests
function getAuthHeaders() {
  const token = authTokenManager.getToken();
  if (!token || !token.accessToken) {
    throw new Error('No auth token found');
  }

  return {
    'Authorization': `Bearer ${token.accessToken}`,
    'Content-Type': 'application/json'
  };
}

// Handle API responses
async function handleResponse(response) {
  const text = await response.text();

  if (!response.ok) {
    // Handle 401 Unauthorized
    if (response.status === 401) {
      console.error('[API] Unauthorized - token expired');
      authTokenManager.clearToken();
      window.location.href = '/login';
      throw new Error('Session expired. Please login again.');
    }

    throw new Error(text || 'Request failed');
  }

  try {
    const json = JSON.parse(text);
    // AWS backend wraps data in { success: true, data: {...} }
    if (json.success && json.data !== undefined) {
      return json.data;
    }
    return json;
  } catch (error) {
    console.error('[API] JSON Parse Error:', error);
    throw new Error(`Failed to parse JSON response: ${error.message}`);
  }
}

// ==================== Portfolio Data ====================

/**
 * Fetch portfolio positions
 * Maps to: GET /api/positions/person/:personName
 */
export async function fetchPositions(personName = 'Vivek') {
  console.log(`[API] Fetching positions for ${personName}...`);

  const url = `${API_BASE_URL}/api/positions/person/${personName}?aggregated=true`;
  const response = await fetch(url, {
    headers: getAuthHeaders()
  });

  const data = await handleResponse(response);
  console.log(`[API] Received ${data.positions?.length || 0} positions`);

  return data.positions || [];
}

/**
 * Fetch cash balances (from accounts)
 * Maps to: GET /api/accounts/:personName
 */
export async function fetchCashBalances(personName = 'Vivek') {
  console.log(`[API] Fetching cash balances for ${personName}...`);

  const url = `${API_BASE_URL}/api/accounts/${personName}`;
  const response = await fetch(url, {
    headers: getAuthHeaders()
  });

  const accounts = await handleResponse(response);
  console.log(`[API] Received ${accounts.length} accounts`);

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

/**
 * Fetch persons list
 * Maps to: GET /api/persons
 */
export async function fetchPersons() {
  console.log('[API] Fetching persons list...');

  const url = `${API_BASE_URL}/api/persons`;
  const response = await fetch(url, {
    headers: getAuthHeaders()
  });

  const data = await handleResponse(response);
  console.log(`[API] Received ${data.length} persons`);

  return data;
}

/**
 * Fetch exchange rate
 * TODO: Backend endpoint missing - needs to be added
 * Temporary: Return default rate
 */
export async function fetchExchangeRate() {
  console.warn('[API] Exchange rate endpoint not implemented yet - using default');

  // TODO: Backend needs to implement GET /api/portfolio/exchange-rate
  // For now, return default
  return 1.40;

  // Future implementation:
  // const url = `${API_BASE_URL}/api/portfolio/exchange-rate`;
  // const response = await fetch(url, { headers: getAuthHeaders() });
  // const data = await handleResponse(response);
  // return parseFloat(data.rate);
}

/**
 * Sync portfolio data
 * Maps to: POST /api/sync/person/:personName
 */
export async function syncPortfolio(personName = 'Vivek') {
  console.log(`[API] Triggering sync for ${personName}...`);

  const url = `${API_BASE_URL}/api/sync/person/${personName}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders()
  });

  const data = await handleResponse(response);
  console.log('[API] Sync completed:', data);

  return data;
}

/**
 * Get sync status
 * Maps to: GET /api/sync/status
 */
export async function getSyncStatus() {
  console.log('[API] Fetching sync status...');

  const url = `${API_BASE_URL}/api/sync/status`;
  const response = await fetch(url, {
    headers: getAuthHeaders()
  });

  return await handleResponse(response);
}

// ==================== Market Data ====================

/**
 * Search symbols
 * Maps to: GET /api/market/symbols/search
 */
export async function searchSymbols(query) {
  console.log(`[API] Searching symbols: ${query}`);

  const url = `${API_BASE_URL}/api/market/symbols/search?query=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: getAuthHeaders()
  });

  return await handleResponse(response);
}

/**
 * Get market status
 * Maps to: GET /api/market/status
 */
export async function getMarketStatus() {
  const url = `${API_BASE_URL}/api/market/status`;
  const response = await fetch(url, {
    headers: getAuthHeaders()
  });

  return await handleResponse(response);
}

// ==================== Backtesting (External Service) ====================

/**
 * Run backtesting analysis
 * Note: This still points to local service (port 3000)
 * TODO: Move backtesting to AWS or keep as separate service
 */
export async function runBacktest(payload) {
  const url = 'http://localhost:3000/api/v1/backtest';
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Backtest failed: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}
```

### Step 3.2: Update WebSocket Service

**File: `src/services/questradeWebSocket.js`** (MODIFY EXISTING)

Find and update the `getAccessToken` method:

```javascript
import questradeTokenCache from './questradeTokenCache';
import authTokenManager from './authToken';

const API_BASE_URL = import.meta.env.VITE_API_GATEWAY_URL;

// ... existing code ...

/**
 * Get access token from cache or backend
 * @param {string} personName - Person name
 * @param {boolean} forceRefresh - Force backend to refresh token
 */
async getAccessToken(personName, forceRefresh = false) {
  try {
    // Check cache first (unless forcing refresh)
    if (!forceRefresh) {
      const cached = questradeTokenCache.getToken(personName);
      if (cached) {
        console.log(`[QT WebSocket] Using cached token for ${personName}`);
        return cached;
      }
    }

    // Get JWT token for auth
    const jwtToken = authTokenManager.getToken();
    if (!jwtToken) {
      throw new Error('No JWT token for API call');
    }

    // Cache miss or forced refresh - fetch from AWS backend
    const url = forceRefresh
      ? `${API_BASE_URL}/api/auth/access-token/${personName}?refresh=${Date.now()}`
      : `${API_BASE_URL}/api/auth/access-token/${personName}`;

    console.log(`[QT WebSocket] ${forceRefresh ? '🔄 Force refreshing' : 'Getting'} access token for ${personName}...`);

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${jwtToken.accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Check for rate limiting (429)
    if (response.status === 429) {
      console.warn(`[QT WebSocket] ⚠️ Rate limited (429) for ${personName} - trying next person`);
      throw new Error('Rate limited');
    }

    // Check for unauthorized (401)
    if (response.status === 401) {
      console.error('[QT WebSocket] Unauthorized - JWT token expired');
      authTokenManager.clearToken();
      window.location.href = '/login';
      throw new Error('Session expired');
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to get access token');
    }

    console.log(`[QT WebSocket] ✅ Got access token for ${personName} (expires: ${new Date(data.data.expiresAt).toLocaleTimeString()})`);

    // Store in cache with auto-refresh
    questradeTokenCache.setToken(personName, data.data);

    return {
      accessToken: data.data.accessToken,
      apiServer: data.data.apiServer,
      expiresAt: data.data.expiresAt
    };
  } catch (error) {
    console.error(`[QT WebSocket] Failed to get access token for ${personName}:`, error);
    throw error;
  }
}

// Also update fetchAvailablePersons method:
async fetchAvailablePersons() {
  try {
    const jwtToken = authTokenManager.getToken();
    if (!jwtToken) {
      throw new Error('No JWT token for API call');
    }

    const response = await fetch(`${API_BASE_URL}/api/persons`, {
      headers: {
        'Authorization': `Bearer ${jwtToken.accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch persons: ${response.status}`);
    }

    const data = await response.json();

    if (!data.success || !data.data || !Array.isArray(data.data)) {
      throw new Error('Invalid response from persons API');
    }

    // Extract person names from database response
    this.availablePersons = data.data
      .filter(p => p.personName && p.isActive !== false)
      .map(p => p.personName);

    console.log('[QT WebSocket] 📋 Fetched available persons from database:', this.availablePersons);

    if (this.availablePersons.length === 0) {
      throw new Error('No active persons found in database');
    }

    return this.availablePersons;
  } catch (error) {
    console.error('[QT WebSocket] Failed to fetch persons:', error);
    throw error;
  }
}
```

### Step 3.3: Update Settings API

**File: `src/services/settingsApi.js`** (MODIFY EXISTING)

```javascript
// Settings API - AWS Backend Integration
import authTokenManager from './authToken';

const API_BASE_URL = import.meta.env.VITE_API_GATEWAY_URL;

function getAuthHeaders() {
  const token = authTokenManager.getToken();
  if (!token || !token.accessToken) {
    throw new Error('No auth token found');
  }

  return {
    'Authorization': `Bearer ${token.accessToken}`,
    'Content-Type': 'application/json'
  };
}

async function handleResponse(response) {
  const text = await response.text();

  if (!response.ok) {
    if (response.status === 401) {
      authTokenManager.clearToken();
      window.location.href = '/login';
      throw new Error('Session expired');
    }
    throw new Error(text || 'Request failed');
  }

  try {
    const json = JSON.parse(text);
    if (json.success && json.data !== undefined) {
      return json.data;
    }
    return json;
  } catch (error) {
    throw new Error(`Failed to parse response: ${error.message}`);
  }
}

// Settings API methods
export async function getSettings() {
  const url = `${API_BASE_URL}/api/settings`;
  const response = await fetch(url, {
    headers: getAuthHeaders()
  });
  return await handleResponse(response);
}

export async function updateSettings(settings) {
  const url = `${API_BASE_URL}/api/settings`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(settings)
  });
  return await handleResponse(response);
}

// Add more settings methods as needed
```

---

## Phase 4: Component Updates 🎨

### Step 4.1: Update App.jsx

**File: `src/App.jsx`** (MODIFY EXISTING)

Add auto-refresh initialization:

```javascript
import { Router, Route } from '@solidjs/router';
import { onMount, onCleanup } from 'solid-js';
import authTokenManager from './services/authToken';

// Import pages
import Login from './pages/Login';
import Holdings from './pages/Holdings';
import Analysis from './pages/Analysis';
import Settings from './pages/Settings';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  onMount(() => {
    console.log('[App] Starting application...');

    // Start JWT auto-refresh
    const token = authTokenManager.getToken();
    if (token) {
      authTokenManager.startAutoRefresh();
      const expiresIn = Math.floor((token.expiresAt - Date.now()) / 1000 / 60);
      console.log(`[App] JWT token valid, expires in ${expiresIn} minutes`);
    } else {
      console.log('[App] No JWT token found');
    }
  });

  onCleanup(() => {
    // Stop auto-refresh on unmount
    authTokenManager.stopAutoRefresh();
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

### Step 4.2: Update Holdings Page

**File: `src/pages/Holdings.jsx`** (MINIMAL CHANGES)

The Holdings page should work as-is since we updated the API service layer. Just verify imports:

```javascript
// At the top of the file
import { fetchPositions, fetchCashBalances, syncPortfolio } from '../services/api';

// Rest of the code should work without changes!
```

### Step 4.3: Update Settings Page

**File: `src/pages/Settings.jsx`** (ADD LOGOUT FUNCTIONALITY)

```javascript
import { createSignal } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import authTokenManager from '../services/authToken';
import questradeTokenCache from '../services/questradeTokenCache';

export default function Settings() {
  const navigate = useNavigate();
  const [loading, setLoading] = createSignal(false);

  async function handleLogout() {
    setLoading(true);

    try {
      console.log('[Settings] Logging out...');

      // Clear all tokens
      authTokenManager.clearToken();
      questradeTokenCache.clear();

      // Stop auto-refresh
      authTokenManager.stopAutoRefresh();

      console.log('[Settings] Logout complete, redirecting to login...');

      // Redirect to login
      navigate('/login', { replace: true });
    } catch (error) {
      console.error('[Settings] Logout error:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div class="settings-page">
      <h1>Settings</h1>

      {/* Existing settings UI */}

      {/* Add logout button */}
      <div class="settings-section">
        <h2>Session</h2>
        <button
          onClick={handleLogout}
          disabled={loading()}
          class="logout-button"
        >
          {loading() ? 'Logging out...' : 'Logout'}
        </button>
      </div>

      {/* Show current token status */}
      <div class="settings-section">
        <h2>Token Status</h2>
        <pre>
          {JSON.stringify({
            jwtToken: authTokenManager.getToken() ? 'Valid' : 'Invalid',
            expiresAt: authTokenManager.getToken()?.expiresAt
              ? new Date(authTokenManager.getToken().expiresAt).toLocaleString()
              : 'N/A'
          }, null, 2)}
        </pre>
      </div>
    </div>
  );
}
```

---

## Phase 5: Testing ✅

### Step 5.1: Test Locally

```bash
cd D:\Project\3\aws-frontend

# Start dev server
npm run dev

# Open browser
# http://localhost:3000
```

### Step 5.2: Testing Checklist

#### Authentication Tests
- [ ] Login page loads
- [ ] Login with valid credentials (victor / Admin@2025)
- [ ] JWT token stored in localStorage
- [ ] Redirect to Holdings page after login
- [ ] Protected routes redirect to login if no token
- [ ] Logout clears token and redirects to login

#### Data Fetching Tests
- [ ] Holdings page loads positions
- [ ] Holdings page loads cash balances
- [ ] Person dropdown populated from backend
- [ ] Sync button triggers sync operation
- [ ] Data updates after sync completes

#### WebSocket Tests
- [ ] WebSocket connects automatically
- [ ] Real-time quotes update in UI
- [ ] Questrade token fetched from backend
- [ ] Token cached in frontend
- [ ] No disconnections during token refresh
- [ ] Reconnection works after network failure

#### Token Refresh Tests
- [ ] JWT token auto-refreshes before expiry
- [ ] Questrade token auto-refreshes before expiry
- [ ] No visible interruption to user
- [ ] Token status shows correct expiry time

### Step 5.3: Debug Console Commands

Open browser console and test:

```javascript
// Check JWT token
const jwt = JSON.parse(localStorage.getItem('authToken'));
console.log('JWT expires:', new Date(jwt.expiresAt));

// Check Questrade token cache
// (This is in memory, view in Network tab when WebSocket connects)

// Force JWT refresh
import('./src/services/authToken.js').then(m => m.default.refreshToken());

// Check API call
fetch('https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev/api/persons', {
  headers: {
    'Authorization': 'Bearer ' + JSON.parse(localStorage.getItem('authToken')).accessToken
  }
}).then(r => r.json()).then(console.log);
```

---

## Phase 6: AWS Deployment 🚀

### Step 6.1: Build Production Bundle

```bash
cd D:\Project\3\aws-frontend

# Build for production
npm run build

# Check output size
dir dist\
# Should see: index.html, assets/

# Verify env vars are set
type .env.production
```

**Expected Output:**
```
dist/
├── index.html (3-5 KB)
├── assets/
│   ├── index-abc123.js (150-300 KB)
│   └── index-xyz789.css (10-20 KB)
```

### Step 6.2: Create S3 Bucket

```bash
# Create S3 bucket
aws s3 mb s3://questrade-portfolio-frontend

# Enable static website hosting
aws s3 website s3://questrade-portfolio-frontend ^
  --index-document index.html ^
  --error-document index.html
```

### Step 6.3: Configure Bucket Policy

Create file: `bucket-policy.json`
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::questrade-portfolio-frontend/*"
    }
  ]
}
```

Apply policy:
```bash
aws s3api put-bucket-policy ^
  --bucket questrade-portfolio-frontend ^
  --policy file://bucket-policy.json
```

### Step 6.4: Upload Built Files

```bash
# Upload to S3
aws s3 sync dist/ s3://questrade-portfolio-frontend --delete

# Verify upload
aws s3 ls s3://questrade-portfolio-frontend/ --recursive
```

### Step 6.5: Get S3 Website URL

```bash
aws s3api get-bucket-website --bucket questrade-portfolio-frontend
```

**Website URL Format:**
```
http://questrade-portfolio-frontend.s3-website-us-east-1.amazonaws.com
```

### Step 6.6: Create CloudFront Distribution (Optional but Recommended)

```bash
# Create CloudFront distribution
aws cloudfront create-distribution ^
  --origin-domain-name questrade-portfolio-frontend.s3-website-us-east-1.amazonaws.com ^
  --default-root-object index.html

# Note: This takes 15-20 minutes to deploy
# You'll receive a CloudFront URL like: https://d1234567890.cloudfront.net
```

### Step 6.7: Update CORS in Backend

Your AWS Backend needs to allow requests from the frontend domain.

**File: `D:\Project\3\aws\AWS-Backend\template.yaml`**

Update the CORS configuration:

```yaml
Globals:
  Api:
    Cors:
      AllowMethods: "'GET,POST,PUT,DELETE,OPTIONS'"
      AllowHeaders: "'Content-Type,Authorization'"
      AllowOrigins:
        - "'http://questrade-portfolio-frontend.s3-website-us-east-1.amazonaws.com'"
        - "'https://d1234567890.cloudfront.net'"  # Add your CloudFront URL
```

Redeploy backend:
```bash
cd D:\Project\3\aws\AWS-Backend
sam build
sam deploy
```

### Step 6.8: Test Production Deployment

1. Open CloudFront URL (or S3 URL): `https://d1234567890.cloudfront.net`
2. Should see login page
3. Login with credentials
4. Holdings page should load
5. Check browser console for errors
6. Verify WebSocket connects
7. Test sync operation

---

## Deployment Script

**File: `deploy.sh`** (Windows: `deploy.bat`)

```bash
@echo off
echo ========================================
echo Deploying Portfolio Manager Frontend
echo ========================================

echo.
echo [1/4] Building production bundle...
call npm run build

echo.
echo [2/4] Uploading to S3...
aws s3 sync dist/ s3://questrade-portfolio-frontend --delete

echo.
echo [3/4] Invalidating CloudFront cache (if using CloudFront)...
REM aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"

echo.
echo [4/4] Deployment complete!
echo.
echo Frontend URL: http://questrade-portfolio-frontend.s3-website-us-east-1.amazonaws.com
echo CloudFront URL: https://YOUR_CLOUDFRONT_URL.cloudfront.net
echo.
pause
```

Make it executable and run:
```bash
deploy.bat
```

---

## Backend TODOs

Based on the Postman collection analysis, here are missing endpoints that the current frontend uses:

### Missing Endpoint 1: Exchange Rate
```
Current Frontend Call: GET /api/portfolio/exchange-rate
Backend Endpoint: MISSING

Action Required:
- Add new endpoint to AWS Backend
- Return current USD/CAD exchange rate
- Can fetch from external API (e.g., exchangerate-api.com)
```

**Implementation in Backend:**

File: `aws/AWS-Backend/lambda-functions/portfolio-analytics/src/handler.js`

Add route:
```javascript
// GET /api/portfolio/exchange-rate
if (event.httpMethod === 'GET' && event.resource === '/api/portfolio/exchange-rate') {
  // Fetch live exchange rate or return cached value
  const rate = await fetchExchangeRate(); // Implement this function
  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
      data: {
        rate: rate,
        base: 'USD',
        target: 'CAD',
        timestamp: Date.now()
      }
    })
  };
}
```

---

## Summary

### Files Created (NEW)
- `src/services/authToken.js` - JWT token management
- `src/services/questradeTokenCache.js` - Questrade token caching
- `.env.production` - Production environment config
- `.env.development` - Development environment config
- `deploy.bat` - Deployment script

### Files Modified (EXISTING)
- `src/services/api.js` - Updated all API calls for AWS backend
- `src/services/questradeWebSocket.js` - Added token caching
- `src/services/settingsApi.js` - Updated for AWS backend
- `src/pages/Login.jsx` - AWS backend authentication
- `src/components/ProtectedRoute.jsx` - JWT token validation
- `src/App.jsx` - Auto-refresh initialization
- `src/pages/Settings.jsx` - Added logout functionality

### Files Unchanged (NO CHANGES NEEDED)
- `src/pages/Holdings.jsx` - Works with updated API service
- `src/pages/Analysis.jsx` - Works with updated API service
- All component files - Work with updated services

### Backend Action Items
1. ✅ Backend already deployed: `https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev`
2. ⏳ Add exchange rate endpoint: `/api/portfolio/exchange-rate`
3. ⏳ Update CORS to allow frontend domain
4. ⏳ Test all endpoints with Postman

### Deployment Checklist
- [ ] Copy Frontend-v2 to aws-frontend
- [ ] Create .env files with API Gateway URL
- [ ] Create new service files (authToken.js, questradeTokenCache.js)
- [ ] Update existing service files (api.js, questradeWebSocket.js, settingsApi.js)
- [ ] Update component files (Login.jsx, App.jsx, ProtectedRoute.jsx, Settings.jsx)
- [ ] Test locally (npm run dev)
- [ ] Build production (npm run build)
- [ ] Create S3 bucket
- [ ] Upload to S3
- [ ] Create CloudFront distribution
- [ ] Update backend CORS
- [ ] Test production deployment

**Estimated Time:** 5 days (20 hours total)

---

**Ready to start Phase 1? Let me know and I'll help you execute each step!** 🚀
