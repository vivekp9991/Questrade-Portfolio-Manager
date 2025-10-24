// src/hooks/usePortfolioData.js - FIXED: Reactive Cash Balance Loading and Processing
import { createSignal, createMemo, createEffect } from 'solid-js';
import {
    fetchPortfolioSummary,
    fetchPositions,
    fetchDividendCalendar,
    fetchPortfolioAnalysis,
    fetchCashBalances
} from '../api';
import { formatStockData, formatDividendCalendar } from '../services/formatters';
import { formatCurrency, formatPercent, convertToCAD } from '../utils/helpers';
import { DEFAULT_STATS } from '../utils/constants';
import { filterStocksByCurrency } from '../utils/currencyFilter';

export function usePortfolioData(selectedAccount, usdCadRate, currencyFilter) {
    const [stockData, setStockData] = createSignal([]);
    const [portfolioSummaryData, setPortfolioSummaryData] = createSignal([]);
    const [dividendCalendarData, setDividendCalendarData] = createSignal([]);
    const [portfolioAnalysisData, setPortfolioAnalysisData] = createSignal(null);
    const [statsData, setStatsData] = createSignal(DEFAULT_STATS);
    const [cashBalanceData, setCashBalanceData] = createSignal(null);
    const [isLoadingCash, setIsLoadingCash] = createSignal(false);

    // FIXED: Reactive cash balance processing with proper account filtering
    const processedCashBalance = createMemo(() => {
        const cashData = cashBalanceData();
        const account = selectedAccount();
        const rate = usdCadRate();
        
        console.log('🏦 Processing cash balance:', { cashData, account, rate });
        
        if (!cashData || !cashData.accounts || !account) {
            console.log('🏦 No cash data or account, returning defaults');
            return {
                totalCAD: 0,
                totalUSD: 0,
                totalInCAD: 0,
                breakdown: [],
                displayText: 'No Cash Data',
                accountCount: 0
            };
        }

        // FIXED: Use the summary data from backend
        const totalCAD = cashData.summary?.totalCAD || 0;
        const totalUSD = cashData.summary?.totalUSD || 0;

        // Process individual accounts for breakdown
        const aggregation = {};

        cashData.accounts.forEach(acc => {
            const accountType = acc.accountType || 'Cash';
            
            // FIXED: Extract cash from nested cashBalances array
            const cadBalance = acc.cashBalances?.find(cb => cb.currency === 'CAD')?.cash || 0;
            const usdBalance = acc.cashBalances?.find(cb => cb.currency === 'USD')?.cash || 0;
            
            console.log(`🏦 Processing: ${accountType}, CAD: ${cadBalance}, USD: ${usdBalance}`);

            if (!aggregation[accountType]) {
                aggregation[accountType] = { CAD: 0, USD: 0 };
            }

            aggregation[accountType].CAD += cadBalance;
            aggregation[accountType].USD += usdBalance;
        });

        const totalInCAD = totalCAD + convertToCAD(totalUSD, 'USD', rate);

        console.log('🏦 Aggregation result:', { totalCAD, totalUSD, totalInCAD });

        // Create breakdown array for display
        const breakdown = Object.entries(aggregation)
            .filter(([_, balances]) => balances.CAD > 0 || balances.USD > 0)
            .map(([accountType, balances]) => {
                const cadBalance = balances.CAD;
                const usdBalance = balances.USD;
                const totalInCAD = cadBalance + convertToCAD(usdBalance, 'USD', rate);
                
                return {
                    accountType,
                    cadBalance,
                    usdBalance,
                    totalInCAD
                };
            })
            .sort((a, b) => b.totalInCAD - a.totalInCAD);

        // Create display text in format: "Cash: $5000, FHSA: $452, TFSA: $5263"
        let displayText = '';
        if (breakdown.length === 0) {
            displayText = 'No Cash';
        } else {
            const formattedBreakdown = breakdown.map(item => {
                const cadBalance = item.cadBalance;
                const usdBalance = item.usdBalance;
                
                if (cadBalance > 0 && usdBalance > 0) {
                    const totalCAD = cadBalance + convertToCAD(usdBalance, 'USD', rate);
                    return `${item.accountType}: ${formatCurrency(totalCAD)}`;
                } else if (cadBalance > 0) {
                    return `${item.accountType}: ${formatCurrency(cadBalance)}`;
                } else if (usdBalance > 0) {
                    const cadEquivalent = convertToCAD(usdBalance, 'USD', rate);
                    return `${item.accountType}: ${formatCurrency(cadEquivalent)}`;
                }
                return '';
            }).filter(text => text.length > 0);
            
            displayText = formattedBreakdown.join(', ');
        }

        const result = {
            totalCAD,
            totalUSD,
            totalInCAD,
            breakdown,
            displayText,
            accountCount: cashData.accounts.length
        };

        console.log('🏦 Final processed cash balance:', result);
        return result;
    });

    // FIXED: Reactive cash balance loading function
    const loadCashBalances = async () => {
        setIsLoadingCash(true);
        try {
            const account = selectedAccount();
            console.log('🏦 Loading cash balances for account:', account);
            
            const cashData = await fetchCashBalances(account);
            setCashBalanceData(cashData);
            
            console.log('🏦 Cash balances loaded successfully:', cashData);
        } catch (error) {
            console.error('🏦 Failed to load cash balances:', error);
            setCashBalanceData({ accounts: [], summary: {} });
        } finally {
            setIsLoadingCash(false);
        }
    };

    const loadSummary = async () => {
        try {
            const account = selectedAccount();
            const summary = await fetchPortfolioSummary(account);

            if (summary) {
                let totalInvestmentCAD = 0;
                let currentValueCAD = 0;
                let unrealizedPnlCAD = 0;
                let totalDividendsReceivedCAD = 0;
                let monthlyDividendIncomeCAD = 0;
                let annualProjectedDividendCAD = 0;

                // FIXED: Calculate from positions array (backend returns different structure)
                // Track total annual dividends and total cost for YoC calculation (excluding excluded stocks)
                let totalAnnualDividendsForYoC = 0;
                let totalInvestmentForYoC = 0;

                if (summary.positions && Array.isArray(summary.positions)) {
                    // Apply currency filtering to positions before calculating stats
                    const filter = currencyFilter?.() || 'combined-cad';
                    const rate = usdCadRate();
                    const filteredPositions = filterStocksByCurrency(summary.positions, filter, rate);

                    console.log('[usePortfolioData] Applying currency filter to stats:', filter, 'Positions:', summary.positions.length, '->', filteredPositions.length);

                    filteredPositions.forEach(position => {
                        // After currency filtering, numeric values are in the target currency
                        // For 'cad-only'/'combined-cad': values are in CAD
                        // For 'usd-only'/'combined-usd': values are in USD
                        const quantity = position.openQuantity || 0;
                        const avgCost = position.averageEntryPrice || 0;
                        const currentPrice = position.currentPrice || 0;

                        // Calculate investment and current value
                        const investment = quantity * avgCost;
                        const currentValue = quantity * currentPrice;
                        const pnl = currentValue - investment;

                        // Just accumulate the values directly - they're already in the right currency
                        totalInvestmentCAD += investment;
                        currentValueCAD += currentValue;
                        unrealizedPnlCAD += pnl;

                        // Calculate dividend metrics from backend data
                        if (position.dividendData) {
                            const divData = position.dividendData;

                            totalDividendsReceivedCAD += (divData.totalReceived || 0);
                            monthlyDividendIncomeCAD += (divData.monthlyDividendPerShare || 0) * quantity;
                            annualProjectedDividendCAD += (divData.annualDividend || 0);

                            // FIXED: Calculate YoC from annual dividends, EXCLUDING stocks marked as excludedFromYoC
                            if (!position.excludedFromYoC && investment > 0) {
                                totalAnnualDividendsForYoC += (divData.annualDividend || 0);
                                totalInvestmentForYoC += investment;
                            }
                        }
                    });
                } else if (summary.accounts && Array.isArray(summary.accounts)) {
                    summary.accounts.forEach(acc => {
                        const currency = acc.currency || 'CAD';
                        totalInvestmentCAD += convertToCAD(acc.totalInvestment || 0, currency, usdCadRate());
                        currentValueCAD += convertToCAD(acc.currentValue || 0, currency, usdCadRate());
                        unrealizedPnlCAD += convertToCAD(acc.unrealizedPnl || 0, currency, usdCadRate());
                        totalDividendsReceivedCAD += convertToCAD(acc.totalDividendsReceived || 0, currency, usdCadRate());
                        monthlyDividendIncomeCAD += convertToCAD(acc.monthlyDividendIncome || 0, currency, usdCadRate());
                        annualProjectedDividendCAD += convertToCAD(acc.annualProjectedDividend || 0, currency, usdCadRate());
                    });
                } else {
                    const currency = summary.currency || 'CAD';
                    totalInvestmentCAD = convertToCAD(summary.totalInvestment || 0, currency, usdCadRate());
                    currentValueCAD = convertToCAD(summary.currentValue || 0, currency, usdCadRate());
                    unrealizedPnlCAD = convertToCAD(summary.unrealizedPnl || 0, currency, usdCadRate());
                    totalDividendsReceivedCAD = convertToCAD(summary.totalDividendsReceived || 0, currency, usdCadRate());
                    monthlyDividendIncomeCAD = convertToCAD(summary.monthlyDividendIncome || 0, currency, usdCadRate());
                    annualProjectedDividendCAD = convertToCAD(summary.annualProjectedDividend || 0, currency, usdCadRate());
                }

                const totalReturnValueCAD = unrealizedPnlCAD + totalDividendsReceivedCAD;

                const unrealizedPnlPercent = totalInvestmentCAD > 0
                    ? (unrealizedPnlCAD / totalInvestmentCAD) * 100
                    : 0;
                const totalReturnPercent = totalInvestmentCAD > 0
                    ? (totalReturnValueCAD / totalInvestmentCAD) * 100
                    : 0;

                // FIXED: Calculate YoC percentage from total annual dividends / total investment (excluding excluded stocks)
                const yieldOnCostPercent = totalInvestmentForYoC > 0
                    ? (totalAnnualDividendsForYoC / totalInvestmentForYoC) * 100
                    : 0;

                console.log(`[YoC Calculation] Annual Divs: ${totalAnnualDividendsForYoC.toFixed(2)}, Investment: ${totalInvestmentForYoC.toFixed(2)}, YoC: ${yieldOnCostPercent.toFixed(2)}%`);

                // Get processed cash balance for the cash balance card
                const cashBalance = processedCashBalance();

                // FIXED: Update stats with real data and integrated cash balance
                setStatsData([
                    {
                        // icon: '💰',
                        background: '#f59e0b',
                        title: 'TOTAL INVESTMENT',
                        value: formatCurrency(totalInvestmentCAD),
                        subtitle: `${summary.totalPositions || summary.numberOfPositions || 0} positions`,
                        tooltip: 'Total invested (CAD equivalent)',
                        rawValue: totalInvestmentCAD
                    },
                    {
                        // icon: '📈',
                        background: '#10b981',
                        title: 'CURRENT VALUE',
                        value: formatCurrency(currentValueCAD),
                        subtitle: 'Live pricing (CAD)',
                        tooltip: 'Current market value in CAD',
                        rawValue: currentValueCAD
                    },
                    {
                        // icon: '📊',
                        background: '#3b82f6',
                        title: 'UNREALIZED P&L',
                        value: formatCurrency(unrealizedPnlCAD),
                        subtitle: `${formatPercent(unrealizedPnlPercent)}`,
                        positive: unrealizedPnlCAD >= 0,
                        tooltip: 'Capital gains/losses',
                        rawValue: unrealizedPnlCAD,
                        percentValue: unrealizedPnlPercent
                    },
                    {
                        // icon: '💎',
                        background: '#ef4444',
                        title: 'TOTAL RETURN',
                        value: formatCurrency(totalReturnValueCAD),
                        subtitle: `${formatPercent(totalReturnPercent)} (incl. dividends)`,
                        positive: totalReturnValueCAD >= 0,
                        tooltip: 'Total return including dividends',
                        rawValue: totalReturnValueCAD,
                        percentValue: totalReturnPercent
                    },
                    {
                        // icon: '💵',
                        background: '#8b5cf6',
                        title: 'YIELD ON COST',
                        value: formatPercent(yieldOnCostPercent),
                        subtitle: `$${(totalAnnualDividendsForYoC / 12).toFixed(2)}/month`,
                        tooltip: 'Average dividend yield on cost basis (excluding non-dividend assets)',
                        rawValue: yieldOnCostPercent,
                        positive: true
                    },
                    // FIXED: Cash balance card with processed data and no icon
                    {
                        icon: '', // REMOVED: Cash balance icon as requested
                        background: '#06b6d4',
                        title: 'CASH BALANCE',
                        value: formatCurrency(cashBalance.totalInCAD),
                        subtitle: cashBalance.displayText,
                        tooltip: 'Available cash across selected accounts',
                        rawValue: cashBalance.totalInCAD,
                        positive: true,
                        isCashBalance: true,
                        breakdown: cashBalance.breakdown,
                        accountCount: cashBalance.accountCount
                    }
                ]);
                
                setPortfolioSummaryData([
                    {
                        title: 'Total Portfolio',
                        rows: [
                            { label: 'Investment (CAD):', value: formatCurrency(totalInvestmentCAD) },
                            { label: 'Current Value (CAD):', value: formatCurrency(currentValueCAD) },
                            { label: 'Total Return:', value: formatCurrency(totalReturnValueCAD), positive: totalReturnValueCAD >= 0 }
                        ]
                    },
                    {
                        title: 'Monthly Income',
                        rows: [
                            { label: 'Current:', value: formatCurrency(monthlyDividendIncomeCAD) },
                            { label: 'Annual Projected:', value: formatCurrency(annualProjectedDividendCAD) }
                        ]
                    },
                    {
                        title: 'Dividend Metrics',
                        rows: [
                            { label: 'Yield on Cost:', value: formatPercent(yieldOnCostPercent) },
                            { label: 'Avg Current Yield:', value: formatPercent(summary.averageYieldPercent) }
                        ]
                    },
                    {
                        title: 'Performance',
                        rows: [
                            { label: 'Total Return:', value: formatPercent(totalReturnPercent), positive: totalReturnPercent >= 0 },
                            { label: 'Positions:', value: String(summary.numberOfPositions || 0) },
                            { label: 'USD/CAD Rate:', value: usdCadRate().toFixed(4) }
                        ]
                    }
                ]);
            }
        } catch (err) {
            console.error('Failed to fetch portfolio summary', err);
        }
    };

    const loadPositions = async () => {
        try {
            const account = selectedAccount();
            const data = await fetchPositions(account, account.aggregate);
            const positions = Array.isArray(data) ? data : [];
            
            if (positions.length > 0) {
                const formattedStocks = formatStockData(positions, usdCadRate());
                
                // Log dividend filtering results
                const totalStocks = formattedStocks.length;
                const dividendStocks = formattedStocks.filter(s => s.isDividendStock);
                const irregularStocks = formattedStocks.filter(s => !s.isDividendStock && s.totalReceivedNum > 0);
                
                console.log(`🔍 Dividend Stock Analysis:`, {
                    totalStocks,
                    dividendStocks: dividendStocks.length,
                    irregularStocks: irregularStocks.length,
                    filtered: irregularStocks.map(s => ({
                        symbol: s.symbol,
                        totalReceived: s.totalReceivedNum,
                        frequencyAnalysis: s.dividendFrequencyAnalysis
                    }))
                });
                
                setStockData(formattedStocks);
            }
        } catch (err) {
            console.error('Failed to fetch positions', err);
        }
    };

    const loadDividends = async () => {
        try {
            const account = selectedAccount();
            const calendar = await fetchDividendCalendar(account);
            if (Array.isArray(calendar)) {
                const formattedCalendar = formatDividendCalendar(calendar, usdCadRate());
                setDividendCalendarData(formattedCalendar);
           }
       } catch (err) {
           // Dividend calendar endpoint not implemented yet - silently ignore
           console.warn('Dividend calendar not available:', err.message);
           setDividendCalendarData([]);
       }
   };

   const loadAnalysis = async () => {
       try {
           const account = selectedAccount();
           const analysis = await fetchPortfolioAnalysis(account);
           if (analysis) {
               setPortfolioAnalysisData(analysis);
           }
       } catch (err) {
           console.error('Failed to fetch portfolio analysis', err);
       }
   };

   // FIXED: Enhanced loadAllData function that includes cash balance loading
   const loadAllData = async () => {
       console.log('🔄 Loading all portfolio data...');
       await Promise.all([
           loadSummary(),
           loadPositions(),
           loadDividends(),
           loadAnalysis(),
           loadCashBalances() // FIXED: Ensure cash balances are loaded
       ]);
       console.log('✅ All portfolio data loaded');
   };

   // FIXED: Create effect to reload cash balances when account changes
   createEffect(async () => {
       const account = selectedAccount();
       if (account) {
           console.log('🏦 Account changed, reloading cash balances:', account);
           await loadCashBalances();
       }
   });

   // NEW: Create effect to reload stats when currency filter changes
   createEffect(async () => {
       const filter = currencyFilter?.();
       if (filter) {
           console.log('💱 Currency filter changed, recalculating stats:', filter);
           await loadSummary();
       }
   });

   // Portfolio dividend metrics computed value - ENHANCED with regular dividend filtering
   const portfolioDividendMetrics = createMemo(() => {
       const data = stockData();
       if (!data || data.length === 0) return [];

       // ENHANCED: Only include stocks with regular dividend patterns
       const dividendStocks = data.filter(s => s.isDividendStock);
       
       console.log(`💰 Portfolio Dividend Metrics: ${dividendStocks.length} regular dividend stocks out of ${data.length} total positions`);

       if (dividendStocks.length === 0) {
           return [
               { label: 'Current Yield', value: '0%' },
               { label: 'Yield on Cost', value: '0%' },
               { label: 'Div Adj. Avg Cost', value: '$0.00' },
               { label: 'Div Adj. Yield', value: '0%' },
               { label: 'TTM Yield', value: '0%' },
               { label: 'Monthly Average', value: '$0.00' },
               { label: 'Annual Projected', value: '$0.00' }
           ];
       }

       let totalValue = 0;
       let totalCost = 0;
       let totalMonthlyDiv = 0;
       let weightedYieldOnCost = 0;
       let weightedCurrentYield = 0;
       let totalDividendsReceived = 0;

       // Filter out excluded stocks for YoC calculation
       dividendStocks.forEach(s => {
           const positionCost = s.totalCostNum;
           const value = s.marketValueNum;
           const monthlyDiv = s.monthlyDividendNum;
           const yieldOnCost = s.yieldOnCostPercentNum;
           const currentYield = s.currentYieldPercentNum;
           const isExcluded = s.excludedFromYoC;

           totalCost += positionCost;
           totalValue += value;
           totalMonthlyDiv += monthlyDiv;

           // Only include non-excluded stocks in YoC calculation
           if (positionCost > 0 && !isExcluded) {
               weightedYieldOnCost += yieldOnCost * positionCost;
           }
           if (value > 0) {
               weightedCurrentYield += currentYield * value;
           }

           totalDividendsReceived += s.totalReceivedNum;
       });

       const avgYieldOnCost = totalCost > 0 ? weightedYieldOnCost / totalCost : 0;
       const avgCurrentYield = totalValue > 0 ? weightedCurrentYield / totalValue : 0;
       const divAdjustedCost = totalCost - totalDividendsReceived;
       const annualProjected = totalMonthlyDiv * 12;
       const divAdjYield = divAdjustedCost > 0 ? (annualProjected / divAdjustedCost) * 100 : 0;

       return [
           { label: 'Current Yield', value: formatPercent(avgCurrentYield) },
           { label: 'Yield on Cost', value: formatPercent(avgYieldOnCost) },
           { label: 'Div Adj. Avg Cost', value: formatCurrency(divAdjustedCost / Math.max(1, dividendStocks.length)) },
           { label: 'Div Adj. Yield', value: formatPercent(divAdjYield) },
           { label: 'TTM Yield', value: formatPercent(avgCurrentYield) },
           { label: 'Monthly Average', value: formatCurrency(totalMonthlyDiv) },
           { label: 'Annual Projected', value: formatCurrency(annualProjected) }
       ];
   });

   return {
       stockData,
       portfolioSummaryData,
       dividendCalendarData,
       portfolioAnalysisData,
       statsData,
       portfolioDividendMetrics,
       cashBalanceData,
       processedCashBalance,
       isLoadingCash,
       setStockData,
       loadAllData,
       loadSummary,
       loadPositions,
       loadDividends,
       loadAnalysis,
       loadCashBalances
   };
}