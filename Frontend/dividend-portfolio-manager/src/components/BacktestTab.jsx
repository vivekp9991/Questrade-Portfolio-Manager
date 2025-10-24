// src/components/BacktestTab.jsx
import { createSignal, For, Show } from 'solid-js';

function BacktestTab(props) {
    const [activeSubTab, setActiveSubTab] = createSignal('strategy');

    const [symbol, setSymbol] = createSignal(props.backtestParamsData.symbol);
    const [timeframe, setTimeframe] = createSignal(props.backtestParamsData.timeframe);
    const [shares, setShares] = createSignal(props.backtestParamsData.shares);
    const [startDate, setStartDate] = createSignal(props.backtestParamsData.startDate);
    const [endDate, setEndDate] = createSignal(props.backtestParamsData.endDate);

    const [strategyPerformanceData, setStrategyPerformanceData] = createSignal([]);
    const [advancedReturnsData, setAdvancedReturnsData] = createSignal([]);
    const [dividendCalculationsData, setDividendCalculationsData] = createSignal([]);
    const [stockInfoData, setStockInfoData] = createSignal([]);
    const [paymentHistoryData, setPaymentHistoryData] = createSignal([]);
    const [totalReceived, setTotalReceived] = createSignal('');
    const [divAdjCost, setDivAdjCost] = createSignal(0);
    const [totalDividend, setTotalDividend] = createSignal(0);
    const [totalDivPercent, setTotalDivPercent] = createSignal(0);
    const [isRunning, setIsRunning] = createSignal(false);
    const [lastRunTime, setLastRunTime] = createSignal(null);

    const subTabs = [
        { id: 'strategy', icon: '📊', label: 'Strategy Performance' },
        { id: 'returns', icon: '💰', label: 'Advanced Returns' },
        { id: 'dividends', icon: '💵', label: 'Dividend Calculations' },
        { id: 'stock', icon: '📈', label: 'Stock Information' },
        { id: 'history', icon: '📋', label: 'Payment History' }
    ];

    // Get context label for current view
    const getViewContext = () => {
        const account = props.selectedAccount?.();
        if (!account) return 'All Accounts';
        
        if (account.viewMode === 'all') return 'All Accounts (Everyone)';
        if (account.viewMode === 'person') return `${account.personName} (All Accounts)`;
        if (account.viewMode === 'account') return account.label;
        
        return account.label || 'All Accounts';
    };

    const runBacktest = async () => {
        setIsRunning(true);
        props.setLoading?.(true);
        
        const payload = {
            ticker: symbol(),
            timeframe: timeframe(),
            quantity: Number(shares()),
            startDate: startDate(),
            endDate: endDate()
        };

        try {
            const res = await fetch('http://localhost:3000/api/v1/backtest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (!res.ok) {
                throw new Error(`Backtest failed: ${res.status} ${res.statusText}`);
            }
            
            const data = await res.json();

            // Calculate derived metrics
            const yearlyAverage = (data.pnLWithDividendPercent / (data.analysisPeriod.durationMonths / 12)).toFixed(2);
            const divAdjustedCost = (data.totalInvestment - data.totalDividend) / data.totalShares;
            const divAdjustedYield = (data.annualDividendPerShare / divAdjustedCost) * 100;
            const monthlyAvg = data.dividendCalculationDetails.totalDividendIncome / data.dividendCalculationDetails.periodsWithIncome;
            const annualProj = data.annualDividendPerShare * data.totalShares;
            const priceDiff = data.currentPrice - data.averageBuyPrice;
            const priceDiffPercent = (priceDiff / data.averageBuyPrice) * 100;

            setDivAdjCost(divAdjustedCost);
            setTotalDividend(data.totalDividend);
            setTotalDivPercent(data.totalDivPercent);

            setStrategyPerformanceData([
                { label: 'Success Rate', value: `${data.redCandleSuccessRate.toFixed(2)}%`, positive: data.redCandleSuccessRate >= 50 },
                { label: 'Red Candles', value: `${data.redCandlePeriods} / ${data.totalCandlePeriods}` },
                { label: 'Analysis Period', value: `${data.analysisPeriod.durationMonths.toFixed(1)} months` },
                { label: 'Capital Growth', value: `${data.pnLPercent.toFixed(2)}%`, positive: data.pnLPercent >= 0 },
                { label: 'Dividend Return', value: `${data.totalDivPercent.toFixed(2)}%`, positive: data.totalDivPercent >= 0 },
                { label: 'Total Return', value: `${data.pnLWithDividendPercent.toFixed(2)}%`, positive: data.pnLWithDividendPercent >= 0 },
                { label: 'Yearly Average', value: `${yearlyAverage}%`, positive: yearlyAverage >= 0 }
            ]);

            setAdvancedReturnsData([
                { label: 'Capital Appreciation', value: `$${data.pnL.toFixed(2)} (${data.pnLPercent.toFixed(2)}%)`, positive: data.pnL >= 0 },
                { label: 'Dividend Income', value: `$${data.totalDividend.toFixed(2)} (${data.totalDivPercent.toFixed(2)}%)`, positive: data.totalDividend >= 0 },
                { label: 'Total Return', value: `$${data.pnLWithDividend.toFixed(2)} (${data.pnLWithDividendPercent.toFixed(2)}%)`, positive: data.pnLWithDividend >= 0 },
                { label: 'Yearly Average Return', value: `${yearlyAverage}%`, positive: yearlyAverage >= 0 },
                { label: 'Div Adjusted Return', value: `${((data.pnLWithDividend / (data.totalInvestment - data.totalDividend)) * 100).toFixed(2)}%`, positive: data.pnLWithDividend >= 0 }
            ]);

            setDividendCalculationsData([
                { label: 'Current Yield', value: `${data.lastDividendYield.toFixed(2)}%`, positive: data.lastDividendYield >= 0 },
                { label: 'Yield on Cost', value: `${data.yieldOnCost.toFixed(2)}%`, positive: data.yieldOnCost >= 0 },
                { label: 'Div Adj. Avg Cost', value: `$${divAdjustedCost.toFixed(2)}`, color: '#8b5cf6' },
                { label: 'Div Adj. Yield', value: `${divAdjustedYield.toFixed(2)}%`, positive: divAdjustedYield >= 0 },
                { label: 'TTM Yield', value: `${data.ttmDividendYield.toFixed(2)}%`, positive: data.ttmDividendYield >= 0 },
                { label: 'Monthly Average', value: `$${monthlyAvg.toFixed(2)}`, positive: monthlyAvg >= 0 },
                { label: 'Annual Projected', value: `$${annualProj.toFixed(2)}`, positive: annualProj >= 0 }
            ]);

            setStockInfoData([
                { label: 'Current Price', value: `$${data.currentPrice.toFixed(2)}` },
                { label: 'Average Cost', value: `$${data.averageBuyPrice.toFixed(2)}` },
                { label: 'Div Adj. Avg Cost', value: `$${divAdjustedCost.toFixed(2)}`, color: '#8b5cf6' },
                { label: 'Price Difference', value: `${priceDiff >= 0 ? '+' : ''}$${priceDiff.toFixed(2)} (${priceDiffPercent.toFixed(2)}%)`, positive: priceDiff >= 0 },
                { label: 'Total Shares', value: `${data.totalShares}` },
                { label: 'Market Value', value: `$${data.totalValueToday.toFixed(2)}` },
                { label: 'Cost Basis', value: `$${data.totalInvestment.toFixed(2)}` }
            ]);

            setPaymentHistoryData(
                data.dividendHistory.map(hist => ({
                    year: hist.year.toString(),
                    total: `$${hist.totalAmount.toFixed(2)}`,
                    months: hist.payments.map(p => ({ 
                        month: `${p.label} ${hist.year}`, 
                        filled: p.status === 'paid',
                        amount: p.amount || 0
                    }))
                }))
            );

            setTotalReceived(`$${data.dividendCalculationDetails.totalDividendIncome.toFixed(2)}`);
            setLastRunTime(new Date().toLocaleTimeString());
            
        } catch (error) {
            console.error('Backtest failed:', error);
            // Set empty data on error
            setStrategyPerformanceData([]);
            setAdvancedReturnsData([]);
            setDividendCalculationsData([]);
            setStockInfoData([]);
            setPaymentHistoryData([]);
            setTotalReceived('$0.00');
        } finally {
            setIsRunning(false);
            props.setLoading?.(false);
        }
    };

    return (
        <div id="backtest-tab">
            <div class="content-header">
                <h2 class="content-title">
                    Backtesting Analytics
                    <span class="view-context">- {getViewContext()}</span>
                </h2>
                <div class="header-controls">
                    <Show when={lastRunTime()}>
                        <div class="last-backtest">
                            <span class="last-run-label">Last run:</span>
                            <span class="last-run-time">{lastRunTime()}</span>
                        </div>
                    </Show>
                    <button class="btn">📤 Export Results</button>
                </div>
            </div>
            
            <div class="backtest-section">
                {/* Backtest Parameters Form */}
                <div class="backtest-params">
                    <h3 style={{ 'margin-bottom': '1rem', color: '#1e293b' }}>
                        📊 Backtesting Parameters
                        <span class="params-subtitle">Configure your backtesting strategy</span>
                    </h3>
                    <div class="backtest-form">
                        <div class="form-group">
                            <label>Stock Symbol</label>
                            <input 
                                type="text" 
                                value={symbol()} 
                                onInput={e => setSymbol(e.target.value)}
                                placeholder="e.g., HYLD.TO"
                                class="symbol-input"
                            />
                        </div>
                        <div class="form-group">
                            <label>Timeframe</label>
                            <select value={timeframe()} onInput={e => setTimeframe(e.target.value)}>
                                <option value="1D">1 Day</option>
                                <option value="1W">1 Week</option>
                                <option value="1M">1 Month</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Shares per Trade</label>
                            <input 
                                type="number" 
                                value={shares()} 
                                onInput={e => setShares(e.target.value)}
                                min="1"
                                placeholder="10"
                            />
                        </div>
                        <div class="form-group">
                            <label>Start Date</label>
                            <input 
                                type="date" 
                                value={startDate()} 
                                onInput={e => setStartDate(e.target.value)}
                            />
                        </div>
                        <div class="form-group">
                            <label>End Date</label>
                            <input 
                                type="date" 
                                value={endDate()} 
                                onInput={e => setEndDate(e.target.value)}
                            />
                        </div>
                        <div class="form-group">
                            <button 
                                class="backtest-btn" 
                                onClick={runBacktest}
                                disabled={isRunning() || !symbol() || !startDate() || !endDate()}
                            >
                                {isRunning() ? '⏳ Running...' : '🚀 Run Backtest'}
                            </button>
                        </div>
                    </div>
                    
                    {/* Strategy Description */}
                    <div class="strategy-description">
                        <div class="strategy-header">
                            <span class="strategy-icon">💡</span>
                            <span class="strategy-title">Strategy: Red Candle Buying</span>
                        </div>
                        <div class="strategy-details">
                            Buy {shares()} shares of {symbol()} on each red {timeframe()} candle during the selected period.
                            This dollar-cost averaging strategy aims to capitalize on temporary price dips.
                        </div>
                    </div>
                </div>

                {/* Results Sub-tabs */}
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

                {/* Strategy Performance Tab */}
                <div id="strategy-subtab" class={`sub-tab-content ${activeSubTab() === 'strategy' ? '' : 'hidden'}`}>
                    <div class="results-card">
                        <div class="results-header">📊 Strategy Performance Results</div>
                        <Show when={strategyPerformanceData().length === 0 && !isRunning()}>
                            <div class="empty-results">
                                <div class="empty-icon">📈</div>
                                <div class="empty-title">No Backtest Results</div>
                                <div class="empty-subtitle">Run a backtest to see strategy performance metrics</div>
                            </div>
                        </Show>
                        <Show when={strategyPerformanceData().length > 0}>
                            <div class="results-grid">
                                <For each={strategyPerformanceData()}>
                                    {row => (
                                        <div class="result-row">
                                            <span class="result-label">{row.label}</span>
                                            <span class={row.positive !== undefined ? (row.positive ? 'result-value positive' : 'result-value negative') : 'result-value'}>
                                                {row.value}
                                            </span>
                                        </div>
                                    )}
                                </For>
                            </div>
                            <div class="strategy-note">
                                <span class="note-icon">📝</span>
                                <span class="note-text">
                                    Strategy: Buy {shares()} shares on each red {timeframe()} candle between {startDate()} and {endDate()}
                                </span>
                            </div>
                        </Show>
                    </div>
                </div>

                {/* Advanced Returns Tab */}
                <div id="returns-subtab" class={`sub-tab-content ${activeSubTab() === 'returns' ? '' : 'hidden'}`}>
                    <div class="results-card">
                        <div class="results-header">💰 Advanced Returns Analysis</div>
                        <Show when={advancedReturnsData().length === 0 && !isRunning()}>
                            <div class="empty-results">
                                <div class="empty-icon">💰</div>
                                <div class="empty-title">No Returns Data</div>
                                <div class="empty-subtitle">Run a backtest to see detailed return analysis</div>
                            </div>
                        </Show>
                        <Show when={advancedReturnsData().length > 0}>
                            <div class="results-grid">
                                <For each={advancedReturnsData()}>
                                    {row => (
                                        <div class="result-row">
                                            <span class="result-label">{row.label}</span>
                                            <span class={row.positive !== undefined ? (row.positive ? 'result-value positive' : 'result-value negative') : 'result-value'}>
                                                {row.value}
                                            </span>
                                        </div>
                                    )}
                                </For>
                            </div>
                            <div class="returns-summary">
                                <div class="summary-item">
                                    <span class="summary-label">Div Adjusted Cost Basis:</span>
                                    <span class="summary-value">${divAdjCost().toFixed(2)}/share</span>
                                </div>
                                <div class="summary-item positive">
                                    <span class="summary-label">Total Income:</span>
                                    <span class="summary-value">${totalDividend().toFixed(2)} ({totalDivPercent().toFixed(2)}% of investment)</span>
                                </div>
                            </div>
                        </Show>
                    </div>
                </div>

                {/* Dividend Calculations Tab */}
                <div id="dividends-subtab" class={`sub-tab-content ${activeSubTab() === 'dividends' ? '' : 'hidden'}`}>
                    <div class="results-card">
                        <div class="results-header">💵 Dividend Calculations & Metrics</div>
                        <Show when={dividendCalculationsData().length === 0 && !isRunning()}>
                            <div class="empty-results">
                                <div class="empty-icon">💵</div>
                                <div class="empty-title">No Dividend Data</div>
                                <div class="empty-subtitle">Run a backtest to see dividend calculations</div>
                            </div>
                        </Show>
                        <Show when={dividendCalculationsData().length > 0}>
                            <div class="results-grid">
                                <For each={dividendCalculationsData()}>
                                    {row => (
                                        <div class="result-row">
                                            <span class="result-label">{row.label}</span>
                                            <span 
                                                class={row.positive !== undefined ? (row.positive ? 'result-value positive' : 'result-value negative') : 'result-value'} 
                                                style={row.color ? { color: row.color } : {}}
                                            >
                                                {row.value}
                                            </span>
                                        </div>
                                    )}
                                </For>
                            </div>
                        </Show>
                    </div>
                </div>

                {/* Stock Information Tab */}
                <div id="stock-subtab" class={`sub-tab-content ${activeSubTab() === 'stock' ? '' : 'hidden'}`}>
                    <div class="results-card">
                        <div class="results-header">📈 Stock Information & Pricing</div>
                        <Show when={stockInfoData().length === 0 && !isRunning()}>
                            <div class="empty-results">
                                <div class="empty-icon">📈</div>
                                <div class="empty-title">No Stock Data</div>
                                <div class="empty-subtitle">Run a backtest to see stock information</div>
                            </div>
                        </Show>
                        <Show when={stockInfoData().length > 0}>
                            <div class="results-grid">
                                <For each={stockInfoData()}>
                                    {row => (
                                        <div class="result-row">
                                            <span class="result-label">{row.label}</span>
                                            <span 
                                                class={row.positive !== undefined ? (row.positive ? 'result-value positive' : 'result-value negative') : 'result-value'} 
                                                style={row.color ? { color: row.color } : {}}
                                            >
                                                {row.value}
                                            </span>
                                        </div>
                                    )}
                                </For>
                            </div>
                        </Show>
                    </div>
                </div>

                {/* Payment History Tab */}
                <div id="history-subtab" class={`sub-tab-content ${activeSubTab() === 'history' ? '' : 'hidden'}`}>
                    <div class="results-card">
                        <div class="results-header">📋 Dividend Payment History</div>
                        <Show when={paymentHistoryData().length === 0 && !isRunning()}>
                            <div class="empty-results">
                                <div class="empty-icon">📋</div>
                                <div class="empty-title">No Payment History</div>
                                <div class="empty-subtitle">Run a backtest to see dividend payment timeline</div>
                            </div>
                        </Show>
                        <Show when={paymentHistoryData().length > 0}>
                            <div class="payment-history">
                                <For each={paymentHistoryData()}>
                                    {year => (
                                        <div class="payment-year">
                                            <div class="year-header">
                                                <span class="year-label">{year.year}</span>
                                                <span class="year-total">{year.total}</span>
                                            </div>
                                            <div class="payment-dots">
                                                <For each={year.months}>
                                                    {month => (
                                                        <div 
                                                            class={`payment-dot ${month.filled ? 'filled' : 'empty'}`} 
                                                            title={`${month.month}${month.amount ? ` - $${month.amount.toFixed(2)}` : ''}`}
                                                        ></div>
                                                    )}
                                                </For>
                                            </div>
                                        </div>
                                    )}
                                </For>
                                <div class="total-received">
                                    <span class="total-icon">💰</span>
                                    <span class="total-text">Total Dividends Received: {totalReceived()}</span>
                                </div>
                            </div>
                        </Show>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default BacktestTab;