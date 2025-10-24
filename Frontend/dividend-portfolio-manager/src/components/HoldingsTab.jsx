// src/components/HoldingsTab.jsx - UPDATED WITH NEW COLUMN STRUCTURE + CURRENCY FILTERING
import { createSignal, createEffect, For, createMemo, Show, onMount } from 'solid-js';
import AccountDetailsModal from './AccountDetailsModal';
import { filterStocksByCurrency } from '../utils/currencyFilter';
import { fetchYieldExclusions } from '../api';

function HoldingsTab(props) {
    const [searchTerm, setSearchTerm] = createSignal('');
    const [showColumns, setShowColumns] = createSignal(false);
    const [columnVisibility, setColumnVisibility] = createSignal({
        stock: true,
        shares: true,
        'avg-cost': true,
        'current-price': true,
        'today-change': true,
        'current-yield': true,
        'monthly-yield': true,
        'yield-on-cost': true,
        'investment-value': true,
        'market-value': true,
        'today-return': true,
        'div-per-share': true,
        'monthly-div-income': true,
        'total-div-received': true,
        'div-adj-cost': true,
        'div-adj-yield': true,
        'source-accounts': false
    });
    const [sortColumn, setSortColumn] = createSignal(0);
    const [sortDirection, setSortDirection] = createSignal('asc');
    
    // Pagination states
    const [currentPage, setCurrentPage] = createSignal(1);
    const [entriesPerPage, setEntriesPerPage] = createSignal(10);
    
    // Modal states
    const [isModalOpen, setIsModalOpen] = createSignal(false);
    const [selectedStock, setSelectedStock] = createSignal(null);

    // Track updated stocks for animation
    const [updatedStocks, setUpdatedStocks] = createSignal(new Set());

    // YoC Exclusion state (read-only for display purposes)
    const [excludedSymbols, setExcludedSymbols] = createSignal(new Set());

    // Load YoC exclusions on mount and when person changes (for display only)
    const loadExclusions = async () => {
        const personName = props.accountSelection?.().personName;
        if (!personName) return;

        try {
            const exclusions = await fetchYieldExclusions(personName);
            const symbolSet = new Set(exclusions.map(e => e.symbol));
            setExcludedSymbols(symbolSet);
        } catch (error) {
            console.error('Failed to load YoC exclusions:', error);
        }
    };

    // Debug on mount
    onMount(() => {
        console.log('HoldingsTab mounted');
        console.log('Stock data:', props.stockData());
        loadExclusions();
    });

    // Reload exclusions when person changes
    createEffect(() => {
        const personName = props.accountSelection?.().personName;
        if (personName) {
            loadExclusions();
        }
    });

    // UPDATED: New column definitions with proper order
    const columns = [
        { id: 'stock', label: 'STOCK', key: 'symbol' },
        { id: 'shares', label: 'SHARES', key: 'shares' },
        { id: 'avg-cost', label: 'AVG COST', key: 'avgCost' },
        { id: 'current-price', label: 'CURRENT PRICE', key: 'currentPrice' },
        { id: 'today-change', label: 'TODAY CHANGE', key: 'todayChange' },
        { id: 'current-yield', label: 'CURRENT YIELD', key: 'currentYield' },
        { id: 'monthly-yield', label: 'MONTHLY YIELD', key: 'monthlyYield' },
        { id: 'yield-on-cost', label: 'YIELD ON COST', key: 'yieldOnCost' },
        { id: 'investment-value', label: 'INVESTMENT VALUE', key: 'investmentValue' },
        { id: 'market-value', label: 'MARKET VALUE', key: 'marketValue' },
        { id: 'today-return', label: 'TODAY RETURN', key: 'todayReturn' },
        { id: 'div-per-share', label: 'DIV PER SHARE', key: 'divPerShare' },
        { id: 'monthly-div-income', label: 'MONTHLY DIV INCOME', key: 'monthlyDivIncome' },
        { id: 'total-div-received', label: 'TOTAL DIV RECEIVED', key: 'totalDivReceived' },
        { id: 'div-adj-cost', label: 'DIV ADJ COST', key: 'divAdjCost' },
        { id: 'div-adj-yield', label: 'DIV ADJ YIELD', key: 'divAdjYield' },
        { id: 'source-accounts', label: 'SOURCE ACCOUNTS', key: 'sourceAccounts' }
    ];

    // STOCK column is always visible (cannot be hidden)
    const visibleColumns = createMemo(() => columns.filter(col => col.id === 'stock' || columnVisibility()[col.id]));

    // Apply currency filtering
    const currencyFilteredStocks = createMemo(() => {
        const stocks = props.stockData();
        const filter = props.currencyFilter?.() || 'combined-cad';
        const rate = props.usdCadRate?.() || 1.35;

        console.log('[HoldingsTab] Applying currency filter:', filter, 'with rate:', rate);
        return filterStocksByCurrency(stocks, filter, rate);
    });

    // Show source accounts column when viewing aggregated data
    createEffect(() => {
        const account = props.selectedAccount?.();
        const hasAggregatedData = currencyFilteredStocks().some(stock => stock.isAggregated);

        if (account && (account.viewMode === 'all' || account.viewMode === 'person') && hasAggregatedData) {
            setColumnVisibility(prev => ({ ...prev, 'source-accounts': true }));
        }
    });

    // Track stock updates for animation
    createEffect(() => {
        const stocks = props.stockData();
        const currentTime = Date.now();
        const recentlyUpdated = new Set();
        
        stocks.forEach(stock => {
            if (stock.lastUpdateTime && (currentTime - stock.lastUpdateTime) < 2000) {
                recentlyUpdated.add(stock.symbol);
            }
        });
        
        setUpdatedStocks(recentlyUpdated);
        
        setTimeout(() => {
            setUpdatedStocks(new Set());
        }, 1500);
    });

    // Handle column dropdown close on outside click
    createEffect(() => {
        const handleClickOutside = (event) => {
            if (showColumns() && !event.target.closest('.columns-btn-container')) {
                setShowColumns(false);
            }
        };
        
        if (showColumns()) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    });

    // Compute filtered and sorted stocks (after currency filter applied)
    const filteredAndSortedStocks = createMemo(() => {
        const term = searchTerm().toLowerCase();
        let filtered = currencyFilteredStocks().filter(stock =>
            stock.symbol.toLowerCase().includes(term) ||
            (stock.company || stock.symbol).toLowerCase().includes(term)
        );

        // Apply sorting
        const colIndex = sortColumn();
        const direction = sortDirection();
        
        if (colIndex >= 0 && colIndex < columns.length) {
            const keys = columns.map(c => c.key);
            filtered = [...filtered].sort((a, b) => {
                let aValue = a[keys[colIndex]];
                let bValue = b[keys[colIndex]];

                // Handle numeric values from formatted strings
                if (keys[colIndex] === 'todayChange' || keys[colIndex] === 'todayReturn') {
                    aValue = a[`${keys[colIndex]}Num`] || 0;
                    bValue = b[`${keys[colIndex]}Num`] || 0;
                } else {
                    // Attempt to parse as number after cleaning
                    const cleanA = (aValue ?? '').toString().replace(/[\$,%+]/g, '');
                    const cleanB = (bValue ?? '').toString().replace(/[\$,%+]/g, '');
                    const numA = parseFloat(cleanA);
                    const numB = parseFloat(cleanB);

                    if (!isNaN(numA) && !isNaN(numB)) {
                        aValue = numA;
                        bValue = numB;
                    } else {
                        aValue = (aValue ?? '').toString();
                        bValue = (bValue ?? '').toString();
                    }
                }

                if (typeof aValue === 'number' && typeof bValue === 'number') {
                    return direction === 'asc' ? aValue - bValue : bValue - aValue;
                } else {
                    return direction === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
                }
            });
        }

        return filtered;
    });

    const totalEntries = createMemo(() => filteredAndSortedStocks().length);
    const totalPages = createMemo(() => Math.ceil(totalEntries() / entriesPerPage()));
    const startIndex = createMemo(() => (currentPage() - 1) * entriesPerPage());
    const endIndex = createMemo(() => Math.min(startIndex() + entriesPerPage(), totalEntries()));
    
    const currentPageData = createMemo(() => {
        return filteredAndSortedStocks().slice(startIndex(), endIndex());
    });

    const toggleColumn = (column) => {
        if (column !== 'stock') {
            setColumnVisibility(prev => ({
                ...prev,
                [column]: !prev[column]
            }));
        }
    };

    const sortTable = (columnIndex) => {
        const currentDir = sortColumn() === columnIndex ? sortDirection() : 'asc';
        const newDir = currentDir === 'asc' ? 'desc' : 'asc';
        setSortColumn(columnIndex);
        setSortDirection(newDir);
    };

    const goToPage = (page) => {
        if (page >= 1 && page <= totalPages()) {
            setCurrentPage(page);
        }
    };

    const handleEntriesPerPageChange = (e) => {
        setEntriesPerPage(parseInt(e.target.value));
        setCurrentPage(1);
    };

    // Modal handling functions
    const openModal = (stock) => {
        console.log('Opening modal for stock:', stock?.symbol);
        setSelectedStock(stock);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        console.log('Closing modal');
        setIsModalOpen(false);
        setSelectedStock(null);
    };

    // Handle Select button click - placeholder for future functionality
    const handleSelectStock = (stock) => {
        console.log('Selected stock:', stock.symbol);
        // TODO: Implement select functionality
    };

    // Format functions
    const formatCurrency = (num) => {
        const n = Number(num);
        return isNaN(n) ? '$0.00' : `$${n.toFixed(2)}`;
    };

    const formatPercent = (num) => {
        const n = Number(num);
        return isNaN(n) ? '0.00%' : `${n.toFixed(2)}%`;
    };

    const formatShares = (num) => {
        const n = Number(num);
        return isNaN(n) ? '0' : n.toLocaleString();
    };

// FIXED: Get cell value based on column with proper null checks
const getCellValue = (colId, stock) => {
    // Add null/undefined checks for all values
    switch(colId) {
        case 'shares':
            return stock.sharesNum ? formatShares(stock.sharesNum) : '0';
        case 'avg-cost':
            return stock.avgCostNum ? formatCurrency(stock.avgCostNum) : '$0.00';
        case 'current-price':
            return stock.currentPriceNum ? formatCurrency(stock.currentPriceNum) : '$0.00';
        case 'today-change':
            return stock.todayChange || '$0.00 (0.00%)';
        case 'current-yield':
            return stock.currentYieldNum !== undefined ? formatPercent(stock.currentYieldNum) : '0.00%';
        case 'monthly-yield':
            return stock.monthlyYieldNum !== undefined ? formatPercent(stock.monthlyYieldNum) : '0.00%';
        case 'yield-on-cost':
            return stock.yieldOnCostNum !== undefined ? formatPercent(stock.yieldOnCostNum) : '0.00%';
        case 'investment-value':
            return stock.investmentValueNum ? formatCurrency(stock.investmentValueNum) : '$0.00';
        case 'market-value':
            return stock.marketValueNum ? formatCurrency(stock.marketValueNum) : '$0.00';
        case 'today-return':
            return stock.todayReturn || '$0.00 (0.00%)';
        case 'div-per-share':
            return stock.divPerShareNum !== undefined ? formatCurrency(stock.divPerShareNum) : '$0.00';
        case 'monthly-div-income':
            return stock.monthlyDivIncomeNum !== undefined ? formatCurrency(stock.monthlyDivIncomeNum) : '$0.00';
        case 'total-div-received':
            return stock.totalDivReceivedNum !== undefined ? formatCurrency(stock.totalDivReceivedNum) : '$0.00';
        case 'div-adj-cost':
            return stock.divAdjCostNum !== undefined ? formatCurrency(stock.divAdjCostNum) : '$0.00';
        case 'div-adj-yield':
            return stock.divAdjYieldNum !== undefined ? formatPercent(stock.divAdjYieldNum) : '0.00%';
        case 'source-accounts':
            return stock.sourceAccounts?.join(', ') || '';
        default:
            return stock[colId] || '';
    }
};

    // UPDATED: Enhanced cell content rendering
    const getCellContent = (colId, stock) => {
        const value = getCellValue(colId, stock);
        const isUpdated = updatedStocks().has(stock.symbol);
        
        if (colId === 'stock') {
            return (
                <div class="stock-info">
                    {stock.dotColor && <div class="stock-dot" style={{ background: stock.dotColor }}></div>}
                    <div class="stock-details">
                        <div class="stock-name">
                            {stock.symbol}
                            {stock.isAggregated && <span class="aggregated-badge">AGG</span>}
                        </div>
                        <div class="stock-company">{stock.company}</div>
                    </div>
                </div>
            );
        }

        // Today change display with color coding
        if (colId === 'today-change') {
            const changeValue = stock.todayChangeNum || 0;
            let changeType = 'neutral';
            if (changeValue > 0.01) changeType = 'positive';
            else if (changeValue < -0.01) changeType = 'negative';
            
            return (
                <div class={`today-change ${changeType} ${isUpdated ? 'live-update updated' : ''}`}>
                    {value}
                </div>
            );
        }

        // Today return display with color coding
        if (colId === 'today-return') {
            const returnValue = stock.todayReturnNum || 0;
            let returnType = 'neutral';
            if (returnValue > 0.01) returnType = 'positive';
            else if (returnValue < -0.01) returnType = 'negative';
            
            return (
                <div class={`today-return ${returnType} ${isUpdated ? 'live-update updated' : ''}`}>
                    {value}
                </div>
            );
        }

        // Live update indicators for price-related fields
        if (['current-price', 'market-value', 'current-yield', 'monthly-yield'].includes(colId)) {
            return (
                <div class={`price-update ${isUpdated ? 'updated' : ''}`}>
                    {value}
                    {isUpdated && <span class="update-indicator">●</span>}
                </div>
            );
        }

        // Source accounts display
        if (colId === 'source-accounts' && stock.sourceAccounts) {
            return (
                <div class="source-accounts">
                    {stock.sourceAccounts.slice(0, 2).map(acc => (
                        <span class="account-tag">{acc}</span>
                    ))}
                    {stock.sourceAccounts.length > 2 && (
                        <span class="more-accounts">+{stock.sourceAccounts.length - 2}</span>
                    )}
                </div>
            );
        }

        // Yield displays with color coding (mark excluded YoC in red)
        if (['current-yield', 'monthly-yield', 'yield-on-cost', 'div-adj-yield'].includes(colId)) {
            const isExcluded = excludedSymbols().has(stock.symbol);
            const className = colId === 'yield-on-cost' && isExcluded ? 'yield-badge excluded-yoc' : 'yield-badge';
            return <span class={className}>{value}</span>;
        }

        return value;
    };

    // Get TD class based on column
    const getTdClass = (colId, stock) => {
        const isUpdated = updatedStocks().has(stock.symbol);
        let classes = [];
        
        if (['current-price', 'market-value', 'current-yield', 'monthly-yield'].includes(colId) && isUpdated) {
            classes.push('live-update');
        }
        
        if (['today-change', 'today-return'].includes(colId)) {
            const value = colId === 'today-change' ? stock.todayChangeNum : stock.todayReturnNum;
            if (value > 0) classes.push('positive');
            else if (value < 0) classes.push('negative');
        }
        
        if (['div-adj-cost', 'div-adj-yield'].includes(colId)) {
            classes.push('dividend-adjusted');
        }
        
        return classes.join(' ');
    };

    // Get context label for current view
    const getViewContext = () => {
        const account = props.selectedAccount?.();
        if (!account) return 'All Accounts';
        
        if (account.viewMode === 'all') return 'All Accounts (Everyone)';
        if (account.viewMode === 'person') return `${account.personName} (All Accounts)`;
        if (account.viewMode === 'account') return account.label;
        
        return account.label || 'All Accounts';
    };

    // Get market status indicator
    const getMarketStatus = () => {
        const now = new Date();
        const hour = now.getHours();
        const day = now.getDay();
        
        if (day === 0 || day === 6) return 'closed';
        if (hour < 9 || (hour === 9 && now.getMinutes() < 30)) return 'pre-market';
        if (hour >= 16) return 'closed';
        return 'open';
    };

    return (
        <div id="holdings-tab">
            <div class="content-header">
                <h2 class="content-title">
                    Portfolio Holdings
                    <span class="view-context">- {getViewContext()}</span>
                </h2>
                <div class="header-controls">
                    <div class="search-box">
                        <input
                            type="text"
                            placeholder="Search stocks..."
                            value={searchTerm()}
                            onInput={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div class={`market-status ${getMarketStatus()}`}>
                        <span class="status-dot"></span>
                        Market {getMarketStatus() === 'open' ? 'Open' : getMarketStatus() === 'pre-market' ? 'Pre-Market' : 'Closed'}
                    </div>
                    <div class="auto-refresh">Auto-refresh: 5s</div>
                    <div class="columns-btn-container">
                        <button class="btn" onClick={() => setShowColumns(!showColumns())}>🔧 Columns</button>
                        <div class={`column-settings ${showColumns() ? '' : 'hidden'}`}>
                            <div class="column-checkboxes">
                                <label class="disabled">
                                    <input
                                        type="checkbox"
                                        checked={true}
                                        disabled={true}
                                    />
                                    Stock
                                </label>
                                <For each={columns.filter(col => col.id !== 'stock')}>
                                    {col => (
                                        <label>
                                            <input
                                                type="checkbox"
                                                checked={columnVisibility()[col.id]}
                                                onChange={() => toggleColumn(col.id)}
                                            />
                                            {col.label}
                                        </label>
                                    )}
                                </For>
                            </div>
                        </div>
                    </div>
                    <button class="btn">📤 Export</button>
                </div>
            </div>

            <div class="table-container">
                <div class="table-wrapper">
                    <table class="modern-table">
                        <thead>
                            <tr>
                                <For each={visibleColumns()}>
                                    {col => {
                                        const colIndex = columns.findIndex(c => c.id === col.id);
                                        return (
                                            <th
                                                onClick={() => sortTable(colIndex)}
                                                class={col.id === 'stock' ? 'sticky-column' : ''}
                                            >
                                                {col.label}
                                                <span class="sort-indicator">
                                                    {sortColumn() === colIndex ? (sortDirection() === 'asc' ? '↑' : '↓') : '↕'}
                                                </span>
                                            </th>
                                        );
                                    }}
                                </For>
                                <th>ACTIONS</th>
                            </tr>
                        </thead>
                        <tbody>
                            <For each={currentPageData()}>
                                {stock => (
                                    <tr class={stock.isAggregated ? 'aggregated-row' : ''}>
                                        <For each={visibleColumns()}>
                                            {col => (
                                                <td class={`${getTdClass(col.id, stock)} ${col.id === 'stock' ? 'sticky-column' : ''}`}>
                                                    {getCellContent(col.id, stock)}
                                                </td>
                                            )}
                                        </For>
                                        <td>
                                            <div class="action-buttons">
                                                <button 
                                                    class="action-btn select-btn" 
                                                    onClick={() => handleSelectStock(stock)}
                                                    title="Select Stock"
                                                >
                                                    Select
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </For>
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div class="pagination-controls">
                <div class="entries-per-page">
                    <span>Show </span>
                    <select value={entriesPerPage()} onChange={handleEntriesPerPageChange}>
                        <option value="5">5</option>
                        <option value="10">10</option>
                        <option value="25">25</option>
                        <option value="50">50</option>
                    </select>
                    <span> of {totalEntries()} entries</span>
                </div>
                <div class="pagination-info">
                    <span>Page {currentPage()} of {totalPages()}</span>
                    <div class="pagination-buttons">
                        <button
                            class="pagination-btn"
                            disabled={currentPage() === 1}
                            onClick={() => goToPage(currentPage() - 1)}
                        >
                            ‹ Previous
                        </button>
                        <button
                            class="pagination-btn"
                            disabled={currentPage() === totalPages()}
                            onClick={() => goToPage(currentPage() + 1)}
                        >
                            Next ›
                        </button>
                    </div>
                </div>
            </div>

            {/* Modal component */}
            <AccountDetailsModal
                isOpen={isModalOpen()}
                stock={selectedStock()}
                onClose={closeModal}
            />
        </div>
    );
}

export default HoldingsTab;