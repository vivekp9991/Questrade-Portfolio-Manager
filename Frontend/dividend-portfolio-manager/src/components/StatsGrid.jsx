// src/components/StatsGrid.jsx - UPDATED TO SUPPORT 6 CARDS INCLUDING CASH BALANCE
import { For, Show, createMemo } from 'solid-js';

function StatsGrid(props) {
    // Get account context information
    const getAccountContext = () => {
        const account = props.selectedAccount?.();
        if (!account) return null;
        
        return {
            viewMode: account.viewMode,
            personName: account.personName,
            label: account.label,
            isAggregated: account.viewMode === 'all' || (account.viewMode === 'person' && account.aggregate)
        };
    };

    // Get display text for account context
    const getAccountContextText = () => {
        const context = getAccountContext();
        if (!context) return null;
        
        switch (context.viewMode) {
            case 'all':
                return 'All Accounts (Everyone)';
            case 'person':
                return `${context.personName}${context.isAggregated ? ' (All Accounts)' : ''}`;
            case 'account':
                return context.label;
            default:
                return null;
        }
    };

    // Get context badge type
    const getContextBadgeType = () => {
        const context = getAccountContext();
        if (!context) return null;
        
        if (context.viewMode === 'all') return 'global';
        if (context.viewMode === 'person') return 'person';
        if (context.viewMode === 'account') return 'account';
        return null;
    };

    // Get context icon
    const getContextIcon = () => {
        const context = getAccountContext();
        if (!context) return null;
        
        if (context.viewMode === 'all') return '🌐';
        if (context.viewMode === 'person') return '👤';
        if (context.viewMode === 'account') return '🏦';
        return null;
    };

    // Check if showing aggregated data
    const isShowingAggregatedData = () => {
        const context = getAccountContext();
        return context?.isAggregated || false;
    };

    // Get aggregation note
    const getAggregationNote = () => {
        const context = getAccountContext();
        if (!context?.isAggregated) return null;
        
        if (context.viewMode === 'all') return 'Combined across all persons and accounts';
        if (context.viewMode === 'person') return `Combined across ${context.personName}'s accounts`;
        return null;
    };

    // Enhanced stats with additional metadata
    const enhancedStats = createMemo(() => {
        const stats = props.stats || [];
        const context = getAccountContext();
        
        return stats.map((stat, index) => ({
            ...stat,
            id: `stat-${index}`,
            contextSensitive: true,
            aggregated: context?.isAggregated || false,
            showPercentChange: stat.percentValue !== undefined,
            showMonthlyAmount: stat.title === 'YIELD ON COST',
            showTrend: stat.positive !== undefined,
            isCashBalance: stat.isCashBalance || false
        }));
    });

    // Format value with sign for changes
    const formatChangeValue = (value, isPositive) => {
        if (value === undefined || value === null) return '';
        const formatted = typeof value === 'string' ? value : `$${Math.abs(value).toFixed(2)}`;
        if (isPositive === undefined) return formatted;
        return isPositive ? `+${formatted}` : formatted;
    };

    // Format cash balance breakdown for tooltip
    const formatCashBreakdown = (breakdown) => {
        if (!breakdown || breakdown.length === 0) return 'No cash balances';
        
        return breakdown.map(item => 
            `${item.accountType}: ${item.value}`
        ).join('\n');
    };

    return (
        <div class="stats-grid">
            {/* Exchange Rate Indicator - Show when USD accounts are included */}
            <Show when={isShowingAggregatedData() && props.usdCadRate}>
                <div class="exchange-rate-indicator">
                    <div class="rate-label">USD/CAD Rate:</div>
                    <div class="rate-value">{props.usdCadRate().toFixed(4)}</div>
                    <div class="rate-note">All values in CAD</div>
                </div>
            </Show>

            {/* Stats Cards */}
            <For each={enhancedStats()}>
                {stat => (
                    <div class={`stat-card ${stat.aggregated ? 'aggregated' : ''} ${stat.isCashBalance ? 'cash-balance-card' : ''}`}>
                        <div class="stat-header">
                            <div class="stat-info">
                                <div class="stat-icon" style={{ 
                                    background: `linear-gradient(135deg, ${stat.background}, ${stat.background}dd)` 
                                }}>
                                    {stat.icon}
                                </div>
                                <div class="stat-title-section">
                                    <div class="stat-title">{stat.title}</div>
                                    <Show when={stat.aggregated}>
                                        <div class="stat-context">
                                            <span class="context-indicator">🔗</span>
                                            <span class="context-label">Combined</span>
                                        </div>
                                    </Show>
                                </div>
                            </div>
                            <div class="stat-trend">
                                <Show when={stat.showTrend && stat.positive !== undefined}>
                                    <div class={`trend-indicator ${stat.positive ? 'positive' : 'negative'}`}>
                                        {stat.positive ? '↗' : '↘'}
                                    </div>
                                </Show>
                                <Show when={stat.tooltip}>
                                    <div class="stat-tooltip" title={stat.tooltip}>ⓘ</div>
                                </Show>
                            </div>
                        </div>
                        
                        {/* Custom layout for cash balance with side-by-side CAD/USD */}
                        <Show when={stat.isCashBalance}>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-top: 0.75rem;">
                                {(() => {
                                    // Parse the multi-line value "CAD: $X\nUSD: $Y"
                                    const lines = stat.value.split('\n').filter(l => l.trim());

                                    return lines.map((line, idx) => {
                                        const [currency, amount] = line.split(':').map(s => s.trim());
                                        const isCAD = currency === 'CAD';
                                        const borderColor = isCAD ? 'rgba(34, 197, 94, 0.5)' : 'rgba(59, 130, 246, 0.5)';
                                        const bgColor = isCAD ? 'rgba(34, 197, 94, 0.05)' : 'rgba(59, 130, 246, 0.05)';

                                        return (
                                            <div style={`display: flex; flex-direction: column; padding: 0.75rem; background: ${bgColor}; border-radius: 10px; border-left: 3px solid ${borderColor};`}>
                                                <span style="font-size: 0.65rem; font-weight: 600; color: var(--neutral-500); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.35rem;">
                                                    {currency === 'CAD' ? 'Canadian Dollar' : 'US Dollar'}
                                                </span>
                                                <span style="font-size: 1.25rem; font-weight: 700; color: var(--neutral-800); line-height: 1;">
                                                    {amount}
                                                </span>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>

                            <Show when={stat.subtitle}>
                                <div class="stat-subtitle" style="margin-top: 0.75rem; text-align: center; font-size: 0.75rem;">
                                    {stat.subtitle}
                                </div>
                            </Show>
                        </Show>

                        {/* Standard layout for other stats */}
                        <Show when={!stat.isCashBalance}>
                            <div class={`stat-value ${stat.positive ? 'positive' : stat.positive === false ? 'negative' : ''}`}>
                                {formatChangeValue(stat.value, stat.positive)}
                            </div>

                            <div class={`stat-subtitle ${stat.positive ? 'positive' : stat.positive === false ? 'negative' : ''}`}>
                                {stat.subtitle}
                            </div>
                        </Show>
                        
                        {/* Cash Balance Specific Content */}
                        <Show when={stat.isCashBalance && stat.breakdown && stat.breakdown.length > 0}>
                            <div class="cash-balance-breakdown">
                                <div class="breakdown-header">
                                    <span class="breakdown-title">Account Breakdown:</span>
                                    <span class="account-count">{stat.accountCount} accounts</span>
                                </div>
                                <div class="breakdown-items">
                                    <For each={stat.breakdown.slice(0, 3)}>
                                        {item => (
                                            <div class="breakdown-item">
                                                <span class="account-type">{item.accountType}</span>
                                                <span class="account-value">{item.value}</span>
                                            </div>
                                        )}
                                    </For>
                                    <Show when={stat.breakdown.length > 3}>
                                        <div class="breakdown-more">
                                            +{stat.breakdown.length - 3} more types
                                        </div>
                                    </Show>
                                </div>
                            </div>
                        </Show>
                        
                        {/* Additional metrics for specific cards */}
                        <Show when={stat.showPercentChange && stat.percentValue !== undefined}>
                            <div class="stat-percent-badge">
                                <span class={stat.positive ? 'positive' : 'negative'}>
                                    {stat.positive ? '↑' : '↓'} {Math.abs(stat.percentValue).toFixed(2)}%
                                </span>
                            </div>
                        </Show>
                        
                        {/* Progress bar for positive values */}
                        <Show when={stat.positive && stat.percentValue}>
                            <div class="progress-bar">
                                <div 
                                    class="progress-fill" 
                                    style={`width: ${Math.min(100, Math.abs(stat.percentValue))}%`}
                                ></div>
                            </div>
                        </Show>

                        {/* Aggregation details */}
                        <Show when={stat.aggregated && stat.details}>
                            <div class="stat-details">
                                <For each={stat.details}>
                                    {detail => (
                                        <div class="detail-item">
                                            <span class="detail-label">{detail.label}:</span>
                                            <span class="detail-value">{detail.value}</span>
                                        </div>
                                    )}
                                </For>
                            </div>
                        </Show>

                        {/* Hover overlay for additional info */}
                        <div class="stat-overlay">
                            <Show when={stat.isCashBalance && stat.breakdown}>
                                <div class="overlay-content">
                                    <div class="overlay-title">Cash Balance Details</div>
                                    <div class="overlay-text">
                                        {formatCashBreakdown(stat.breakdown)}
                                    </div>
                                    <Show when={props.usdCadRate}>
                                        <div class="overlay-rate">
                                            USD/CAD: {props.usdCadRate().toFixed(4)}
                                        </div>
                                    </Show>
                                </div>
                            </Show>
                            <Show when={!stat.isCashBalance && isShowingAggregatedData()}>
                                <div class="overlay-content">
                                    <div class="overlay-title">Aggregated Data</div>
                                    <div class="overlay-text">
                                        {getAggregationNote()}
                                    </div>
                                    <Show when={props.usdCadRate}>
                                        <div class="overlay-rate">
                                            USD/CAD: {props.usdCadRate().toFixed(4)}
                                        </div>
                                    </Show>
                                </div>
                            </Show>
                        </div>
                    </div>
                )}
            </For>
        </div>
    );
}

export default StatsGrid;