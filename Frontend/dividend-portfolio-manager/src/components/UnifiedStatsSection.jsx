// src/components/UnifiedStatsSection.jsx - FIXED: Remove red border and improve USD/CAD conversion + Currency Filter
import { createSignal, onMount, onCleanup, Index, Show, createMemo, createEffect } from 'solid-js';
import AccountSelector from './AccountSelector';
import CurrencySwitcher from './CurrencySwitcher';
import { fetchCashBalances } from '../api';
import { useExchangeRate } from '../hooks/useExchangeRate';
import { formatCurrency, convertToCAD } from '../utils/helpers';
import { DEFAULT_USD_CAD_RATE } from '../utils/constants';

function UnifiedStatsSection(props) {
    const [cashData, setCashData] = createSignal(null);
    const [lastUpdate, setLastUpdate] = createSignal(null);
    const [cashError, setCashError] = createSignal(null);
    const [isLoadingCash, setIsLoadingCash] = createSignal(false);

    const formatCompactCurrency = (amount, currency = 'CAD') => {
        const value = Number(amount) || 0;
        if (value >= 1000000) {
            return `${currency === 'USD' ? '$' : 'C$'}${(value / 1000000).toFixed(1)}M`;
        } else if (value >= 1000) {
            return `${currency === 'USD' ? '$' : 'C$'}${(value / 1000).toFixed(0)}K`;
        }
        return `${currency === 'USD' ? '$' : 'C$'}${value.toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    };

    // FIXED: Enhanced cash balance loading with better error handling and debugging
    const loadCashBalances = async () => {
        setIsLoadingCash(true);
        setCashError(null);
        
        try {
            const account = props.selectedAccount?.();
            console.log('🏦 UnifiedStatsSection: Loading cash balances for account:', account);
            
            if (!account) {
                console.log('🏦 No account selected, skipping cash balance load');
                return;
            }
            
            const data = await fetchCashBalances(account);
            console.log('🏦 UnifiedStatsSection: Cash balance API response:', data);
            
            setCashData(data || { accounts: [], summary: { totalAccounts: 0, totalPersons: 0, totalCAD: 0, totalUSD: 0 } });
            setLastUpdate(new Date());
            
            console.log('🏦 UnifiedStatsSection: Cash data set successfully');
        } catch (error) {
            console.error('🏦 UnifiedStatsSection: Failed to load cash balances:', error);
            setCashError(error.message);
            setCashData({ accounts: [], summary: { totalAccounts: 0, totalPersons: 0, totalCAD: 0, totalUSD: 0 } });
        } finally {
            setIsLoadingCash(false);
        }
    };

    // FIXED: Enhanced USD/CAD conversion for TFSA and other account types
    const processedCashBalance = createMemo(() => {
        const data = cashData();
        const account = props.selectedAccount?.();
        const rate = props.usdCadRate?.() || 1.35;

        console.log('🏦 UnifiedStatsSection: Processing cash balance data:', {
            hasData: !!data,
            hasAccount: !!account,
            accountsCount: data?.accounts?.length || 0,
            rate
        });

        // FIXED: Allow cash balance to show even without a specific account selected (for "All Accounts" view)
        if (!data || !data.accounts || data.accounts.length === 0) {
            console.log('🏦 UnifiedStatsSection: No data available, returning defaults');
            return {
                totalCAD: 0,
                totalUSD: 0,
                totalInCAD: 0,
                breakdown: [],
                displayText: 'No Cash',
                accountCount: 0
            };
        }

        // FIXED: Enhanced aggregation by account type with proper USD/CAD conversion
        const aggregation = {};
        let totalCAD = 0;
        let totalUSD = 0;
        
        data.accounts.forEach(acc => {
            const accountType = acc.accountType || 'Cash';
            
            // FIXED: Extract cash from nested cashBalances array with better handling
            const cadBalance = acc.cashBalances?.find(cb => cb.currency === 'CAD')?.cash || 0;
            const usdBalance = acc.cashBalances?.find(cb => cb.currency === 'USD')?.cash || 0;
            
            console.log(`🏦 Processing account ${acc.accountName} (${accountType}): CAD=${cadBalance}, USD=${usdBalance}`);
            
            if (!aggregation[accountType]) {
                aggregation[accountType] = { CAD: 0, USD: 0, totalInCAD: 0 };
            }
            
            aggregation[accountType].CAD += cadBalance;
            aggregation[accountType].USD += usdBalance;
            
            // FIXED: Proper conversion for each account type
            const cadEquivalent = cadBalance + convertToCAD(usdBalance, 'USD', rate);
            aggregation[accountType].totalInCAD += cadEquivalent;
            
            totalCAD += cadBalance;
            totalUSD += usdBalance;
        });

        const totalInCAD = totalCAD + convertToCAD(totalUSD, 'USD', rate);

        console.log('🏦 UnifiedStatsSection: Aggregation result:', { aggregation, totalCAD, totalUSD, totalInCAD });

        // Create breakdown array for display, sorted by total value
        const breakdown = Object.entries(aggregation)
            .filter(([_, balances]) => balances.totalInCAD > 0)
            .map(([accountType, balances]) => ({
                accountType,
                cadBalance: balances.CAD,
                usdBalance: balances.USD,
                totalInCAD: balances.totalInCAD,
                // FIXED: Enhanced display formatting for mixed currencies
                displayValue: balances.CAD > 0 && balances.USD > 0 
                    ? `${formatCurrency(balances.totalInCAD)} (CAD + USD)` 
                    : balances.CAD > 0 
                        ? formatCurrency(balances.CAD)
                        : formatCurrency(balances.totalInCAD)
            }))
            .sort((a, b) => b.totalInCAD - a.totalInCAD);

        // FIXED: Enhanced display text with better currency handling
        let displayText = '';
        if (breakdown.length === 0) {
            displayText = 'No Cash';
        } else {
            const formattedBreakdown = breakdown.map(item => {
                return `${item.accountType}: ${formatCurrency(item.totalInCAD)}`;
            });
            
            displayText = formattedBreakdown.join(', ');
        }

        const result = {
            totalCAD,
            totalUSD,
            totalInCAD,
            breakdown,
            displayText,
            accountCount: data.accounts.length
        };

        console.log('🏦 UnifiedStatsSection: Final processed cash balance:', result);
        return result;
    });

    // Enhanced stats with proper CASH BALANCE formatting - NO ICON - SHOW CAD/USD SEPARATELY
    // FIXED: Use createMemo with previous value comparison to prevent unnecessary re-renders
    const enhancedStats = createMemo((prev) => {
        const stats = props.stats || [];
        const cashBalance = processedCashBalance();

        // NEW: Display separate CAD and USD amounts without conversion
        const cadAmount = cashBalance.totalCAD || 0;
        const usdAmount = cashBalance.totalUSD || 0;

        // Format as multi-line text showing both currencies
        const cadLine = cadAmount > 0 ? `CAD: ${formatCurrency(cadAmount)}` : '';
        const usdLine = usdAmount > 0 ? `USD: ${formatCurrency(usdAmount)}` : '';

        let displayValue = '';
        if (cadLine && usdLine) {
            displayValue = `${cadLine}\n${usdLine}`;
        } else if (cadLine) {
            displayValue = cadLine;
        } else if (usdLine) {
            displayValue = usdLine;
        } else {
            displayValue = '$0.00';
        }

        const displaySubtitle = cashBalance.accountCount > 0
            ? `${cashBalance.accountCount} account${cashBalance.accountCount > 1 ? 's' : ''}`
            : 'No Cash';

        const newStats = stats.map((stat, index) => {
            // Update CASH BALANCE card with proper format and REMOVE ICON
            if (stat.title === 'CASH BALANCE' || stat.isCashBalance) {
                return {
                    ...stat,
                    icon: '', // REMOVED: Cash balance icon as requested
                    value: displayValue,
                    subtitle: displaySubtitle,
                    contextSensitive: true,
                    showTrend: false,
                    isCashBalance: true,
                    breakdown: cashBalance.breakdown,
                    accountCount: cashBalance.accountCount,
                    cadAmount,
                    usdAmount
                };
            }

            return {
                ...stat,
                contextSensitive: true,
                showTrend: stat.positive !== undefined
            };
        });

        // CRITICAL FIX: Check if values actually changed before returning new array
        // This prevents unnecessary re-renders when values haven't changed
        if (prev && prev.length === newStats.length) {
            let hasChanges = false;
            for (let i = 0; i < newStats.length; i++) {
                if (prev[i].value !== newStats[i].value ||
                    prev[i].subtitle !== newStats[i].subtitle ||
                    prev[i].positive !== newStats[i].positive) {
                    hasChanges = true;
                    break;
                }
            }
            // If nothing changed, return previous array to prevent re-render
            if (!hasChanges) {
                return prev;
            }
        }

        return newStats;
    });

    // FIXED: Create effect to load cash balances when account changes
    createEffect(() => {
        const account = props.selectedAccount?.();
        if (account) {
            console.log('🏦 UnifiedStatsSection: Account changed, reloading cash balances:', account);
            loadCashBalances();
        }
    });

    // FIXED: Create effect to reload cash balances when USD/CAD rate changes
    createEffect(() => {
        const rate = props.usdCadRate?.();
        if (rate && cashData()) {
            console.log('🏦 UnifiedStatsSection: Exchange rate changed, triggering cash balance recalculation:', rate);
            // The processedCashBalance memo will automatically recalculate when rate changes
        }
    });

    onMount(() => {
        console.log('🏦 UnifiedStatsSection mounted');
        loadCashBalances();
        
        // Reload cash balances every 5 minutes
        const interval = setInterval(() => {
            console.log('🏦 UnifiedStatsSection: Periodic cash balance reload');
            loadCashBalances();
        }, 5 * 60 * 1000);
        
        onCleanup(() => {
            clearInterval(interval);
        });
    });

    return (
        <div class="stats-section-with-controls">
            {/* Control Bar - positioned above the stats grid */}
            <div class="stats-control-bar">
                <div class="control-left">
                    <AccountSelector
                        selectedAccount={props.selectedAccount}
                        onAccountChange={props.onAccountChange}
                        disabled={props.isLoading?.()}
                    />
                    <CurrencySwitcher
                        value={props.currencyFilter?.()}
                        onChange={props.onCurrencyFilterChange}
                    />
                    <div class="exchange-rate-display">
                        <span class="rate-label">USD/CAD:</span>
                        <span class="rate-value">{props.usdCadRate?.()?.toFixed(4) || DEFAULT_USD_CAD_RATE.toFixed(4)}</span>
                    </div>
                </div>
                
                <div class="control-right">
                    <div class="live-indicator">
                        <div class="live-dot"></div>
                        <span class="live-text">Live</span>
                    </div>
                    <button 
                        class="sync-data-btn" 
                        onClick={props.runQuestrade}
                        disabled={props.isLoading?.()}
                    >
                        {props.isLoading?.() ? 'Syncing...' : 'Sync Data'}
                    </button>
                    <div class="last-sync-time">
                        Last sync: {props.lastRun?.() || 'Never'}
                    </div>
                </div>
            </div>

            {/* Debug info removed - errors are logged to console instead */}

            {/* 6 Stats Cards - CRITICAL FIX: Use Index instead of For to prevent DOM re-creation */}
            <div class="stats-grid-container">
                <div class="stats-grid">
                    <Index each={enhancedStats()} fallback={<div>Loading...</div>}>
                        {(stat, index) => {
                            // Index component uses index as key, preventing card DOM re-creation
                            // stat() is a signal that updates reactively without unmounting/remounting
                            return (
                                <div class={`stat-card ${stat().isCashBalance ? 'cash-balance-card' : ''}`} data-stat-index={index}>
                                    {/* Original card content without overlay controls */}
                                    <div class="stat-header">
                                        <div class="stat-info">
                                            {/* FIXED: Only show icon if it exists (cash balance icon removed) */}
                                            <Show when={stat().icon}>
                                                <div class="stat-icon" style={{
                                                    background: `linear-gradient(135deg, ${stat().background}, ${stat().background}dd)`
                                                }}>
                                                    {stat().icon}
                                                </div>
                                            </Show>
                                            <div class="stat-title-section">
                                                <div class="stat-title">{stat().title}</div>
                                            </div>
                                        </div>
                                        <div class="stat-trend">
                                            <Show when={stat().showTrend && stat().positive !== undefined}>
                                                <div class={`trend-indicator ${stat().positive ? 'positive' : 'negative'}`}>
                                                    {stat().positive ? '↗' : '↘'}
                                                </div>
                                            </Show>
                                        </div>
                                    </div>

                                    <div class={`stat-value ${stat().positive ? 'positive' : stat().positive === false ? 'negative' : ''}`}>
                                        {stat().value}
                                    </div>

                                    <div class={`stat-subtitle ${stat().positive ? 'positive' : stat().positive === false ? 'negative' : ''}`}>
                                        {stat().subtitle}
                                    </div>

                                    {/* REMOVED: Cash Balance Breakdown section to eliminate red box */}
                                </div>
                            );
                        }}
                    </Index>
                </div>
            </div>
        </div>
    );
}

export default UnifiedStatsSection;