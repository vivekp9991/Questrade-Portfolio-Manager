// API Service - AWS Backend Integration
const API_BASE_URL = import.meta.env.VITE_API_GATEWAY_URL;

// Import auth manager
import authTokenManager from './authToken';

// Get JWT token for authenticated requests
function getAuthHeaders() {
  const token = authTokenManager.getToken();
  if (!token || !token.accessToken) {
    console.warn('[API] No auth token found');
    return {
      'Content-Type': 'application/json'
    };
  }

  return {
    'Authorization': `Bearer ${token.accessToken}`,
    'Content-Type': 'application/json'
  };
}

// Handle API responses with auto-retry on 401
async function handleResponse(response, retryCallback = null) {
  const text = await response.text();

  if (!response.ok) {
    // Handle 401 Unauthorized - Try to refresh token and retry ONCE
    if (response.status === 401) {
      console.warn('[API] ⚠️ 401 Unauthorized - attempting token refresh...');

      // Try to refresh the token
      const refreshResult = await authTokenManager.refreshToken();

      if (refreshResult.success && retryCallback) {
        console.log('[API] ✅ Token refreshed, retrying request...');
        // Retry the original request with new token
        return await retryCallback();
      } else {
        // Refresh failed or no retry callback - force logout
        console.error('[API] ❌ Token refresh failed - forcing logout');
        authTokenManager.clearToken();
        window.location.href = '/login';
        throw new Error('Session expired. Please login again.');
      }
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

// Enhanced fetch with auto-retry on 401
async function fetchWithRetry(url, options = {}) {
  let retried = false;

  const makeRequest = async () => {
    const response = await fetch(url, options);

    // Pass retry callback only on first attempt
    return await handleResponse(response, !retried ? async () => {
      retried = true;
      // Update headers with new token
      options.headers = getAuthHeaders();
      return await makeRequest();
    } : null);
  };

  return await makeRequest();
}

// ==================== Portfolio Data ====================

/**
 * Fetch portfolio positions
 * Maps to: GET /api/portfolio/positions
 */
export async function fetchPositions(personName = 'Vivek') {
  console.log(`[API] Fetching positions for ${personName}...`);

  let url;
  if (personName === 'all') {
    url = `${API_BASE_URL}/api/portfolio/positions?viewMode=all&aggregate=true`;
  } else {
    url = `${API_BASE_URL}/api/portfolio/positions?viewMode=person&personName=${personName}&aggregate=true`;
  }

  const result = await fetchWithRetry(url, {
    headers: getAuthHeaders()
  });

  console.log(`[API] Received ${result?.length || 0} positions`);

  // The backend returns array directly in data field
  return result || [];
}

/**
 * Fetch cash balances (from accounts)
 * Maps to: GET /api/portfolio/cash-balances
 */
export async function fetchCashBalances(personName = 'Vivek') {
  console.log(`[API] Fetching cash balances for ${personName}...`);

  let url;
  if (personName === 'all') {
    url = `${API_BASE_URL}/api/portfolio/cash-balances?viewMode=all`;
  } else {
    url = `${API_BASE_URL}/api/portfolio/cash-balances?viewMode=person&personName=${personName}`;
  }

  const result = await fetchWithRetry(url, {
    headers: getAuthHeaders()
  });

  console.log(`[API] Received ${result.accounts?.length || 0} accounts`);

  // Return the full result object { accounts: [...], summary: {...} }
  return result || { accounts: [] };
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
 * Fetch per-login sync status (last sync time + status + needsReauth).
 * Maps to: GET /api/sync/status
 * Returns: [{ personName, isActive, needsReauth, lastSyncStatus, lastSyncTime, lastSyncError }]
 */
export async function fetchSyncStatus() {
  try {
    const url = `${API_BASE_URL}/api/sync/status`;
    const response = await fetch(url, { headers: getAuthHeaders() });
    const data = await handleResponse(response);
    return Array.isArray(data) ? data : (data?.data || []);
  } catch (error) {
    console.warn('[API] fetchSyncStatus failed:', error.message);
    return [];
  }
}

/**
 * Fetch exchange rate
 * Maps to: GET /api/portfolio/exchange-rate
 */
export async function fetchExchangeRate() {
  try {
    console.log('[API] Fetching exchange rate...');

    const url = `${API_BASE_URL}/api/portfolio/exchange-rate`;
    const response = await fetch(url, {
      headers: getAuthHeaders()
    });

    const result = await handleResponse(response);

    // Return full exchange rate object with percent change
    const rateData = {
      rate: parseFloat(result.rate || 1.40),
      percentChange: result.percentChange || 0,
      change: result.change || 0,
      previousClose: result.previousClose,
      open: result.open,
      high: result.high,
      low: result.low
    };

    console.log(`[API] Exchange rate:`, rateData);
    return rateData;

  } catch (error) {
    console.error('[API] Error fetching exchange rate:', error);
    return { rate: 1.40, percentChange: 0 }; // Fallback
  }
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
 * Run backtesting analysis
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

// ==================== Portfolio Analysis ====================

/**
 * Fetch portfolio analysis data for charts
 * Maps to: GET /api/portfolio/analysis
 * @param {string} personName - Person name or 'all' for all persons
 * @param {string} viewMode - 'investment' or 'market'
 * @param {string|null} accountId - Optional account ID for account-level filtering
 */
export async function fetchPortfolioAnalysis(personName = 'all', viewMode = 'investment', accountId = null) {
  console.log(`[API] Fetching portfolio analysis for ${personName}${accountId ? ` (account: ${accountId})` : ''}...`);

  let url = `${API_BASE_URL}/api/portfolio/analysis?personName=${personName}&viewMode=${viewMode}`;
  if (accountId) {
    url += `&accountId=${accountId}`;
  }

  const result = await fetchWithRetry(url, {
    headers: getAuthHeaders()
  });

  console.log('[API] Portfolio analysis received:', result);
  return result;
}

// ==================== Symbol Categories ====================

/**
 * Fetch all symbol categories
 * Maps to: GET /api/symbol-categories
 */
export async function fetchSymbolCategories() {
  console.log('[API] Fetching symbol categories...');

  const url = `${API_BASE_URL}/api/symbol-categories`;
  const result = await fetchWithRetry(url, {
    headers: getAuthHeaders()
  });

  console.log(`[API] Received ${result?.length || 0} symbol categories`);
  return result || [];
}

/**
 * Fetch category options (types, subtypes, sectors)
 * Maps to: GET /api/category-options
 */
export async function fetchCategoryOptions() {
  console.log('[API] Fetching category options...');

  const url = `${API_BASE_URL}/api/category-options`;
  const result = await fetchWithRetry(url, {
    headers: getAuthHeaders()
  });

  console.log('[API] Category options received');
  return result;
}

/**
 * Update symbol category
 * Maps to: POST /api/symbol-categories/:symbol
 */
export async function updateSymbolCategory(symbol, categoryData) {
  console.log(`[API] Updating category for ${symbol}...`, categoryData);

  const url = `${API_BASE_URL}/api/symbol-categories/${symbol}`;
  const result = await fetchWithRetry(url, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(categoryData)
  });

  console.log('[API] Category updated:', result);
  return result;
}

/**
 * Bulk update symbol categories
 * Maps to: POST /api/symbol-categories/bulk
 */
export async function bulkUpdateSymbolCategories(categories) {
  console.log(`[API] Bulk updating ${categories.length} categories...`);

  const url = `${API_BASE_URL}/api/symbol-categories/bulk`;
  const result = await fetchWithRetry(url, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ categories })
  });

  console.log('[API] Bulk update complete:', result);
  return result;
}

// ==================== Testing ====================

/**
 * Test Questrade API endpoint
 * Maps to: POST /api/test/questrade-api
 */
export async function testQuestradeApi(personName, endpoint, startDate = null, endDate = null) {
  console.log(`[API] Testing Questrade API for ${personName}`, { endpoint, startDate, endDate });

  const url = `${API_BASE_URL}/api/test/questrade-api`;

  const makeRequest = async () => {
    const response = await fetch(url, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        personName,
        endpoint,
        startDate,
        endDate
      })
    });

    return await handleResponse(response, makeRequest);
  };

  const data = await makeRequest();
  console.log('[API] Questrade API test completed:', data);

  return data;
}
