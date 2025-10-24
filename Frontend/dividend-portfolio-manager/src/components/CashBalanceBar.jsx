// src/components/CashBalanceBar.jsx - FIXED VERSION WITH BETTER ERROR HANDLING
import { createSignal, onMount, onCleanup, For, Show, createMemo } from 'solid-js';
import { fetchCashBalances, fetchExchangeRate } from '../api';

function CashBalanceBar() {
    const [cashData, setCashData] = createSignal(null);
    const [usdCadRate, setUsdCadRate] = createSignal(1.35);
    const [isLoading, setIsLoading] = createSignal(true);
    const [isExpanded, setIsExpanded] = createSignal(false);
    const [lastUpdate, setLastUpdate] = createSignal(null);
    const [hoveredAccount, setHoveredAccount] = createSignal(null);
    const [error, setError] = createSignal(null);

    const formatCurrency = (amount, currency = 'CAD', showSymbol = true) => {
        const value = Number(amount) || 0;
        if (showSymbol) {
            const symbol = currency === 'USD' ? 'US$' : 'C$';
            return `${symbol}${value.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
        return value.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const convertToCAD = (amount, currency) => {
        if (currency === 'USD') {
            return amount * usdCadRate();
        }
        return amount;
    };

    const loadCashBalances = async () => {
        setIsLoading(true);
        setError(null);
        
        try {
            console.log('Loading cash balances...');
            
            // Load exchange rate first
            try {
                const rate = await fetchExchangeRate('USD', 'CAD');
                setUsdCadRate(rate);
                console.log('Exchange rate loaded:', rate);
            } catch (rateError) {
                console.warn('Failed to load exchange rate, using default:', rateError);
                // Continue with default rate
            }

            // Load cash balances
            const data = await fetchCashBalances();
            console.log('Cash balances loaded:', data);
            
            if (data) {
                setCashData(data);
                setLastUpdate(new Date());
                console.log('Cash data set successfully');
            } else {
                console.warn('No cash data returned');
                setCashData({ accounts: [], summary: { totalAccounts: 0, totalPersons: 0, totalCAD: 0 } });
            }
        } catch (error) {
            console.error('Failed to load cash balances:', error);
            setError(error.message || 'Failed to load cash balances');
            // Set empty data on error
            setCashData({ accounts: [], summary: { totalAccounts: 0, totalPersons: 0, totalCAD: 0 } });
        } finally {
            setIsLoading(false);
        }
    };

    // Calculate totals and grouped data
    const processedData = createMemo(() => {
        const data = cashData();
        if (!data || !data.accounts) {
            console.log('No cash data or accounts to process');
            return null;
        }

        let totalCAD = 0;
        let totalUSD = 0;
        const personGroups = {};

        console.log('Processing cash data:', data);

        // Process each account
        data.accounts.forEach(account => {
            const personName = account.personName || 'Unknown';
            const currency = account.currency || 'CAD';
            const cashBalance = Number(account.cashBalance) || 0;

            if (!personGroups[personName]) {
                personGroups[personName] = {
                    personName,
                    accounts: [],
                    totalCAD: 0,
                    totalUSD: 0,
                    totalInCAD: 0
                };
            }

            personGroups[personName].accounts.push({
                accountId: account.accountId,
                accountName: account.accountName || account.accountType || 'Unknown',
                accountType: account.accountType,
                cashBalance,
                currency,
                cashBalanceCAD: convertToCAD(cashBalance, currency)
            });

            if (currency === 'USD') {
                personGroups[personName].totalUSD += cashBalance;
                totalUSD += cashBalance;
            } else {
                personGroups[personName].totalCAD += cashBalance;
                totalCAD += cashBalance;
            }
            
            const cadEquivalent = convertToCAD(cashBalance, currency);
            personGroups[personName].totalInCAD += cadEquivalent;
        });

        const totalInCAD = totalCAD + convertToCAD(totalUSD, 'USD');

        const result = {
            totalCAD,
            totalUSD,
            totalInCAD,
            personGroups: Object.values(personGroups),
            accountCount: data.accounts?.length || 0
        };

        console.log('Processed cash data:', result);
        return result;
    });

    // Get color for account type
    const getAccountColor = (accountType) => {
        const colors = {
            'TFSA': '#10b981',
            'RRSP': '#3b82f6',
            'FHSA': '#8b5cf6',
            'Cash': '#f59e0b',
            'Margin': '#ef4444',
            'USD': '#06b6d4',
            'default': '#64748b'
        };
        return colors[accountType] || colors.default;
    };

    // Get icon for account type
    const getAccountIcon = (accountType) => {
        const icons = {
            'TFSA': '🔒',
            'RRSP': '📈',
            'FHSA': '🏠',
            'Cash': '💰',
            'Margin': '⚡',
            'USD': '💵',
            'default': '🏦'
        };
        return icons[accountType] || icons.default;
    };

    // Calculate percentage of total
    const getPercentage = (amount, total) => {
        if (total === 0) return 0;
        return ((amount / total) * 100).toFixed(1);
    };

    onMount(() => {
        console.log('CashBalanceBar mounted');
        loadCashBalances();
        
        // Refresh every 5 minutes
        const interval = setInterval(loadCashBalances, 5 * 60 * 1000);
        
        onCleanup(() => {
            clearInterval(interval);
        });
    });

    return (
        <div class="cash-balance-bar">
            <Show when={isLoading() && !cashData()}>
                <div class="cash-loading">
                    <div class="loading-spinner"></div>
                    <span>Loading cash balances...</span>
                </div>
            </Show>

            <Show when={error()}>
                <div class="cash-error">
                    <div class="error-icon">⚠️</div>
                    <span>Error loading cash balances: {error()}</span>
                    <button 
                        class="retry-btn"
                        onClick={loadCashBalances}
                        disabled={isLoading()}
                    >
                        Retry
                    </button>
                </div>
            </Show>

            <Show when={!isLoading() && !error() && processedData()}>
                <div class="cash-container">
                    {/* Summary Section */}
                    <div class="cash-summary">
                        <div class="cash-total-section">
                            <div class="cash-icon">💵</div>
                            <div class="cash-totals">
                                <div class="cash-total-main">
                                    <span class="cash-label">Total Cash:</span>
                                    <span class="cash-value-main">
                                        {formatCurrency(processedData().totalInCAD, 'CAD')}
                                    </span>
                                </div>
                                <div class="cash-breakdown">
                                    <Show when={processedData().totalCAD > 0}>
                                        <span class="cash-currency-item">
                                            CAD: {formatCurrency(processedData().totalCAD, 'CAD')}
                                        </span>
                                    </Show>
                                    <Show when={processedData().totalUSD > 0}>
                                        <span class="cash-currency-item">
                                            USD: {formatCurrency(processedData().totalUSD, 'USD')}
                                            <span class="exchange-rate">
                                                (@{usdCadRate().toFixed(4)})
                                            </span>
                                        </span>
                                    </Show>
                                </div>
                            </div>
                        </div>

                        {/* Visual Distribution Bar */}
                        <div class="cash-distribution">
                            <div class="distribution-bar">
                                <For each={processedData().personGroups}>
                                    {(person, index) => {
                                        const percentage = getPercentage(person.totalInCAD, processedData().totalInCAD);
                                        return (
                                            <div 
                                                class="distribution-segment"
                                                style={{
                                                    width: `${percentage}%`,
                                                    background: `hsl(${index() * 60 + 200}, 70%, 50%)`
                                                }}
                                                title={`${person.personName}: ${formatCurrency(person.totalInCAD, 'CAD')} (${percentage}%)`}
                                                onMouseEnter={() => setHoveredAccount(person.personName)}
                                                onMouseLeave={() => setHoveredAccount(null)}
                                            >
                                                <Show when={percentage > 10}>
                                                    <span class="segment-label">{percentage}%</span>
                                                </Show>
                                            </div>
                                        );
                                    }}
                                </For>
                            </div>
                            <div class="distribution-legend">
                                <For each={processedData().personGroups}>
                                    {(person, index) => (
                                        <div 
                                            class={`legend-item ${hoveredAccount() === person.personName ? 'highlighted' : ''}`}
                                            onMouseEnter={() => setHoveredAccount(person.personName)}
                                            onMouseLeave={() => setHoveredAccount(null)}
                                        >
                                            <div 
                                                class="legend-color" 
                                                style={{
                                                    background: `hsl(${index() * 60 + 200}, 70%, 50%)`
                                                }}
                                            ></div>
                                            <span class="legend-name">{person.personName}</span>
                                            <span class="legend-value">
                                                {formatCurrency(person.totalInCAD, 'CAD')}
                                            </span>
                                        </div>
                                    )}
                                </For>
                            </div>
                        </div>

                        {/* Toggle Details Button */}
                        <button 
                            class="expand-toggle"
                            onClick={() => setIsExpanded(!isExpanded())}
                            title={isExpanded() ? 'Hide details' : 'Show details'}
                        >
                            <span class="toggle-icon">{isExpanded() ? '▼' : '▶'}</span>
                            <span class="toggle-text">
                                {isExpanded() ? 'Hide' : 'Show'} Details
                            </span>
                        </button>
                    </div>

                    {/* Expanded Details Section */}
                    <Show when={isExpanded()}>
                        <div class="cash-details">
                            <For each={processedData().personGroups}>
                                {person => (
                                    <div class="person-cash-group">
                                        <div class="person-header">
                                            <div class="person-info">
                                                <span class="person-icon">👤</span>
                                                <span class="person-name">{person.personName}</span>
                                                <span class="person-accounts">
                                                    ({person.accounts.length} {person.accounts.length === 1 ? 'account' : 'accounts'})
                                                </span>
                                            </div>
                                            <div class="person-total">
                                                <span class="total-label">Total:</span>
                                                <span class="total-value">
                                                    {formatCurrency(person.totalInCAD, 'CAD')}
                                                </span>
                                                <Show when={person.totalUSD > 0}>
                                                    <span class="usd-amount">
                                                        (includes {formatCurrency(person.totalUSD, 'USD')})
                                                    </span>
                                                </Show>
                                            </div>
                                        </div>
                                        <div class="person-accounts-list">
                                            <For each={person.accounts}>
                                                {account => (
                                                    <div class="account-cash-item">
                                                        <div class="account-info">
                                                            <span class="account-icon">
                                                                {getAccountIcon(account.accountType)}
                                                            </span>
                                                            <span class="account-name">{account.accountName}</span>
                                                            <span 
                                                                class="account-type-badge"
                                                                style={{
                                                                    background: `${getAccountColor(account.accountType)}20`,
                                                                    color: getAccountColor(account.accountType),
                                                                    border: `1px solid ${getAccountColor(account.accountType)}40`
                                                                }}
                                                            >
                                                                {account.accountType}
                                                            </span>
                                                        </div>
                                                        <div class="account-balance">
                                                            <span class="balance-value">
                                                                {formatCurrency(account.cashBalance, account.currency)}
                                                            </span>
                                                            <Show when={account.currency === 'USD'}>
                                                                <span class="cad-equivalent">
                                                                    ≈ {formatCurrency(account.cashBalanceCAD, 'CAD')}
                                                                </span>
                                                            </Show>
                                                        </div>
                                                    </div>
                                                )}
                                            </For>
                                        </div>
                                    </div>
                                )}
                            </For>
                        </div>
                    </Show>

                    {/* Last Update Timestamp */}
                    <div class="cash-footer">
                        <Show when={lastUpdate()}>
                            <span class="last-update">
                                Last updated: {lastUpdate().toLocaleTimeString()}
                            </span>
                        </Show>
                        <button 
                            class="refresh-btn-small"
                            onClick={loadCashBalances}
                            disabled={isLoading()}
                            title="Refresh cash balances"
                        >
                            🔄
                        </button>
                    </div>
                </div>
            </Show>

            {/* Empty State */}
            <Show when={!isLoading() && !error() && (!processedData() || processedData().accountCount === 0)}>
                <div class="cash-empty-state">
                    <div class="empty-icon">💰</div>
                    <div class="empty-title">No Cash Balances</div>
                    <div class="empty-subtitle">No accounts with cash balances found</div>
                    <button 
                        class="retry-btn"
                        onClick={loadCashBalances}
                        disabled={isLoading()}
                    >
                        Refresh
                    </button>
                </div>
            </Show>
        </div>
    );
}

export default CashBalanceBar;