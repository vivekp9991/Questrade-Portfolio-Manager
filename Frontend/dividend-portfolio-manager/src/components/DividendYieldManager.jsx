// src/components/DividendYieldManager.jsx - Complete Dividend & Yield Management
import { createSignal, createEffect, onMount, For, Show } from 'solid-js';
import {
    fetchYieldExclusions,
    addYieldExclusion,
    removeYieldExclusion,
    fetchAllSymbolDividends,
    bulkUpdateSymbolDividends,
    getManualDividendOverrides,
    fetchPositions,
    fetchPersons
} from '../api';

function DividendYieldManager() {
    const [persons, setPersons] = createSignal([]);
    const [selectedPerson, setSelectedPerson] = createSignal('');
    const [exclusions, setExclusions] = createSignal([]);
    const [dividendOverrides, setDividendOverrides] = createSignal(new Map());
    const [availableStocks, setAvailableStocks] = createSignal([]);
    const [isLoading, setIsLoading] = createSignal(false);
    const [isSaving, setIsSaving] = createSignal(false);
    const [notifications, setNotifications] = createSignal([]);
    const [searchTerm, setSearchTerm] = createSignal('');
    const [sortColumn, setSortColumn] = createSignal('currentYield');
    const [sortDirection, setSortDirection] = createSignal('desc');

    // Pending changes tracking
    const [pendingChanges, setPendingChanges] = createSignal(new Map()); // symbol -> { excluded, frequency, monthlyDiv }
    const [hasUnsavedChanges, setHasUnsavedChanges] = createSignal(false);

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
            const data = await fetchYieldExclusions(person);
            const exclusionsArray = Array.isArray(data) ? data : [];
            console.log(`[YoC Exclusions] Loaded ${exclusionsArray.length} exclusions for ${person}:`,
                exclusionsArray.map(e => e.symbol).join(', '));
            setExclusions(exclusionsArray);
        } catch (error) {
            console.error('Failed to load exclusions:', error);
            setExclusions([]);
        }
    };

    const loadDividendOverrides = async () => {
        try {
            // Load universal dividend data (not person-specific)
            const data = await fetchAllSymbolDividends();
            const overrideMap = new Map();
            (data || []).forEach(override => {
                overrideMap.set(override.symbol, override);
            });
            console.log(`[Symbol Dividends] Loaded ${overrideMap.size} universal dividend records`);
            setDividendOverrides(overrideMap);
        } catch (error) {
            console.error('Failed to load dividend overrides:', error);
            setDividendOverrides(new Map());
        }
    };

    const loadAvailableStocks = async () => {
        const person = selectedPerson();
        if (!person) return;

        try {
            setIsLoading(true);
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
        } finally {
            setIsLoading(false);
        }
    };

    const loadAllData = async () => {
        setIsLoading(true);
        try {
            await Promise.all([
                loadExclusions(),
                loadDividendOverrides(),
                loadAvailableStocks()
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    const isExcluded = (symbol) => {
        // Check pending changes first
        const pending = pendingChanges().get(symbol);
        if (pending && pending.excluded !== undefined) {
            return pending.excluded;
        }

        // Otherwise check saved exclusions with case-insensitive comparison
        const normalizedSymbol = (symbol || '').toUpperCase().trim();
        const excludedSymbols = exclusions() || [];
        const isEx = excludedSymbols.some(e => {
            const excludedSymbol = (e.symbol || '').toUpperCase().trim();
            return excludedSymbol === normalizedSymbol;
        });

        return isEx;
    };

    const getDividendFrequency = (symbol) => {
        // Check pending changes first
        const pending = pendingChanges().get(symbol);
        if (pending && pending.frequency) {
            return pending.frequency;
        }
        // Check saved overrides
        const override = dividendOverrides().get(symbol);
        if (override) {
            return override.dividendFrequency || 'monthly';
        }
        // Default to monthly
        return 'monthly';
    };

    const getMonthlyDividend = (symbol) => {
        // Check pending changes first
        const pending = pendingChanges().get(symbol);
        if (pending && pending.monthlyDiv !== undefined) {
            return pending.monthlyDiv;
        }
        // Check saved overrides
        const override = dividendOverrides().get(symbol);
        if (override) {
            return override.monthlyDividendPerShare || 0;
        }
        // Try to get from stock data
        const stock = availableStocks().find(s => s.symbol === symbol);
        return stock?.dividendData?.monthlyDividendPerShare || 0;
    };

    const handleExclusionToggle = (symbol) => {
        const currentExcluded = isExcluded(symbol);
        const newExcluded = !currentExcluded;

        setPendingChanges(prev => {
            const next = new Map(prev);
            const existing = next.get(symbol) || {};
            // Mark that this exclusion was explicitly set by user
            next.set(symbol, { ...existing, excluded: newExcluded, excludedByUser: true });
            return next;
        });

        setHasUnsavedChanges(true);
    };

    const handleFrequencyChange = (symbol, frequency) => {
        setPendingChanges(prev => {
            const next = new Map(prev);
            const existing = next.get(symbol) || {};
            // Only set frequency, don't touch excluded field
            const updated = { ...existing, frequency };
            // Remove excluded field if it wasn't explicitly set by toggle
            if (updated.excluded === undefined || !existing.excludedByUser) {
                delete updated.excluded;
            }
            next.set(symbol, updated);
            return next;
        });

        setHasUnsavedChanges(true);
    };

    const handleMonthlyDivChange = (symbol, value) => {
        const numValue = parseFloat(value) || 0;

        setPendingChanges(prev => {
            const next = new Map(prev);
            const existing = next.get(symbol) || {};
            // Only set monthlyDiv, don't touch excluded field
            const updated = { ...existing, monthlyDiv: numValue };
            // Remove excluded field if it wasn't explicitly set by toggle
            if (updated.excluded === undefined || !existing.excludedByUser) {
                delete updated.excluded;
            }
            next.set(symbol, updated);
            return next;
        });

        setHasUnsavedChanges(true);
    };

    const handleSaveAll = async () => {
        const person = selectedPerson();
        if (!person || pendingChanges().size === 0) return;

        setIsSaving(true);

        try {
            const changes = Array.from(pendingChanges().entries());
            const exclusionChanges = [];
            const overrideChanges = [];

            for (const [symbol, change] of changes) {
                const stock = availableStocks().find(s => s.symbol === symbol);

                // Handle exclusion changes
                if (change.excluded !== undefined) {
                    // Use same case-insensitive comparison as isExcluded()
                    const normalizedSymbol = (symbol || '').toUpperCase().trim();
                    const currentlyExcluded = exclusions().some(e =>
                        (e.symbol || '').toUpperCase().trim() === normalizedSymbol
                    );

                    console.log(`[Save Check] ${symbol}: change.excluded=${change.excluded}, currentlyExcluded=${currentlyExcluded}`);

                    if (change.excluded !== currentlyExcluded) {
                        exclusionChanges.push({
                            symbol,
                            excluded: change.excluded,
                            name: stock?.companyName || symbol
                        });
                    }
                }

                // Handle dividend override changes
                if (change.frequency || change.monthlyDiv !== undefined) {
                    overrideChanges.push({
                        symbol,
                        dividendFrequency: change.frequency || getDividendFrequency(symbol),
                        monthlyDividendPerShare: change.monthlyDiv !== undefined
                            ? change.monthlyDiv
                            : getMonthlyDividend(symbol)
                    });
                }
            }

            // Save exclusions
            console.log('[DividendYieldManager] Saving exclusion changes:', exclusionChanges);
            const saveErrors = [];

            for (const change of exclusionChanges) {
                try {
                    if (change.excluded) {
                        console.log(`[DividendYieldManager] Adding exclusion for ${change.symbol}`);
                        await addYieldExclusion(person, change.symbol, { name: change.name });
                    } else {
                        console.log(`[DividendYieldManager] Removing exclusion for ${change.symbol}`);
                        await removeYieldExclusion(person, change.symbol);
                    }
                } catch (error) {
                    // If trying to remove non-existent exclusion, log but don't fail
                    if (error.message.includes('not found') && !change.excluded) {
                        console.warn(`[DividendYieldManager] ${change.symbol} was not excluded, skipping removal`);
                    } else {
                        saveErrors.push({ symbol: change.symbol, error: error.message });
                    }
                }
            }

            // Bulk save dividend overrides (universal - not person-specific)
            if (overrideChanges.length > 0) {
                console.log('[DividendYieldManager] Saving universal dividend data:', overrideChanges);
                await bulkUpdateSymbolDividends(overrideChanges);
            }

            // Clear pending changes
            setPendingChanges(new Map());
            setHasUnsavedChanges(false);

            // Reload only exclusions and overrides (not positions to avoid rate limit)
            await Promise.all([
                loadExclusions(),
                loadDividendOverrides()
            ]);

            // Show notification with error count if any
            const totalChanges = exclusionChanges.length + overrideChanges.length;
            if (saveErrors.length > 0) {
                showNotification(
                    `Saved ${totalChanges} changes with ${saveErrors.length} warnings. Check console for details.`,
                    'warning'
                );
                console.warn('[Save Errors]', saveErrors);
            } else {
                showNotification(
                    `Successfully saved ${totalChanges} changes`,
                    'success'
                );
            }
        } catch (error) {
            console.error('Failed to save changes:', error);
            showNotification('Failed to save changes: ' + error.message, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDiscardAll = () => {
        setPendingChanges(new Map());
        setHasUnsavedChanges(false);
        showNotification('Discarded all unsaved changes', 'info');
    };

    const handleSort = (column) => {
        if (sortColumn() === column) {
            setSortDirection(sortDirection() === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection('desc');
        }
    };

    const sortedAndFilteredStocks = () => {
        const term = searchTerm().toLowerCase();
        let stocks = availableStocks().filter(stock =>
            stock.symbol.toLowerCase().includes(term) ||
            (stock.companyName && stock.companyName.toLowerCase().includes(term))
        );

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
                case 'frequency':
                    aVal = getDividendFrequency(a.symbol);
                    bVal = getDividendFrequency(b.symbol);
                    break;
                case 'monthlyDiv':
                    aVal = getMonthlyDividend(a.symbol);
                    bVal = getMonthlyDividend(b.symbol);
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

    const getPendingChangeCount = () => {
        return pendingChanges().size;
    };

    const hasManualOverride = (symbol) => {
        return dividendOverrides().has(symbol) || pendingChanges().has(symbol);
    };

    createEffect(() => {
        if (selectedPerson()) {
            loadAllData();
            setPendingChanges(new Map());
            setHasUnsavedChanges(false);
        }
    });

    onMount(() => {
        loadPersons();
    });

    return (
        <div class="dividend-yield-manager">
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

            {/* Unsaved Changes Banner */}
            <Show when={hasUnsavedChanges()}>
                <div class="unsaved-changes-banner">
                    <div class="banner-content">
                        <span class="banner-icon">⚠️</span>
                        <span class="banner-text">
                            You have <strong>{getPendingChangeCount()}</strong> unsaved change{getPendingChangeCount() !== 1 ? 's' : ''}
                        </span>
                        <div class="banner-actions">
                            <button
                                class="btn btn-primary"
                                onClick={handleSaveAll}
                                disabled={isSaving()}
                            >
                                {isSaving() ? '💾 Saving...' : '💾 Save All Changes'}
                            </button>
                            <button
                                class="btn btn-secondary"
                                onClick={handleDiscardAll}
                                disabled={isSaving()}
                            >
                                ✕ Discard
                            </button>
                        </div>
                    </div>
                </div>
            </Show>

            <div class="settings-card">
                <div class="settings-header">💰 Dividend & Yield Manager</div>
                <div class="settings-description">
                    Manage dividend settings, yield calculations, and YoC inclusions.
                    <strong>Manual overrides are protected from Questrade syncs.</strong>
                </div>

                <div class="manager-controls">
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

                    <div class="info-summary">
                        <div class="info-box">
                            <span class="info-label">Total Stocks:</span>
                            <span class="info-value">{availableStocks().length}</span>
                        </div>
                        <div class="info-box">
                            <span class="info-label">Excluded from YoC:</span>
                            <span class="info-value excluded-count">{exclusions().length}</span>
                        </div>
                        <div class="info-box">
                            <span class="info-label">Manual Overrides:</span>
                            <span class="info-value override-count">{dividendOverrides().size}</span>
                        </div>
                        <div class="info-box">
                            <span class="info-label">Unsaved Changes:</span>
                            <span class="info-value pending-count">{getPendingChangeCount()}</span>
                        </div>
                    </div>
                </div>
            </div>

            <Show when={selectedPerson()}>
                <div class="settings-card">
                    <div class="settings-header">Stock Configuration Table</div>

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
                        <Show when={isLoading()}>
                            <div class="empty-state">
                                Loading dividend data...
                            </div>
                        </Show>

                        <Show when={!isLoading() && sortedAndFilteredStocks().length === 0}>
                            <div class="empty-state">
                                {searchTerm() ? 'No stocks match your search' : 'No stocks available'}
                            </div>
                        </Show>

                        <Show when={!isLoading() && sortedAndFilteredStocks().length > 0}>
                            <table class="manager-table">
                                <thead>
                                    <tr>
                                        <th class="checkbox-col">Include in YoC</th>
                                        <th class="sortable" onClick={() => handleSort('symbol')}>
                                            Symbol {sortColumn() === 'symbol' && (sortDirection() === 'asc' ? '▲' : '▼')}
                                        </th>
                                        <th>Company</th>
                                        <th class="sortable" onClick={() => handleSort('frequency')}>
                                            Div Frequency {sortColumn() === 'frequency' && (sortDirection() === 'asc' ? '▲' : '▼')}
                                        </th>
                                        <th class="sortable number-col" onClick={() => handleSort('monthlyDiv')}>
                                            Monthly Div/Share {sortColumn() === 'monthlyDiv' && (sortDirection() === 'asc' ? '▲' : '▼')}
                                        </th>
                                        <th class="sortable number-col" onClick={() => handleSort('currentYield')}>
                                            Current Yield {sortColumn() === 'currentYield' && (sortDirection() === 'asc' ? '▲' : '▼')}
                                        </th>
                                        <th class="sortable number-col" onClick={() => handleSort('yieldOnCost')}>
                                            Yield on Cost {sortColumn() === 'yieldOnCost' && (sortDirection() === 'asc' ? '▲' : '▼')}
                                        </th>
                                        <th class="sortable number-col" onClick={() => handleSort('marketValue')}>
                                            Market Value {sortColumn() === 'marketValue' && (sortDirection() === 'asc' ? '▲' : '▼')}
                                        </th>
                                        <th class="status-col">Override</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <For each={sortedAndFilteredStocks()}>
                                        {stock => {
                                            // Create reactive accessors using arrow functions
                                            const excluded = () => isExcluded(stock.symbol);
                                            const frequency = () => getDividendFrequency(stock.symbol);
                                            const monthlyDiv = () => getMonthlyDividend(stock.symbol);
                                            const marketValue = () => (stock.openQuantity || 0) * (stock.currentPrice || 0);
                                            const isPending = () => pendingChanges().has(stock.symbol);
                                            const hasOverride = () => hasManualOverride(stock.symbol);

                                            return (
                                                <tr class={`${excluded() ? 'excluded-row' : 'included-row'} ${isPending() ? 'pending-row' : ''}`}>
                                                    <td class="checkbox-col">
                                                        <input
                                                            type="checkbox"
                                                            checked={!excluded()}
                                                            onChange={() => handleExclusionToggle(stock.symbol)}
                                                            class="yoc-checkbox"
                                                            title={excluded() ? "Excluded from portfolio YoC" : "Included in portfolio YoC"}
                                                        />
                                                    </td>
                                                    <td class="symbol-col">
                                                        {stock.symbol}
                                                        {isPending() && <span class="pending-indicator">*</span>}
                                                    </td>
                                                    <td class="company-col">{stock.companyName || 'N/A'}</td>
                                                    <td class="frequency-col">
                                                        <select
                                                            value={frequency()}
                                                            onChange={(e) => handleFrequencyChange(stock.symbol, e.target.value)}
                                                            class="frequency-select"
                                                        >
                                                            <option value="monthly">Monthly</option>
                                                            <option value="semi-monthly">Semi-Monthly</option>
                                                            <option value="quarterly">Quarterly</option>
                                                            <option value="semi-annual">Semi-Annual</option>
                                                            <option value="annual">Annual</option>
                                                            <option value="none">None</option>
                                                        </select>
                                                    </td>
                                                    <td class="number-col">
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            min="0"
                                                            value={monthlyDiv().toFixed(2)}
                                                            onInput={(e) => handleMonthlyDivChange(stock.symbol, e.target.value)}
                                                            class="monthly-div-input"
                                                            placeholder="0.00"
                                                        />
                                                    </td>
                                                    <td class="number-col">
                                                        <span class="yield-value">
                                                            {stock.dividendData?.currentYield ?
                                                                `${stock.dividendData.currentYield.toFixed(2)}%` :
                                                                '0.00%'}
                                                        </span>
                                                    </td>
                                                    <td class="number-col">
                                                        <span class={`yield-value ${excluded() ? 'excluded-value' : ''}`}>
                                                            {stock.dividendData?.yieldOnCost ?
                                                                `${stock.dividendData.yieldOnCost.toFixed(2)}%` :
                                                                '0.00%'}
                                                        </span>
                                                    </td>
                                                    <td class="number-col">
                                                        ${marketValue().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </td>
                                                    <td class="status-col">
                                                        <span class={`override-badge ${hasOverride() ? 'manual' : 'auto'}`}>
                                                            {hasOverride() ? '✏️ Manual' : '🔄 Auto'}
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

                    <Show when={!hasUnsavedChanges() && selectedPerson()}>
                        <div class="help-text">
                            💡 <strong>Tip:</strong> Make changes to dividend frequency or monthly amounts.
                            Your manual settings will be protected from Questrade syncs.
                        </div>
                    </Show>
                </div>
            </Show>

            <Show when={isLoading()}>
                <div class="loading-overlay">
                    <div class="loading-spinner">🔄</div>
                    <div class="loading-text">Loading stocks...</div>
                </div>
            </Show>

            <style>{`
                .dividend-yield-manager {
                    position: relative;
                }

                .unsaved-changes-banner {
                    position: sticky;
                    top: 0;
                    z-index: 100;
                    background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
                    border: 2px solid #f59e0b;
                    border-radius: 8px;
                    padding: 1rem;
                    margin-bottom: 1rem;
                    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.2);
                    animation: slideDown 0.3s ease-out;
                }

                @keyframes slideDown {
                    from {
                        transform: translateY(-20px);
                        opacity: 0;
                    }
                    to {
                        transform: translateY(0);
                        opacity: 1;
                    }
                }

                .banner-content {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    flex-wrap: wrap;
                }

                .banner-icon {
                    font-size: 1.5rem;
                }

                .banner-text {
                    flex: 1;
                    font-size: 0.875rem;
                    color: #92400e;
                }

                .banner-actions {
                    display: flex;
                    gap: 0.5rem;
                }

                .btn {
                    padding: 0.5rem 1rem;
                    border: none;
                    border-radius: 6px;
                    font-size: 0.875rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .btn-primary {
                    background: #10b981;
                    color: white;
                }

                .btn-primary:hover:not(:disabled) {
                    background: #059669;
                }

                .btn-secondary {
                    background: #6b7280;
                    color: white;
                }

                .btn-secondary:hover:not(:disabled) {
                    background: #4b5563;
                }

                .settings-description {
                    margin: 1rem 0;
                    padding: 0.75rem;
                    background: #dbeafe;
                    border-left: 3px solid #3b82f6;
                    border-radius: 4px;
                    font-size: 0.875rem;
                    color: #1e40af;
                }

                .manager-controls {
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }

                .person-selector {
                    padding: 0.5rem;
                    border: 1px solid #e5e7eb;
                    border-radius: 6px;
                    font-size: 0.875rem;
                }

                .info-summary {
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

                .info-value.override-count {
                    color: #f59e0b;
                }

                .info-value.pending-count {
                    color: #8b5cf6;
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

                .manager-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 0.875rem;
                }

                .manager-table thead {
                    position: sticky;
                    top: 0;
                    background: #f9fafb;
                    z-index: 10;
                }

                .manager-table th {
                    padding: 0.75rem;
                    text-align: left;
                    font-weight: 600;
                    color: #374151;
                    border-bottom: 2px solid #e5e7eb;
                    white-space: nowrap;
                    font-size: 0.75rem;
                }

                .manager-table th.sortable {
                    cursor: pointer;
                    user-select: none;
                }

                .manager-table th.sortable:hover {
                    background: #f3f4f6;
                }

                .manager-table th.number-col {
                    text-align: right;
                }

                .manager-table td {
                    padding: 0.75rem;
                    border-bottom: 1px solid #e5e7eb;
                }

                .manager-table tr.included-row {
                    background: #f0fdf4;
                }

                .manager-table tr.excluded-row {
                    background: #fef2f2;
                }

                .manager-table tr.pending-row {
                    background: #faf5ff;
                    border-left: 3px solid #8b5cf6;
                }

                .manager-table tr:hover {
                    background: #f3f4f6;
                }

                .checkbox-col {
                    width: 80px;
                    text-align: center;
                }

                .yoc-checkbox {
                    width: 18px;
                    height: 18px;
                    cursor: pointer;
                    accent-color: #16a34a;
                }

                .symbol-col {
                    font-weight: 600;
                    color: #111827;
                }

                .pending-indicator {
                    color: #8b5cf6;
                    font-weight: bold;
                    margin-left: 0.25rem;
                }

                .company-col {
                    max-width: 250px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    color: #6b7280;
                }

                .frequency-col {
                    min-width: 120px;
                }

                .frequency-select {
                    width: 100%;
                    padding: 0.375rem;
                    border: 1px solid #d1d5db;
                    border-radius: 4px;
                    font-size: 0.8rem;
                    cursor: pointer;
                }

                .frequency-select:focus {
                    outline: none;
                    border-color: #3b82f6;
                    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
                }

                .number-col {
                    text-align: right;
                }

                .monthly-div-input {
                    width: 100px;
                    padding: 0.375rem;
                    border: 1px solid #d1d5db;
                    border-radius: 4px;
                    font-size: 0.8rem;
                    text-align: right;
                }

                .monthly-div-input:focus {
                    outline: none;
                    border-color: #3b82f6;
                    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
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

                .override-badge {
                    padding: 0.25rem 0.75rem;
                    border-radius: 12px;
                    font-size: 0.7rem;
                    font-weight: 600;
                }

                .override-badge.manual {
                    background: #fef3c7;
                    color: #92400e;
                }

                .override-badge.auto {
                    background: #e0e7ff;
                    color: #3730a3;
                }

                .empty-state {
                    text-align: center;
                    padding: 2rem;
                    color: #9ca3af;
                    font-size: 0.875rem;
                }

                .help-text {
                    margin-top: 1rem;
                    padding: 0.75rem;
                    background: #f0f9ff;
                    border-radius: 6px;
                    font-size: 0.875rem;
                    color: #0c4a6e;
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

export default DividendYieldManager;
