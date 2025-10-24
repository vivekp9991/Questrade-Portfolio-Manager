import { createSignal, Index, Show, onMount, onCleanup } from 'solid-js';
import StockCell from './StockCell';
import './HoldingsTable.css';

const HoldingsTable = (props) => {
  const [searchQuery, setSearchQuery] = createSignal('');
  const [currentPage, setCurrentPage] = createSignal(1);
  const [rowsPerPage, setRowsPerPage] = createSignal(10);
  const [showColumnFilter, setShowColumnFilter] = createSignal(false);
  let filterButtonRef;
  const [sortColumn, setSortColumn] = createSignal(null);
  const [sortDirection, setSortDirection] = createSignal('asc');
  const [visibleColumns, setVisibleColumns] = createSignal({
    stock: true,
    shares: true,
    avgCost: true,
    previousClose: false, // Hidden by default, user can show it
    currentPrice: true,
    todayChange: true,
    totalPnL: true,
    portfolioPercentage: true,
    currentYield: true,
    monthlyYield: true,
    yoc: true,
    investmentValue: true,
    marketValue: true,
    todayReturn: true,
    divPerShare: true,
    monthlyDivIncome: true,
    totalDivReceived: true,
    divAdjCost: true,
    divAdjYield: true,
    sourceAccounts: true,
    actions: true
  });

  // Default holdings if not provided
  const holdings = () => props.holdings || [];

  // Filter and sort holdings
  const filteredHoldings = () => {
    const query = searchQuery().toLowerCase();
    let filtered = holdings();

    // Apply search filter
    if (query) {
      filtered = filtered.filter((holding) =>
        holding.ticker?.toLowerCase().includes(query) ||
        holding.company?.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    const column = sortColumn();
    const direction = sortDirection();

    if (column) {
      filtered = [...filtered].sort((a, b) => {
        let aValue = a[column];
        let bValue = b[column];

        // Handle null/undefined values
        if (aValue == null) aValue = 0;
        if (bValue == null) bValue = 0;

        // For string columns (ticker, company, sourceAccounts)
        if (typeof aValue === 'string' || typeof bValue === 'string') {
          aValue = String(aValue).toLowerCase();
          bValue = String(bValue).toLowerCase();
          return direction === 'asc'
            ? aValue.localeCompare(bValue)
            : bValue.localeCompare(aValue);
        }

        // For numeric columns
        return direction === 'asc' ? aValue - bValue : bValue - aValue;
      });
    }

    return filtered;
  };

  // Paginated holdings
  const paginatedHoldings = () => {
    const filtered = filteredHoldings();
    const start = (currentPage() - 1) * rowsPerPage();
    const end = start + rowsPerPage();
    return filtered.slice(start, end);
  };

  // Calculate total pages
  const totalPages = () => Math.ceil(filteredHoldings().length / rowsPerPage());

  // Format currency
  const formatCurrency = (value) => {
    if (typeof value === 'number') {
      return `$${value.toFixed(2)}`;
    }
    return value || '$0.00';
  };

  // Format dividend amounts with 4 decimal places
  const formatDividend = (value) => {
    if (typeof value === 'number') {
      return `$${value.toFixed(4)}`;
    }
    return value || '$0.0000';
  };

  // Format percentage
  const formatPercentage = (value) => {
    if (typeof value === 'number') {
      return `${value.toFixed(2)}%`;
    }
    return value || '0.00%';
  };

  // Get change color class
  const getChangeClass = (value) => {
    if (typeof value === 'number') {
      return value >= 0 ? 'positive' : 'negative';
    }
    if (typeof value === 'string') {
      return value.startsWith('-') ? 'negative' : 'positive';
    }
    return '';
  };

  // Toggle column visibility
  const toggleColumn = (column) => {
    console.log(`🔧 Toggling column: ${column}, current:`, visibleColumns()[column]);
    setVisibleColumns((prev) => {
      const newState = {
        ...prev,
        [column]: !prev[column]
      };
      console.log(`✅ New visibility state:`, newState);
      return newState;
    });
  };

  // Sort table by column
  const sortTable = (column) => {
    const currentDir = sortColumn() === column ? sortDirection() : 'asc';
    const newDir = currentDir === 'asc' ? 'desc' : 'asc';
    setSortColumn(column);
    setSortDirection(newDir);
  };

  // Get sort indicator
  const getSortIndicator = (column) => {
    if (sortColumn() === column) {
      return sortDirection() === 'asc' ? '↑' : '↓';
    }
    return '↕';
  };

  // Handle click outside to close filter dropdown
  onMount(() => {
    const handleClickOutside = (event) => {
      if (showColumnFilter() && filterButtonRef && !filterButtonRef.contains(event.target)) {
        setShowColumnFilter(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    onCleanup(() => {
      document.removeEventListener('mousedown', handleClickOutside);
    });
  });

  // Handle export
  const handleExport = () => {
    console.log('Exporting holdings data...');
    if (props.onExport) {
      props.onExport(filteredHoldings());
    }
  };

  return (
    <div class="holdings-table-container">
      {/* Toolbar */}
      <div class="holdings-toolbar">
        <div class="search-container">
          <input
            type="text"
            class="search-input"
            placeholder="search holdings..."
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div class="toolbar-actions">
          <div class="filter-dropdown-container" ref={filterButtonRef}>
            <button
              class="filter-button"
              onClick={() => setShowColumnFilter(!showColumnFilter())}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              <span>filter</span>
            </button>

            <Show when={showColumnFilter()}>
              <div class="column-filter-dropdown">
                <div class="filter-dropdown-header">SHOW COLUMNS</div>
                <label class="filter-checkbox-item">
                  <input type="checkbox" checked={visibleColumns().shares} onInput={() => toggleColumn('shares')} />
                  <span>SHARES</span>
                </label>
                <label class="filter-checkbox-item">
                  <input type="checkbox" checked={visibleColumns().avgCost} onInput={() => toggleColumn('avgCost')} />
                  <span>AVG COST</span>
                </label>
                <label class="filter-checkbox-item">
                  <input type="checkbox" checked={visibleColumns().previousClose} onInput={() => toggleColumn('previousClose')} />
                  <span>PREV CLOSE</span>
                </label>
                <label class="filter-checkbox-item">
                  <input type="checkbox" checked={visibleColumns().currentPrice} onInput={() => toggleColumn('currentPrice')} />
                  <span>CURRENT PRICE</span>
                </label>
                <label class="filter-checkbox-item">
                  <input type="checkbox" checked={visibleColumns().todayChange} onInput={() => toggleColumn('todayChange')} />
                  <span>TODAY CHANGE</span>
                </label>
                <label class="filter-checkbox-item">
                  <input type="checkbox" checked={visibleColumns().totalPnL} onInput={() => toggleColumn('totalPnL')} />
                  <span>TOTAL P&L</span>
                </label>
                <label class="filter-checkbox-item">
                  <input type="checkbox" checked={visibleColumns().portfolioPercentage} onInput={() => toggleColumn('portfolioPercentage')} />
                  <span>% OF PORTFOLIO</span>
                </label>
                <label class="filter-checkbox-item">
                  <input type="checkbox" checked={visibleColumns().currentYield} onInput={() => toggleColumn('currentYield')} />
                  <span>CURRENT YIELD</span>
                </label>
                <label class="filter-checkbox-item">
                  <input type="checkbox" checked={visibleColumns().monthlyYield} onInput={() => toggleColumn('monthlyYield')} />
                  <span>MONTHLY YIELD</span>
                </label>
                <label class="filter-checkbox-item">
                  <input type="checkbox" checked={visibleColumns().yoc} onInput={() => toggleColumn('yoc')} />
                  <span>YIELD ON COST</span>
                </label>
                <label class="filter-checkbox-item">
                  <input type="checkbox" checked={visibleColumns().investmentValue} onInput={() => toggleColumn('investmentValue')} />
                  <span>INVESTMENT VALUE</span>
                </label>
                <label class="filter-checkbox-item">
                  <input type="checkbox" checked={visibleColumns().marketValue} onInput={() => toggleColumn('marketValue')} />
                  <span>MARKET VALUE</span>
                </label>
                <label class="filter-checkbox-item">
                  <input type="checkbox" checked={visibleColumns().todayReturn} onInput={() => toggleColumn('todayReturn')} />
                  <span>TODAY RETURN</span>
                </label>
                <label class="filter-checkbox-item">
                  <input type="checkbox" checked={visibleColumns().divPerShare} onInput={() => toggleColumn('divPerShare')} />
                  <span>DIV PER SHARE</span>
                </label>
                <label class="filter-checkbox-item">
                  <input type="checkbox" checked={visibleColumns().monthlyDivIncome} onInput={() => toggleColumn('monthlyDivIncome')} />
                  <span>MONTHLY DIV INCOME</span>
                </label>
                <label class="filter-checkbox-item">
                  <input type="checkbox" checked={visibleColumns().totalDivReceived} onInput={() => toggleColumn('totalDivReceived')} />
                  <span>TOTAL DIV RECEIVED</span>
                </label>
                <label class="filter-checkbox-item">
                  <input type="checkbox" checked={visibleColumns().divAdjCost} onInput={() => toggleColumn('divAdjCost')} />
                  <span>DIV ADJ COST</span>
                </label>
                <label class="filter-checkbox-item">
                  <input type="checkbox" checked={visibleColumns().divAdjYield} onInput={() => toggleColumn('divAdjYield')} />
                  <span>DIV ADJ YIELD</span>
                </label>
                <label class="filter-checkbox-item">
                  <input type="checkbox" checked={visibleColumns().sourceAccounts} onInput={() => toggleColumn('sourceAccounts')} />
                  <span>SOURCE ACCOUNTS</span>
                </label>
                <label class="filter-checkbox-item">
                  <input type="checkbox" checked={visibleColumns().actions} onInput={() => toggleColumn('actions')} />
                  <span>ACTIONS</span>
                </label>
              </div>
            </Show>
          </div>

          <button class="export-button" onClick={handleExport}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>export</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div class="table-wrapper">
        <table class="holdings-table">
          <thead>
            <tr>
              <th class="th-stock sortable" onClick={() => sortTable('ticker')}>
                STOCK <span class="sort-indicator">{getSortIndicator('ticker')}</span>
              </th>
              {visibleColumns().shares && (
                <th class="th-right th-shares sortable" onClick={() => sortTable('shares')}>
                  SHARES <span class="sort-indicator">{getSortIndicator('shares')}</span>
                </th>
              )}
              {visibleColumns().avgCost && (
                <th class="th-right th-avgcost sortable" onClick={() => sortTable('cost')}>
                  AVG COST <span class="sort-indicator">{getSortIndicator('cost')}</span>
                </th>
              )}
              {visibleColumns().previousClose && (
                <th class="th-right th-prevclose sortable" onClick={() => sortTable('previousClose')}>
                  PREV CLOSE <span class="sort-indicator">{getSortIndicator('previousClose')}</span>
                </th>
              )}
              {visibleColumns().currentPrice && (
                <th class="th-right th-currentprice sortable" onClick={() => sortTable('price')}>
                  CURRENT PRICE <span class="sort-indicator">{getSortIndicator('price')}</span>
                </th>
              )}
              {visibleColumns().todayChange && (
                <th class="th-right th-todaychange sortable" onClick={() => sortTable('change')}>
                  TODAY CHANGE <span class="sort-indicator">{getSortIndicator('change')}</span>
                </th>
              )}
              {visibleColumns().totalPnL && (
                <th class="th-right th-totalpnl sortable" onClick={() => sortTable('totalPnL')}>
                  TOTAL P&L <span class="sort-indicator">{getSortIndicator('totalPnL')}</span>
                </th>
              )}
              {visibleColumns().portfolioPercentage && (
                <th class="th-right th-portfoliopct sortable" onClick={() => sortTable('portfolioPercentage')}>
                  % OF PORTFOLIO <span class="sort-indicator">{getSortIndicator('portfolioPercentage')}</span>
                </th>
              )}
              {visibleColumns().currentYield && (
                <th class="th-right sortable" onClick={() => sortTable('yield')}>
                  CURRENT YIELD <span class="sort-indicator">{getSortIndicator('yield')}</span>
                </th>
              )}
              {visibleColumns().monthlyYield && (
                <th class="th-right sortable" onClick={() => sortTable('monthlyYield')}>
                  MONTHLY YIELD <span class="sort-indicator">{getSortIndicator('monthlyYield')}</span>
                </th>
              )}
              {visibleColumns().yoc && (
                <th class="th-right sortable" onClick={() => sortTable('yoc')}>
                  YIELD ON COST <span class="sort-indicator">{getSortIndicator('yoc')}</span>
                </th>
              )}
              {visibleColumns().investmentValue && (
                <th class="th-right sortable" onClick={() => sortTable('investmentValue')}>
                  INVESTMENT VALUE <span class="sort-indicator">{getSortIndicator('investmentValue')}</span>
                </th>
              )}
              {visibleColumns().marketValue && (
                <th class="th-right sortable" onClick={() => sortTable('marketValue')}>
                  MARKET VALUE <span class="sort-indicator">{getSortIndicator('marketValue')}</span>
                </th>
              )}
              {visibleColumns().todayReturn && (
                <th class="th-right sortable" onClick={() => sortTable('todayReturn')}>
                  TODAY RETURN <span class="sort-indicator">{getSortIndicator('todayReturn')}</span>
                </th>
              )}
              {visibleColumns().divPerShare && (
                <th class="th-right sortable" onClick={() => sortTable('divPerShare')}>
                  DIV PER SHARE <span class="sort-indicator">{getSortIndicator('divPerShare')}</span>
                </th>
              )}
              {visibleColumns().monthlyDivIncome && (
                <th class="th-right sortable" onClick={() => sortTable('monthlyDivIncome')}>
                  MONTHLY DIV INCOME <span class="sort-indicator">{getSortIndicator('monthlyDivIncome')}</span>
                </th>
              )}
              {visibleColumns().totalDivReceived && (
                <th class="th-right sortable" onClick={() => sortTable('totalDivReceived')}>
                  TOTAL DIV RECEIVED <span class="sort-indicator">{getSortIndicator('totalDivReceived')}</span>
                </th>
              )}
              {visibleColumns().divAdjCost && (
                <th class="th-right sortable" onClick={() => sortTable('divAdjCost')}>
                  DIV ADJ COST <span class="sort-indicator">{getSortIndicator('divAdjCost')}</span>
                </th>
              )}
              {visibleColumns().divAdjYield && (
                <th class="th-right sortable" onClick={() => sortTable('divAdjYield')}>
                  DIV ADJ YIELD <span class="sort-indicator">{getSortIndicator('divAdjYield')}</span>
                </th>
              )}
              {visibleColumns().sourceAccounts && (
                <th class="th-right sortable" onClick={() => sortTable('sourceAccounts')}>
                  SOURCE ACCOUNTS <span class="sort-indicator">{getSortIndicator('sourceAccounts')}</span>
                </th>
              )}
              {visibleColumns().actions && (
                <th class="th-right">ACTIONS</th>
              )}
            </tr>
          </thead>
          <tbody>
            <Show
              when={paginatedHoldings().length > 0}
              fallback={
                <tr>
                  <td colspan="8" class="empty-state">
                    No holdings found
                  </td>
                </tr>
              }
            >
              <Index each={paginatedHoldings()}>
                {(holding, index) => (
                  <tr class="table-row" data-row-index={index}>
                    <td class="td-stock">
                      <StockCell
                        ticker={holding().ticker}
                        company={holding().company}
                        currency={holding().currency}
                      />
                    </td>
                    {visibleColumns().shares && <td class="td-right td-shares">{holding().shares || 0}</td>}
                    {visibleColumns().avgCost && <td class="td-right td-avgcost">{formatCurrency(holding().cost)}</td>}
                    {visibleColumns().previousClose && <td class="td-right td-prevclose">{formatCurrency(holding().previousClose)}</td>}
                    {visibleColumns().currentPrice && <td class="td-right td-currentprice">{formatCurrency(holding().price)}</td>}
                    {visibleColumns().todayChange && (
                      <td class={`td-right td-todaychange ${getChangeClass(holding().change)}`} style="white-space: nowrap;">
                        {holding().changeDollar >= 0 ? '+' : ''}{formatCurrency(holding().changeDollar)} ({holding().change >= 0 ? '+' : ''}{formatPercentage(holding().change)})
                      </td>
                    )}
                    {visibleColumns().totalPnL && (
                      <td class={`td-right td-totalpnl ${getChangeClass(holding().totalPnL)}`} style="white-space: nowrap;">
                        {holding().totalPnLDollar >= 0 ? '+' : ''}{formatCurrency(holding().totalPnLDollar)} ({holding().totalPnL >= 0 ? '+' : ''}{formatPercentage(holding().totalPnL)})
                      </td>
                    )}
                    {visibleColumns().portfolioPercentage && (
                      <td class="td-right td-portfoliopct">
                        {formatPercentage(holding().portfolioPercentage)}
                      </td>
                    )}
                    {visibleColumns().currentYield && <td class="td-right">{formatPercentage(holding().yield)}</td>}
                    {visibleColumns().monthlyYield && <td class="td-right">{formatCurrency(holding().monthlyYield || 0)}</td>}
                    {visibleColumns().yoc && <td class="td-right">{formatPercentage(holding().yoc)}</td>}
                    {visibleColumns().investmentValue && <td class="td-right">{formatCurrency(holding().investmentValue || 0)}</td>}
                    {visibleColumns().marketValue && <td class="td-right td-value">{formatCurrency(holding().marketValue)}</td>}
                    {visibleColumns().todayReturn && <td class="td-right">{formatCurrency(holding().todayReturn || 0)}</td>}
                    {visibleColumns().divPerShare && <td class="td-right">{formatDividend(holding().divPerShare || 0)}</td>}
                    {visibleColumns().monthlyDivIncome && <td class="td-right">{formatDividend(holding().monthlyDivIncome || 0)}</td>}
                    {visibleColumns().totalDivReceived && <td class="td-right">{formatDividend(holding().totalDivReceived || 0)}</td>}
                    {visibleColumns().divAdjCost && <td class="td-right">{formatCurrency(holding().divAdjCost || 0)}</td>}
                    {visibleColumns().divAdjYield && <td class="td-right">{formatPercentage(holding().divAdjYield || 0)}</td>}
                    {visibleColumns().sourceAccounts && <td class="td-right">{holding().sourceAccounts || '-'}</td>}
                    {visibleColumns().actions && <td class="td-right">-</td>}
                  </tr>
                )}
              </Index>
            </Show>
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div class="holdings-footer">
        <div class="footer-info">
          <span class="footer-label">Show</span>
          <select
            class="rows-per-page-select"
            value={rowsPerPage()}
            onChange={(e) => {
              setRowsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
          >
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
          <span class="footer-text">
            of {filteredHoldings().length} entries
          </span>
        </div>
        <div class="footer-pagination">
          <button
            class="pagination-button"
            disabled={currentPage() === 1}
            onClick={() => setCurrentPage(currentPage() - 1)}
            title="Previous page"
          >
            <span class="arrow-icon">◀</span>
          </button>
          <span class="page-info">
            page {currentPage()} / {totalPages() || 1}
          </span>
          <button
            class="pagination-button"
            disabled={currentPage() === totalPages() || totalPages() === 0}
            onClick={() => setCurrentPage(currentPage() + 1)}
            title="Next page"
          >
            <span class="arrow-icon">▶</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default HoldingsTable;
