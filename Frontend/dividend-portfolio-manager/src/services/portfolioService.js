// src/services/portfolioService.js - ENHANCED WITH DIVIDEND FREQUENCY FILTERING
import { syncAllPersons, syncPerson } from '../api';

export class PortfolioService {
    static async runQuestrade(selectedAccount, isLoading, setIsLoading, setLastQuestradeRun, loadExchangeRate, loadAllData) {
        if (isLoading()) return;
        
        setIsLoading(true);
        try {
            const account = selectedAccount();
            
            if (account.personName) {
                await syncPerson(account.personName, false);
            } else {
                await syncAllPersons(false);
            }
            
            // Reload exchange rate and all data after sync
            await loadExchangeRate();
            await loadAllData();
            // Don't set lastQuestradeRun here - let App.jsx load it from the API with proper Calgary timezone
        } catch (err) {
            console.error('Failed to run sync:', err);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }

    // ENHANCED: updateStatsWithLivePrice function with dividend filtering + YoC exclusions
    static updateStatsWithLivePrice(stockData, statsData, formatCurrency, formatPercent) {
        const stocks = stockData();
        if (stocks.length === 0) return;

        const totalValue = stocks.reduce((sum, s) => sum + s.marketValueNum, 0);
        const totalCost = stocks.reduce((sum, s) => sum + s.totalCostNum, 0);
        const unrealizedPnl = totalValue - totalCost;
        const unrealizedPnlPercent = totalCost > 0 ? (unrealizedPnl / totalCost) * 100 : 0;

        // ENHANCED: Only include regular dividend stocks in dividend calculations
        const regularDividendStocks = stocks.filter(s => s.isDividendStock);
        const totalDividendsReceived = regularDividendStocks.reduce((sum, s) => sum + s.totalReceivedNum, 0);
        const totalReturnValue = unrealizedPnl + totalDividendsReceived;
        const totalReturnPercent = totalCost > 0 ? (totalReturnValue / totalCost) * 100 : 0;

        // ENHANCED: Calculate yield on cost only from regular dividend stocks that are NOT excluded
        // Filter out stocks marked as excludedFromYoC (from backend)
        const includedDividendStocks = regularDividendStocks.filter(s => !s.excludedFromYoC);
        const totalAnnualDividends = includedDividendStocks.reduce((sum, s) => sum + s.annualDividendNum, 0);

        // Calculate total cost only for included stocks for accurate YoC percentage
        const includedStocksCost = includedDividendStocks.reduce((sum, s) => sum + s.totalCostNum, 0);
        const yieldOnCostPercent = includedStocksCost > 0 && totalAnnualDividends > 0
           ? (totalAnnualDividends / includedStocksCost) * 100
           : 0;

        // Log dividend filtering for debugging
        const excludedCount = regularDividendStocks.length - includedDividendStocks.length;
        console.log(`📊 Live Stats Update: ${includedDividendStocks.length} dividend stocks included in YoC (${excludedCount} excluded) out of ${stocks.length} total`);

       statsData(prev => {
           // CRITICAL FIX: Check if values actually changed before creating new objects
           // This prevents unnecessary re-renders and stat card blinking
           const newTotalCostValue = formatCurrency(totalCost);
           const newTotalValue = formatCurrency(totalValue);
           const newUnrealizedPnlValue = formatCurrency(unrealizedPnl);
           const newUnrealizedPnlSubtitle = formatPercent(unrealizedPnlPercent);
           const newTotalReturnValue = formatCurrency(totalReturnValue);
           const newTotalReturnSubtitle = `${formatPercent(totalReturnPercent)} (incl. dividends)`;
           const newYoCValue = formatPercent(yieldOnCostPercent);
           const newYoCSubtitle = `$${(totalAnnualDividends / 12).toFixed(2)}/month`;

           // Check if any values actually changed
           const hasChanges =
               prev[0]?.value !== newTotalCostValue ||
               prev[1]?.value !== newTotalValue ||
               prev[2]?.value !== newUnrealizedPnlValue ||
               prev[2]?.subtitle !== newUnrealizedPnlSubtitle ||
               prev[3]?.value !== newTotalReturnValue ||
               prev[3]?.subtitle !== newTotalReturnSubtitle ||
               prev[4]?.value !== newYoCValue ||
               prev[4]?.subtitle !== newYoCSubtitle;

           // If nothing changed, return the same array reference to prevent re-render
           if (!hasChanges) {
               return prev;
           }

           // Keep the cash balance card data (6th card) unchanged during live price updates
           const newStats = [
               { ...prev[0], value: newTotalCostValue },
               { ...prev[1], value: newTotalValue },
               {
                   ...prev[2],
                   value: newUnrealizedPnlValue,
                   subtitle: newUnrealizedPnlSubtitle,
                   positive: unrealizedPnl >= 0,
                   rawValue: unrealizedPnl,
                   percentValue: unrealizedPnlPercent
               },
               {
                   ...prev[3],
                   value: newTotalReturnValue,
                   subtitle: newTotalReturnSubtitle,
                   positive: totalReturnValue >= 0,
                   rawValue: totalReturnValue,
                   percentValue: totalReturnPercent
               },
               {
                   ...prev[4],
                   value: newYoCValue,
                   subtitle: newYoCSubtitle,
                   rawValue: yieldOnCostPercent
               }
           ];

           // Preserve the 6th card (Cash Balance) if it exists
           if (prev.length >= 6) {
               newStats.push(prev[5]); // Keep cash balance card unchanged
           }

           return newStats;
       });
   }
}