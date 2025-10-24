// Analysis Page - Portfolio Analysis View
import { createSignal } from 'solid-js';
import './Analysis.css';

export default function Analysis(props) {
  const [activeTab, setActiveTab] = createSignal(0);

  // Mock data - will be replaced with real data from backend
  const mockData = {
    currentGain: 0.00,
    dividendYield: 0.00,
    totalReturns: 0.00,
    totalInvestment: 0.00,
    currentValue: 0.00,
    totalReturnValue: 0.00,
    returnPercentage: 0.00,
    numberOfPositions: 0,
    dividendPayingStocks: 0,
    averagePositionSize: 0.00,
    largestPosition: { value: 0.00, symbol: 'n/a' },
    currentYield: 0.00,
    yieldOnCost: 0.00,
    dividendAdjustedAvgCost: 0.00,
    dividendAdjustedYield: 0.00,
    ttmYield: 0.00,
    monthlyAverageIncome: 0.00,
    annualProjectedIncome: 0.00,
    totalDividendsReceived: 0.00,
    capitalGainsValue: 0.00,
    dividendIncomeValue: 0.00,
    capitalGainsPercentage: 0.00,
    dividendReturnPercentage: 0.00,
    bestPerformingStock: { symbol: 'n/a', percentage: 0.00 },
    monthlyIncome: 0.00,
    portfolioConcentration: 'low',
    largestPositionWeight: 'n/a',
    sectorConcentration: 'moderate',
    geographicExposure: 'canada/us',
    dividendDependency: 'n/a',
    yieldStability: 'stable',
    concentrationRisk: 30,
    highYieldAssets: 0.00,
    growthAssets: 0.00,
    averagePortfolioYield: 0.00
  };

  const tabs = [
    { id: 0, label: '📊 portfolio-metrics', icon: '📊' },
    { id: 1, label: '💰 dividend-analysis', icon: '💰' },
    { id: 2, label: '📈 performance-breakdown', icon: '📈' },
    { id: 3, label: '⚠️ risk-analysis', icon: '⚠️' },
    { id: 4, label: '📋 allocation-analysis', icon: '📋' }
  ];

  const formatCurrency = (value) => {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercent = (value) => {
    return `${value.toFixed(2)}%`;
  };

  return (
    <div class="analysis-page">
      {/* Header */}
      <div class="analysis-header">
        <div class="header-title">
          <span class="title-icon">📈</span>
          <span>Portfolio Analysis</span>
        </div>
        <button class="export-btn">
          <span>📤</span>
          <span>export-analysis</span>
        </button>
      </div>

      {/* Metrics Bar */}
      <div class="metrics-bar">
        <div class="metrics-row">
          <div class="metric-card">
            <div class="metric-icon">📊</div>
            <div class="metric-label">current-gain</div>
            <div class="metric-value green">{formatPercent(mockData.currentGain)}</div>
            <div class="metric-sub">capital appreciation</div>
          </div>
          <div class="metric-card">
            <div class="metric-icon">💰</div>
            <div class="metric-label">dividend-yield</div>
            <div class="metric-value">{formatPercent(mockData.dividendYield)}</div>
            <div class="metric-sub">current yield for account</div>
          </div>
          <div class="metric-card">
            <div class="metric-icon">💎</div>
            <div class="metric-label">total-returns</div>
            <div class="metric-value green">{formatCurrency(mockData.totalReturns)}</div>
            <div class="metric-sub">including dividends</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div class="tabs-container">
        <div class="tabs">
          {tabs.map((tab) => (
            <div
              class={`tab ${activeTab() === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </div>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div class="content-area">
        {/* Tab 0: Portfolio Metrics */}
        {activeTab() === 0 && (
          <div class="tab-content">
            <div class="section">
              <div class="section-title">📊 portfolio-overview</div>
              <div class="data-row">
                <div class="data-label">total-investment</div>
                <div class="data-value">{formatCurrency(mockData.totalInvestment)}</div>
              </div>
              <div class="data-row">
                <div class="data-label">current-value</div>
                <div class="data-value">{formatCurrency(mockData.currentValue)}</div>
              </div>
              <div class="data-row">
                <div class="data-label">total-return-value</div>
                <div class="data-value green">{formatCurrency(mockData.totalReturnValue)}</div>
              </div>
              <div class="data-row">
                <div class="data-label">return-percentage</div>
                <div class="data-value green">{formatPercent(mockData.returnPercentage)}</div>
              </div>
              <div class="data-row">
                <div class="data-label">number-of-positions</div>
                <div class="data-value">{mockData.numberOfPositions}</div>
              </div>
              <div class="data-row">
                <div class="data-label">dividend-paying-stocks</div>
                <div class="data-value">{mockData.dividendPayingStocks}</div>
              </div>
              <div class="data-row">
                <div class="data-label">average-position-size</div>
                <div class="data-value">{formatCurrency(mockData.averagePositionSize)}</div>
              </div>
              <div class="data-row">
                <div class="data-label">largest-position</div>
                <div class="data-value">
                  {formatCurrency(mockData.largestPosition.value)} <span class="data-symbol">({mockData.largestPosition.symbol})</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 1: Dividend Analysis */}
        {activeTab() === 1 && (
          <div class="tab-content">
            <div class="section">
              <div class="section-title">💰 dividend-analysis</div>
              <div class="data-row">
                <div class="data-label">current-yield</div>
                <div class="data-value green">{formatPercent(mockData.currentYield)}</div>
              </div>
              <div class="data-row">
                <div class="data-label">yield-on-cost</div>
                <div class="data-value green">{formatPercent(mockData.yieldOnCost)}</div>
              </div>
              <div class="data-row">
                <div class="data-label">dividend-adjusted-avg-cost</div>
                <div class="data-value accent">{formatCurrency(mockData.dividendAdjustedAvgCost)}</div>
              </div>
              <div class="data-row">
                <div class="data-label">dividend-adjusted-yield</div>
                <div class="data-value green">{formatPercent(mockData.dividendAdjustedYield)}</div>
              </div>
              <div class="data-row">
                <div class="data-label">ttm-yield</div>
                <div class="data-value green">{formatPercent(mockData.ttmYield)}</div>
              </div>
              <div class="data-row">
                <div class="data-label">monthly-average-income</div>
                <div class="data-value green">{formatCurrency(mockData.monthlyAverageIncome)}</div>
              </div>
              <div class="data-row">
                <div class="data-label">annual-projected-income</div>
                <div class="data-value green">{formatCurrency(mockData.annualProjectedIncome)}</div>
              </div>
              <div class="data-row">
                <div class="data-label">total-dividends-received</div>
                <div class="data-value green">{formatCurrency(mockData.totalDividendsReceived)}</div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Performance Breakdown */}
        {activeTab() === 2 && (
          <div class="tab-content">
            <div class="section">
              <div class="section-title">📈 performance-breakdown</div>
              <div class="data-row">
                <div class="data-label">capital-gains-value</div>
                <div class="data-value green">{formatCurrency(mockData.capitalGainsValue)}</div>
              </div>
              <div class="data-row">
                <div class="data-label">dividend-income-value</div>
                <div class="data-value green">{formatCurrency(mockData.dividendIncomeValue)}</div>
              </div>
              <div class="data-row">
                <div class="data-label">capital-gains-percentage</div>
                <div class="data-value green">{formatPercent(mockData.capitalGainsPercentage)}</div>
              </div>
              <div class="data-row">
                <div class="data-label">dividend-return-percentage</div>
                <div class="data-value green">{formatPercent(mockData.dividendReturnPercentage)}</div>
              </div>
              <div class="data-row">
                <div class="data-label">best-performing-stock</div>
                <div class="data-value green">
                  {mockData.bestPerformingStock.symbol} <span class="data-symbol">({formatPercent(mockData.bestPerformingStock.percentage)})</span>
                </div>
              </div>
              <div class="data-row">
                <div class="data-label">monthly-income</div>
                <div class="data-value green">{formatCurrency(mockData.monthlyIncome)}</div>
              </div>
              <div class="data-row">
                <div class="data-label">annual-projected-income</div>
                <div class="data-value green">{formatCurrency(mockData.annualProjectedIncome)}</div>
              </div>
            </div>

            <div class="section">
              <div class="section-title">return-composition</div>
              <div class="data-row">
                <div class="data-label">capital-gains</div>
                <div class="progress-bar">
                  <div class="progress-track">
                    <div class="progress-fill" style={`width: ${mockData.capitalGainsPercentage}%`}></div>
                  </div>
                  <div class="progress-label">{formatPercent(mockData.capitalGainsPercentage)}</div>
                </div>
              </div>
              <div class="data-row">
                <div class="data-label">dividend-income</div>
                <div class="progress-bar">
                  <div class="progress-track">
                    <div class="progress-fill" style={`width: ${mockData.dividendReturnPercentage}%`}></div>
                  </div>
                  <div class="progress-label">{formatPercent(mockData.dividendReturnPercentage)}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Risk Analysis */}
        {activeTab() === 3 && (
          <div class="tab-content">
            <div class="section">
              <div class="section-title">⚠️ risk-assessment</div>
              <div class="data-row">
                <div class="data-label">portfolio-concentration</div>
                <div class="data-value">{mockData.portfolioConcentration}</div>
              </div>
              <div class="data-row">
                <div class="data-label">largest-position-weight</div>
                <div class="data-value gray">{mockData.largestPositionWeight}</div>
              </div>
              <div class="data-row">
                <div class="data-label">sector-concentration</div>
                <div class="data-value warning">{mockData.sectorConcentration}</div>
              </div>
              <div class="data-row">
                <div class="data-label">geographic-exposure</div>
                <div class="data-value">{mockData.geographicExposure}</div>
              </div>
              <div class="data-row">
                <div class="data-label">dividend-dependency</div>
                <div class="data-value gray">{mockData.dividendDependency}</div>
              </div>
              <div class="data-row">
                <div class="data-label">yield-stability</div>
                <div class="data-value green">{mockData.yieldStability}</div>
              </div>
            </div>

            <div class="section">
              <div class="section-title">risk-level-assessment</div>
              <div class="data-row">
                <div class="data-label">concentration-risk</div>
                <div class="progress-bar">
                  <div class="progress-track">
                    <div class="progress-fill low" style={`width: ${mockData.concentrationRisk}%`}></div>
                  </div>
                  <div class="progress-label">low</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Allocation Analysis */}
        {activeTab() === 4 && (
          <div class="tab-content">
            <div class="section">
              <div class="section-title">📋 asset-allocation</div>
              <div class="data-row">
                <div class="data-label">high-yield-assets</div>
                <div class="data-value green">{formatPercent(mockData.highYieldAssets)}</div>
              </div>
              <div class="data-row">
                <div class="data-label">growth-assets</div>
                <div class="data-value green">{formatPercent(mockData.growthAssets)}</div>
              </div>
              <div class="data-row">
                <div class="data-label">average-portfolio-yield</div>
                <div class="data-value green">{formatPercent(mockData.averagePortfolioYield)}</div>
              </div>
            </div>

            <div class="section">
              <div class="section-title">asset-distribution</div>
              <div class="data-row">
                <div class="data-label">● high-yield-assets</div>
                <div class="progress-bar">
                  <div class="progress-track">
                    <div class="progress-fill" style={`width: ${mockData.highYieldAssets}%`}></div>
                  </div>
                  <div class="progress-label">{formatPercent(mockData.highYieldAssets)}</div>
                </div>
              </div>
              <div class="data-row">
                <div class="data-label">● growth-assets</div>
                <div class="progress-bar">
                  <div class="progress-track">
                    <div class="progress-fill accent-fill" style={`width: ${mockData.growthAssets}%`}></div>
                  </div>
                  <div class="progress-label">{formatPercent(mockData.growthAssets)}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
