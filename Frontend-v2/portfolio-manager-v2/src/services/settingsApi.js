// Settings API Service - Portfolio Manager V2
// Backend APIs: Auth (4001), Sync (4002), Portfolio (4003)
// Using Vite proxy configuration for dev, API Gateway for production

// Get API base URL from environment
// In production: https://...amazonaws.com/dev/api
// In dev: /api
const API_BASE = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api`
  : '/api';

// All APIs use the same base in production (AWS API Gateway)
const AUTH_API = API_BASE;
const SYNC_API = API_BASE;
const PORTFOLIO_API = API_BASE;

// Handle API responses
async function handleResponse(response) {
  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || 'Request failed');
  }

  try {
    const json = JSON.parse(text);
    // Most endpoints wrap data in { success: true, data: {...} }
    if (json.success && json.data !== undefined) {
      return json.data;
    }
    return json;
  } catch (error) {
    console.error('JSON Parse Error:', error);
    throw new Error(`Failed to parse JSON response: ${error.message}`);
  }
}

// ============================================
// PERSON MANAGEMENT
// ============================================

// Get all persons
export async function fetchPersons() {
  const url = `${AUTH_API}/persons`;
  const response = await fetch(url);
  return handleResponse(response);
}

// Add new person
export async function addPerson(personData) {
  const url = `${AUTH_API}/persons`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(personData)
  });
  return handleResponse(response);
}

// Update person
export async function updatePerson(personName, personData) {
  const url = `${AUTH_API}/persons/${personName}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(personData)
  });
  return handleResponse(response);
}

// Delete person
export async function deletePerson(personName) {
  const url = `${AUTH_API}/persons/${personName}`;
  const response = await fetch(url, {
    method: 'DELETE'
  });
  return handleResponse(response);
}

// Toggle person active status
export async function togglePersonActive(personName, isActive) {
  const url = `${AUTH_API}/persons/${personName}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isActive })
  });
  return handleResponse(response);
}

// ============================================
// TOKEN MANAGEMENT
// ============================================

// Get token info for a person
export async function fetchTokenInfo(personName) {
  const url = `${AUTH_API}/auth/token-status/${personName}`;
  const response = await fetch(url);
  return handleResponse(response);
}

// Refresh token for a person
export async function refreshToken(personName) {
  const url = `${AUTH_API}/auth/refresh-token/${personName}`;
  const response = await fetch(url, {
    method: 'POST'
  });
  return handleResponse(response);
}

// Update refresh token for a person
export async function updateRefreshToken(personName, refreshToken) {
  const url = `${AUTH_API}/auth/setup-person`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ personName, refreshToken })
  });
  return handleResponse(response);
}

// Get access token for a person
export async function getAccessToken(personName) {
  const url = `${AUTH_API}/auth/access-token/${personName}`;
  const response = await fetch(url);
  return handleResponse(response);
}

// Test connection for a person
export async function testConnection(personName) {
  const url = `${AUTH_API}/auth/test-connection/${personName}`;
  const response = await fetch(url, {
    method: 'POST'
  });
  return handleResponse(response);
}

// ============================================
// DATA SYNC
// ============================================

// Sync all persons
export async function syncAll() {
  const url = `${SYNC_API}/sync/all`;
  const response = await fetch(url, {
    method: 'POST'
  });
  return handleResponse(response);
}

// Sync specific person
export async function syncPerson(personName) {
  const url = `${SYNC_API}/sync/person/${personName}`;
  const response = await fetch(url, {
    method: 'POST'
  });
  return handleResponse(response);
}

// Sync specific account
export async function syncAccount(personName, accountNumber) {
  const url = `${SYNC_API}/sync/account/${personName}/${accountNumber}`;
  const response = await fetch(url, {
    method: 'POST'
  });
  return handleResponse(response);
}

// Sync accounts only
export async function syncAccounts(personName) {
  const url = `${SYNC_API}/sync/accounts/${personName}`;
  const response = await fetch(url, {
    method: 'POST'
  });
  return handleResponse(response);
}

// Sync positions only
export async function syncPositions(personName) {
  const url = `${SYNC_API}/sync/positions/${personName}`;
  const response = await fetch(url, {
    method: 'POST'
  });
  return handleResponse(response);
}

// Sync activities only
export async function syncActivities(personName) {
  const url = `${SYNC_API}/sync/activities/${personName}`;
  const response = await fetch(url, {
    method: 'POST'
  });
  return handleResponse(response);
}

// Sync previous day close (candles) for a person
export async function syncCandlesPerson(personName) {
  const url = `${SYNC_API}/sync/candles/person/${personName}`;
  const response = await fetch(url, {
    method: 'POST'
  });
  return handleResponse(response);
}

// Sync previous day close (candles) for all persons
export async function syncCandlesAll() {
  const url = `${SYNC_API}/sync/candles/all`;
  const response = await fetch(url, {
    method: 'POST'
  });
  return handleResponse(response);
}

// Sync using trigger endpoint (full sync + candles)
export async function syncTrigger() {
  const url = `${SYNC_API}/sync/trigger`;
  const response = await fetch(url, {
    method: 'POST'
  });
  return handleResponse(response);
}

// Get sync status
export async function fetchSyncStatus() {
  const url = `${SYNC_API}/sync/status`;
  const response = await fetch(url);
  return handleResponse(response);
}

// Get sync history
export async function fetchSyncHistory(limit = 50) {
  const url = `${SYNC_API}/sync/history?limit=${limit}`;
  const response = await fetch(url);
  return handleResponse(response);
}

// ============================================
// DIVIDEND MANAGER
// ============================================

// Get all positions with dividend data
export async function fetchDividendPositions(personName) {
  const url = `${PORTFOLIO_API}/portfolio/positions?viewMode=person&personName=${personName}`;
  const response = await fetch(url);
  return handleResponse(response);
}

// Get all YoC exclusions (centralized, not person-specific)
export async function fetchYieldExclusions() {
  const url = `${PORTFOLIO_API}/yield-exclusions`;
  const response = await fetch(url);
  return handleResponse(response);
}

// Add YoC exclusion (exclude from YoC calculation)
export async function addYieldExclusion(symbol, reason = '') {
  const url = `${PORTFOLIO_API}/yield-exclusions/${symbol}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason })
  });
  return handleResponse(response);
}

// Remove YoC exclusion (include in YoC calculation)
export async function removeYieldExclusion(symbol) {
  const url = `${PORTFOLIO_API}/yield-exclusions/${symbol}`;
  const response = await fetch(url, {
    method: 'DELETE'
  });
  return handleResponse(response);
}

// ============================================
// SYMBOL DIVIDEND (Centralized)
// ============================================

// Get all symbol dividend data
export async function fetchAllSymbolDividends() {
  const url = `${PORTFOLIO_API}/symbol-dividends/all`;
  const response = await fetch(url);
  return handleResponse(response);
}

// Get dividend data for a specific symbol
export async function fetchSymbolDividend(symbol) {
  const url = `${PORTFOLIO_API}/symbol-dividends/symbol/${symbol}`;
  const response = await fetch(url);
  return handleResponse(response);
}

// Set/update dividend data for a symbol
export async function setSymbolDividend(symbol, dividendData) {
  const url = `${PORTFOLIO_API}/symbol-dividends/symbol/${symbol}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dividendData)
  });
  return handleResponse(response);
}

// Bulk update symbol dividends
export async function bulkUpdateSymbolDividends(dividends) {
  const url = `${PORTFOLIO_API}/symbol-dividends/bulk`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dividends })
  });
  return handleResponse(response);
}

// Delete symbol dividend
export async function deleteSymbolDividend(symbol) {
  const url = `${PORTFOLIO_API}/symbol-dividends/symbol/${symbol}`;
  const response = await fetch(url, {
    method: 'DELETE'
  });
  return handleResponse(response);
}

// Reset manual override for a symbol
export async function resetSymbolDividendOverride(symbol) {
  const url = `${PORTFOLIO_API}/symbol-dividends/symbol/${symbol}/reset-override`;
  const response = await fetch(url, {
    method: 'POST'
  });
  return handleResponse(response);
}

// ============================================
// SYSTEM HEALTH
// ============================================

// Check Auth API health
export async function checkAuthHealth() {
  const url = `${AUTH_API}/health`;
  const response = await fetch(url);
  return handleResponse(response);
}

// Check Sync API health
export async function checkSyncHealth() {
  const url = `${SYNC_API}/health`;
  const response = await fetch(url);
  return handleResponse(response);
}

// Check Portfolio API health
export async function checkPortfolioHealth() {
  const url = `${PORTFOLIO_API}/health`;
  const response = await fetch(url);
  return handleResponse(response);
}

// Get sync statistics
export async function fetchSyncStats() {
  const url = `${SYNC_API}/stats/sync`;
  const response = await fetch(url);
  return handleResponse(response);
}

// Get data statistics
export async function fetchDataStats() {
  const url = `${SYNC_API}/stats/data`;
  const response = await fetch(url);
  return handleResponse(response);
}

// ============================================
// ERROR LOGS
// ============================================

// Get error statistics
export async function fetchErrorStats() {
  const url = `${SYNC_API}/stats/errors`;
  const response = await fetch(url);
  return handleResponse(response);
}

// Get recent errors (from sync history)
export async function fetchRecentErrors(limit = 20) {
  const url = `${SYNC_API}/sync/history?limit=${limit}&errorsOnly=true`;
  const response = await fetch(url);
  return handleResponse(response);
}

// ============================================
// ACCOUNTS
// ============================================

// Get accounts dropdown options
export async function fetchAccountsDropdown() {
  const url = `${SYNC_API}/accounts/dropdown-options`;
  const response = await fetch(url);
  return handleResponse(response);
}

// Get account summary
export async function fetchAccountSummary(personName) {
  const url = `${SYNC_API}/accounts/summary/${personName}`;
  const response = await fetch(url);
  return handleResponse(response);
}

// ============================================
// QUESTRADE DIVIDEND SYNC
// ============================================

// Sync dividend data from Questrade API
export async function syncQuestradeDividends() {
  const url = `${SYNC_API}/sync/questrade-dividends`;
  const response = await fetch(url, {
    method: 'POST'
  });
  return handleResponse(response);
}

// Sync master candles (centralized previousClose for all symbols)
export async function syncMasterCandles() {
  const url = `${SYNC_API}/sync/master-candles`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ triggerType: 'MANUAL' })
  });
  return handleResponse(response);
}
