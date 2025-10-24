// src/utils/constants.js - FIXED: Updated Default Stats with Cash Balance icon removed
export const DEFAULT_USD_CAD_RATE = 1.3938;

export const POLLING_INTERVALS = {
    QUOTES: 30000, // FIXED: Changed from 5s to 30s to respect Questrade snap quote limits (20 req/sec, 15k req/hour)
    EXCHANGE_RATE: 15 * 60 * 1000, // 15 minutes
    POSITIONS: 60000, // 60 seconds (reduced from 30s to lower API calls)
};

export const CURRENCY = {
    USD: 'USD',
    CAD: 'CAD',
};

export const ACCOUNT_TYPES = {
    TFSA: 'TFSA',
    RRSP: 'RRSP',
    FHSA: 'FHSA',
    CASH: 'Cash',
    MARGIN: 'Margin',
    USD: 'USD',
};

export const VIEW_MODES = {
    ALL: 'all',
    PERSON: 'person',
    ACCOUNT: 'account',
};

export const TABS = {
    HOLDINGS: 'holdings',
    PORTFOLIO_ANALYSIS: 'portfolioAnalysis',
    BACKTEST: 'backtest',
    SETTINGS: 'settings',
};

// FIXED: Default stats with CASH BALANCE icon removed as requested
export const DEFAULT_STATS = [
    { 
        icon: '💰', 
        background: '#f59e0b', 
        title: 'TOTAL INVESTMENT', 
        value: '$0.00', 
        subtitle: '0 positions', 
        tooltip: 'Total invested (CAD equivalent)' 
    },
    { 
        icon: '📈', 
        background: '#10b981', 
        title: 'CURRENT VALUE', 
        value: '$0.00', 
        subtitle: 'Live pricing', 
        tooltip: 'Current market value (CAD)' 
    },
    { 
        icon: '📊', 
        background: '#3b82f6', 
        title: 'UNREALIZED P&L', 
        value: '$0.00', 
        subtitle: '0%', 
        positive: false, 
        tooltip: 'Capital gains/losses' 
    },
    { 
        icon: '💎', 
        background: '#ef4444', 
        title: 'TOTAL RETURN', 
        value: '$0.00', 
        subtitle: '0% (incl. dividends)', 
        positive: false, 
        tooltip: 'Total return with dividends' 
    },
    { 
        icon: '💵', 
        background: '#8b5cf6', 
        title: 'YIELD ON COST', 
        value: '0.00%', 
        subtitle: 'Average yield', 
        tooltip: 'Dividend yield on cost basis',
        positive: true
    },
    // FIXED: CASH BALANCE card with icon removed and proper format
    { 
        icon: '', // REMOVED: Cash balance icon as requested
        background: '#06b6d4', 
        title: 'CASH BALANCE', 
        value: '$0.00', 
        subtitle: 'No Cash Data', // Default subtitle when no data
        tooltip: 'Available cash across selected accounts',
        positive: true,
        isCashBalance: true,
        breakdown: [],
        accountCount: 0
    }
];