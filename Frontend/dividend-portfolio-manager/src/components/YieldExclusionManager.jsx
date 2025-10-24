// src/components/YieldExclusionManager.jsx - Yield on Cost Exclusion Management with Sortable Table
import { createSignal, createEffect, onMount, For, Show } from 'solid-js';
import {
    fetchYieldExclusions,
    addYieldExclusion,
    removeYieldExclusion,
    fetchPositions,
    fetchPersons
} from '../api';

function YieldExclusionManager() {
    const [persons, setPersons] = createSignal([]);
    const [selectedPerson, setSelectedPerson] = createSignal('');
    const [exclusions, setExclusions] = createSignal([]);
    const [availableStocks, setAvailableStocks] = createSignal([]);
    const [isLoading, setIsLoading] = createSignal(false);
    const [notifications, setNotifications] = createSignal([]);
    const [searchTerm, setSearchTerm] = createSignal('');
    const [sortColumn, setSortColumn] = createSignal('currentYield'); // Default sort by Current Yield
    const [sortDirection, setSortDirection] = createSignal('desc'); // Descending (highest first)

    const showNotification = (message, type = 'info') => {
        const id = Date.now();
        setNotifications(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 5000);
    };

    const loadPersons = async () => {
        try {
            const data = await fetchPersons();
            setPersons(Array.isArray(data) ? data : []);
            if (data.length > 0 && !selectedPerson()) {
                setSelectedPerson(data[0].personName);
            }
        } catch (error) {
            console.error('Failed to load persons:', error);
            showNotification('Failed to load persons', 'error');
        }
    };

    const loadExclusions = async () => {
        const person = selectedPerson();
        if (!person) return;

        try {
            setIsLoading(true);
            const data = await fetchYieldExclusions(person);
            setExclusions(data || []);
        } catch (error) {
            console.error('Failed to load exclusions:', error);
            setExclusions([]);
        } finally {
            setIsLoading(false);
        }
    };

    const loadAvailableStocks = async () => {
        const person = selectedPerson();
        if (!person) return;

        try {
            const accountSelection = {
                viewMode: 'person',
                personName: person,
                aggregate: true
            };
            const positions = await fetchPositions(accountSelection, true);
            setAvailableStocks(Array.isArray(positions) ? positions : []);
        } catch (error) {
            console.error('Failed to load stocks:', error);
            setAvailableStocks([]);
        }
    };

    const handleAddExclusion = async (symbol, name) => {
        const person = selectedPerson();
        if (!person) return;

        try {
            setIsLoading(true);
            await addYieldExclusion(person, symbol, { name });
            await loadExclusions();
            showNotification(`${symbol} excluded from YoC calculation`, 'success');
        } catch (error) {
            console.error('Failed to add exclusion:', error);
            showNotification(error.message || 'Failed to add exclusion', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRemoveExclusion = async (symbol) => {
        const person = selectedPerson();
        if (!person) return;

        try {
            setIsLoading(true);
            await removeYieldExclusion(person, symbol);
            await loadExclusions();
            showNotification(`${symbol} included in YoC calculation`, 'success');
        } catch (error) {
            console.error('Failed to remove exclusion:', error);
            showNotification(error.message || 'Failed to remove exclusion', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const isExcluded = (symbol) => {
        return exclusions().some(e => e.symbol === symbol);
    };

    const handleSort = (column) => {
        if (sortColumn() === column) {
            // Toggle direction
            setSortDirection(sortDirection() === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection('desc'); // Default to descending for new column
        }
    };

    const sortedAndFilteredStocks = () => {
        const term = searchTerm().toLowerCase();
        let stocks = availableStocks().filter(stock =>
            stock.symbol.toLowerCase().includes(term) ||
            (stock.companyName && stock.companyName.toLowerCase().includes(term))
        );

        // Sort stocks
        stocks.sort((a, b) => {
            let aVal, bVal;

            switch (sortColumn()) {
                case 'symbol':
                    aVal = a.symbol || '';
                    bVal = b.symbol || '';
                    break;
                case 'currentYield':
                    aVal = a.dividendData?.currentYield || 0;
                    bVal = b.dividendData?.currentYield || 0;
                    break;
                case 'yieldOnCost':
                    aVal = a.dividendData?.yieldOnCost || 0;
                    bVal = b.dividendData?.yieldOnCost || 0;
                    break;
                case 'marketValue':
                    aVal = (a.openQuantity || 0) * (a.currentPrice || 0);
                    bVal = (b.openQuantity || 0) * (b.currentPrice || 0);
                    break;
                default:
                    return 0;
            }

            if (typeof aVal === 'string') {
                return sortDirection() === 'asc'
                    ? aVal.localeCompare(bVal)
                    : bVal.localeCompare(aVal);
            } else {
                return sortDirection() === 'asc' ? aVal - bVal : bVal - aVal;
            }
        });

        return stocks;
    };

    createEffect(() => {
        if (selectedPerson()) {
            loadExclusions();
            loadAvailableStocks();
        }
    });

    onMount(() => {
        loadPersons();
    });

    return (
        <div class="yield-exclusion-manager">
            {/* Notifications */}
            <Show when={notifications().length > 0}>
                <div class="notifications">
                    <For each={notifications()}>
                        {notification => (
                            <div class={`notification notification-${notification.type}`}>
                                {notification.message}
                                <button
                                    class="notification-close"
                                    onClick={() => setNotifications(prev => prev.filter(n => n.id !== notification.id))}
                                >
                                    ✕
                                </button>
                            </div>
                        )}
                    </For>
                </div>
            </Show>

            <div class="settings-card">
                <div class="settings-header">📊 Yield on Cost Exclusion Management</div>
                <div class="settings-description">
                    Manage which stocks are included or excluded from portfolio-level Yield on Cost calculations.
                    Changes are permanent until you modify them here.
                </div>

                <div class="exclusion-controls">
                    <div class="form-group">
                        <label>Select Person</label>
                        <select
                            value={selectedPerson()}
                            onChange={e => setSelectedPerson(e.target.value)}
                            class="person-selector"
                        >
                            <option value="">Select a person...</option>
                            <For each={persons()}>
                                {person => (
                                    <option value={person.personName}>{person.personName}</option>
                                )}
                            </For>
                        </select>
                    </div>

                    <div class="exclusion-info">
                        <div class="info-box">
                            <span class="info-label">Total Stocks:</span>
                            <span class="info-value">{availableStocks().length}</span>
                        </div>
                        <div class="info-box">
                            <span class="info-label">Excluded:</span>
                            <span class="info-value excluded-count">{exclusions().length}</span>
                        </div>
                        <div class="info-box">
                            <span class="info-label">Included in YoC:</span>
                            <span class="info-value included-count">{availableStocks().length - exclusions().length}</span>
                        </div>
                    </div>
                </div>
            </div>

            <Show when={selectedPerson()}>
                <div class="settings-card">
                    <div class="settings-header">Stock Selection Table</div>

                    <div class="search-bar">
                        <input
                            type="text"
                            placeholder="Search stocks by symbol or name..."
                            value={searchTerm()}
                            onInput={e => setSearchTerm(e.target.value)}
                            class="search-input"
                        />
                    </div>

                    <div class="table-container">
                        <Show when={sortedAndFilteredStocks().length === 0}>
                            <div class="empty-state">
                                {searchTerm() ? 'No stocks match your search' : 'No stocks available'}
                            </div>
                        </Show>

                        <Show when={sortedAndFilteredStocks().length > 0}>
                            <table class="yoc-table">
                                <thead>
                                    <tr>
                                        <th class="checkbox-col">Include</th>
                                        <th class="sortable" onClick={() => handleSort('symbol')}>
                                            Symbol {sortColumn() === 'symbol' && (sortDirection() === 'asc' ? '▲' : '▼')}
                                        </th>
                                        <th>Company</th>
                                        <th class="sortable number-col" onClick={() => handleSort('currentYield')}>
                                            Current Yield {sortColumn() === 'currentYield' && (sortDirection() === 'asc' ? '▲' : '▼')}
                                        </th>
                                        <th class="sortable number-col" onClick={() => handleSort('yieldOnCost')}>
                                            Yield on Cost {sortColumn() === 'yieldOnCost' && (sortDirection() === 'asc' ? '▲' : '▼')}
                                        </th>
                                        <th class="sortable number-col" onClick={() => handleSort('marketValue')}>
                                            Market Value {sortColumn() === 'marketValue' && (sortDirection() === 'asc' ? '▲' : '▼')}
                                        </th>
                                        <th class="status-col">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <For each={sortedAndFilteredStocks()}>
                                        {stock => {
                                            const excluded = isExcluded(stock.symbol);
                                            const marketValue = (stock.openQuantity || 0) * (stock.currentPrice || 0);
                                            return (
                                                <tr class={excluded ? 'excluded-row' : 'included-row'}>
                                                    <td class="checkbox-col">
                                                        <input
                                                            type="checkbox"
                                                            checked={!excluded}
                                                            onChange={() =>
                                                                excluded
                                                                    ? handleRemoveExclusion(stock.symbol)
                                                                    : handleAddExclusion(stock.symbol, stock.companyName)
                                                            }
                                                            disabled={isLoading()}
                                                            class="yoc-checkbox"
                                                        />
                                                    </td>
                                                    <td class="symbol-col">{stock.symbol}</td>
                                                    <td class="company-col">{stock.companyName || 'N/A'}</td>
                                                    <td class="number-col">
                                                        <span class="yield-value">
                                                            {stock.dividendData?.currentYield ?
                                                                `${stock.dividendData.currentYield.toFixed(2)}%` :
                                                                '0.00%'}
                                                        </span>
                                                    </td>
                                                    <td class="number-col">
                                                        <span class={`yield-value ${excluded ? 'excluded-value' : ''}`}>
                                                            {stock.dividendData?.yieldOnCost ?
                                                                `${stock.dividendData.yieldOnCost.toFixed(2)}%` :
                                                                '0.00%'}
                                                        </span>
                                                    </td>
                                                    <td class="number-col">
                                                        ${marketValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </td>
                                                    <td class="status-col">
                                                        <span class={`status-badge ${excluded ? 'excluded' : 'included'}`}>
                                                            {excluded ? 'Excluded' : 'Included'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        }}
                                    </For>
                                </tbody>
                            </table>
                        </Show>
                    </div>
                </div>
            </Show>

            <Show when={isLoading()}>
                <div class="loading-overlay">
                    <div class="loading-spinner">🔄</div>
                    <div class="loading-text">Loading...</div>
                </div>
            </Show>

            <style>{`
                .yield-exclusion-manager {
                    position: relative;
                }

                .settings-description {
                    margin: 1rem 0;
                    padding: 0.75rem;
                    background: #f0f9ff;
                    border-left: 3px solid #3b82f6;
                    border-radius: 4px;
                    font-size: 0.875rem;
                    color: #1e40af;
                }

                .exclusion-controls {
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                    margin-bottom: 1rem;
                }

                .person-selector {
                    padding: 0.5rem;
                    border: 1px solid #e5e7eb;
                    border-radius: 6px;
                    font-size: 0.875rem;
                }

                .exclusion-info {
                    display: flex;
                    gap: 1rem;
                    flex-wrap: wrap;
                }

                .info-box {
                    display: flex;
                    flex-direction: column;
                    padding: 0.75rem 1rem;
                    background: #f9fafb;
                    border-radius: 8px;
                    border: 1px solid #e5e7eb;
                }

                .info-label {
                    font-size: 0.75rem;
                    color: #6b7280;
                    margin-bottom: 0.25rem;
                }

                .info-value {
                    font-size: 1.25rem;
                    font-weight: 700;
                    color: #111827;
                }

                .info-value.excluded-count {
                    color: #dc2626;
                }

                .info-value.included-count {
                    color: #16a34a;
                }

                .search-bar {
                    margin-bottom: 1rem;
                }

                .search-input {
                    width: 100%;
                    padding: 0.75rem;
                    border: 1px solid #e5e7eb;
                    border-radius: 6px;
                    font-size: 0.875rem;
                }

                .table-container {
                    overflow-x: auto;
                    max-height: 600px;
                    overflow-y: auto;
                }

                .yoc-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 0.875rem;
                }

                .yoc-table thead {
                    position: sticky;
                    top: 0;
                    background: #f9fafb;
                    z-index: 10;
                }

                .yoc-table th {
                    padding: 0.75rem;
                    text-align: left;
                    font-weight: 600;
                    color: #374151;
                    border-bottom: 2px solid #e5e7eb;
                    white-space: nowrap;
                }

                .yoc-table th.sortable {
                    cursor: pointer;
                    user-select: none;
                }

                .yoc-table th.sortable:hover {
                    background: #f3f4f6;
                }

                .yoc-table th.number-col {
                    text-align: right;
                }

                .yoc-table td {
                    padding: 0.75rem;
                    border-bottom: 1px solid #e5e7eb;
                }

                .yoc-table tr.included-row {
                    background: #f0fdf4;
                }

                .yoc-table tr.excluded-row {
                    background: #fef2f2;
                }

                .yoc-table tr:hover {
                    background: #f3f4f6;
                }

                .checkbox-col {
                    width: 60px;
                    text-align: center;
                }

                .yoc-checkbox {
                    width: 18px;
                    height: 18px;
                    cursor: pointer;
                    accent-color: #16a34a;
                }

                .yoc-checkbox:disabled {
                    cursor: not-allowed;
                    opacity: 0.5;
                }

                .symbol-col {
                    font-weight: 600;
                    color: #111827;
                }

                .company-col {
                    max-width: 300px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    color: #6b7280;
                }

                .number-col {
                    text-align: right;
                }

                .yield-value {
                    font-weight: 600;
                    color: #059669;
                }

                .yield-value.excluded-value {
                    color: #dc2626;
                    text-decoration: line-through;
                    opacity: 0.7;
                }

                .status-col {
                    width: 100px;
                    text-align: center;
                }

                .status-badge {
                    padding: 0.25rem 0.75rem;
                    border-radius: 12px;
                    font-size: 0.75rem;
                    font-weight: 600;
                }

                .status-badge.excluded {
                    background: #fee2e2;
                    color: #dc2626;
                }

                .status-badge.included {
                    background: #dcfce7;
                    color: #16a34a;
                }

                .empty-state {
                    text-align: center;
                    padding: 2rem;
                    color: #9ca3af;
                    font-size: 0.875rem;
                }

                .loading-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.3);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                }

                .loading-spinner {
                    font-size: 3rem;
                    animation: spin 1s linear infinite;
                }

                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }

                .loading-text {
                    margin-top: 1rem;
                    color: white;
                    font-size: 1rem;
                    font-weight: 600;
                }

                .notifications {
                    position: fixed;
                    top: 1rem;
                    right: 1rem;
                    z-index: 2000;
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }

                .notification {
                    padding: 1rem;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    min-width: 300px;
                    animation: slideIn 0.3s ease-out;
                }

                @keyframes slideIn {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }

                .notification-success {
                    background: #dcfce7;
                    color: #166534;
                    border-left: 4px solid #16a34a;
                }

                .notification-error {
                    background: #fee2e2;
                    color: #991b1b;
                    border-left: 4px solid #dc2626;
                }

                .notification-info {
                    background: #dbeafe;
                    color: #1e40af;
                    border-left: 4px solid #3b82f6;
                }

                .notification-close {
                    margin-left: auto;
                    background: none;
                    border: none;
                    font-size: 1.25rem;
                    cursor: pointer;
                    color: inherit;
                    opacity: 0.6;
                }

                .notification-close:hover {
                    opacity: 1;
                }
            `}</style>
        </div>
    );
}

export default YieldExclusionManager;
