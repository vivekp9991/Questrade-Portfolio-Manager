// src/utils/currencyFilter.js - Currency filtering and conversion utilities

/**
 * Filter stocks based on currency mode
 * @param {Array} stocks - Array of stock objects with currency field
 * @param {string} currencyFilter - Filter mode: 'combined-cad', 'combined-usd', 'cad-only', 'usd-only'
 * @param {number} usdCadRate - USD to CAD exchange rate
 * @returns {Array} Filtered and/or converted stocks
 */
export function filterStocksByCurrency(stocks, currencyFilter, usdCadRate = 1.35) {
  if (!stocks || stocks.length === 0) {
    return [];
  }

  const rate = usdCadRate || 1.35;

  switch (currencyFilter) {
    case 'cad-only':
      // Return only CAD stocks, no conversion
      return stocks.filter(stock => stock.currency === 'CAD');

    case 'usd-only':
      // Return only USD stocks, no conversion
      return stocks.filter(stock => stock.currency === 'USD');

    case 'combined-usd':
      // Return all stocks, convert CAD to USD
      return stocks.map(stock => {
        if (stock.currency === 'CAD') {
          return convertStockToUSD(stock, rate);
        }
        return stock;
      });

    case 'combined-cad':
    default:
      // Return all stocks, convert USD to CAD
      return stocks.map(stock => {
        if (stock.currency === 'USD') {
          return convertStockToCAD(stock, rate);
        }
        return stock;
      });
  }
}

/**
 * Convert a stock from USD to CAD
 */
function convertStockToCAD(stock, rate) {
  const converted = {
    ...stock,
    // Preserve original currency for reference
    originalCurrency: stock.currency,
    currency: 'CAD (converted)',

    // Convert numeric price fields (if they exist - for formatted frontend data)
    ...(stock.avgCostNum !== undefined && { avgCostNum: stock.avgCostNum * rate }),
    ...(stock.currentPriceNum !== undefined && { currentPriceNum: stock.currentPriceNum * rate }),
    ...(stock.openPriceNum !== undefined && { openPriceNum: stock.openPriceNum * rate }),
    ...(stock.investmentValueNum !== undefined && { investmentValueNum: stock.investmentValueNum * rate }),
    ...(stock.marketValueNum !== undefined && { marketValueNum: stock.marketValueNum * rate }),
    ...(stock.todayChangeValueNum !== undefined && { todayChangeValueNum: stock.todayChangeValueNum * rate }),
    ...(stock.todayReturnValueNum !== undefined && { todayReturnValueNum: stock.todayReturnValueNum * rate }),
    ...(stock.divPerShareNum !== undefined && { divPerShareNum: stock.divPerShareNum * rate }),
    ...(stock.monthlyDivIncomeNum !== undefined && { monthlyDivIncomeNum: stock.monthlyDivIncomeNum * rate }),
    ...(stock.totalDivReceivedNum !== undefined && { totalDivReceivedNum: stock.totalDivReceivedNum * rate }),
    ...(stock.divAdjCostNum !== undefined && { divAdjCostNum: stock.divAdjCostNum * rate }),
    ...(stock.totalCostNum !== undefined && { totalCostNum: stock.totalCostNum * rate }),
    ...(stock.totalReceivedNum !== undefined && { totalReceivedNum: stock.totalReceivedNum * rate }),
    ...(stock.monthlyDividendNum !== undefined && { monthlyDividendNum: stock.monthlyDividendNum * rate }),
    ...(stock.annualDividendNum !== undefined && { annualDividendNum: stock.annualDividendNum * rate }),

    // Convert backend API fields (if they exist - for raw position data)
    ...(stock.averageEntryPrice !== undefined && { averageEntryPrice: stock.averageEntryPrice * rate }),
    ...(stock.currentPrice !== undefined && typeof stock.currentPrice === 'number' && { currentPrice: stock.currentPrice * rate }),
    ...(stock.openPrice !== undefined && { openPrice: stock.openPrice * rate }),
  };

  // Convert formatted string values (if they exist)
  if (stock.avgCostNum !== undefined) {
    converted.avgCost = formatCAD(stock.avgCostNum * rate);
    converted.currentPrice = formatCAD(stock.currentPriceNum * rate);
    converted.investmentValue = formatCAD(stock.investmentValueNum * rate);
    converted.marketValue = formatCAD(stock.marketValueNum * rate);
    converted.divPerShare = formatCAD(stock.divPerShareNum * rate);
    converted.monthlyDivIncome = formatCAD(stock.monthlyDivIncomeNum * rate);
    converted.totalDivReceived = formatCAD(stock.totalDivReceivedNum * rate);
    converted.divAdjCost = formatCAD(stock.divAdjCostNum * rate);
    converted.todayChange = formatChangeCAD(stock.todayChangeValueNum * rate, stock.todayChangeNum);
    converted.todayReturn = formatChangeCAD(stock.todayReturnValueNum * rate, stock.todayReturnNum);
  }

  // Convert dividendData nested object (backend API structure)
  if (stock.dividendData) {
    converted.dividendData = {
      ...stock.dividendData,
      totalReceived: (stock.dividendData.totalReceived || 0) * rate,
      monthlyDividendPerShare: (stock.dividendData.monthlyDividendPerShare || 0) * rate,
      annualDividend: (stock.dividendData.annualDividend || 0) * rate,
      annualDividendPerShare: (stock.dividendData.annualDividendPerShare || 0) * rate,
      // yieldOnCost and currentYield are percentages, don't convert
    };
  }

  return converted;
}

/**
 * Convert a stock from CAD to USD
 */
function convertStockToUSD(stock, rate) {
  const converted = {
    ...stock,
    // Preserve original currency for reference
    originalCurrency: stock.currency,
    currency: 'USD (converted)',

    // Convert numeric price fields (if they exist - for formatted frontend data)
    ...(stock.avgCostNum !== undefined && { avgCostNum: stock.avgCostNum / rate }),
    ...(stock.currentPriceNum !== undefined && { currentPriceNum: stock.currentPriceNum / rate }),
    ...(stock.openPriceNum !== undefined && { openPriceNum: stock.openPriceNum / rate }),
    ...(stock.investmentValueNum !== undefined && { investmentValueNum: stock.investmentValueNum / rate }),
    ...(stock.marketValueNum !== undefined && { marketValueNum: stock.marketValueNum / rate }),
    ...(stock.todayChangeValueNum !== undefined && { todayChangeValueNum: stock.todayChangeValueNum / rate }),
    ...(stock.todayReturnValueNum !== undefined && { todayReturnValueNum: stock.todayReturnValueNum / rate }),
    ...(stock.divPerShareNum !== undefined && { divPerShareNum: stock.divPerShareNum / rate }),
    ...(stock.monthlyDivIncomeNum !== undefined && { monthlyDivIncomeNum: stock.monthlyDivIncomeNum / rate }),
    ...(stock.totalDivReceivedNum !== undefined && { totalDivReceivedNum: stock.totalDivReceivedNum / rate }),
    ...(stock.divAdjCostNum !== undefined && { divAdjCostNum: stock.divAdjCostNum / rate }),
    ...(stock.totalCostNum !== undefined && { totalCostNum: stock.totalCostNum / rate }),
    ...(stock.totalReceivedNum !== undefined && { totalReceivedNum: stock.totalReceivedNum / rate }),
    ...(stock.monthlyDividendNum !== undefined && { monthlyDividendNum: stock.monthlyDividendNum / rate }),
    ...(stock.annualDividendNum !== undefined && { annualDividendNum: stock.annualDividendNum / rate }),

    // Convert backend API fields (if they exist - for raw position data)
    ...(stock.averageEntryPrice !== undefined && { averageEntryPrice: stock.averageEntryPrice / rate }),
    ...(stock.currentPrice !== undefined && typeof stock.currentPrice === 'number' && { currentPrice: stock.currentPrice / rate }),
    ...(stock.openPrice !== undefined && { openPrice: stock.openPrice / rate }),
  };

  // Convert formatted string values (if they exist)
  if (stock.avgCostNum !== undefined) {
    converted.avgCost = formatUSD(stock.avgCostNum / rate);
    converted.currentPrice = formatUSD(stock.currentPriceNum / rate);
    converted.investmentValue = formatUSD(stock.investmentValueNum / rate);
    converted.marketValue = formatUSD(stock.marketValueNum / rate);
    converted.divPerShare = formatUSD(stock.divPerShareNum / rate);
    converted.monthlyDivIncome = formatUSD(stock.monthlyDivIncomeNum / rate);
    converted.totalDivReceived = formatUSD(stock.totalDivReceivedNum / rate);
    converted.divAdjCost = formatUSD(stock.divAdjCostNum / rate);
    converted.todayChange = formatChangeUSD(stock.todayChangeValueNum / rate, stock.todayChangeNum);
    converted.todayReturn = formatChangeUSD(stock.todayReturnValueNum / rate, stock.todayReturnNum);
  }

  // Convert dividendData nested object (backend API structure)
  if (stock.dividendData) {
    converted.dividendData = {
      ...stock.dividendData,
      totalReceived: (stock.dividendData.totalReceived || 0) / rate,
      monthlyDividendPerShare: (stock.dividendData.monthlyDividendPerShare || 0) / rate,
      annualDividend: (stock.dividendData.annualDividend || 0) / rate,
      annualDividendPerShare: (stock.dividendData.annualDividendPerShare || 0) / rate,
      // yieldOnCost and currentYield are percentages, don't convert
    };
  }

  return converted;
}

// Helper formatting functions
function formatCAD(value) {
  return `$${value.toFixed(2)}`;
}

function formatUSD(value) {
  return `$${value.toFixed(2)}`;
}

function formatChangeCAD(valueChange, percentChange) {
  const sign = valueChange >= 0 ? '+' : '';
  return `${sign}$${Math.abs(valueChange).toFixed(2)} (${sign}${percentChange.toFixed(2)}%)`;
}

function formatChangeUSD(valueChange, percentChange) {
  const sign = valueChange >= 0 ? '+' : '';
  return `${sign}$${Math.abs(valueChange).toFixed(2)} (${sign}${percentChange.toFixed(2)}%)`;
}

/**
 * Calculate currency filter summary
 * @param {Array} allStocks - All stocks before filtering
 * @param {Array} filteredStocks - Stocks after currency filter applied
 * @param {string} currencyFilter - Current filter mode
 * @returns {string} Summary text for display
 */
export function getCurrencyFilterSummary(allStocks, filteredStocks, currencyFilter) {
  const totalCount = allStocks.length;
  const filteredCount = filteredStocks.length;

  switch (currencyFilter) {
    case 'cad-only':
      const cadCount = allStocks.filter(s => s.currency === 'CAD').length;
      return `${cadCount} CAD positions (${totalCount - cadCount} USD hidden)`;

    case 'usd-only':
      const usdCount = allStocks.filter(s => s.currency === 'USD').length;
      return `${usdCount} USD positions (${totalCount - usdCount} CAD hidden)`;

    case 'combined-usd':
      return `${totalCount} positions (displayed in USD)`;

    case 'combined-cad':
    default:
      return `${totalCount} positions (displayed in CAD)`;
  }
}
