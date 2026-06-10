import { createSignal, onMount, Show, For } from 'solid-js';
import * as settingsApi from '../services/settingsApi';
import { fetchExchangeRate } from '../services/api';
import './AccountBalances.css';

// Account Balance & Contribution tracking (B4) — docs/account-balance-tracking.md
const AccountBalances = (props) => {
  const [accounts, setAccounts] = createSignal([]);
  const [loading, setLoading] = createSignal(false);
  const [rate, setRate] = createSignal(1.40);
  const [drafts, setDrafts] = createSignal({}); // accountKey -> { baselineDate, CAD, USD }

  const keyOf = (a) => `${a.personName}|${a.accountId}`;

  const load = async () => {
    try {
      setLoading(true);
      const [data, rateObj] = await Promise.all([
        settingsApi.fetchAccountBalances(),
        fetchExchangeRate().catch(() => ({ rate: 1.40 }))
      ]);
      setAccounts(Array.isArray(data) ? data : []);
      setRate(Number(rateObj?.rate) || 1.40);
      setDrafts({});
    } catch (e) {
      props.showMessage?.(`Failed to load account balances: ${e.message}`, 'error');
    } finally { setLoading(false); }
  };
  onMount(load);

  // ---- drafts ----
  const getDraft = (a) => drafts()[keyOf(a)] || {};
  const draftVal = (a, field, fallback) => { const d = getDraft(a); return field in d ? d[field] : fallback; };
  const setDraft = (a, field, value) => setDrafts({ ...drafts(), [keyOf(a)]: { ...getDraft(a), [field]: value } });
  const isDirty = (a) => { const d = getDraft(a); return Object.keys(d).length > 0; };
  const baselineDateOf = (a) => draftVal(a, 'baselineDate', a.baselineDate || '');
  const baselineOf = (a, c) => draftVal(a, c, a.manualBaseline?.[c] ?? '');

  const saveAccount = async (a) => {
    try {
      setLoading(true);
      const manualBaseline = {};
      for (const c of ['CAD', 'USD']) {
        const v = baselineOf(a, c);
        if (v !== '' && v != null) manualBaseline[c] = Number(v) || 0;
      }
      await settingsApi.setAccountBaseline(a.personName, a.accountId, {
        manualBaseline: Object.keys(manualBaseline).length ? manualBaseline : null,
        baselineDate: baselineDateOf(a) || null
      });
      props.showMessage?.(`Baseline saved for ${a.personName} ${a.accountType}`, 'success');
      await load();
    } catch (e) {
      props.showMessage?.(`Save failed: ${e.message}`, 'error');
    } finally { setLoading(false); }
  };

  const clearAccount = async (a) => {
    try {
      setLoading(true);
      await settingsApi.setAccountBaseline(a.personName, a.accountId, { manualBaseline: null, baselineDate: null });
      props.showMessage?.(`Baseline cleared for ${a.personName} ${a.accountType}`, 'info');
      await load();
    } catch (e) {
      props.showMessage?.(`Clear failed: ${e.message}`, 'error');
    } finally { setLoading(false); }
  };

  const syncBalances = async () => {
    try {
      setLoading(true);
      props.showMessage?.('Refreshing balances from Questrade…', 'info');
      await settingsApi.syncAccountBalances();
      props.showMessage?.('Balances refreshed', 'success');
      await load();
    } catch (e) {
      props.showMessage?.(`Sync failed: ${e.message}`, 'error');
    } finally { setLoading(false); }
  };

  // ---- grouping + combined totals ----
  const persons = () => {
    const m = {};
    accounts().forEach((a) => { (m[a.personName] = m[a.personName] || []).push(a); });
    return Object.entries(m).map(([personName, accts]) => ({
      personName,
      accts: accts.sort((x, y) => String(x.accountType).localeCompare(String(y.accountType)))
    })).sort((x, y) => x.personName.localeCompare(y.personName));
  };

  const combine = (accts) => {
    let valCAD = 0, valUSD = 0, conCAD = 0, conUSD = 0;
    accts.forEach((a) => Object.entries(a.perCurrency || {}).forEach(([c, v]) => {
      if (c === 'CAD') { valCAD += v.totalEquity; conCAD += v.netContributions; }
      else if (c === 'USD') { valUSD += v.totalEquity; conUSD += v.netContributions; }
    }));
    const r = rate();
    const valueCAD = valCAD + valUSD * r, valueUSD = valUSD + (r ? valCAD / r : 0);
    const contribCAD = conCAD + conUSD * r, contribUSD = conUSD + (r ? conCAD / r : 0);
    return { valueCAD, valueUSD, contribCAD, contribUSD, gainCAD: valueCAD - contribCAD, gainUSD: valueUSD - contribUSD };
  };

  const fmt = (n) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const gainClass = (n) => (Number(n) >= 0 ? 'pos' : 'neg');
  const pct = (gain, contrib) => contrib ? ((gain / contrib) * 100).toFixed(2) : '0.00';

  const CcyRow = (props2) => {
    const v = props2.v; const c = props2.c;
    return (
      <div class="ab-ccy">
        <span class="ab-ccy-tag">{c}</span>
        <span class="ab-num">${fmt(v.totalEquity)}</span>
        <span class="ab-num">${fmt(v.netContributions)}{v.estimated ? <span class="ab-est" title="No baseline set — estimated from activities (may miss older history / FX)">est</span> : ''}</span>
        <span class={`ab-num ${gainClass(v.gain)}`}>{v.gain >= 0 ? '+' : ''}${fmt(v.gain)}</span>
        <span class={`ab-num ${gainClass(v.gain)}`}>{pct(v.gain, v.netContributions)}%</span>
      </div>
    );
  };

  return (
    <div class="account-balances">
      {/* Portfolio summary */}
      <div class="ab-summary">
        <div class="ab-sum-card">
          <div class="ab-sum-label">Portfolio Value</div>
          <div class="ab-sum-val">C${fmt(combine(accounts()).valueCAD)}</div>
          <div class="ab-sum-sub">US${fmt(combine(accounts()).valueUSD)}</div>
        </div>
        <div class="ab-sum-card">
          <div class="ab-sum-label">Net Contributions</div>
          <div class="ab-sum-val">C${fmt(combine(accounts()).contribCAD)}</div>
          <div class="ab-sum-sub">US${fmt(combine(accounts()).contribUSD)}</div>
        </div>
        <div class="ab-sum-card">
          <div class="ab-sum-label">Total Gain</div>
          <div class={`ab-sum-val ${gainClass(combine(accounts()).gainCAD)}`}>{combine(accounts()).gainCAD >= 0 ? '+' : ''}C${fmt(combine(accounts()).gainCAD)}</div>
          <div class={`ab-sum-sub ${gainClass(combine(accounts()).gainUSD)}`}>{combine(accounts()).gainUSD >= 0 ? '+' : ''}US${fmt(combine(accounts()).gainUSD)}</div>
        </div>
        <div class="ab-actions">
          <span class="ab-rate">USD/CAD {rate().toFixed(4)}</span>
          <button class="btn btn-primary" onClick={syncBalances} disabled={loading()}>SYNC BALANCES</button>
          <button class="btn btn-refresh" onClick={load} disabled={loading()}>REFRESH</button>
        </div>
      </div>

      <Show when={persons().length > 0} fallback={<div class="ab-empty">{loading() ? 'Loading…' : 'No accounts. Click SYNC BALANCES.'}</div>}>
        <For each={persons()}>
          {(p) => {
            const t = () => combine(p.accts);
            return (
              <div class="ab-person">
                <div class="ab-person-head">
                  <span class="ab-person-name">{p.personName}</span>
                  <span class="ab-person-tot">
                    value <b>C${fmt(t().valueCAD)}</b> / US${fmt(t().valueUSD)} ·
                    contrib <b>C${fmt(t().contribCAD)}</b> ·
                    gain <b class={gainClass(t().gainCAD)}>{t().gainCAD >= 0 ? '+' : ''}C${fmt(t().gainCAD)}</b> / <span class={gainClass(t().gainUSD)}>US${fmt(t().gainUSD)}</span>
                  </span>
                </div>

                <div class="ab-col-head">
                  <span>Account</span><span>Cur</span><span>Current value</span><span>Net contributions</span><span>Gain $</span><span>Gain %</span>
                </div>

                <For each={p.accts}>
                  {(a) => (
                    <div class="ab-acct">
                      <div class="ab-acct-grid">
                        <span class="ab-acct-name">{a.accountType}<span class="ab-acct-id">{a.accountId}</span></span>
                        <div class="ab-ccy-list">
                          <For each={Object.entries(a.perCurrency || {})}>
                            {([c, v]) => <CcyRow c={c} v={v} />}
                          </For>
                          <Show when={!Object.keys(a.perCurrency || {}).length}><span class="muted small">no balance data</span></Show>
                        </div>
                      </div>
                      {/* Baseline editor */}
                      <div class="ab-edit">
                        <span class="ab-edit-lbl">Set baseline (net contributions as of date):</span>
                        <label>Date<input type="date" value={baselineDateOf(a)} onInput={(e) => setDraft(a, 'baselineDate', e.target.value)} /></label>
                        <For each={['CAD', 'USD']}>
                          {(c) => (
                            <Show when={a.perCurrency?.[c] || a.manualBaseline?.[c] != null}>
                              <label>{c}<input type="number" step="0.01" placeholder="—" value={baselineOf(a, c)} onInput={(e) => setDraft(a, c, e.target.value)} /></label>
                            </Show>
                          )}
                        </For>
                        <button class="btn btn-primary sm" onClick={() => saveAccount(a)} disabled={loading() || !isDirty(a)}>SAVE</button>
                        <Show when={a.baselineDate}><button class="btn btn-secondary sm" onClick={() => clearAccount(a)} disabled={loading()}>CLEAR</button></Show>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            );
          }}
        </For>
      </Show>

      <div class="ab-note">
        Net contributions = your manual baseline (set once, as of a date) + deposits/transfers − withdrawals after that date.
        Until a baseline is set, the figure is an <b>estimate</b> from activity history (may miss older contributions or be skewed by CAD↔USD conversions). Gain = current value − net contributions (includes dividends + capital gains). Combined totals use the top-bar USD/CAD rate.
      </div>
    </div>
  );
};

export default AccountBalances;
