// Dividend Analysis Page - Portfolio Analysis Charts
import { createSignal, createEffect, createMemo, onMount, Show } from 'solid-js';
import MetricsGrid from '../components/metrics/MetricsGrid';
import DonutChart from '../components/charts/DonutChart';
import { fetchPortfolioAnalysis, fetchPositions, fetchCashBalances, fetchExchangeRate } from '../services/api';
import './DividendAnalysis.css';

export default function DividendAnalysis(props) {
  const [loading, setLoading] = createSignal(true);
  const [analysisData, setAnalysisData] = createSignal(null);
  const [positions, setPositions] = createSignal([]);
  const [cashBalances, setCashBalances] = createSignal([]);
  const [exchangeRate, setExchangeRate] = createSignal({ rate: 1.40, percentChange: 0 });
  const [viewMode, setViewMode] = createSignal('investment'); // 'investment' or 'market'

  const personName = () => props.selectedPerson || 'Vivek';

  // Metrics state (same as Holdings page)
  const [metrics, setMetrics] = createSignal({
    totalInvested: 0,
    currentValue: 0,
    profitLoss: 0,
    profitLossPercent: 0,
    totalReturn: 0,
    totalReturnPercent: 0,
    todayPnL: 0,
    todayPnLPercent: 0,
    yoc: 0,
    monthlyIncome: 0,
    totalDividendsReceived: 0,
    totalCashCAD: 0,
    totalCashUSD: 0,
    cashAccountCount: 0,
    positionCount: 0
  });

  // Load data
  async function loadData() {
    try {
      setLoading(true);

      const filter = (typeof props.accountFilter === 'function' ? props.accountFilter() : props.accountFilter) || { type: 'person', value: 'Vivek' };

      // Determine person and accountId based on filter type
      let person;
      let accountId = null;

      if (filter.type === 'all') {
        person = 'all';
      } else if (filter.type === 'account' && filter.value) {
        // Account-level filter: use the person from account info, pass accountId
        person = filter.value.personName || personName();
        accountId = filter.value.accountId || filter.value.accountNumber || null;
      } else {
        // Person-level filter
        person = filter.value || personName();
      }

      console.log('📊 Loading analysis data for:', person, accountId ? `(account: ${accountId})` : '');

      // Fetch analysis data and positions in parallel
      const [analysis, positionsData, cashData, rate] = await Promise.all([
        fetchPortfolioAnalysis(person, viewMode(), accountId),
        fetchPositions(person),
        fetchCashBalances(person),
        fetchExchangeRate()
      ]);

      console.log('✅ Analysis data received:', analysis);
      console.log('✅ Positions loaded:', positionsData?.length);

      setAnalysisData(analysis);
      setPositions(positionsData || []);
      setCashBalances(cashData || []);

      const rateObject = typeof rate === 'object' && rate.rate
        ? { rate: rate.rate, percentChange: rate.percentChange || 0, ...rate }
        : (typeof rate === 'number' ? { rate: rate, percentChange: 0 } : { rate: 1.40, percentChange: 0 });
      setExchangeRate(rateObject);

      // Calculate metrics (same logic as Holdings page)
      calculateMetrics(positionsData || [], cashData || [], rateObject.rate, filter);

      setLoading(false);
    } catch (error) {
      console.error('❌ Error loading analysis data:', error);
      setLoading(false);
    }
  }

  // Calculate metrics (simplified version from Holdings)
  function calculateMetrics(positions, cash, rate, filter) {
    const displayCurrency = (typeof props.selectedCurrency === 'function' ? props.selectedCurrency() : props.selectedCurrency) || 'CAD';

    let totalInvested = 0;
    let currentValue = 0;
    let totalDividendIncome = 0;
    let todayPnL = 0;
    let yocTotalInvested = 0;
    let yocTotalDividendIncome = 0;
    const dividendsBySymbol = new Map();

    positions.forEach(pos => {
      const cost = pos.averageEntryPrice || 0;
      const currentPrice = pos.currentPrice || 0;
      const previousClose = pos.previousClose || pos.openPrice || currentPrice;
      const qty = pos.openQuantity || 0;
      const isUSD = pos.currency === 'USD';
      const excludedFromYoC = pos.excludedFromYoC || false;

      const positionDayPnl = (currentPrice - previousClose) * qty;

      let costInDisplayCurrency, priceInDisplayCurrency, dayPnlInDisplayCurrency;
      if (displayCurrency === 'USD') {
        costInDisplayCurrency = isUSD ? cost : cost / rate;
        priceInDisplayCurrency = isUSD ? currentPrice : currentPrice / rate;
        dayPnlInDisplayCurrency = isUSD ? positionDayPnl : positionDayPnl / rate;
      } else {
        costInDisplayCurrency = isUSD ? cost * rate : cost;
        priceInDisplayCurrency = isUSD ? currentPrice * rate : currentPrice;
        dayPnlInDisplayCurrency = isUSD ? positionDayPnl * rate : positionDayPnl;
      }

      const positionInvested = costInDisplayCurrency * qty;
      const positionValue = priceInDisplayCurrency * qty;

      totalInvested += positionInvested;
      currentValue += positionValue;
      todayPnL += dayPnlInDisplayCurrency;

      const annualDividend = pos.dividendData?.annualDividend || 0;
      const annualDividendInDisplayCurrency = displayCurrency === 'USD'
        ? (isUSD ? annualDividend : annualDividend / rate)
        : (isUSD ? annualDividend * rate : annualDividend);

      totalDividendIncome += annualDividendInDisplayCurrency;

      if (!excludedFromYoC) {
        yocTotalInvested += positionInvested;
        yocTotalDividendIncome += annualDividendInDisplayCurrency;
      }

      const positionTotalDivReceived = pos.dividendData?.totalReceived || 0;
      if (!dividendsBySymbol.has(pos.symbol)) {
        const totalDivReceivedInDisplayCurrency = displayCurrency === 'USD'
          ? (isUSD ? positionTotalDivReceived : positionTotalDivReceived / rate)
          : (isUSD ? positionTotalDivReceived * rate : positionTotalDivReceived);
        dividendsBySymbol.set(pos.symbol, totalDivReceivedInDisplayCurrency);
      }
    });

    const totalDividendsReceived = Array.from(dividendsBySymbol.values()).reduce((sum, val) => sum + val, 0);
    const profitLoss = currentValue - totalInvested;
    const profitLossPercent = totalInvested > 0 ? (profitLoss / totalInvested) * 100 : 0;
    const todayPnLPercent = currentValue > 0 ? (todayPnL / (currentValue - todayPnL)) * 100 : 0;
    const totalReturn = profitLoss + totalDividendsReceived;
    const totalReturnPercent = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0;
    const yoc = yocTotalInvested > 0 ? (yocTotalDividendIncome / yocTotalInvested) * 100 : 0;
    const monthlyIncome = yocTotalDividendIncome / 12;

    // Cash calculation
    let totalCashCAD = 0;
    let totalCashUSD = 0;
    let accountCount = 0;

    if (cash && cash.accounts && Array.isArray(cash.accounts)) {
      const accountsToSum = filter && filter.type === 'account' && filter.value?.accountType
        ? cash.accounts.filter(acc => acc.accountType === filter.value.accountType)
        : cash.accounts;

      accountCount = accountsToSum.length;
      accountsToSum.forEach(account => {
        if (account.cashBalances && Array.isArray(account.cashBalances)) {
          account.cashBalances.forEach(balance => {
            const amount = balance.cash || 0;
            if (balance.currency === 'USD') {
              totalCashUSD += amount;
            } else if (balance.currency === 'CAD') {
              totalCashCAD += amount;
            }
          });
        }
      });
    }

    setMetrics({
      totalInvested,
      currentValue,
      profitLoss,
      profitLossPercent,
      totalReturn,
      totalReturnPercent,
      todayPnL,
      todayPnLPercent,
      yoc,
      monthlyIncome,
      totalDividendsReceived,
      totalCashCAD,
      totalCashUSD,
      cashAccountCount: accountCount,
      positionCount: positions.length,
      displayCurrency
    });
  }

  // Format metrics for MetricsGrid (same as Holdings page)
  const formattedMetrics = createMemo(() => {
    const m = metrics();
    const displayCurr = m.displayCurrency || 'CAD';
    const currSymbol = displayCurr === 'USD' ? 'USD' : 'CAD';
    const rateObj = exchangeRate();
    const rate = typeof rateObj === 'object' ? rateObj.rate : rateObj;

    let totalCash;
    if (displayCurr === 'USD') {
      totalCash = m.totalCashUSD + (m.totalCashCAD / rate);
    } else {
      totalCash = m.totalCashCAD + (m.totalCashUSD * rate);
    }

    const cashValue = `Total ${displayCurr}: $${totalCash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\nCAD $${m.totalCashCAD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\nUSD $${m.totalCashUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    return [
      {
        name: 'INVEST',
        value: `${currSymbol}: $${m.totalInvested.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        info: `${m.positionCount} pos`,
        successTag: null
      },
      {
        name: 'CURRENT',
        value: `${currSymbol}: $${m.currentValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        info: 'live',
        successTag: null
      },
      {
        name: 'P&L',
        value: `${currSymbol}: $${m.profitLoss.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        info: `${m.profitLossPercent >= 0 ? '+' : ''}${m.profitLossPercent.toFixed(2)}%`,
        successTag: m.profitLossPercent >= 0 ? `+${m.profitLossPercent.toFixed(2)}%` : null
      },
      {
        name: "TODAY'S P&L",
        value: `${currSymbol}: ${m.todayPnL >= 0 ? '+' : ''}$${Math.abs(m.todayPnL).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        info: `${m.todayPnLPercent >= 0 ? '+' : ''}${m.todayPnLPercent.toFixed(2)}%`,
        successTag: m.todayPnL >= 0 ? `+${m.todayPnLPercent.toFixed(2)}%` : null,
        errorTag: m.todayPnL < 0 ? `${m.todayPnLPercent.toFixed(2)}%` : null
      },
      {
        name: 'RETURN',
        value: `${currSymbol}: $${m.totalReturn.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        info: `${m.totalReturnPercent >= 0 ? '+' : ''}${m.totalReturnPercent.toFixed(2)}%`,
        successTag: m.totalReturnPercent >= 0 ? `+${m.totalReturnPercent.toFixed(2)}%` : null
      },
      {
        name: 'YOC',
        value: `${m.yoc.toFixed(2)}%`,
        info: `${currSymbol}: ${m.monthlyIncome.toFixed(0)}/mo`,
        extraInfo: `Total Dividends: ${m.totalDividendsReceived.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        successTag: null
      },
      {
        name: 'CASH',
        value: cashValue,
        info: `${m.cashAccountCount} account${m.cashAccountCount !== 1 ? 's' : ''}`,
        successTag: null
      }
    ];
  });

  // Prepare chart data from analysis
  const dividendChartData = createMemo(() => {
    const data = analysisData();
    if (!data || !data.dividendBreakdown) return [];

    return [
      {
        label: 'Dividend Paying',
        value: data.dividendBreakdown.dividendPaying?.value || 0,
        color: '#4ade80' // Green
      },
      {
        label: 'Non-Dividend',
        value: data.dividendBreakdown.nonDividend?.value || 0,
        color: '#6b7280' // Gray
      }
    ].filter(item => item.value > 0);
  });

  const categoryChartData = createMemo(() => {
    const data = analysisData();
    if (!data || !data.categoryBreakdown) return [];

    const colors = {
      DIVIDEND_ETF: '#4ade80', // Green
      INDEX_ETF: '#3b82f6',    // Blue
      STOCK: '#f97316',        // Orange
      COMMODITY: '#eab308',    // Yellow
      UNCATEGORIZED: '#6b7280' // Gray
    };

    const labels = {
      DIVIDEND_ETF: 'Dividend ETF',
      INDEX_ETF: 'Index ETF',
      STOCK: 'Stock',
      COMMODITY: 'Commodity',
      UNCATEGORIZED: 'Uncategorized'
    };

    return Object.entries(data.categoryBreakdown)
      .filter(([key, val]) => val.value > 0)
      .map(([key, val]) => ({
        label: labels[key] || key,
        value: val.value,
        color: colors[key] || '#6b7280'
      }));
  });

  const commodityChartData = createMemo(() => {
    const data = analysisData();
    if (!data || !data.commodityBreakdown) return [];

    const colors = {
      GOLD: '#eab308',    // Gold
      SILVER: '#94a3b8',  // Silver
      PLATINUM: '#e2e8f0', // Platinum
      OTHER: '#6b7280'    // Gray
    };

    return Object.entries(data.commodityBreakdown)
      .filter(([key, val]) => val.value > 0)
      .map(([key, val]) => ({
        label: key.charAt(0) + key.slice(1).toLowerCase(),
        value: val.value,
        color: colors[key] || '#6b7280'
      }));
  });

  // Format currency for center display
  const formatCurrency = (value) => {
    const displayCurr = metrics().displayCurrency || 'CAD';
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  // Reload when filters change
  createEffect(() => {
    const filter = (typeof props.accountFilter === 'function' ? props.accountFilter() : props.accountFilter) || { type: 'person', value: 'Vivek' };
    console.log('🔄 Filter changed, reloading analysis data:', JSON.stringify(filter));
    loadData();
  });

  onMount(() => {
    loadData();
  });

  return (
    <div class="dividend-analysis-page">
      <div class="workspace-head">
        <div class="workspace-title">Dividend Analysis</div>
        <div class="view-mode-toggle">
          <button
            class={`view-mode-btn ${viewMode() === 'investment' ? 'active' : ''}`}
            onClick={() => { setViewMode('investment'); loadData(); }}
          >
            Investment View
          </button>
          <button
            class={`view-mode-btn ${viewMode() === 'market' ? 'active' : ''}`}
            onClick={() => { setViewMode('market'); loadData(); }}
          >
            Market View
          </button>
        </div>
      </div>

      <MetricsGrid metrics={formattedMetrics()} loading={loading()} />

      <Show when={!loading()} fallback={<div class="loading-charts">Loading analysis...</div>}>
        <div class="charts-grid">
          {/* Dividend vs Non-Dividend Chart */}
          <div class="chart-card">
            <div class="chart-title">Dividend vs Non-Dividend</div>
            <Show when={dividendChartData().length > 0} fallback={<div class="no-data">No data available</div>}>
              <DonutChart
                data={dividendChartData()}
                size={200}
                strokeWidth={40}
                centerValue={formatCurrency(analysisData()?.summary?.totalValue || 0)}
                centerLabel="Total Value"
                showLegend={true}
              />
            </Show>
          </div>

          {/* Category Breakdown Chart */}
          <div class="chart-card">
            <div class="chart-title">ETF Category Breakdown</div>
            <Show when={categoryChartData().length > 0} fallback={<div class="no-data">No categories set</div>}>
              <DonutChart
                data={categoryChartData()}
                size={200}
                strokeWidth={40}
                centerValue={`${analysisData()?.summary?.holdingsCount || 0}`}
                centerLabel="Holdings"
                showLegend={true}
              />
            </Show>
          </div>

          {/* Commodities Breakdown Chart */}
          <div class="chart-card">
            <div class="chart-title">Commodities Breakdown</div>
            <Show when={commodityChartData().length > 0} fallback={<div class="no-data">No commodities</div>}>
              <DonutChart
                data={commodityChartData()}
                size={200}
                strokeWidth={40}
                centerValue={`${analysisData()?.summary?.commodityCount || 0}`}
                centerLabel="Commodities"
                showLegend={true}
              />
            </Show>
          </div>

        </div>
      </Show>
    </div>
  );
}
