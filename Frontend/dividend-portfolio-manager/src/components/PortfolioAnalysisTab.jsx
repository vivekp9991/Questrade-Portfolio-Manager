// src/components/PortfolioAnalysisTab.jsx
import { createSignal, For, createMemo, Show } from 'solid-js';

function PortfolioAnalysisTab(props) {
    const [activeSubTab, setActiveSubTab] = createSignal('portfolioMetrics');

    const analysis = createMemo(() => (props.analysisData ? props.analysisData() : {}) || {});

    const formatCurrency = (num) => {
        const n = Number(num);
        return isNaN(n) ? '$0.00' : `$${n.toFixed(2)}`;
    };

    const formatPercent = (num) => {
        const n = Number(num);
        return isNaN(n) ? '0%' : `${n.toFixed(2)}%`;
    };

    const formatNumber = (num) => {
        const n = Number(num);
        return isNaN(n) ? '0' : n.toLocaleString();
    };

    const overview = createMemo(() => analysis().overview || {});
    const dividend = createMemo(() => analysis().dividendAnalysis || {});
    const performance = createMemo(() => analysis().performanceBreakdown || {});
    const risk = createMemo(() => analysis().riskMetrics || {});
    const allocation = createMemo(() => analysis().allocationAnalysis || {});

    // Get context label for current view
    const getViewContext = () => {
        const account = props.selectedAccount?.();
        if (!account) return 'All Accounts';
        
        if (account.viewMode === 'all') return 'All Accounts (Everyone)';
        if (account.viewMode === 'person') return `${account.personName} (All Accounts)`;
        if (account.viewMode === 'account') return account.label;
        
        return account.label || 'All Accounts';
    };

    // Check if viewing aggregated data
    const isAggregatedView = () => {
        const account = props.selectedAccount?.();
        return account && (account.viewMode === 'all' || (account.viewMode === 'person' && account.aggregate));
    };

    // Get aggregation context text
    const getAggregationContext = () => {
        const account = props.selectedAccount?.();
        if (!account) return '';
        
        if (account.viewMode === 'all') return 'across all persons and accounts';
        if (account.viewMode === 'person' && account.aggregate) return `across all ${account.personName}'s accounts`;
        if (account.viewMode === 'account') return 'for this specific account';
        
        return '';
    };

    const subTabs = [
        { id: 'portfolioMetrics', icon: '📊', label: 'Portfolio Metrics' },
        { id: 'dividendAnalysis', icon: '💰', label: 'Dividend Analysis' },
        { id: 'performanceBreakdown', icon: '📈', label: 'Performance Breakdown' },
        { id: 'riskAnalysis', icon: '⚠️', label: 'Risk Analysis' },
        { id: 'allocationAnalysis', icon: '📋', label: 'Allocation Analysis' }
    ];

    return (
        <div id="portfolioAnalysis-tab">
            <div class="content-header">
                <h2 class="content-title">
                    Portfolio Analysis
                    <span class="view-context">- {getViewContext()}</span>
                </h2>
                <div class="header-controls">
                    <Show when={isAggregatedView()}>
                        <div class="aggregation-indicator">
                            <span class="aggregation-icon">🔗</span>
                            <span class="aggregation-text">Aggregated Data</span>
                        </div>
                    </Show>
                    <button class="btn">📤 Export Analysis</button>
                </div>
            </div>

            {/* Analysis Overview Cards */}
            <div class="backtest-section">
                <div class="portfolio-analysis-cards">
                    <div class="analysis-card current-gain">
                        <div class="analysis-header">
                            <div class="analysis-icon">📊</div>
                            <span>Current Gain</span>
                        </div>
                        <div class={`analysis-value ${(analysis().currentGainPercent || 0) >= 0 ? 'positive' : 'negative'}`}>
                            {formatPercent(analysis().currentGainPercent)}
                        </div>
                        <div class="analysis-subtitle">Capital appreciation</div>
                    </div>

                    <div class="analysis-card dividends">
                        <div class="analysis-header">
                            <div class="analysis-icon">💰</div>
                            <span>Dividend Yield</span>
                        </div>
                        <div class="analysis-value">{formatPercent(analysis().dividendsYieldPercent)}</div>
                        <div class="analysis-subtitle">Current yield {getAggregationContext()}</div>
                    </div>
                    
                    <div class="analysis-card total-returns">
                        <div class="analysis-header">
                            <div class="analysis-icon">💎</div>
                            <span>Total Returns</span>
                        </div>
                        <div class={`analysis-value ${(analysis().totalReturnsValue || 0) >= 0 ? 'positive' : 'negative'}`}>
                            {formatCurrency(analysis().totalReturnsValue)}
                        </div>
                        <div class="analysis-subtitle">Including dividends</div>
                    </div>

                    <Show when={isAggregatedView()}>
                        <div class="analysis-card aggregation-stats">
                            <div class="analysis-header">
                                <div class="analysis-icon">🏦</div>
                                <span>Accounts</span>
                            </div>
                            <div class="analysis-value">{overview().numberOfPositions || 0}</div>
                            <div class="analysis-subtitle">Total positions</div>
                        </div>
                    </Show>
                </div>

                {/* Context Banner for Aggregated Views */}
                <Show when={isAggregatedView()}>
                    <div class="analysis-context-banner">
                        <div class="context-info">
                            <span class="context-icon">💡</span>
                            <span class="context-message">
                                Analysis computed {getAggregationContext()}. Same stocks are combined for accurate metrics.
                            </span>
                        </div>
                        <div class="context-stats">
                            <span class="context-stat">
                                <strong>{overview().numberOfDividendStocks || 0}</strong> dividend stocks
                            </span>
                            <span class="context-stat">
                                <strong>{formatCurrency(overview().averagePositionSize)}</strong> avg position
                            </span>
                        </div>
                    </div>
                </Show>

                <div class="sub-tabs">
                    <For each={subTabs}>
                        {tab => (
                            <div
                                class={`sub-tab ${activeSubTab() === tab.id ? 'active' : ''}`}
                                data-subtab={tab.id}
                                onClick={() => setActiveSubTab(tab.id)}
                            >
                                {tab.icon} {tab.label}
                            </div>
                        )}
                    </For>
                </div>

                {/* Portfolio Metrics Tab */}
                <div id="portfolioMetrics-subtab" class={`sub-tab-content ${activeSubTab() === 'portfolioMetrics' ? '' : 'hidden'}`}>
                    <div class="results-card">
                        <div class="results-header">📊 Portfolio Overview</div>
                        <div class="results-grid">
                            <div class="result-row">
                                <span>Total Investment</span>
                                <span class="result-value">{formatCurrency(overview().totalInvestment)}</span>
                            </div>
                            <div class="result-row">
                                <span>Current Value</span>
                                <span class="result-value">{formatCurrency(overview().currentValue)}</span>
                            </div>
                            <div class="result-row">
                                <span>Total Return Value</span>
                                <span class={`result-value ${(overview().totalReturnValue || 0) >= 0 ? 'positive' : 'negative'}`}>
                                    {formatCurrency(overview().totalReturnValue)}
                                </span>
                            </div>
                            <div class="result-row">
                                <span>Return Percentage</span>
                                <span class={`result-value ${(overview().returnPercent || 0) >= 0 ? 'positive' : 'negative'}`}>
                                    {formatPercent(overview().returnPercent)}
                                </span>
                            </div>
                            <div class="result-row">
                                <span>Number of Positions</span>
                                <span class="result-value">{formatNumber(overview().numberOfPositions)}</span>
                            </div>
                            <div class="result-row">
                                <span>Dividend-Paying Stocks</span>
                                <span class="result-value">{formatNumber(overview().numberOfDividendStocks)}</span>
                            </div>
                            <div class="result-row">
                                <span>Average Position Size</span>
                                <span class="result-value">{formatCurrency(overview().averagePositionSize)}</span>
                            </div>
                            <div class="result-row">
                                <span>Largest Position</span>
                                <span class="result-value">
                                    {formatCurrency(overview().largestPosition?.value)} 
                                    <span class="result-symbol">({overview().largestPosition?.symbol})</span>
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Dividend Analysis Tab */}
                <div id="dividendAnalysis-subtab" class={`sub-tab-content ${activeSubTab() === 'dividendAnalysis' ? '' : 'hidden'}`}>
                    <div class="results-card">
                        <div class="results-header">💰 Dividend Analysis</div>
                        <div class="results-grid">
                            <div class="result-row">
                                <span>Current Yield</span>
                                <span class="result-value positive">{formatPercent(dividend().currentYieldPercent)}</span>
                            </div>
                            <div class="result-row">
                                <span>Yield on Cost</span>
                                <span class="result-value positive">{formatPercent(dividend().yieldOnCostPercent)}</span>
                            </div>
                            <div class="result-row">
                                <span>Dividend Adjusted Average Cost</span>
                                <span class="result-value" style="color: #8b5cf6;">
                                    {formatCurrency(dividend().dividendAdjustedAverageCost)}
                                </span>
                            </div>
                            <div class="result-row">
                                <span>Dividend Adjusted Yield</span>
                                <span class="result-value positive">{formatPercent(dividend().dividendAdjustedYieldPercent)}</span>
                            </div>
                            <div class="result-row">
                                <span>TTM Yield</span>
                                <span class="result-value positive">{formatPercent(dividend().ttmYieldPercent)}</span>
                            </div>
                            <div class="result-row">
                                <span>Monthly Average Income</span>
                                <span class="result-value positive">{formatCurrency(dividend().monthlyAverage)}</span>
                            </div>
                            <div class="result-row">
                                <span>Annual Projected Income</span>
                                <span class="result-value positive">{formatCurrency(dividend().annualProjected)}</span>
                            </div>
                            <div class="result-row">
                                <span>Total Dividends Received</span>
                                <span class="result-value positive">{formatCurrency(dividend().totalDividendsReceived)}</span>
                            </div>
                        </div>
                        <Show when={isAggregatedView()}>
                            <div class="analysis-note">
                                <span class="note-icon">📝</span>
                                <span class="note-text">
                                    Dividend metrics are weighted by position size {getAggregationContext()}
                                </span>
                            </div>
                        </Show>
                    </div>
                </div>

                {/* Performance Breakdown Tab */}
                <div id="performanceBreakdown-subtab" class={`sub-tab-content ${activeSubTab() === 'performanceBreakdown' ? '' : 'hidden'}`}>
                    <div class="results-card">
                        <div class="results-header">📈 Performance Breakdown</div>
                        <div class="results-grid">
                            <div class="result-row">
                                <span>Capital Gains Value</span>
                                <span class={`result-value ${(performance().capitalGainsValue || 0) >= 0 ? 'positive' : 'negative'}`}>
                                    {formatCurrency(performance().capitalGainsValue)}
                                </span>
                            </div>
                            <div class="result-row">
                                <span>Dividend Income Value</span>
                                <span class="result-value positive">{formatCurrency(performance().dividendIncomeValue)}</span>
                            </div>
                            <div class="result-row">
                                <span>Capital Gains Percentage</span>
                                <span class={`result-value ${(performance().capitalGainsPercent || 0) >= 0 ? 'positive' : 'negative'}`}>
                                    {formatPercent(performance().capitalGainsPercent)}
                                </span>
                            </div>
                            <div class="result-row">
                                <span>Dividend Return Percentage</span>
                                <span class="result-value positive">{formatPercent(performance().dividendReturnPercent)}</span>
                            </div>
                            <div class="result-row">
                                <span>Best Performing Stock</span>
                                <span class="result-value positive">
                                    <Show 
                                        when={performance().bestPerformingStock} 
                                        fallback="N/A"
                                    >
                                        {performance().bestPerformingStock.symbol} 
                                        <span class="result-percentage">
                                            ({formatPercent(performance().bestPerformingStock.returnPercent)})
                                        </span>
                                    </Show>
                                </span>
                            </div>
                            <div class="result-row">
                                <span>Monthly Income</span>
                                <span class="result-value positive">{formatCurrency(performance().monthlyIncome)}</span>
                            </div>
                            <div class="result-row">
                                <span>Annual Projected Income</span>
                                <span class="result-value positive">{formatCurrency(performance().annualProjectedIncome)}</span>
                            </div>
                        </div>
                        
                        {/* Performance Composition Chart */}
                        <div class="performance-composition">
                            <h4>Return Composition</h4>
                            <div class="composition-bars">
                                <div class="composition-item">
                                    <div class="composition-label">Capital Gains</div>
                                    <div class="composition-bar">
                                        <div 
                                            class="composition-fill capital-gains"
                                            style={{
                                                width: `${Math.abs(performance().capitalGainsPercent || 0) * 2}%`
                                            }}
                                        ></div>
                                    </div>
                                    <div class="composition-value">{formatPercent(performance().capitalGainsPercent)}</div>
                                </div>
                                <div class="composition-item">
                                    <div class="composition-label">Dividend Income</div>
                                    <div class="composition-bar">
                                        <div 
                                            class="composition-fill dividend-income"
                                            style={{
                                                width: `${Math.abs(performance().dividendReturnPercent || 0) * 2}%`
                                            }}
                                        ></div>
                                    </div>
                                    <div class="composition-value">{formatPercent(performance().dividendReturnPercent)}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Risk Analysis Tab */}
                <div id="riskAnalysis-subtab" class={`sub-tab-content ${activeSubTab() === 'riskAnalysis' ? '' : 'hidden'}`}>
                    <div class="results-card">
                        <div class="results-header">⚠️ Risk Assessment</div>
                        <div class="results-grid">
                            <div class="result-row">
                                <span>Portfolio Concentration</span>
                                <span class={`result-value risk-${(risk().portfolioConcentration || '').toLowerCase()}`}>
                                    {risk().portfolioConcentration}
                                </span>
                            </div>
                            <div class="result-row">
                                <span>Largest Position Weight</span>
                                <span class="result-value">{risk().largestPositionWeight}</span>
                            </div>
                            <div class="result-row">
                                <span>Sector Concentration</span>
                                <span class="result-value">{risk().sectorConcentration}</span>
                            </div>
                            <div class="result-row">
                                <span>Geographic Exposure</span>
                                <span class="result-value">{risk().geographicExposure}</span>
                            </div>
                            <div class="result-row">
                                <span>Dividend Dependency</span>
                                <span class="result-value positive">{risk().dividendDependency}</span>
                            </div>
                            <div class="result-row">
                                <span>Yield Stability</span>
                                <span class="result-value positive">{risk().yieldStability}</span>
                            </div>
                        </div>
                        
                        {/* Risk Level Indicators */}
                        <div class="risk-indicators">
                            <h4>Risk Level Assessment</h4>
                            <div class="risk-levels">
                                <div class="risk-level">
                                    <div class="risk-level-label">Concentration Risk</div>
                                    <div class="risk-level-bar">
                                        <div class={`risk-level-fill risk-${(risk().portfolioConcentration || '').toLowerCase()}`}></div>
                                    </div>
                                    <div class="risk-level-text">{risk().portfolioConcentration}</div>
                                </div>
                            </div>
                        </div>
                        
                        <Show when={isAggregatedView()}>
                            <div class="analysis-note">
                                <span class="note-icon">⚠️</span>
                                <span class="note-text">
                                    Risk assessment considers combined positions {getAggregationContext()}
                                </span>
                            </div>
                        </Show>
                    </div>
                </div>

                {/* Allocation Analysis Tab */}
                <div id="allocationAnalysis-subtab" class={`sub-tab-content ${activeSubTab() === 'allocationAnalysis' ? '' : 'hidden'}`}>
                    <div class="results-card">
                        <div class="results-header">📋 Asset Allocation</div>
                        <div class="results-grid">
                            <Show when={Object.keys(allocation().assetWeights || {}).length > 0}>
                                <For each={Object.entries(allocation().assetWeights || {})}>
                                    {([asset, weight]) => (
                                        <div class="result-row">
                                            <span>{asset} Weight</span>
                                            <span class="result-value">{formatPercent(weight)}</span>
                                        </div>
                                    )}
                                </For>
                            </Show>
                            
                            <Show when={Object.keys(allocation().sectorWeights || {}).length > 0}>
                                <For each={Object.entries(allocation().sectorWeights || {})}>
                                    {([sector, weight]) => (
                                        <div class="result-row">
                                            <span>{sector} Sector</span>
                                            <span class="result-value">{formatPercent(weight)}</span>
                                        </div>
                                    )}
                                </For>
                            </Show>
                            
                            <div class="result-row">
                                <span>High Yield Assets</span>
                                <span class="result-value positive">{formatPercent(allocation().highYieldAssetsPercent)}</span>
                            </div>
                            <div class="result-row">
                                <span>Growth Assets</span>
                                <span class="result-value positive">{formatPercent(allocation().growthAssetsPercent)}</span>
                            </div>
                            <div class="result-row">
                                <span>Average Portfolio Yield</span>
                                <span class="result-value positive">{formatPercent(allocation().averageYieldPercent)}</span>
                            </div>
                        </div>

                        {/* Allocation Chart */}
                        <div class="allocation-chart">
                            <h4>Asset Distribution</h4>
                            <div class="allocation-items">
                                <div class="allocation-item">
                                    <div class="allocation-label">
                                        <span class="allocation-dot high-yield"></span>
                                        High Yield Assets
                                    </div>
                                    <div class="allocation-percentage">{formatPercent(allocation().highYieldAssetsPercent)}</div>
                                </div>
                                <div class="allocation-item">
                                    <div class="allocation-label">
                                        <span class="allocation-dot growth"></span>
                                        Growth Assets
                                    </div>
                                    <div class="allocation-percentage">{formatPercent(allocation().growthAssetsPercent)}</div>
                                </div>
                            </div>
                        </div>
                        
                        <Show when={isAggregatedView()}>
                            <div class="analysis-note">
                                <span class="note-icon">📊</span>
                                <span class="note-text">
                                    Allocation percentages calculated from combined holdings {getAggregationContext()}
                                </span>
                            </div>
                        </Show>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default PortfolioAnalysisTab;