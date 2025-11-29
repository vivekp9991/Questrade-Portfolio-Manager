import { createSignal, createEffect, Show, For, onMount } from 'solid-js';
import * as settingsApi from '../services/settingsApi';
import './DividendManager.css';

const DividendManager = (props) => {
  const [positions, setPositions] = createSignal([]);
  const [originalPositions, setOriginalPositions] = createSignal([]);
  const [loading, setLoading] = createSignal(false);
  const [searchTerm, setSearchTerm] = createSignal('');
  const [sortColumn, setSortColumn] = createSignal('symbol');
  const [sortDirection, setSortDirection] = createSignal('asc');
  const [changes, setChanges] = createSignal({});
  const [exclusions, setExclusions] = createSignal([]);
  const [symbolDividends, setSymbolDividends] = createSignal([]); // Centralized symbol dividend data

  // Pagination
  const [currentPage, setCurrentPage] = createSignal(1);
  const [itemsPerPage, setItemsPerPage] = createSignal(10);

  // Statistics
  const totalStocks = () => positions().length;
  const excludedCount = () => {
    return positions().filter(p => {
      const changeKey = `${p.symbol}_include`;
      if (changeKey in changes()) {
        return !changes()[changeKey];
      }
      return exclusions().includes(p.symbol);
    }).length;
  };
  const overrideCount = () => {
    return Object.keys(changes()).filter(k => k.endsWith('_override') || k.endsWith('_frequency')).length;
  };
  const unsavedChanges = () => Object.keys(changes()).length;

  // Dividend frequencies
  const frequencies = ['Monthly', 'Semi-Monthly', 'Quarterly', 'Semi-Annual', 'Annual', 'No Dividend', 'Unknown'];

  // Convert frontend frequency format to backend format
  const toBackendFrequency = (frontendFreq) => {
    const mapping = {
      'Monthly': 'monthly',
      'Semi-Monthly': 'semi-monthly',
      'Quarterly': 'quarterly',
      'Semi-Annual': 'semi-annual',
      'Annual': 'annual',
      'No Dividend': 'none',
      'Unknown': 'unknown'
    };
    return mapping[frontendFreq] || 'unknown';
  };

  // Convert backend frequency format to frontend format
  const toFrontendFrequency = (backendFreq) => {
    const mapping = {
      'monthly': 'Monthly',
      'semi-monthly': 'Semi-Monthly',
      'quarterly': 'Quarterly',
      'semi-annual': 'Semi-Annual',
      'annual': 'Annual',
      'none': 'No Dividend',
      'unknown': 'Unknown'
    };
    return mapping[backendFreq] || 'Unknown';
  };

  // Load positions
  const loadPositions = async () => {
    if (!props.selectedPerson) {
      props.showMessage?.('Please select a person', 'error');
      return;
    }

    try {
      setLoading(true);
      const [positionsData, exclusionsData, symbolDividendsData] = await Promise.all([
        settingsApi.fetchDividendPositions(props.selectedPerson),
        settingsApi.fetchYieldExclusions(), // Centralized, not person-specific
        settingsApi.fetchAllSymbolDividends() // Load centralized symbol dividend data
      ]);

      setPositions(Array.isArray(positionsData) ? positionsData : []);
      setOriginalPositions(Array.isArray(positionsData) ? [...positionsData] : []);
      setExclusions(Array.isArray(exclusionsData) ? exclusionsData.map(e => e.symbol) : []);
      setSymbolDividends(Array.isArray(symbolDividendsData) ? symbolDividendsData : []);
      console.log('[DIVIDEND] Loaded symbol dividends:', symbolDividendsData);
      setChanges({});
    } catch (error) {
      props.showMessage?.(`Failed to load positions: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Sync dividend data from Questrade
  const handleSyncDividends = async () => {
    try {
      setLoading(true);
      props.showMessage?.('Syncing dividend data from Questrade...', 'info');

      await settingsApi.syncQuestradeDividends();

      props.showMessage?.('Dividend data synced successfully from Questrade', 'success');

      // Reload positions to reflect updated data
      await loadPositions();
    } catch (error) {
      props.showMessage?.(`Failed to sync dividends: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Auto-load on mount
  onMount(() => {
    if (props.selectedPerson) {
      loadPositions();
    }
  });

  // Auto-load when person changes
  createEffect(() => {
    if (props.selectedPerson) {
      loadPositions();
    }
  });

  // Handle field changes
  const handleInclusionChange = (symbol, newValue) => {
    const changeKey = `${symbol}_include`;
    const isExcluded = exclusions().includes(symbol);
    const originalValue = !isExcluded;

    if (newValue === originalValue) {
      // Reverting to original, remove from changes
      const newChanges = { ...changes() };
      delete newChanges[changeKey];
      setChanges(newChanges);
    } else {
      setChanges({ ...changes(), [changeKey]: newValue });
    }
  };

  const handleOverrideChange = (symbol, value) => {
    const changeKey = `${symbol}_override`;

    // Always track the change when user enters a value
    if (value === '' || value === null || value === undefined) {
      // Empty value - remove from changes
      const newChanges = { ...changes() };
      delete newChanges[changeKey];
      setChanges(newChanges);
    } else {
      setChanges({ ...changes(), [changeKey]: value });
    }
  };

  const handleFrequencyChange = (symbol, frequency) => {
    const changeKey = `${symbol}_frequency`;

    // Always track the change when user selects a frequency
    // We'll let the backend determine if it's actually different from the original
    setChanges({ ...changes(), [changeKey]: frequency });
  };

  // Get display value
  const getInclusionValue = (symbol) => {
    const changeKey = `${symbol}_include`;
    if (changeKey in changes()) {
      return changes()[changeKey];
    }
    return !exclusions().includes(symbol);
  };

  const getOverrideValue = (symbol) => {
    const changeKey = `${symbol}_override`;
    if (changeKey in changes()) {
      return changes()[changeKey];
    }
    const symbolData = symbolDividends().find(s => s.symbol === symbol);
    // Only return override value if it's a manual override
    // Handle isManualOverride being either boolean true or string "true"
    const isOverride = symbolData?.isManualOverride === true || symbolData?.isManualOverride === 'true';

    if (isOverride) {
      // Try overrideValue first (some records), then monthlyDividendPerShare
      const monthlyValue = symbolData.overrideValue || symbolData.monthlyDividendPerShare;
      if (monthlyValue && monthlyValue > 0) {
        // Return monthly value as-is (user enters monthly, not annual)
        return monthlyValue.toFixed(4);
      }
    }
    return '';
  };

  const getFrequencyValue = (symbol) => {
    const changeKey = `${symbol}_frequency`;
    if (changeKey in changes()) {
      return changes()[changeKey];
    }
    const symbolData = symbolDividends().find(s => s.symbol === symbol);
    const backendFreq = symbolData?.dividendFrequency;
    const frontendFreq = toFrontendFrequency(backendFreq) || 'Unknown';
    console.log(`[DIVIDEND] Get frequency for ${symbol}:`, {symbolData, backendFreq, frontendFreq});
    return frontendFreq;
  };

  // Save all changes
  const handleSaveAll = async () => {
    try {
      setLoading(true);
      const changeEntries = Object.entries(changes());

      // Group changes by symbol
      const symbolChanges = {};
      for (const [key, value] of changeEntries) {
        const [symbol, type] = key.split('_');

        if (!symbolChanges[symbol]) {
          symbolChanges[symbol] = {};
        }
        symbolChanges[symbol][type] = value;
      }

      // Process each symbol's changes
      for (const [symbol, changeTypes] of Object.entries(symbolChanges)) {
        // Handle YoC inclusion/exclusion
        if ('include' in changeTypes) {
          if (changeTypes.include) {
            // Include in YoC - remove from exclusions
            await settingsApi.removeYieldExclusion(symbol);
          } else {
            // Exclude from YoC
            await settingsApi.addYieldExclusion(symbol, 'User excluded');
          }
        }

        // Handle dividend data changes (override or frequency)
        if ('override' in changeTypes || 'frequency' in changeTypes) {
          // User enters MONTHLY dividend, not annual
          const monthlyDividendPerShare = changeTypes.override !== undefined
            ? parseFloat(changeTypes.override) || 0
            : parseFloat(getOverrideValue(symbol)) || 0;

          const frequency = changeTypes.frequency !== undefined
            ? changeTypes.frequency
            : getFrequencyValue(symbol);

          // Save to centralized SymbolDividend table
          await settingsApi.setSymbolDividend(symbol, {
            dividendFrequency: toBackendFrequency(frequency),
            monthlyDividendPerShare,
            isManualOverride: true
          });
        }
      }

      props.showMessage?.('All changes saved successfully', 'success');
      setChanges({});
      await loadPositions(); // Reload to get fresh data
    } catch (error) {
      props.showMessage?.(`Failed to save changes: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Discard changes
  const handleDiscard = () => {
    setChanges({});
    props.showMessage?.('Changes discarded', 'info');
  };

  // Sorting
  const handleSort = (column) => {
    if (sortColumn() === column) {
      setSortDirection(sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
    setCurrentPage(1); // Reset to first page when sorting
  };

  // Filtered and sorted positions (without pagination)
  const filteredAndSortedPositions = () => {
    let filtered = positions();

    // Apply search filter
    if (searchTerm()) {
      const term = searchTerm().toLowerCase();
      filtered = filtered.filter(p =>
        p.symbol?.toLowerCase().includes(term) ||
        p.description?.toLowerCase().includes(term)
      );
    }

    // Apply sorting
    filtered = [...filtered].sort((a, b) => {
      let aVal, bVal;

      switch (sortColumn()) {
        case 'symbol':
          aVal = a.symbol || '';
          bVal = b.symbol || '';
          break;
        case 'frequency':
          aVal = getFrequencyValue(a.symbol);
          bVal = getFrequencyValue(b.symbol);
          break;
        case 'monthlyDiv':
          // Use backend monthlyDividendPerShare for sorting
          const aOverride = getOverrideValue(a.symbol);
          const bOverride = getOverrideValue(b.symbol);

          aVal = aOverride ? parseFloat(aOverride) / 12 : (a.dividendData?.monthlyDividendPerShare || 0);
          bVal = bOverride ? parseFloat(bOverride) / 12 : (b.dividendData?.monthlyDividendPerShare || 0);
          break;
        case 'currentYield':
          aVal = a.dividendData?.currentYield || 0;
          bVal = b.dividendData?.currentYield || 0;
          break;
        case 'yoc':
          aVal = a.dividendData?.yieldOnCost || 0;
          bVal = b.dividendData?.yieldOnCost || 0;
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

    return filtered;
  };

  // Paginated positions
  const filteredPositions = () => {
    const allFiltered = filteredAndSortedPositions();
    const startIndex = (currentPage() - 1) * itemsPerPage();
    const endIndex = startIndex + itemsPerPage();
    return allFiltered.slice(startIndex, endIndex);
  };

  // Pagination helpers
  const totalPages = () => Math.ceil(filteredAndSortedPositions().length / itemsPerPage());
  const totalFilteredCount = () => filteredAndSortedPositions().length;

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages()) {
      setCurrentPage(page);
    }
  };

  const handleItemsPerPageChange = (newItemsPerPage) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1); // Reset to first page when changing items per page
  };

  const getSortIcon = (column) => {
    if (sortColumn() !== column) return '⇅';
    return sortDirection() === 'asc' ? '↑' : '↓';
  };

  // Copy symbol to clipboard
  const copySymbolToClipboard = (symbol) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(symbol).then(() => {
        props.showMessage?.(`Copied ${symbol} to clipboard`, 'success');
      }).catch((err) => {
        console.error('Failed to copy:', err);
        props.showMessage?.(`Failed to copy ${symbol}`, 'error');
      });
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = symbol;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        props.showMessage?.(`Copied ${symbol} to clipboard`, 'success');
      } catch (err) {
        console.error('Fallback copy failed:', err);
        props.showMessage?.(`Failed to copy ${symbol}`, 'error');
      }
      document.body.removeChild(textArea);
    }
  };

  return (
    <div class="dividend-manager">
      {/* Statistics Cards */}
      <div class="dividend-stats">
        <div class="stat-card">
          <div class="stat-label">Total Stocks</div>
          <div class="stat-value">{totalStocks()}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Excluded from YoC</div>
          <div class="stat-value">{excludedCount()}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Manual Overrides</div>
          <div class="stat-value">{overrideCount()}</div>
        </div>
        <div class={`stat-card ${unsavedChanges() > 0 ? 'highlight' : ''}`}>
          <div class="stat-label">Unsaved Changes</div>
          <div class="stat-value">{unsavedChanges()}</div>
        </div>
      </div>

      {/* Action Bar */}
      <div class="dividend-actions">
        <div class="search-container">
          <input
            type="text"
            class="search-input"
            placeholder="Search by symbol or company..."
            value={searchTerm()}
            onInput={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div class="rows-per-page">
          <label style="margin-right: 8px; color: #888; font-size: 14px;">Rows per page:</label>
          <select
            class="rows-select"
            value={itemsPerPage()}
            onChange={(e) => handleItemsPerPageChange(parseInt(e.target.value))}
            style="padding: 6px 12px; background: #1e1e1e; border: 1px solid #333; border-radius: 4px; color: #fff; font-size: 14px;"
          >
            <option value="5">5</option>
            <option value="10">10</option>
            <option value="15">15</option>
            <option value="25">25</option>
            <option value="50">50</option>
          </select>
        </div>

        <div class="action-buttons">
          <Show when={unsavedChanges() > 0}>
            <button class="btn btn-secondary" onClick={handleDiscard} disabled={loading()}>
              DISCARD CHANGES
            </button>
            <button class="btn btn-primary" onClick={handleSaveAll} disabled={loading()}>
              SAVE ALL CHANGES
            </button>
          </Show>
          <button class="btn btn-refresh" onClick={loadPositions} disabled={loading()}>
            REFRESH
          </button>
          <button class="btn btn-primary" onClick={handleSyncDividends} disabled={loading()}>
            SYNC DIVIDENDS
          </button>
        </div>
      </div>

      {/* Table */}
      <div class="dividend-table-container">
        <table class="dividend-table">
          <thead>
            <tr>
              <th class="sortable" onClick={() => handleSort('include')}>
                INCLUDE IN YOC <span class="sort-icon">{getSortIcon('include')}</span>
              </th>
              <th class="sortable" onClick={() => handleSort('symbol')}>
                SYMBOL <span class="sort-icon">{getSortIcon('symbol')}</span>
              </th>
              <th class="sortable" onClick={() => handleSort('frequency')}>
                DIV FREQUENCY <span class="sort-icon">{getSortIcon('frequency')}</span>
              </th>
              <th class="sortable" onClick={() => handleSort('monthlyDiv')}>
                MONTHLY DIV/SHARE <span class="sort-icon">{getSortIcon('monthlyDiv')}</span>
              </th>
              <th class="sortable" onClick={() => handleSort('currentYield')}>
                CURRENT YIELD <span class="sort-icon">{getSortIcon('currentYield')}</span>
              </th>
              <th class="sortable" onClick={() => handleSort('yoc')}>
                YIELD ON COST <span class="sort-icon">{getSortIcon('yoc')}</span>
              </th>
              <th>OVERRIDE</th>
            </tr>
          </thead>
          <tbody>
            <Show when={filteredPositions().length > 0} fallback={
              <tr>
                <td colspan="7" class="empty-state">
                  {loading() ? 'Loading positions...' : 'No positions found. Click REFRESH to load.'}
                </td>
              </tr>
            }>
              <For each={filteredPositions()}>
                {(position) => {
                  const isIncluded = getInclusionValue(position.symbol);
                  const overrideValue = getOverrideValue(position.symbol);
                  // Don't store frequencyValue in const - call function directly in JSX for reactivity
                  const hasOverride = overrideValue !== '';

                  // Calculate monthly dividend per share based on frequency
                  const totalShares = position.totalQuantity || 1;

                  let monthlyDivPerShare = 0;
                  if (hasOverride) {
                    // Override is annual per-share dividend
                    const annualPerShare = parseFloat(overrideValue) || 0;
                    monthlyDivPerShare = annualPerShare / 12; // Always divide by 12 for override
                  } else {
                    // Backend provides monthlyDividendPerShare directly
                    monthlyDivPerShare = position.dividendData?.monthlyDividendPerShare || 0;
                  }

                  return (
                    <tr class={!isIncluded ? 'excluded-row' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          checked={isIncluded}
                          onChange={(e) => handleInclusionChange(position.symbol, e.target.checked)}
                          class="checkbox-input"
                        />
                      </td>
                      <td
                        class="mono-text symbol-cell"
                        onClick={() => copySymbolToClipboard(position.symbol)}
                        style="cursor: pointer; user-select: none;"
                        title="Click to copy"
                      >
                        {position.symbol}
                      </td>
                      <td>
                        <select
                          class="frequency-select"
                          value={getFrequencyValue(position.symbol)}
                          onChange={(e) => handleFrequencyChange(position.symbol, e.target.value)}
                        >
                          <For each={frequencies}>
                            {(freq) => <option value={freq}>{freq}</option>}
                          </For>
                        </select>
                      </td>
                      <td class="mono-text">${monthlyDivPerShare.toFixed(4)}</td>
                      <td class="mono-text">{(position.dividendData?.currentYield || 0).toFixed(2)}%</td>
                      <td class="mono-text">{(position.dividendData?.yieldOnCost || 0).toFixed(2)}%</td>
                      <td>
                        <div class="override-cell">
                          <input
                            type="number"
                            step="0.01"
                            class="override-input"
                            value={overrideValue}
                            onChange={(e) => handleOverrideChange(position.symbol, e.target.value)}
                            placeholder="0.00"
                          />
                          <Show when={changes()[`${position.symbol}_override`] || changes()[`${position.symbol}_frequency`]}>
                            <button
                              class="btn-save-row"
                              onClick={async () => {
                                try {
                                  setLoading(true);

                                  const overrideChange = changes()[`${position.symbol}_override`];
                                  const frequencyChange = changes()[`${position.symbol}_frequency`];

                                  // User enters MONTHLY dividend, not annual
                                  const monthlyDividendPerShare = overrideChange !== undefined
                                    ? parseFloat(overrideChange) || 0
                                    : parseFloat(getOverrideValue(position.symbol)) || 0;

                                  const frequency = frequencyChange !== undefined
                                    ? frequencyChange
                                    : getFrequencyValue(position.symbol);

                                  await settingsApi.setSymbolDividend(position.symbol, {
                                    dividendFrequency: toBackendFrequency(frequency),
                                    monthlyDividendPerShare,
                                    isManualOverride: true
                                  });

                                  // Remove from changes
                                  const newChanges = { ...changes() };
                                  delete newChanges[`${position.symbol}_override`];
                                  delete newChanges[`${position.symbol}_frequency`];
                                  setChanges(newChanges);

                                  props.showMessage?.('Override saved successfully', 'success');
                                  await loadPositions();
                                } catch (error) {
                                  props.showMessage?.(`Failed to save override: ${error.message}`, 'error');
                                } finally {
                                  setLoading(false);
                                }
                              }}
                              disabled={loading()}
                              title="Save override for this symbol"
                            >
                              💾
                            </button>
                          </Show>
                          <Show when={hasOverride}>
                            <span class="override-badge">OVERRIDE</span>
                          </Show>
                        </div>
                      </td>
                    </tr>
                  );
                }}
              </For>
            </Show>
          </tbody>
        </table>

        {/* Pagination Controls */}
        <div class="pagination-controls" style="margin-top: 16px; display: flex; justify-content: space-between; align-items: center;">
          <div class="pagination-info" style="color: #888; font-size: 14px;">
            Showing {totalFilteredCount() > 0 ? ((currentPage() - 1) * itemsPerPage() + 1) : 0} - {Math.min(currentPage() * itemsPerPage(), totalFilteredCount())} of {totalFilteredCount()} records
          </div>
          <div class="pagination-buttons" style="display: flex; gap: 8px;">
            <button
              class="btn btn-secondary"
              onClick={() => handlePageChange(1)}
              disabled={currentPage() === 1}
              style="padding: 6px 12px; font-size: 12px;"
            >
              First
            </button>
            <button
              class="btn btn-secondary"
              onClick={() => handlePageChange(currentPage() - 1)}
              disabled={currentPage() === 1}
              style="padding: 6px 12px; font-size: 12px;"
            >
              Previous
            </button>
            <span style="padding: 8px 16px; background: #1e1e1e; border-radius: 4px; color: #fff; font-size: 14px;">
              Page {currentPage()} of {totalPages() || 1}
            </span>
            <button
              class="btn btn-secondary"
              onClick={() => handlePageChange(currentPage() + 1)}
              disabled={currentPage() === totalPages() || totalPages() === 0}
              style="padding: 6px 12px; font-size: 12px;"
            >
              Next
            </button>
            <button
              class="btn btn-secondary"
              onClick={() => handlePageChange(totalPages())}
              disabled={currentPage() === totalPages() || totalPages() === 0}
              style="padding: 6px 12px; font-size: 12px;"
            >
              Last
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DividendManager;
