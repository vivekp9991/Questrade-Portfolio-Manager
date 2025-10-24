// src/api.js - FIXED: Microservices API Configuration
// Define separate base URLs for each microservice
const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL || 'http://localhost:4001';
const SYNC_API_URL = import.meta.env.VITE_SYNC_API_URL || 'http://localhost:4002';
const PORTFOLIO_API_URL = import.meta.env.VITE_PORTFOLIO_API_URL || 'http://localhost:4003';
const MARKET_API_URL = import.meta.env.VITE_MARKET_API_URL || 'http://localhost:4004';

// Legacy fallback for compatibility
const API_BASE_URL = PORTFOLIO_API_URL;

// FIXED: Import detectDividendFrequency helper
import { detectDividendFrequency } from './utils/helpers';

async function handleResponse(response) {
  // Get response text first for better error handling
  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || 'Request failed');
  }

  try {
    const json = JSON.parse(text);
    // Most endpoints wrap data in a { success: true, data: {...} } structure
    if (json.success && json.data !== undefined) {
      return json.data;
    }
    return json;
  } catch (error) {
    // If JSON parsing fails, provide detailed error info
    console.error('JSON Parse Error:', error);
    console.error('Response length:', text.length);
    console.error('Response Text (first 500 chars):', text.substring(0, 500));
    console.error('Response Text (at position 2000):', text.substring(1950, 2050));
    throw new Error(`Failed to parse JSON response: ${error.message}. Response length: ${text.length}, starts with: ${text.substring(0, 100)}`);
  }
}

// UPDATED: Get exchange rate from backend (uses cached rate, no direct TwelveData API calls)
export async function fetchExchangeRate(fromCurrency = 'USD', toCurrency = 'CAD') {
  try {
    // Get cached exchange rate from backend instead of calling TwelveData directly
    // This prevents rate limiting and lets the backend handle caching
    const response = await fetch(`${PORTFOLIO_API_URL}/api/portfolio/exchange-rate`);

    if (!response.ok) {
      console.warn('Failed to fetch exchange rate from backend, using default');
      return 1.35; // Default fallback
    }

    const json = await response.json();

    // Backend returns: { success: true, data: { rate, pair, cachedAt } }
    if (json.success && json.data && json.data.rate) {
      const rate = parseFloat(json.data.rate);
      console.log(`Backend cached ${json.data.pair} rate:`, rate, json.data.cachedAt ? `(cached at ${json.data.cachedAt})` : '');
      return rate;
    }

    console.warn('Invalid response from backend, using default rate');
    return 1.35;
  } catch (error) {
    console.error('Error fetching exchange rate from backend:', error);
    return 1.35; // Default USD/CAD rate
  }
}

// FIXED: Enhanced Cash Balances Function with Proper Account Filtering
export async function fetchCashBalances(accountSelection = null) {
  // FIXED: Use Portfolio API (Port 4003) for cash balances
  const url = new URL(`${PORTFOLIO_API_URL}/api/portfolio/cash-balances`);
  
  console.log('🏦 fetchCashBalances called with account selection:', accountSelection);
  
  if (accountSelection) {
    // Add viewMode parameter
    url.searchParams.set('viewMode', accountSelection.viewMode || 'all');
    
    // Add specific filters based on viewMode
    if (accountSelection.viewMode === 'person' && accountSelection.personName) {
      url.searchParams.set('personName', accountSelection.personName);
      console.log('🏦 Adding personName filter:', accountSelection.personName);
    }
    
    if (accountSelection.viewMode === 'account' && accountSelection.accountId) {
      url.searchParams.set('accountId', accountSelection.accountId);
      console.log('🏦 Adding accountId filter:', accountSelection.accountId);
    }
    
    // Add currency filter if specified
    if (accountSelection.currency) {
      url.searchParams.set('currency', accountSelection.currency);
    }
    
    // Add aggregate flag for proper data processing
    if (accountSelection.aggregate !== undefined) {
      url.searchParams.set('aggregate', accountSelection.aggregate.toString());
    }
  }
  
  console.log('🏦 Final cash balance URL:', url.toString());
  
  try {
    const response = await fetch(url);
    const data = await handleResponse(response);
    
    console.log('🏦 Cash balance API response:', data);
    
    // Ensure we return properly structured data
    if (!data) {
      return { 
        accounts: [], 
        summary: { 
          totalAccounts: 0, 
          totalPersons: 0, 
          totalCAD: 0, 
          totalUSD: 0,
          totalInCAD: 0 
        } 
      };
    }
    
    // FIXED: Process and enhance the data with proper USD/CAD conversion
    const processedData = enhanceCashBalanceData(data);
    
    console.log('🏦 Processed cash balance data:', processedData);
    return processedData;
  } catch (error) {
    console.error('🏦 Failed to fetch cash balances:', error);
    throw error;
  }
}


// Account Selection & Multi-Person Functions
export async function fetchDropdownOptions() {
  // FIXED: Use Sync API (Port 4002) for accounts dropdown
  const response = await fetch(`${SYNC_API_URL}/api/accounts/dropdown-options`);
  const data = await handleResponse(response);

  const options = [];

  // Add "All Accounts" option
  options.push({
    label: 'All Accounts',
    value: 'all',
    viewMode: 'all',
    personName: null,
    accountId: null,
    aggregate: true
  });

  // Extract unique persons from account data
  const persons = new Set();
  if (Array.isArray(data)) {
    data.forEach(account => {
      if (account.personName) {
        persons.add(account.personName);
      }
    });
  }

  // Add person-level options
  persons.forEach(personName => {
    options.push({
      label: personName,
      value: `person-${personName}`,
      viewMode: 'person',
      personName: personName,
      accountId: null,
      aggregate: true
    });
  });

  // Add individual account options
  if (Array.isArray(data)) {
    data.forEach(account => {
      options.push({
        label: account.label,
        value: account.value,
        viewMode: 'account',
        personName: account.personName,
        accountId: account.value,
        accountType: account.accountType,
        isPrimary: account.isPrimary,
        aggregate: false
      });
    });
  }

  return options;
}

export async function fetchAccountsByPerson() {
  // FIXED: Use Sync API (Port 4002) for accounts by person
  const response = await fetch(`${SYNC_API_URL}/api/accounts`);
  return handleResponse(response);
}

// Person Management Functions
export async function fetchPersons() {
  // FIXED: Use Auth API (Port 4001) for persons
  const response = await fetch(`${AUTH_API_URL}/api/persons`);
  return handleResponse(response);
}

export async function createPerson(personData) {
  // FIXED: Use Auth API (Port 4001) for creating persons
  const response = await fetch(`${AUTH_API_URL}/api/persons`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(personData)
  });
  return handleResponse(response);
}

export async function updatePerson(personName, updates) {
  // FIXED: Use Auth API (Port 4001) for updating persons
  const response = await fetch(`${AUTH_API_URL}/api/persons/${encodeURIComponent(personName)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  return handleResponse(response);
}

export async function deletePerson(personName) {
  // FIXED: Use Auth API (Port 4001) for deleting persons
  const response = await fetch(`${AUTH_API_URL}/api/persons/${encodeURIComponent(personName)}`, {
    method: 'DELETE'
  });
  return handleResponse(response);
}

// Token Management Functions
export async function setupPersonToken(personName, refreshToken) {
  // FIXED: Use Auth API (Port 4001) for token setup
  const response = await fetch(`${AUTH_API_URL}/api/auth/setup-person`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ personName, refreshToken })
  });
  return handleResponse(response);
}

export async function refreshPersonToken(personName) {
  // FIXED: Use Auth API (Port 4001) for token refresh
  const response = await fetch(`${AUTH_API_URL}/api/auth/refresh-token/${encodeURIComponent(personName)}`, {
    method: 'PUT'
  });
  return handleResponse(response);
}

export async function getTokenStatus(personName = null) {
  // FIXED: Use Auth API (Port 4001) for token status
  const url = personName
    ? `${AUTH_API_URL}/api/auth/token-status/${encodeURIComponent(personName)}`
    : `${AUTH_API_URL}/api/auth/token-status`;
  const response = await fetch(url);
  return handleResponse(response);
}

export async function testConnection(personName) {
  // FIXED: Use Auth API (Port 4001) for test connection
  const response = await fetch(`${AUTH_API_URL}/api/auth/test-connection/${encodeURIComponent(personName)}`, {
    method: 'POST'
  });
  return handleResponse(response);
}

export async function deleteToken(personName) {
  // FIXED: Use Auth API (Port 4001) for deleting token
  const response = await fetch(`${AUTH_API_URL}/api/auth/token/${encodeURIComponent(personName)}`, {
    method: 'DELETE'
  });
  return handleResponse(response);
}

// Settings & Health Functions
export async function fetchSettingsDashboard() {
  const response = await fetch(`${API_BASE_URL}/api/settings/dashboard`);
  return handleResponse(response);
}

export async function validateToken(refreshToken) {
  const response = await fetch(`${API_BASE_URL}/api/settings/validate-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });
  return handleResponse(response);
}

export async function getErrorLogs(filters = {}) {
  const url = new URL(`${API_BASE_URL}/api/settings/error-logs`);
  if (filters.personName) url.searchParams.set('personName', filters.personName);
  if (filters.days) url.searchParams.set('days', filters.days);
  const response = await fetch(url);
  return handleResponse(response);
}

export async function clearErrors(personName) {
  const response = await fetch(`${API_BASE_URL}/api/settings/clear-errors/${encodeURIComponent(personName)}`, {
    method: 'POST'
  });
  return handleResponse(response);
}

// Sync Functions
export async function syncPerson(personName, fullSync = false) {
  // FIXED: Use Sync API (Port 4002) for syncing person
  const response = await fetch(`${SYNC_API_URL}/api/sync/person/${encodeURIComponent(personName)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullSync, triggeredBy: 'manual' })
  });
  return handleResponse(response);
}

export async function syncAllPersons(fullSync = false) {
  // FIXED: Use Sync API (Port 4002) and correct endpoint name
  const response = await fetch(`${SYNC_API_URL}/api/sync/all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullSync, triggeredBy: 'manual' })
  });
  return handleResponse(response);
}

export async function getSyncStatus(personName = null) {
  // FIXED: Use Sync API (Port 4002) for sync status
  const url = `${SYNC_API_URL}/api/sync/status`;
  const response = await fetch(url);
  const data = await handleResponse(response);

  // If personName is provided, filter the status for that person
  if (personName && data) {
    return {
      ...data,
      lastSync: data.lastSyncByPerson?.[personName] || data.lastSync
    };
  }

  return data;
}

// Updated Portfolio Functions with Account Selection
export async function fetchPortfolioSummary(accountSelection = null) {
  // FIXED: Use Portfolio API (Port 4003)
  const url = new URL(`${PORTFOLIO_API_URL}/api/portfolio/summary`);
  
  if (accountSelection) {
    url.searchParams.set('viewMode', accountSelection.viewMode);
    if (accountSelection.personName) {
      url.searchParams.set('personName', accountSelection.personName);
    }
    if (accountSelection.accountId) {
      url.searchParams.set('accountId', accountSelection.accountId);
    }
    if (accountSelection.aggregate !== undefined) {
      url.searchParams.set('aggregate', accountSelection.aggregate);
    }
  }
  
  const response = await fetch(url);
  return handleResponse(response);
}

// Update the fetchPositions function in src/api.js (around line 190)
export async function fetchPositions(accountSelection = null, aggregateMode = true) {
  // FIXED: Use Portfolio API (Port 4003) for positions with dividend data
  const url = new URL(`${PORTFOLIO_API_URL}/api/portfolio/positions`);
  
  if (accountSelection) {
    url.searchParams.set('viewMode', accountSelection.viewMode);
    if (accountSelection.personName) {
      url.searchParams.set('personName', accountSelection.personName);
    }
    if (accountSelection.accountId) {
      url.searchParams.set('accountId', accountSelection.accountId);
    }
    url.searchParams.set('aggregate', aggregateMode);
  }
  
  console.log('Fetching positions from:', url.toString());
  
  const response = await fetch(url);
  const result = await response.json();
  
  // Handle the new response structure
  if (result.success && result.data) {
    console.log('Positions API response:', {
      success: result.success,
      viewMode: result.viewMode,
      aggregate: result.aggregate,
      count: result.count,
      dataLength: result.data?.length
    });
    
    // Log first position to check structure
    if (result.data && result.data.length > 0) {
      console.log('First position structure:', result.data[0]);
    }
    
    return result.data; // Return the data array directly
  }
  
  // Fallback for old API structure
  return handleResponse(response);
}

export async function fetchDividendCalendar(accountSelection = null) {
  // FIXED: Use Portfolio API (Port 4003) for dividend calendar
  const url = new URL(`${PORTFOLIO_API_URL}/api/portfolio/dividends/calendar`);
  
  if (accountSelection) {
    url.searchParams.set('viewMode', accountSelection.viewMode);
    if (accountSelection.personName) {
      url.searchParams.set('personName', accountSelection.personName);
    }
    if (accountSelection.accountId) {
      url.searchParams.set('accountId', accountSelection.accountId);
    }
  }
  
  const response = await fetch(url);
  return handleResponse(response);
}

// Legacy function kept for backward compatibility
export async function runPortfolioSync(fullSync = false, personName = null) {
  if (personName) {
    return syncPerson(personName, fullSync);
  } else {
    return syncAllPersons(fullSync);
  }
}

// ENHANCED: Portfolio analysis function with dividend frequency filtering
export async function fetchPortfolioAnalysis(accountSelection = null) {
  try {
    const [summary, positions] = await Promise.all([
      fetchPortfolioSummary(accountSelection),
      fetchPositions(accountSelection)
    ]);

    // ENHANCED: Filter for stocks with regular dividend patterns only
    const dividendStocks = positions.filter(p => {
      if (!p.dividendData) return false;
      
      // Check if it has actual dividend data
      const hasBasicDividendData = (p.dividendData.annualDividend > 0 || p.dividendData.totalReceived > 0);
      if (!hasBasicDividendData) return false;
      
      // Enhanced: Check for regular dividend pattern if history is available
      if (p.dividendData.dividendHistory && Array.isArray(p.dividendData.dividendHistory)) {
        const frequencyAnalysis = detectDividendFrequency(p.dividendData.dividendHistory);
        const isRegular = frequencyAnalysis.isRegular && frequencyAnalysis.confidence >= 60;
        
        console.log(`Portfolio Analysis - ${p.symbol}: ${isRegular ? 'Regular' : 'Irregular'} dividend (${frequencyAnalysis.frequency}, ${frequencyAnalysis.confidence}% confidence)`);
        return isRegular;
      }
      
      // Fallback: If no history but has current dividend data, assume regular
      if (p.dividendData.monthlyDividendPerShare > 0 || p.dividendData.annualDividend > 0) {
        console.log(`Portfolio Analysis - ${p.symbol}: Assuming regular dividend (current data available)`);
        return true;
      }
      
      // Only historical dividends without current data - likely irregular
      console.log(`Portfolio Analysis - ${p.symbol}: Irregular dividend (only historical data)`);
      return false;
    });

    console.log(`🔍 Portfolio Analysis: ${dividendStocks.length} regular dividend stocks out of ${positions.length} total positions`);

    const dividendMetrics = calculateDividendMetrics(dividendStocks);
    
    return {
      currentGainPercent: summary.unrealizedPnl && summary.totalInvestment > 0 
        ? (summary.unrealizedPnl / summary.totalInvestment) * 100 
        : 0,
      dividendsYieldPercent: dividendMetrics.averageYield,
      totalReturnsValue: summary.totalReturnValue || 0,
      overview: {
        totalInvestment: summary.totalInvestment || 0,
        currentValue: summary.currentValue || 0,
        totalReturnValue: summary.totalReturnValue || 0,
        returnPercent: summary.totalReturnPercent || 0,
        numberOfPositions: summary.numberOfPositions || 0,
        numberOfDividendStocks: dividendStocks.length,
        averagePositionSize: (summary.totalInvestment || 0) / Math.max(1, summary.numberOfPositions || 1),
        largestPosition: findLargestPosition(positions)
      },
      dividendAnalysis: {
        currentYieldPercent: dividendMetrics.currentYield,
        yieldOnCostPercent: dividendMetrics.yieldOnCost,
        dividendAdjustedAverageCost: dividendMetrics.dividendAdjustedCost,
        dividendAdjustedYieldPercent: dividendMetrics.dividendAdjustedYield,
        ttmYieldPercent: dividendMetrics.ttmYield,
        monthlyAverage: dividendMetrics.monthlyIncome,
        annualProjected: dividendMetrics.annualProjected,
        totalDividendsReceived: dividendMetrics.totalDividends
      },
      performanceBreakdown: {
        capitalGainsValue: summary.unrealizedPnl || 0,
        dividendIncomeValue: dividendMetrics.totalDividends,
        capitalGainsPercent: summary.unrealizedPnl && summary.totalInvestment > 0 
          ? (summary.unrealizedPnl / summary.totalInvestment) * 100 
          : 0,
        dividendReturnPercent: dividendMetrics.totalDividends && summary.totalInvestment > 0
          ? (dividendMetrics.totalDividends / summary.totalInvestment) * 100
          : 0,
        bestPerformingStock: findBestPerformer(positions),
        monthlyIncome: dividendMetrics.monthlyIncome,
        annualProjectedIncome: dividendMetrics.annualProjected
      },
      riskMetrics: calculateRiskMetrics(positions, summary),
      allocationAnalysis: calculateAllocation(positions, dividendStocks)
    };
  } catch (error) {
    console.error('Failed to fetch portfolio analysis:', error);
    return getDefaultAnalysis();
  }
}

// Helper functions
function calculateDividendMetrics(dividendStocks) {
  if (!dividendStocks || dividendStocks.length === 0) {
    return {
      averageYield: 0,
      currentYield: 0,
      yieldOnCost: 0,
      dividendAdjustedCost: 0,
      dividendAdjustedYield: 0,
      ttmYield: 0,
      monthlyIncome: 0,
      annualProjected: 0,
      totalDividends: 0
    };
  }

  let totalInvestment = 0;
  let totalValue = 0;
  let totalDividends = 0;
  let totalMonthlyIncome = 0;
  let totalAnnualProjected = 0;
  let weightedYieldOnCost = 0;
  let weightedCurrentYield = 0;

  dividendStocks.forEach(stock => {
    const investment = stock.totalCost || 0;
    const value = stock.currentMarketValue || 0;
    const dividendData = stock.dividendData || {};
    
    totalInvestment += investment;
    totalValue += value;
    totalDividends += dividendData.totalReceived || 0;
    totalMonthlyIncome += dividendData.monthlyDividend || 0;
    totalAnnualProjected += dividendData.annualDividend || 0;
    
    if (investment > 0) {
      weightedYieldOnCost += (dividendData.yieldOnCost || 0) * investment;
    }
    if (value > 0) {
      const monthlyDividend = dividendData.monthlyDividend || 0;
      const currentYield = ((monthlyDividend * 12) / value) * 100;
      weightedCurrentYield += currentYield * value;
    }
  });

  const avgYieldOnCost = totalInvestment > 0 ? weightedYieldOnCost / totalInvestment : 0;
  const avgCurrentYield = totalValue > 0 ? weightedCurrentYield / totalValue : 0;
  const dividendAdjustedCost = totalInvestment - totalDividends;
  const dividendAdjustedYield = dividendAdjustedCost > 0 
    ? (totalAnnualProjected / dividendAdjustedCost) * 100 
    : 0;

  return {
    averageYield: avgCurrentYield,
    currentYield: avgCurrentYield,
    yieldOnCost: avgYieldOnCost,
    dividendAdjustedCost,
    dividendAdjustedYield,
    ttmYield: avgCurrentYield,
    monthlyIncome: totalMonthlyIncome,
    annualProjected: totalAnnualProjected,
    totalDividends
  };
}

function findLargestPosition(positions) {
  if (!positions || positions.length === 0) {
    return { value: 0, symbol: 'N/A' };
  }
  
  const largest = positions.reduce((max, pos) => 
    (pos.currentMarketValue || 0) > (max.currentMarketValue || 0) ? pos : max
  );
  
  return {
    value: largest.currentMarketValue || 0,
    symbol: largest.symbol || 'N/A'
  };
}

function findBestPerformer(positions) {
  if (!positions || positions.length === 0) return null;
  
  const best = positions.reduce((max, pos) => {
    const returnPercent = pos.totalReturnPercent || 0;
    const maxReturn = max ? (max.totalReturnPercent || 0) : -Infinity;
    return returnPercent > maxReturn ? pos : max;
  }, null);
  
  return best ? {
    symbol: best.symbol,
    returnPercent: best.totalReturnPercent || 0
  } : null;
}

function calculateRiskMetrics(positions, summary) {
  if (!positions || positions.length === 0) {
    return {
      portfolioConcentration: 'N/A',
      largestPositionWeight: 'N/A',
      sectorConcentration: 'N/A',
      geographicExposure: 'N/A',
      dividendDependency: 'N/A',
      yieldStability: 'N/A'
    };
  }

  const totalValue = summary.currentValue || 0;
  const largest = Math.max(...positions.map(p => p.currentMarketValue || 0));
  const largestWeight = totalValue > 0 ? (largest / totalValue * 100).toFixed(2) + '%' : 'N/A';
  
  const dividendIncome = positions.reduce((sum, p) => 
    sum + (p.dividendData?.annualDividend || 0), 0
  );
  const dividendDependency = totalValue > 0 
    ? (dividendIncome / totalValue * 100).toFixed(2) + '%' 
    : 'N/A';

  return {
    portfolioConcentration: positions.length < 10 ? 'High' : positions.length < 20 ? 'Moderate' : 'Low',
    largestPositionWeight: largestWeight,
    sectorConcentration: 'Moderate',
    geographicExposure: 'Canada/US',
    dividendDependency: dividendDependency,
    yieldStability: 'Stable'
  };
}

function calculateAllocation(allPositions, dividendStocks) {
  const totalValue = allPositions.reduce((sum, p) => sum + (p.currentMarketValue || 0), 0);
  const dividendValue = dividendStocks.reduce((sum, p) => sum + (p.currentMarketValue || 0), 0);
  
  const highYieldStocks = dividendStocks.filter(p => 
    p.dividendData && p.dividendData.yieldOnCost > 4
  );
  const highYieldValue = highYieldStocks.reduce((sum, p) => sum + (p.currentMarketValue || 0), 0);
  
  return {
    assetWeights: {},
    sectorWeights: {},
    highYieldAssetsPercent: totalValue > 0 ? (highYieldValue / totalValue) * 100 : 0,
    growthAssetsPercent: totalValue > 0 ? ((totalValue - dividendValue) / totalValue) * 100 : 0,
    averageYieldPercent: calculateDividendMetrics(dividendStocks).averageYield
  };
}

function getDefaultAnalysis() {
  return {
    currentGainPercent: 0,
    dividendsYieldPercent: 0,
    totalReturnsValue: 0,
    overview: {
      totalInvestment: 0,
      currentValue: 0,
      totalReturnValue: 0,
      returnPercent: 0,
      numberOfPositions: 0,
      numberOfDividendStocks: 0,
      averagePositionSize: 0,
      largestPosition: { value: 0, symbol: 'N/A' }
    },
    dividendAnalysis: {
      currentYieldPercent: 0,
      yieldOnCostPercent: 0,
      dividendAdjustedAverageCost: 0,
      dividendAdjustedYieldPercent: 0,
      ttmYieldPercent: 0,
      monthlyAverage: 0,
      annualProjected: 0,
      totalDividendsReceived: 0
    },
    performanceBreakdown: {
      capitalGainsValue: 0,
      dividendIncomeValue: 0,
      capitalGainsPercent: 0,
      dividendReturnPercent: 0,
      bestPerformingStock: null,
      monthlyIncome: 0,
      annualProjectedIncome: 0
    },
    riskMetrics: {
      portfolioConcentration: 'N/A',
      largestPositionWeight: 'N/A',
      sectorConcentration: 'N/A',
      geographicExposure: 'N/A',
      dividendDependency: 'N/A',
      yieldStability: 'N/A'
    },
    allocationAnalysis: {
      assetWeights: {},
      sectorWeights: {},
      highYieldAssetsPercent: 0,
      growthAssetsPercent: 0,
      averageYieldPercent: 0
    }
  };
}

// FIXED: Helper function to enhance cash balance data with proper USD/CAD handling
function enhanceCashBalanceData(rawData) {
  // If data is already properly structured, return as-is but enhanced
  if (rawData.accounts && Array.isArray(rawData.accounts)) {
    return {
      ...rawData,
      accounts: rawData.accounts.map(account => enhanceAccountData(account)),
      summary: enhanceSummaryData(rawData.summary || {}, rawData.accounts || [])
    };
  }
  
  // If data is a direct array, wrap it and enhance
  if (Array.isArray(rawData)) {
    const enhancedAccounts = rawData.map(account => enhanceAccountData(account));
    return { 
      accounts: enhancedAccounts, 
      summary: enhanceSummaryData({}, enhancedAccounts)
    };
  }
  
  return rawData;
}

function enhanceSummaryData(existingSummary, accounts) {
  let totalCAD = 0;
  let totalUSD = 0;
  const accountTypes = new Set();
  const persons = new Set();
  
  accounts.forEach(account => {
    // Add to sets for counting
    if (account.accountType) accountTypes.add(account.accountType);
    if (account.personName) persons.add(account.personName);
    
    // Sum up currencies
    totalCAD += account.totalCAD || 0;
    totalUSD += account.totalUSD || 0;
  });
  
  return {
    ...existingSummary,
    totalAccounts: accounts.length,
    totalPersons: persons.size,
    totalAccountTypes: accountTypes.size,
    totalCAD,
    totalUSD,
    // FIXED: Add totalInCAD calculation (will be properly converted in the frontend)
    totalInCAD: totalCAD + totalUSD // Frontend will apply proper exchange rate
  };
}

function enhanceAccountData(account) {
  // Ensure cashBalances is properly structured
  const cashBalances = account.cashBalances || [];
  
  // If cashBalances is not an array, try to extract from other properties
  if (!Array.isArray(cashBalances) && account.cash !== undefined) {
    const currency = account.currency || 'CAD';
    return {
      ...account,
      cashBalances: [{
        currency: currency,
        cash: Number(account.cash) || 0
      }]
    };
  }
  
  // Ensure all cashBalances entries have proper numeric values
  const enhancedCashBalances = cashBalances.map(cb => ({
    currency: cb.currency || 'CAD',
    cash: Number(cb.cash) || 0
  }));
  
  return {
    ...account,
    cashBalances: enhancedCashBalances,
    // FIXED: Add helper properties for easier access
    totalCAD: enhancedCashBalances
      .filter(cb => cb.currency === 'CAD')
      .reduce((sum, cb) => sum + cb.cash, 0),
    totalUSD: enhancedCashBalances
      .filter(cb => cb.currency === 'USD')
      .reduce((sum, cb) => sum + cb.cash, 0)
  };
}

// Legacy function for access token
export async function fetchAccessToken() {
  // FIXED: Use Auth API (Port 4001) for access token
  const response = await fetch(`${AUTH_API_URL}/api/auth/access-token`);
  const data = await response.json();

  if (data.success) {
    return {
      token: data.token,
      expiresAt: data.expiresAt,
      apiServer: data.apiServer || 'https://api01.iq.questrade.com/'
    };
  }
  throw new Error('Failed to fetch access token');
}

// ============= Yield on Cost Exclusion Management =============

export async function fetchYieldExclusions(personName) {
  const response = await fetch(`${PORTFOLIO_API_URL}/api/yield-exclusions/person/${personName}`);
  return handleResponse(response);
}

export async function addYieldExclusion(personName, symbol, data = {}) {
  const response = await fetch(`${PORTFOLIO_API_URL}/api/yield-exclusions/person/${personName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      symbol,
      ...data
    })
  });
  return handleResponse(response);
}

export async function removeYieldExclusion(personName, symbol) {
  const response = await fetch(`${PORTFOLIO_API_URL}/api/yield-exclusions/person/${personName}/${symbol}`, {
    method: 'DELETE'
  });
  return handleResponse(response);
}

export async function bulkAddYieldExclusions(personName, symbols) {
  const response = await fetch(`${PORTFOLIO_API_URL}/api/yield-exclusions/person/${personName}/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbols })
  });
  return handleResponse(response);
}

export async function bulkRemoveYieldExclusions(personName, symbols) {
  const response = await fetch(`${PORTFOLIO_API_URL}/api/yield-exclusions/person/${personName}/bulk`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbols })
  });
  return handleResponse(response);
}

// ============= Symbol Dividend Management (Universal) =============

// Get all dividend data (universal - not person-specific)
export async function fetchAllSymbolDividends() {
  const response = await fetch(`${PORTFOLIO_API_URL}/api/symbol-dividends/all`);
  return handleResponse(response);
}

// Get dividend data for a specific symbol
export async function getSymbolDividend(symbol) {
  const response = await fetch(`${PORTFOLIO_API_URL}/api/symbol-dividends/symbol/${symbol}`);
  return handleResponse(response);
}

// Set dividend data for a symbol (universal)
export async function setSymbolDividend(symbol, data) {
  const response = await fetch(`${PORTFOLIO_API_URL}/api/symbol-dividends/symbol/${symbol}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return handleResponse(response);
}

// Remove dividend data for a symbol
export async function removeSymbolDividend(symbol) {
  const response = await fetch(`${PORTFOLIO_API_URL}/api/symbol-dividends/symbol/${symbol}`, {
    method: 'DELETE'
  });
  return handleResponse(response);
}

// Bulk update dividend data
export async function bulkUpdateSymbolDividends(dividends) {
  const response = await fetch(`${PORTFOLIO_API_URL}/api/symbol-dividends/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dividends })
  });
  return handleResponse(response);
}

// Get symbols with manual overrides
export async function getManualDividendOverrides() {
  const response = await fetch(`${PORTFOLIO_API_URL}/api/symbol-dividends/manual-overrides`);
  return handleResponse(response);
}

// Reset manual override for a symbol (allow sync to update again)
export async function resetDividendOverride(symbol) {
  const response = await fetch(`${PORTFOLIO_API_URL}/api/symbol-dividends/symbol/${symbol}/reset-override`, {
    method: 'POST'
  });
  return handleResponse(response);
}