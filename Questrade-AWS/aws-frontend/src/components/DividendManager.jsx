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
  const [symbolDividends, setSymbolDividends] = createSignal([]);
  const [actuals, setActuals] = createSignal({}); // symbol -> actual dividend data (D1)
  const [expanded, setExpanded] = createSignal(null); // currently expanded symbol

  // Symbol Categories
  const [symbolCategories, setSymbolCategories] = createSignal({});
  const [categoryOptions, setCategoryOptions] = createSignal({ types: [], subTypes: {} });

  // Pagination
  const [currentPage, setCurrentPage] = createSignal(1);
  const [itemsPerPage, setItemsPerPage] = createSignal(10);

  // Statistics
  const totalStocks = () => positions().length;
  const excludedCount = () => positions().filter(p => {
    const k = `${p.symbol}_include`;
    return (k in changes()) ? !changes()[k] : exclusions().includes(p.symbol);
  }).length;
  const overrideCount = () => Object.keys(changes()).filter(k => k.endsWith('_override') || k.endsWith('_frequency')).length;
  const unsavedChanges = () => Object.keys(changes()).length;
  const reviewCount = () => positions().filter(p => needsReview(p)).length;

  const frequencies = ['Monthly', 'Semi-Monthly', 'Quarterly', 'Semi-Annual', 'Annual', 'No Dividend', 'Unknown'];

  const toBackendFrequency = (f) => ({ 'Monthly': 'monthly', 'Semi-Monthly': 'semi-monthly', 'Quarterly': 'quarterly', 'Semi-Annual': 'semi-annual', 'Annual': 'annual', 'No Dividend': 'none', 'Unknown': 'unknown' }[f] || 'unknown');
  const toFrontendFrequency = (f) => ({ 'monthly': 'Monthly', 'semi-monthly': 'Semi-Monthly', 'quarterly': 'Quarterly', 'semi-annual': 'Semi-Annual', 'annual': 'Annual', 'none': 'No Dividend', 'unknown': 'Unknown' }[f] || 'Unknown');

  const handleSyncDividends = async () => {
    try {
      setLoading(true);
      props.showMessage?.('Syncing dividend data from Questrade...', 'info');
      const result = await settingsApi.syncQuestradeDividends();
      props.showMessage?.(`Dividend sync complete: ${result.results.updated} updated, ${result.results.skipped} skipped`, 'success');
      await loadPositions();
    } catch (error) {
      props.showMessage?.(`Failed to sync dividends: ${error.message}`, 'error');
    } finally { setLoading(false); }
  };

  const loadPositions = async () => {
    try {
      setLoading(true);
      const [positionsData, exclusionsData, symbolDividendsData, categoriesData, categoryOptionsData, actualsData] = await Promise.all([
        settingsApi.fetchAllUniqueSymbols(),
        settingsApi.fetchYieldExclusions(),
        settingsApi.fetchAllSymbolDividends(),
        settingsApi.fetchAllSymbolCategories().catch(() => []),
        settingsApi.fetchCategoryOptions().catch(() => ({ types: [], subTypes: {} })),
        settingsApi.fetchDividendActuals().catch(() => [])
      ]);

      setPositions(Array.isArray(positionsData) ? positionsData : []);
      setOriginalPositions(Array.isArray(positionsData) ? [...positionsData] : []);
      setExclusions(Array.isArray(exclusionsData) ? exclusionsData.map(e => e.symbol) : []);
      setSymbolDividends(Array.isArray(symbolDividendsData) ? symbolDividendsData : []);

      const categoriesMap = {};
      (Array.isArray(categoriesData) ? categoriesData : []).forEach(cat => { categoriesMap[cat.symbol] = cat; });
      setSymbolCategories(categoriesMap);

      setCategoryOptions({
        types: categoryOptionsData?.symbolTypes || categoryOptionsData?.types || [],
        subTypes: categoryOptionsData?.subTypes || {}
      });

      const actualsMap = {};
      (Array.isArray(actualsData) ? actualsData : []).forEach(a => { if (a && a.symbol) actualsMap[a.symbol] = a; });
      setActuals(actualsMap);

      setChanges({});
    } catch (error) {
      props.showMessage?.(`Failed to load positions: ${error.message}`, 'error');
    } finally { setLoading(false); }
  };

  createEffect(() => { loadPositions(); });

  // ---- change handlers ----
  const handleInclusionChange = (symbol, newValue) => {
    const k = `${symbol}_include`;
    const originalValue = !exclusions().includes(symbol);
    if (newValue === originalValue) { const c = { ...changes() }; delete c[k]; setChanges(c); }
    else setChanges({ ...changes(), [k]: newValue });
  };

  const handleOverrideChange = (symbol, value) => {
    const k = `${symbol}_override`;
    const sd = symbolDividends().find(s => s.symbol === symbol);
    const isOverride = sd?.isManualOverride === 'true' || sd?.isManualOverride === true;
    // Override is a MONTHLY $/share value, stored as overrideValue.
    const originalValue = (isOverride && sd?.overrideValue != null && sd?.overrideValue !== '') ? Number(sd.overrideValue).toFixed(4) : '';
    if (value === originalValue || (value === '' && !originalValue)) { const c = { ...changes() }; delete c[k]; setChanges(c); }
    else setChanges({ ...changes(), [k]: value });
  };

  const handleFrequencyChange = (symbol, frequency) => {
    const k = `${symbol}_frequency`;
    const sd = symbolDividends().find(s => s.symbol === symbol);
    const originalValue = toFrontendFrequency(sd?.dividendFrequency) || 'Unknown';
    if (frequency === originalValue) { const c = { ...changes() }; delete c[k]; setChanges(c); }
    else setChanges({ ...changes(), [k]: frequency });
  };

  const handleSymbolTypeChange = (symbol, newType) => {
    const tk = `${symbol}_symbolType`, sk = `${symbol}_symbolSubType`;
    const originalType = symbolCategories()[symbol]?.symbolType || '';
    if (newType === originalType) { const c = { ...changes() }; delete c[tk]; delete c[sk]; setChanges(c); }
    else setChanges({ ...changes(), [tk]: newType, [sk]: '' });
  };

  const handleSubTypeChange = (symbol, newSubType) => {
    const k = `${symbol}_symbolSubType`;
    const originalSubType = symbolCategories()[symbol]?.symbolSubType || '';
    if (newSubType === originalSubType) { const c = { ...changes() }; delete c[k]; setChanges(c); }
    else setChanges({ ...changes(), [k]: newSubType });
  };

  // ---- getters ----
  const getSymbolType = (symbol) => (`${symbol}_symbolType` in changes()) ? changes()[`${symbol}_symbolType`] : (symbolCategories()[symbol]?.symbolType || '');
  const getSymbolSubType = (symbol) => (`${symbol}_symbolSubType` in changes()) ? changes()[`${symbol}_symbolSubType`] : (symbolCategories()[symbol]?.symbolSubType || '');
  const getSubTypeOptions = (type) => type ? (categoryOptions().subTypes?.[type] || []) : [];
  const getInclusionValue = (symbol) => (`${symbol}_include` in changes()) ? changes()[`${symbol}_include`] : !exclusions().includes(symbol);
  const getOverrideValue = (symbol) => {
    if (`${symbol}_override` in changes()) return changes()[`${symbol}_override`];
    const sd = symbolDividends().find(s => s.symbol === symbol);
    const isOverride = sd?.isManualOverride === 'true' || sd?.isManualOverride === true;
    // overrideValue is the MONTHLY $/share the owner set (backend uses it as monthly).
    if (isOverride && sd?.overrideValue != null && sd?.overrideValue !== '') return Number(sd.overrideValue).toFixed(4);
    return '';
  };
  const getFrequencyValue = (symbol) => (`${symbol}_frequency` in changes()) ? changes()[`${symbol}_frequency`] : (toFrontendFrequency(symbolDividends().find(s => s.symbol === symbol)?.dividendFrequency) || 'Unknown');

  // ---- D1 actuals-driven helpers ----
  const actualFor = (symbol) => actuals()[symbol] || {};
  // Payments per year by frequency label (matches the backend multiplier).
  const FREQ_MULT = { 'Monthly': 12, 'Semi-Monthly': 24, 'Quarterly': 4, 'Semi-Annual': 2, 'Annual': 1, 'No Dividend': 0, 'Unknown': 0 };
  const sdFor = (symbol) => symbolDividends().find((s) => s.symbol === symbol) || {};

  // Monthly $/share = override (monthly) → else Questrade PER-PAYMENT × payments-per-year(frequency) / 12
  // → else last synced monthly value. Reactive to the frequency dropdown.
  const effectiveMonthly = (position) => {
    const sym = position.symbol;
    const ov = getOverrideValue(sym);
    if (ov !== '') return parseFloat(ov) || 0; // override is a MONTHLY $/share value
    const perPayment = Number(sdFor(sym)?.questradeData?.dividend) || 0;
    const mult = FREQ_MULT[getFrequencyValue(sym)] ?? 0;
    if (perPayment > 0 && mult > 0) return (perPayment * mult) / 12;
    return Number(position.dividendData?.monthlyDividendPerShare) || 0; // fallback
  };
  const effectiveAnnual = (position) => effectiveMonthly(position) * 12;
  const computedYield = (position) => {
    const price = Number(position.currentPrice) || 0;
    return price > 0 ? (effectiveAnnual(position) / price) * 100 : 0;
  };
  const computedYoC = (position) => {
    const cost = Number(position.averageEntryPrice) || 0;
    return cost > 0 ? (effectiveAnnual(position) / cost) * 100 : 0;
  };
  const valueSource = (symbol) => (getOverrideValue(symbol) !== '') ? 'override' : (actualFor(symbol).valueSource || 'none');
  const needsReview = (position) => {
    const a = actualFor(position.symbol);
    if (getOverrideValue(position.symbol) !== '') return false; // owner-set, trust it
    if (!a.ttmPerShare || a.ttmPerShare <= 0) return false;
    const effAnnual = effectiveMonthly(position) * 12;
    return Math.abs(effAnnual - a.ttmPerShare) / a.ttmPerShare > 0.20;
  };
  const useLastActual = (symbol) => {
    const a = actualFor(symbol);
    if (a.ttmPerShare && a.ttmPerShare > 0) {
      const monthly = a.ttmPerShare / 12; // override is MONTHLY; TTM/12 reproduces the actual annual
      handleOverrideChange(symbol, monthly.toFixed(4));
      props.showMessage?.(`${symbol}: override set to $${monthly.toFixed(4)}/mo (= TTM $${a.ttmPerShare.toFixed(4)}/yr; review & SAVE)`, 'info');
    }
  };

  // ---- save / discard ----
  const handleSaveAll = async () => {
    try {
      setLoading(true);
      const changeEntries = Object.entries(changes());
      setChanges({});
      const symbolChanges = {};
      for (const [key, value] of changeEntries) {
        const i = key.indexOf('_');
        const symbol = key.slice(0, i); const type = key.slice(i + 1);
        (symbolChanges[symbol] = symbolChanges[symbol] || {})[type] = value;
      }
      for (const [symbol, ct] of Object.entries(symbolChanges)) {
        if ('include' in ct) {
          if (ct.include) await settingsApi.removeYieldExclusion(symbol);
          else await settingsApi.addYieldExclusion(symbol, 'User excluded');
        }
        if ('override' in ct || 'frequency' in ct) {
          // Override input is MONTHLY $/share; backend stores it as overrideValue (monthly).
          const monthlyOverride = ct.override !== undefined ? (parseFloat(ct.override) || 0) : (parseFloat(getOverrideValue(symbol)) || 0);
          const frequency = ct.frequency !== undefined ? ct.frequency : getFrequencyValue(symbol);
          await settingsApi.setSymbolDividend(symbol, {
            dividendFrequency: toBackendFrequency(frequency),
            monthlyDividendPerShare: monthlyOverride,
            isManualOverride: monthlyOverride > 0
          });
        }
        if ('symbolType' in ct || 'symbolSubType' in ct) {
          const cur = symbolCategories()[symbol] || {};
          await settingsApi.setSymbolCategory(symbol, {
            symbolType: ct.symbolType !== undefined ? ct.symbolType : (cur.symbolType || ''),
            symbolSubType: ct.symbolSubType !== undefined ? ct.symbolSubType : (cur.symbolSubType || '')
          });
        }
      }
      props.showMessage?.('All changes saved successfully', 'success');
      await new Promise(r => setTimeout(r, 1000));
      await loadPositions();
    } catch (error) {
      props.showMessage?.(`Failed to save changes: ${error.message}`, 'error');
      setChanges(Object.fromEntries(Object.entries(changes())));
    } finally { setLoading(false); }
  };

  const handleDiscard = () => { setChanges({}); props.showMessage?.('Changes discarded', 'info'); };

  // ---- sort / filter / paginate ----
  const handleSort = (column) => {
    if (sortColumn() === column) setSortDirection(sortDirection() === 'asc' ? 'desc' : 'asc');
    else { setSortColumn(column); setSortDirection('asc'); }
    setCurrentPage(1);
  };
  const filteredAndSortedPositions = () => {
    let filtered = positions();
    if (searchTerm()) {
      const term = searchTerm().toLowerCase();
      filtered = filtered.filter(p => p.symbol?.toLowerCase().includes(term) || p.description?.toLowerCase().includes(term) || p.companyName?.toLowerCase().includes(term));
    }
    filtered = [...filtered].sort((a, b) => {
      let aVal, bVal;
      switch (sortColumn()) {
        case 'symbol': aVal = a.symbol || ''; bVal = b.symbol || ''; break;
        case 'symbolType': aVal = getSymbolType(a.symbol) || 'zzz'; bVal = getSymbolType(b.symbol) || 'zzz'; break;
        case 'monthlyDiv': aVal = effectiveMonthly(a); bVal = effectiveMonthly(b); break;
        case 'currentYield': aVal = computedYield(a); bVal = computedYield(b); break;
        case 'yoc': aVal = computedYoC(a); bVal = computedYoC(b); break;
        case 'review': aVal = needsReview(a) ? 1 : 0; bVal = needsReview(b) ? 1 : 0; break;
        default: return 0;
      }
      if (typeof aVal === 'string') return sortDirection() === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortDirection() === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return filtered;
  };
  const filteredPositions = () => {
    const all = filteredAndSortedPositions();
    const start = (currentPage() - 1) * itemsPerPage();
    return all.slice(start, start + itemsPerPage());
  };
  const totalPages = () => Math.ceil(filteredAndSortedPositions().length / itemsPerPage());
  const totalFilteredCount = () => filteredAndSortedPositions().length;
  const handlePageChange = (page) => { if (page >= 1 && page <= totalPages()) setCurrentPage(page); };
  const handleItemsPerPageChange = (n) => { setItemsPerPage(n); setCurrentPage(1); };
  const getSortIcon = (c) => sortColumn() !== c ? '⇅' : (sortDirection() === 'asc' ? '↑' : '↓');

  const fmt = (n, d = 2) => (Number(n) || 0).toFixed(d);
  const srcLabel = { override: 'Override', questrade: 'Questrade', actual: 'Actual', none: 'No data' };

  return (
    <div class="dividend-manager">
      {/* Statistics */}
      <div class="dividend-stats">
        <div class="stat-card"><div class="stat-label">Total Stocks</div><div class="stat-value">{totalStocks()}</div></div>
        <div class="stat-card"><div class="stat-label">Excluded from YoC</div><div class="stat-value">{excludedCount()}</div></div>
        <div class="stat-card"><div class="stat-label">Manual Overrides</div><div class="stat-value">{overrideCount()}</div></div>
        <div class={`stat-card ${reviewCount() > 0 ? 'warn' : ''}`}><div class="stat-label">Needs Review</div><div class="stat-value">{reviewCount()}</div></div>
        <div class={`stat-card ${unsavedChanges() > 0 ? 'highlight' : ''}`}><div class="stat-label">Unsaved Changes</div><div class="stat-value">{unsavedChanges()}</div></div>
      </div>

      {/* Action bar */}
      <div class="dividend-actions">
        <div class="search-container">
          <input type="text" class="search-input" placeholder="Search by symbol or company..." value={searchTerm()} onInput={(e) => setSearchTerm(e.target.value)} />
        </div>
        <div class="dm-sortbar">
          <span class="dm-sort-label">Sort:</span>
          <button class={`dm-sort ${sortColumn() === 'symbol' ? 'active' : ''}`} onClick={() => handleSort('symbol')}>Symbol {getSortIcon('symbol')}</button>
          <button class={`dm-sort ${sortColumn() === 'currentYield' ? 'active' : ''}`} onClick={() => handleSort('currentYield')}>Yield {getSortIcon('currentYield')}</button>
          <button class={`dm-sort ${sortColumn() === 'review' ? 'active' : ''}`} onClick={() => handleSort('review')}>Review {getSortIcon('review')}</button>
        </div>
        <div class="action-buttons">
          <Show when={unsavedChanges() > 0}>
            <button class="btn btn-secondary" onClick={handleDiscard} disabled={loading()}>DISCARD</button>
            <button class="btn btn-primary" onClick={handleSaveAll} disabled={loading()}>SAVE ALL ({unsavedChanges()})</button>
          </Show>
          <button class="btn btn-primary" onClick={handleSyncDividends} disabled={loading()}>SYNC DIVIDENDS</button>
          <button class="btn btn-refresh" onClick={loadPositions} disabled={loading()}>REFRESH</button>
        </div>
      </div>

      {/* Compact rows + expand */}
      <div class="dm-list">
        <div class="dm-head">
          <div class="dm-c-inc">YoC</div>
          <div class="dm-c-sym">Symbol</div>
          <div class="dm-c-type">Type</div>
          <div class="dm-c-mo">Monthly /sh</div>
          <div class="dm-c-actual">Last actual /sh</div>
          <div class="dm-c-yield">Yield</div>
          <div class="dm-c-yoc">YoC</div>
          <div class="dm-c-src">Source</div>
          <div class="dm-c-exp"></div>
        </div>

        <Show when={filteredPositions().length > 0} fallback={<div class="dm-empty">{loading() ? 'Loading…' : 'No positions found. Click REFRESH.'}</div>}>
          <For each={filteredPositions()}>
            {(position) => {
              const sym = position.symbol;
              const a = () => actualFor(sym);
              const isExp = () => expanded() === sym;
              return (
                <div class={`dm-item ${getInclusionValue(sym) ? '' : 'excluded'} ${needsReview(position) ? 'review' : ''}`}>
                  <div class="dm-row" onClick={() => setExpanded(isExp() ? null : sym)}>
                    <div class="dm-c-inc" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={getInclusionValue(sym)} onChange={(e) => handleInclusionChange(sym, e.target.checked)} title="Include in Yield-on-Cost" />
                    </div>
                    <div class="dm-c-sym mono">{sym}</div>
                    <div class="dm-c-type">
                      <Show when={getSymbolType(sym)} fallback={<span class="type-badge muted">Uncategorized</span>}>
                        <span class="type-badge">{getSymbolType(sym).replace(/_/g, ' ')}{getSymbolSubType(sym) ? ' · ' + getSymbolSubType(sym).replace(/_/g, ' ') : ''}</span>
                      </Show>
                    </div>
                    <div class="dm-c-mo mono">${fmt(effectiveMonthly(position), 4)}</div>
                    <div class="dm-c-actual mono">
                      <Show when={a().lastActualPerShare != null} fallback={<span class="muted">—</span>}>
                        ${fmt(a().lastActualPerShare, 4)} <span class="muted small">{a().lastActualDate}</span>
                      </Show>
                    </div>
                    <div class="dm-c-yield mono">{fmt(computedYield(position))}%</div>
                    <div class="dm-c-yoc mono">{fmt(computedYoC(position))}%</div>
                    <div class="dm-c-src">
                      <span class={`src-dot src-${valueSource(sym)}`} title={srcLabel[valueSource(sym)]}></span>
                      <Show when={a().isVariable}><span class="tag-var" title="Distribution varies month-to-month">VAR</span></Show>
                      <Show when={needsReview(position)}><span class="review-flag" title="Displayed value differs >20% from your actual receipts">⚠</span></Show>
                    </div>
                    <div class="dm-c-exp">{isExp() ? '▾' : '▸'}</div>
                  </div>

                  <Show when={isExp()}>
                    <div class="dm-expand">
                      <div class="dm-actual-box">
                        <div class="dm-actual-grid">
                          <div><span class="lbl">Last actual</span><span class="val mono">${fmt(a().lastActualPerShare, 4)}/sh</span><span class="sub">on {a().lastActualDate || '—'} ({a().sharesAtLastPayment ?? '—'} sh)</span></div>
                          <div><span class="lbl">TTM / share</span><span class="val mono">${fmt(a().ttmPerShare, 4)}/yr</span><span class="sub">{a().paymentsLast12mo || 0} payments · TTM ${fmt(a().ttmIncome)}</span></div>
                          <div><span class="lbl">Distribution</span><span class={`val ${a().isVariable ? 'var' : ''}`}>{a().isVariable ? 'Variable' : 'Stable'}</span><span class="sub">source: {srcLabel[valueSource(sym)]}</span></div>
                        </div>
                        <Show when={a().ttmPerShare > 0}>
                          <button class="use-actual-btn" onClick={() => useLastActual(sym)}>Use actual (${fmt(a().ttmPerShare / 12, 4)}/mo) as override</button>
                        </Show>
                      </div>

                      <div class="dm-fields">
                        <label class="dm-field"><span>Symbol Type</span>
                          <select class="category-select" value={getSymbolType(sym)} onChange={(e) => handleSymbolTypeChange(sym, e.target.value)}>
                            <option value="">Select Type…</option>
                            <For each={categoryOptions().types || []}>{(t) => <option value={t.value}>{t.label}</option>}</For>
                          </select>
                        </label>
                        <label class="dm-field"><span>Sub-Type</span>
                          <select class="category-select" value={getSymbolSubType(sym)} onChange={(e) => handleSubTypeChange(sym, e.target.value)} disabled={!getSymbolType(sym)}>
                            <option value="">Select Sub-Type…</option>
                            <For each={getSubTypeOptions(getSymbolType(sym))}>{(s) => <option value={s.value}>{s.label}</option>}</For>
                          </select>
                        </label>
                        <label class="dm-field"><span>Div Frequency</span>
                          <select class="frequency-select" value={getFrequencyValue(sym)} onChange={(e) => handleFrequencyChange(sym, e.target.value)}>
                            <For each={frequencies}>{(f) => <option value={f}>{f}</option>}</For>
                          </select>
                        </label>
                        <label class="dm-field"><span>Override (monthly $/sh)</span>
                          <input type="number" step="0.01" class="override-input" value={getOverrideValue(sym)} onInput={(e) => handleOverrideChange(sym, e.target.value)} placeholder="0.00" />
                        </label>
                        <label class="dm-field dm-field-inc"><span>Include in YoC</span>
                          <input type="checkbox" checked={getInclusionValue(sym)} onChange={(e) => handleInclusionChange(sym, e.target.checked)} />
                        </label>
                      </div>
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>
        </Show>
      </div>

      {/* Footer: legend + pagination */}
      <div class="dm-footer">
        <div class="dm-legend">
          <span><span class="src-dot src-override"></span>Override</span>
          <span><span class="src-dot src-questrade"></span>Questrade</span>
          <span><span class="src-dot src-none"></span>No data</span>
          <span class="tag-var">VAR</span><span class="muted">variable</span>
          <span class="review-flag">⚠</span><span class="muted">needs review</span>
        </div>
        <div class="dm-pager">
          <label class="muted small">Rows:</label>
          <select class="rows-select" value={itemsPerPage()} onChange={(e) => handleItemsPerPageChange(parseInt(e.target.value))}>
            <option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="100">100</option>
          </select>
          <span class="muted small">{totalFilteredCount() > 0 ? ((currentPage() - 1) * itemsPerPage() + 1) : 0}–{Math.min(currentPage() * itemsPerPage(), totalFilteredCount())} of {totalFilteredCount()}</span>
          <button class="btn btn-secondary sm" onClick={() => handlePageChange(currentPage() - 1)} disabled={currentPage() === 1}>‹</button>
          <span class="muted small">{currentPage()}/{totalPages() || 1}</span>
          <button class="btn btn-secondary sm" onClick={() => handlePageChange(currentPage() + 1)} disabled={currentPage() === totalPages() || totalPages() === 0}>›</button>
        </div>
      </div>
    </div>
  );
};

export default DividendManager;
