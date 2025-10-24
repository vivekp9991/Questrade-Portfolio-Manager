// src/services/dataProcessing.js
import { VIEW_MODES } from '../utils/constants';

export class DataProcessor {
    static getAccountContext(selectedAccount) {
        const account = selectedAccount?.();
        if (!account) return null;
        
        return {
            viewMode: account.viewMode,
            personName: account.personName,
            label: account.label,
            isAggregated: account.viewMode === VIEW_MODES.ALL || (account.viewMode === VIEW_MODES.PERSON && account.aggregate)
        };
    }

    static getAccountContextText(selectedAccount) {
        const context = this.getAccountContext(selectedAccount);
        if (!context) return null;
        
        switch (context.viewMode) {
            case VIEW_MODES.ALL:
                return 'All Accounts (Everyone)';
            case VIEW_MODES.PERSON:
                return `${context.personName}${context.isAggregated ? ' (All Accounts)' : ''}`;
            case VIEW_MODES.ACCOUNT:
                return context.label;
            default:
                return null;
        }
    }

    static shouldShowAggregationInfo(selectedAccount) {
        const account = selectedAccount?.();
        return account && (account.viewMode === VIEW_MODES.ALL || account.viewMode === VIEW_MODES.PERSON) && account.aggregate;
    }

    static getAggregationStats(stockData) {
        const stocks = stockData();
        const aggregatedStocks = stocks.filter(s => s.isAggregated);
        const totalAccounts = stocks.reduce((sum, s) => sum + (s.accountCount || s.individualPositions?.length || 1), 0);
        return {
            totalStocks: stocks.length,
            aggregatedStocks: aggregatedStocks.length,
            totalAccounts: totalAccounts
        };
    }

    static getMarketStatus() {
        const now = new Date();
        const hour = now.getHours();
        const day = now.getDay();
        
        // Simple market hours check (9:30 AM - 4:00 PM ET, Mon-Fri)
        if (day === 0 || day === 6) return 'closed'; // Weekend
        if (hour < 9 || (hour === 9 && now.getMinutes() < 30)) return 'pre-market';
        if (hour >= 16) return 'closed';
        return 'open';
    }
}