// Backtesting Analytics Page
import { createSignal, For, Show, onCleanup } from 'solid-js';
import { runBacktest } from '../services/api';
import './Backtesting.css';

export default function Backtesting() {
  const [activeTab, setActiveTab] = createSignal('strategy');
  const [loading, setLoading] = createSignal(false);
  const [lastRunTime, setLastRunTime] = createSignal(null);
  const [showNotification, setShowNotification] = createSignal(false);

  // Form parameters
  const [symbol, setSymbol] = createSignal('AAPL');
  const [timeframe, setTimeframe] = createSignal('1W');
  const [shares, setShares] = createSignal(10);
  const [startDate, setStartDate] = createSignal('2024-01-01');
  const [endDate, setEndDate] = createSignal('2025-07-29');

  // Results data
  const [strategyPerformanceData, setStrategyPerformanceData] = createSignal([]);
  const [advancedReturnsData, setAdvancedReturnsData] = createSignal([]);
  const [dividendCalculationsData, setDividendCalculationsData] = createSignal([]);
  const [stockInfoData, setStockInfoData] = createSignal([]);
  const [paymentHistoryData, setPaymentHistoryData] = createSignal([]);
  const [totalReceived, setTotalReceived] = createSignal('$0.00');
  const [divAdjCost, setDivAdjCost] = createSignal(0);
  const [totalDividend, setTotalDividend] = createSignal(0);
  const [totalDivPercent, setTotalDivPercent] = createSignal(0);

  const tabs = [
    { id: 'strategy', icon: '📊', label: 'strategy performance' },
    { id: 'returns', icon: '💰', label: 'advanced returns' },
    { id: 'dividends', icon: '💵', label: 'dividend calculations' },
    { id: 'stock', icon: '📈', label: 'stock information' },
    { id: 'history', icon: '📋', label: 'payment history' }
  ];

  const handleRunBacktest = async () => {
    setLoading(true);

    // Show notification when backtest starts
    setShowNotification(true);

    // Auto-hide notification after 5 seconds
    setTimeout(() => {
      setShowNotification(false);
    }, 5000);

    const payload = {
      ticker: symbol(),
      timeframe: timeframe(),
      quantity: Number(shares()),
      startDate: startDate(),
      endDate: endDate()
    };

    try {
      const data = await runBacktest(payload);

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
        { label: 'success rate', value: `${data.redCandleSuccessRate.toFixed(2)}%`, positive: data.redCandleSuccessRate >= 50 },
        { label: 'red candles', value: `${data.redCandlePeriods} / ${data.totalCandlePeriods}` },
        { label: 'analysis period', value: `${data.analysisPeriod.durationMonths.toFixed(1)} months` },
        { label: 'capital growth', value: `${data.pnLPercent.toFixed(2)}%`, positive: data.pnLPercent >= 0 },
        { label: 'dividend return', value: `${data.totalDivPercent.toFixed(2)}%`, positive: data.totalDivPercent >= 0 },
        { label: 'total return', value: `${data.pnLWithDividendPercent.toFixed(2)}%`, positive: data.pnLWithDividendPercent >= 0 },
        { label: 'yearly average', value: `${yearlyAverage}%`, positive: yearlyAverage >= 0 }
      ]);

      setAdvancedReturnsData([
        { label: 'capital appreciation', value: `$${data.pnL.toFixed(2)} (${data.pnLPercent.toFixed(2)}%)`, positive: data.pnL >= 0 },
        { label: 'dividend income', value: `$${data.totalDividend.toFixed(2)} (${data.totalDivPercent.toFixed(2)}%)`, positive: data.totalDividend >= 0 },
        { label: 'total return', value: `$${data.pnLWithDividend.toFixed(2)} (${data.pnLWithDividendPercent.toFixed(2)}%)`, positive: data.pnLWithDividend >= 0 },
        { label: 'yearly average return', value: `${yearlyAverage}%`, positive: yearlyAverage >= 0 },
        { label: 'div adjusted return', value: `${((data.pnLWithDividend / (data.totalInvestment - data.totalDividend)) * 100).toFixed(2)}%`, positive: data.pnLWithDividend >= 0 }
      ]);

      setDividendCalculationsData([
        { label: 'current yield', value: `${data.lastDividendYield.toFixed(2)}%`, positive: data.lastDividendYield >= 0 },
        { label: 'yield on cost', value: `${data.yieldOnCost.toFixed(2)}%`, positive: data.yieldOnCost >= 0 },
        { label: 'div adj avg cost', value: `$${divAdjustedCost.toFixed(2)}`, color: '#8b5cf6' },
        { label: 'div adj yield', value: `${divAdjustedYield.toFixed(2)}%`, positive: divAdjustedYield >= 0 },
        { label: 'ttm yield', value: `${data.ttmDividendYield.toFixed(2)}%`, positive: data.ttmDividendYield >= 0 },
        { label: 'monthly average', value: `$${monthlyAvg.toFixed(2)}`, positive: monthlyAvg >= 0 },
        { label: 'annual projected', value: `$${annualProj.toFixed(2)}`, positive: annualProj >= 0 }
      ]);

      setStockInfoData([
        { label: 'current price', value: `$${data.currentPrice.toFixed(2)}` },
        { label: 'average cost', value: `$${data.averageBuyPrice.toFixed(2)}` },
        { label: 'div adj avg cost', value: `$${divAdjustedCost.toFixed(2)}`, color: '#8b5cf6' },
        { label: 'price difference', value: `${priceDiff >= 0 ? '+' : ''}$${priceDiff.toFixed(2)} (${priceDiffPercent.toFixed(2)}%)`, positive: priceDiff >= 0 },
        { label: 'total shares', value: `${data.totalShares}` },
        { label: 'market value', value: `$${data.totalValueToday.toFixed(2)}` },
        { label: 'cost basis', value: `$${data.totalInvestment.toFixed(2)}` }
      ]);

      // Filter payment history based on start and end date
      const startYear = parseInt(startDate().split('-')[0]);
      const endYear = parseInt(endDate().split('-')[0]);

      const filteredHistory = data.dividendHistory
        .filter(hist => hist.year >= startYear && hist.year <= endYear)
        .map(hist => ({
          year: hist.year.toString(),
          total: `$${hist.totalAmount.toFixed(2)}`,
          months: hist.payments.map(p => ({
            month: `${p.label} ${hist.year}`,
            filled: p.status === 'paid',
            amount: p.amount || 0
          }))
        }));

      setPaymentHistoryData(filteredHistory);
      setTotalReceived(`$${data.dividendCalculationDetails.totalDividendIncome.toFixed(2)}`);
      setLastRunTime(new Date().toLocaleTimeString());

    } catch (error) {
      console.error('Backtest failed:', error);
      // Clear data on error
      setStrategyPerformanceData([]);
      setAdvancedReturnsData([]);
      setDividendCalculationsData([]);
      setStockInfoData([]);
      setPaymentHistoryData([]);
      setTotalReceived('$0.00');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="backtesting-page">
      {/* Notification Bar */}
      <Show when={showNotification()}>
        <div class="notification-bar">
          <div class="notification-content">
            <span class="notification-icon">💡</span>
            <div class="notification-text">
              <strong>Strategy: Red Candle Buying</strong>
              <span>Buy {shares()} shares of {symbol()} on each red {timeframe()} candle during the selected period. This dollar cost averaging strategy aims to capitalize on temporary price dips.</span>
            </div>
          </div>
          <button class="notification-close" onClick={() => setShowNotification(false)}>×</button>
        </div>
      </Show>

      {/* Header */}
      <div class="backtesting-header">
        <div class="header-title">
          <span class="title-icon">🔙</span>
          <span>backtesting analytics</span>
          <Show when={lastRunTime()}>
            <span class="last-run">last run: {lastRunTime()}</span>
          </Show>
        </div>
        <button class="export-btn">
          <span>📤</span>
          <span>export results</span>
        </button>
      </div>

      {/* Parameters Section */}
      <div class="params-section">
        <div class="section-title">
          <span class="title-icon">📊</span>
          <span>backtesting parameters</span>
        </div>

        <div class="params-form">
          <div class="form-row">
            <div class="form-group">
              <label>stock symbol</label>
              <input
                type="text"
                value={symbol()}
                onInput={(e) => setSymbol(e.target.value)}
                placeholder="e.g., AAPL"
              />
            </div>
            <div class="form-group">
              <label>timeframe</label>
              <select value={timeframe()} onInput={(e) => setTimeframe(e.target.value)}>
                <option value="1D">1-day</option>
                <option value="1W">1-week</option>
                <option value="1M">1-month</option>
              </select>
            </div>
            <div class="form-group">
              <label>shares per trade</label>
              <input
                type="number"
                value={shares()}
                onInput={(e) => setShares(e.target.value)}
                min="1"
              />
            </div>
            <div class="form-group">
              <label>start date</label>
              <input
                type="date"
                value={startDate()}
                onInput={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div class="form-group">
              <label>end date</label>
              <input
                type="date"
                value={endDate()}
                onInput={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div class="form-group">
              <label>&nbsp;</label>
              <button
                class="run-btn"
                onClick={handleRunBacktest}
                disabled={loading() || !symbol() || !startDate() || !endDate()}
              >
                {loading() ? '⏳ running...' : '🚀 run backtest'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div class="tabs-container">
        <div class="tabs">
          <For each={tabs}>
            {tab => (
              <div
                class={`tab ${activeTab() === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon} {tab.label}
              </div>
            )}
          </For>
        </div>
      </div>

      {/* Content Area */}
      <div class="content-area">
        {/* Strategy Performance Tab */}
        {activeTab() === 'strategy' && (
          <div class="tab-content">
            <div class="section">
              <div class="section-header">📊 strategy performance results</div>
              <Show when={strategyPerformanceData().length === 0 && !loading()}>
                <div class="empty-state">
                  <div class="empty-icon">📈</div>
                  <div class="empty-title">no backtest results</div>
                  <div class="empty-subtitle">run a backtest to see strategy performance metrics</div>
                </div>
              </Show>
              <Show when={strategyPerformanceData().length > 0}>
                <div class="data-grid">
                  <For each={strategyPerformanceData()}>
                    {row => (
                      <div class="data-row">
                        <div class="data-label">{row.label}</div>
                        <div class={row.positive !== undefined ? (row.positive ? 'data-value green' : 'data-value red') : 'data-value'}>
                          {row.value}
                        </div>
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
        )}

        {/* Advanced Returns Tab */}
        {activeTab() === 'returns' && (
          <div class="tab-content">
            <div class="section">
              <div class="section-header">💰 advanced returns analysis</div>
              <Show when={advancedReturnsData().length === 0 && !loading()}>
                <div class="empty-state">
                  <div class="empty-icon">💰</div>
                  <div class="empty-title">no returns data</div>
                  <div class="empty-subtitle">run a backtest to see detailed return analysis</div>
                </div>
              </Show>
              <Show when={advancedReturnsData().length > 0}>
                <div class="data-grid">
                  <For each={advancedReturnsData()}>
                    {row => (
                      <div class="data-row">
                        <div class="data-label">{row.label}</div>
                        <div class={row.positive !== undefined ? (row.positive ? 'data-value green' : 'data-value red') : 'data-value'}>
                          {row.value}
                        </div>
                      </div>
                    )}
                  </For>
                </div>
                <div class="returns-summary">
                  <div class="summary-item">
                    <span class="summary-label">div adjusted cost basis:</span>
                    <span class="summary-value">${divAdjCost().toFixed(2)}/share</span>
                  </div>
                  <div class="summary-item positive">
                    <span class="summary-label">total income:</span>
                    <span class="summary-value">${totalDividend().toFixed(2)} ({totalDivPercent().toFixed(2)}% of investment)</span>
                  </div>
                </div>
              </Show>
            </div>
          </div>
        )}

        {/* Dividend Calculations Tab */}
        {activeTab() === 'dividends' && (
          <div class="tab-content">
            <div class="section">
              <div class="section-header">💵 dividend calculations & metrics</div>
              <Show when={dividendCalculationsData().length === 0 && !loading()}>
                <div class="empty-state">
                  <div class="empty-icon">💵</div>
                  <div class="empty-title">no dividend data</div>
                  <div class="empty-subtitle">run a backtest to see dividend calculations</div>
                </div>
              </Show>
              <Show when={dividendCalculationsData().length > 0}>
                <div class="data-grid">
                  <For each={dividendCalculationsData()}>
                    {row => (
                      <div class="data-row">
                        <div class="data-label">{row.label}</div>
                        <div
                          class={row.positive !== undefined ? (row.positive ? 'data-value green' : 'data-value red') : 'data-value'}
                          style={row.color ? { color: row.color } : {}}
                        >
                          {row.value}
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </div>
        )}

        {/* Stock Information Tab */}
        {activeTab() === 'stock' && (
          <div class="tab-content">
            <div class="section">
              <div class="section-header">📈 stock information & pricing</div>
              <Show when={stockInfoData().length === 0 && !loading()}>
                <div class="empty-state">
                  <div class="empty-icon">📈</div>
                  <div class="empty-title">no stock data</div>
                  <div class="empty-subtitle">run a backtest to see stock information</div>
                </div>
              </Show>
              <Show when={stockInfoData().length > 0}>
                <div class="data-grid">
                  <For each={stockInfoData()}>
                    {row => (
                      <div class="data-row">
                        <div class="data-label">{row.label}</div>
                        <div
                          class={row.positive !== undefined ? (row.positive ? 'data-value green' : 'data-value red') : 'data-value'}
                          style={row.color ? { color: row.color } : {}}
                        >
                          {row.value}
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </div>
        )}

        {/* Payment History Tab */}
        {activeTab() === 'history' && (
          <div class="tab-content">
            <div class="section">
              <div class="section-header">📋 dividend payment history</div>
              <Show when={paymentHistoryData().length === 0 && !loading()}>
                <div class="empty-state">
                  <div class="empty-icon">📋</div>
                  <div class="empty-title">no payment history</div>
                  <div class="empty-subtitle">run a backtest to see dividend payment timeline</div>
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
                    <span class="total-text">total dividends received: {totalReceived()}</span>
                  </div>
                </div>
              </Show>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
