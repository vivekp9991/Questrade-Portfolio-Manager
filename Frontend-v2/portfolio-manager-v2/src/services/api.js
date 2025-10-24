// API Service - Portfolio Manager V2
// Using Vite proxy: /api -> http://localhost:4003

const API_BASE = '/api';

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

// Fetch portfolio positions
export async function fetchPositions(personName = 'Vivek') {
  let url;
  if (personName === 'all') {
    // Fetch all persons' combined data
    url = `${API_BASE}/portfolio/positions?viewMode=all`;
  } else {
    // Fetch specific person's data
    url = `${API_BASE}/portfolio/positions?viewMode=person&personName=${personName}`;
  }
  const response = await fetch(url);
  return handleResponse(response);
}

// Fetch cash balances
export async function fetchCashBalances(personName = 'Vivek') {
  let url;
  if (personName === 'all') {
    // Fetch all persons' combined data
    url = `${API_BASE}/portfolio/cash-balances?viewMode=all`;
  } else {
    // Fetch specific person's data
    url = `${API_BASE}/portfolio/cash-balances?viewMode=person&personName=${personName}`;
  }
  const response = await fetch(url);
  return handleResponse(response);
}

// Fetch persons list
export async function fetchPersons() {
  const url = `${API_BASE}/persons`;
  const response = await fetch(url);
  return handleResponse(response);
}

// Fetch exchange rate
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

// Sync portfolio data
export async function syncPortfolio(personName = 'Vivek') {
  const url = `${API_BASE}/sync/sync-person/${personName}`;
  const response = await fetch(url, { method: 'POST' });
  return handleResponse(response);
}

// Run backtesting analysis
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
