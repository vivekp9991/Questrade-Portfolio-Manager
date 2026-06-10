import { createSignal, onMount, For, Show } from 'solid-js';
import * as settingsApi from '../services/settingsApi';
import { fetchExchangeRate } from '../services/api';
import './NetWorthReport.css';

const QT_ACCOUNTS = ['Cash', 'TFSA', 'RRSP'];
const PMAP_KEY = 'nwPersonMap';
const CATS = ['', 'EQUITY', 'DIVIDEND_ETF', 'GOLD', 'SILVER', 'PLATINUM', 'CRYPTO', 'OTHER'];
const TABS = [
  { id: 'bank', label: 'Bank / Cash' },
  { id: 'investments', label: 'Investments' },
  { id: 'custom', label: 'Custom Investments' },
  { id: 'total', label: 'Total & Breakdown' },
  { id: 'report', label: 'Report (A4)' }
];

// ---------- pure helpers ----------
const fmt = (n, ccy) => { const s = n < 0 ? '-' : ''; const v = Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return `${s}${ccy === 'USD' ? 'US$' : '$'}${v}`; };
const fmtN = (n) => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cl = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
const secHead = (tag, title, hint) => `<div class="sec-head"><span class="sec-tag">${tag}</span><h2>${title}</h2><span class="hint">${hint}</span></div>`;

// ---------- section builders (take D = report data) ----------
function buildHeader(D) {
  return `<div class="report-head"><div><h1>${esc(D.meta.reportTitle)}</h1>
    <div class="sub">Bank cash · Questrade investments · custom assets — for ${esc(D.meta.people.join(' & '))}</div></div>
    <div class="meta-box">As of <strong>${esc(D.meta.asOfDate)}</strong><br><span class="rate-pill">USD/CAD = ${D.meta.usdCadRate.toFixed(2)}</span></div></div>`;
}

function bankTable(D, ccy) {
  const P = D.meta.people, cc = ccy === 'CAD' ? 'cad' : 'usd';
  const V = D.bankBalances.filter((b) => b.currency === ccy && b.person === P[0]);
  const H = D.bankBalances.filter((b) => b.currency === ccy && b.person === P[1]);
  const n = Math.max(V.length, H.length, 3);
  let body = '';
  for (let i = 0; i < n; i++) {
    const v = V[i], h = H[i];
    body += `<tr><td class="lbl">${v ? esc(v.bankName) : ''}</td><td class="num">${v ? fmt(v.amount, ccy) : ''}</td>
      <td class="gap"></td><td class="lbl">${h ? esc(h.bankName) : ''}</td><td class="num">${h ? fmt(h.amount, ccy) : ''}</td></tr>`;
  }
  const vt = V.reduce((s, b) => s + b.amount, 0), ht = H.reduce((s, b) => s + b.amount, 0);
  body += `<tr class="subtotal"><td class="lbl">Total</td><td class="num">${fmt(vt, ccy)}</td><td class="gap"></td><td class="lbl">Total</td><td class="num">${fmt(ht, ccy)}</td></tr>`;
  body += `<tr class="grand"><td class="lbl">Total ${ccy}</td><td class="num" colspan="4" style="text-align:center">${fmt(vt + ht, ccy)}</td></tr>`;
  return `<div><div class="mini-title">Cash <span class="ccy-${cc}">${ccy}</span></div><table>
    <thead><tr><th colspan="2" class="person-head p0">${esc(P[0] || '')}</th><th class="gap"></th><th colspan="2" class="person-head p1">${esc(P[1] || '')}</th></tr>
    <tr class="colh"><th class="lbl">Bank</th><th>Amount</th><th class="gap"></th><th class="lbl">Bank</th><th>Amount</th></tr></thead>
    <tbody>${body}</tbody></table></div>`;
}
function buildBank(D) { return `<section>${secHead('A', 'Bank / Cash Balances', 'manual · people side by side')}<div class="two-up">${bankTable(D, 'CAD')}${bankTable(D, 'USD')}</div></section>`; }

function qtEntries(D, person, ccy) {
  const out = QT_ACCOUNTS.map((acc) => {
    const q = D.questrade.find((x) => x.person === person && x.account === acc && x.currency === ccy && !x.manual);
    return { label: acc, contribution: q ? q.contribution : 0, invested: q ? q.invested : 0, pnl: q ? q.pnl : 0, cash: q ? q.cash : 0, manual: false };
  });
  D.questrade.filter((x) => x.manual && x.person === person && x.currency === ccy)
    .forEach((q) => out.push({ label: q.account, contribution: q.contribution || 0, invested: q.invested || 0, pnl: q.pnl || 0, cash: q.cash || 0, manual: true }));
  return out;
}
function entryCells(e, sums) {
  if (!e) return `<td class="lbl"></td><td></td><td></td><td></td><td></td><td></td>`;
  const total = e.invested + e.pnl + e.cash;
  sums.contribution += e.contribution; sums.invested += e.invested; sums.pnl += e.pnl; sums.cash += e.cash; sums.total += total;
  return `<td class="lbl">${esc(e.label)}${e.manual ? '<span class="tag-manual">MANUAL</span>' : ''}</td>
    <td class="num">${fmtN(e.contribution)}</td><td class="num">${fmtN(e.invested)}</td>
    <td class="num ${cl(e.pnl)}">${fmtN(e.pnl)}</td><td class="num">${fmtN(e.cash)}</td><td class="num">${fmtN(total)}</td>`;
}
const subtotalCells = (label, s) => `<td class="lbl">${label}</td><td class="num">${fmtN(s.contribution)}</td><td class="num">${fmtN(s.invested)}</td><td class="num ${cl(s.pnl)}">${fmtN(s.pnl)}</td><td class="num">${fmtN(s.cash)}</td><td class="num">${fmtN(s.total)}</td>`;
function qtBand(D, ccy) {
  const P = D.meta.people, V = qtEntries(D, P[0], ccy), H = qtEntries(D, P[1], ccy);
  const n = Math.max(V.length, H.length);
  const sV = { contribution: 0, invested: 0, pnl: 0, cash: 0, total: 0 }, sH = { contribution: 0, invested: 0, pnl: 0, cash: 0, total: 0 };
  let rows = `<tr class="ccy-band"><td colspan="13">${ccy}</td></tr>`;
  for (let i = 0; i < n; i++) rows += `<tr>${entryCells(V[i], sV)}<td class="gap"></td>${entryCells(H[i], sH)}</tr>`;
  rows += `<tr class="subtotal">${subtotalCells('Total ' + ccy, sV)}<td class="gap"></td>${subtotalCells('Total ' + ccy, sH)}</tr>`;
  return rows;
}
function buildQuestrade(D) {
  const P = D.meta.people;
  const colh = `<th class="lbl">Account</th><th>Contribution</th><th>Invested</th><th>P&amp;L</th><th>Cash</th><th>Total</th>`;
  return `<section>${secHead('B', 'Questrade Investment Summary', 'CAD + USD · Invested = cost basis, P&amp;L = market − cost')}
    <div class="scroll"><table><thead>
      <tr><th colspan="6" class="person-head p0">${esc(P[0] || '')}</th><th class="gap"></th><th colspan="6" class="person-head p1">${esc(P[1] || '')}</th></tr>
      <tr class="colh">${colh}<th class="gap"></th>${colh}</tr></thead>
      <tbody>${qtBand(D, 'CAD')}${qtBand(D, 'USD')}</tbody></table></div></section>`;
}

function buildCustom(D) {
  let body = ''; const tot = { CAD: 0, USD: 0 };
  D.customInvestments.forEach((c) => {
    tot[c.currency] = (tot[c.currency] || 0) + c.currentValue;
    const lots = c.mode === 'lots';
    body += `<tr><td class="lbl">${esc(c.person)}</td><td class="lbl">${esc(c.name)}</td><td class="lbl">${esc(c.category)}</td><td class="lbl">${c.currency}</td>
      <td class="num">${lots ? c.totalQty : '<span class="muted">—</span>'}</td>
      <td class="num">${lots ? fmt(c.avgPrice, c.currency) : '<span class="muted">—</span>'}</td>
      <td class="num">${fmt(c.cost, c.currency)}</td>
      <td class="num">${lots ? fmt(c.currentPrice, c.currency) : '<span class="muted">—</span>'}</td>
      <td class="num">${fmt(c.currentValue, c.currency)}</td>
      <td class="num ${cl(c.pnl)}">${fmtN(c.pnl)}</td></tr>`;
  });
  if (!D.customInvestments.length) body = `<tr><td class="lbl muted" colspan="10">No custom investments yet — add them in this tab.</td></tr>`;
  body += `<tr class="grand"><td class="lbl" colspan="8">Custom total — CAD</td><td class="num">${fmt(tot.CAD || 0, 'CAD')}</td><td></td></tr>`;
  body += `<tr class="grand"><td class="lbl" colspan="8">Custom total — USD</td><td class="num">${fmt(tot.USD || 0, 'USD')}</td><td></td></tr>`;
  return `<section class="page-break">${secHead('C', 'Custom Investments', 'lot-based &amp; simple')}
    <div class="scroll"><table><thead><tr class="colh">
      <th class="lbl">Person</th><th class="lbl">Name</th><th class="lbl">Category</th><th class="lbl">Ccy</th>
      <th>Qty</th><th>Avg Price</th><th>Cost</th><th>Cur. Price</th><th>Cur. Value</th><th>P&amp;L</th></tr></thead><tbody>${body}</tbody></table></div></section>`;
}

// shared aggregates (everything in CAD)
function aggregates(D) {
  const RATE = D.meta.usdCadRate;
  const toCAD = (n, c) => (c === 'USD' ? n * RATE : n);
  const bankCash = D.bankBalances.reduce((s, b) => s + toCAD(b.amount, b.currency), 0);
  const qtInv = D.questrade.reduce((s, q) => s + toCAD(q.invested, q.currency), 0);
  const qtMkt = D.questrade.reduce((s, q) => s + toCAD(q.invested + q.pnl, q.currency), 0);
  const qtCash = D.questrade.reduce((s, q) => s + toCAD(q.cash, q.currency), 0);
  const cInv = D.customInvestments.reduce((s, c) => s + toCAD(c.cost, c.currency), 0);
  const cMkt = D.customInvestments.reduce((s, c) => s + toCAD(c.currentValue, c.currency), 0);
  return { RATE, toCAD, bankCash, qtInv, qtMkt, qtCash, cInv, cMkt };
}

function buildTotalCards(D) {
  const RATE = D.meta.usdCadRate;
  const sumBy = (items, c, v) => items.reduce((o, x) => (o[c(x)] = (o[c(x)] || 0) + v(x), o), { CAD: 0, USD: 0 });
  const bankBy = sumBy(D.bankBalances, (b) => b.currency, (b) => b.amount);
  const qtBy = sumBy(D.questrade, (q) => q.currency, (q) => q.invested + q.pnl + q.cash);
  const customBy = sumBy(D.customInvestments, (c) => c.currency, (c) => c.currentValue);
  const sources = [
    { label: 'Bank / cash', cad: bankBy.CAD, usd: bankBy.USD },
    { label: 'Questrade', cad: qtBy.CAD, usd: qtBy.USD },
    { label: 'Custom', cad: customBy.CAD, usd: customBy.USD }
  ];
  const cadNative = sources.reduce((s, x) => s + x.cad, 0), usdNative = sources.reduce((s, x) => s + x.usd, 0);
  const grandCAD = cadNative + usdNative * RATE, grandUSD = usdNative + cadNative / RATE;
  return `<section>${secHead('D', 'Grand Total', 'two parallel totals · USD converted at ' + RATE.toFixed(2))}
    <div class="totals-grid">
      <div class="total-card cad"><h3>NET WORTH — CAD</h3><div class="big num" style="text-align:left">${fmt(grandCAD, 'CAD')}</div>
        <div class="breakdown">${sources.map((s) => `<div><span>${s.label}</span><span class="num">${fmt(s.cad + s.usd * RATE, 'CAD')}</span></div>`).join('')}</div></div>
      <div class="total-card usd"><h3>NET WORTH — USD</h3><div class="big num" style="text-align:left">${fmt(grandUSD, 'USD')}</div>
        <div class="breakdown">${sources.map((s) => `<div><span>${s.label}</span><span class="num">${fmt(s.usd + s.cad / RATE, 'USD')}</span></div>`).join('')}</div></div>
    </div></section>`;
}

// Invested vs Market value breakdown (the % of invested AND market value the owner asked for).
function buildInvestedVsMarket(D) {
  const A = aggregates(D);
  const rows = [
    { label: 'Bank / cash', invested: 0, market: 0, cash: A.bankCash },
    { label: 'Questrade holdings', invested: A.qtInv, market: A.qtMkt, cash: A.qtCash },
    { label: 'Custom investments', invested: A.cInv, market: A.cMkt, cash: 0 }
  ];
  const totInv = rows.reduce((s, r) => s + r.invested, 0) || 1;
  const totMkt = rows.reduce((s, r) => s + r.market + r.cash, 0) || 1;
  const body = rows.map((r) => {
    const value = r.market + r.cash, gain = r.market - r.invested;
    return `<tr><td class="lbl">${r.label}</td>
      <td class="num">${fmt(r.invested, 'CAD')}</td><td class="num">${r.invested ? (r.invested / totInv * 100).toFixed(1) + '%' : '<span class="muted">—</span>'}</td>
      <td class="num">${fmt(value, 'CAD')}</td><td class="num">${(value / totMkt * 100).toFixed(1)}%</td>
      <td class="num ${cl(gain)}">${fmtN(gain)}</td></tr>`;
  }).join('');
  const gi = rows.reduce((s, r) => s + r.invested, 0), gm = rows.reduce((s, r) => s + r.market + r.cash, 0);
  return `<section>${secHead('D2', 'Invested vs Market Value (CAD)', '% of cost vs % of current value')}
    <table><thead><tr class="colh"><th class="lbl">Bucket</th><th>Invested</th><th>% inv.</th><th>Market value</th><th>% val.</th><th>Gain</th></tr></thead>
    <tbody>${body}<tr class="grand"><td class="lbl">Total</td><td class="num">${fmt(gi, 'CAD')}</td><td class="num">100%</td><td class="num">${fmt(gm, 'CAD')}</td><td class="num">100%</td><td class="num ${cl(gm - gi - A.bankCash)}">${fmtN(gm - gi - A.bankCash)}</td></tr></tbody></table></section>`;
}

function buildCategory(D) {
  const A = aggregates(D);
  const CAT_COLORS = { Cash: '#1f5f8b', 'Equity & ETF': '#2e7d6b', Gold: '#c69214', Silver: '#8b94a0', Platinum: '#7a8794', Crypto: '#a0552e', Equity: '#2e7d6b', 'Dividend ETF': '#8a6d1f', Other: '#6b7785' };
  const cats = {}; const addCat = (k, cad) => (cats[k] = (cats[k] || 0) + cad);
  addCat('Cash', A.bankCash + A.qtCash);
  addCat('Equity & ETF', A.qtMkt);
  D.customInvestments.forEach((c) => addCat(({ GOLD: 'Gold', SILVER: 'Silver', PLATINUM: 'Platinum', EQUITY: 'Equity', DIVIDEND_ETF: 'Dividend ETF', CRYPTO: 'Crypto' }[c.category] || 'Other'), A.toCAD(c.currentValue, c.currency)));
  const catTotal = Object.values(cats).reduce((s, v) => s + v, 0) || 1;
  const catRows = Object.entries(cats).filter(([, v]) => v > 0.005).sort((a, b) => b[1] - a[1]);
  return `<section>${secHead('E', 'Category Breakdown', '% of net worth (market value, in CAD)')}
    ${catRows.map(([name, cad]) => { const pct = (cad / catTotal) * 100; return `<div class="cat-row"><div class="cat-name">${esc(name)}</div>
      <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${pct.toFixed(1)}%;background:${CAT_COLORS[name] || CAT_COLORS.Other}"></div></div>
      <div class="cat-amt num">${fmt(cad, 'CAD')}</div><div class="cat-pct">${pct.toFixed(1)}%</div></div>`; }).join('') || '<div class="muted">No data yet.</div>'}
    <div class="footnote">Questrade holdings are lumped as “Equity &amp; ETF”; the detailed split by symbol category (Gold/Silver/Index ETF/…) comes in R5.</div></section>`;
}

const buildFullReport = (D) => buildHeader(D) + buildBank(D) + buildQuestrade(D) + buildCustom(D) + buildTotalCards(D) + buildCategory(D);

// ---------- component ----------
const NetWorthReport = (props) => {
  const [tab, setTab] = createSignal('bank');
  const [bank, setBank] = createSignal([]);
  const [custom, setCustom] = createSignal([]);
  const [accounts, setAccounts] = createSignal([]);
  const [rate, setRate] = createSignal(1.40);
  const [loading, setLoading] = createSignal(false);
  const [personMap, setPersonMap] = createSignal(loadMap());
  const [nb, setNb] = createSignal({ person: '', bankName: '', currency: 'CAD', amount: '' });
  const [nc, setNc] = createSignal({ person: '', name: '', category: '', currency: 'CAD', mode: 'simple', cost: '', currentValue: '', currentPrice: '', lots: '' });

  function loadMap() { try { return JSON.parse(localStorage.getItem(PMAP_KEY) || '{}'); } catch { return {}; } }
  const mapPerson = (login) => personMap()[login] || login;

  const load = async () => {
    try {
      setLoading(true);
      const [ab, bb, ci, rt] = await Promise.all([
        settingsApi.fetchAccountBalances(), settingsApi.fetchBankBalances(),
        settingsApi.fetchCustomInvestments(), fetchExchangeRate().catch(() => ({ rate: 1.40 }))
      ]);
      setAccounts(Array.isArray(ab) ? ab : []); setBank(Array.isArray(bb) ? bb : []);
      setCustom(Array.isArray(ci) ? ci : []); setRate(Number(rt?.rate) || 1.40);
    } catch (e) { props.showMessage?.(`Failed to load report: ${e.message}`, 'error'); }
    finally { setLoading(false); }
  };
  onMount(load);

  const data = () => {
    const qt = [];
    accounts().forEach((a) => {
      const person = mapPerson(a.personName);
      Object.entries(a.perCurrency || {}).forEach(([c, v]) => {
        if (!v.totalEquity && !v.invested && !v.cash) return;
        qt.push({ person, account: a.accountType, currency: c, contribution: v.netContributions, invested: v.invested, pnl: v.pnl, cash: v.cash, manual: false });
      });
    });
    const set = new Set();
    qt.forEach((x) => set.add(x.person)); bank().forEach((x) => set.add(x.person)); custom().forEach((x) => set.add(x.person));
    const people = [...set].sort();
    const today = new Date().toISOString().slice(0, 10);
    return { meta: { reportTitle: 'Net-Worth Report', asOfDate: today, usdCadRate: rate(), people }, bankBalances: bank(), questrade: qt, customInvestments: custom() };
  };

  const printReport = () => {
    const w = window.open('', '_blank');
    if (!w) { props.showMessage?.('Allow pop-ups to print', 'error'); return; }
    const css = document.getElementById('nw-print-style')?.textContent || '';
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Net-Worth Report</title><style>${css}</style></head><body><div class="nw-wrap"><div class="nw-report page">${buildFullReport(data())}</div></div></body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 350);
  };

  // editors
  const addBank = async () => {
    const f = nb(); if (!f.person || !f.bankName) return props.showMessage?.('Person and bank required', 'error');
    await settingsApi.saveBankBalance({ person: f.person, bankName: f.bankName, currency: f.currency, amount: Number(f.amount) || 0 });
    setNb({ person: f.person, bankName: '', currency: f.currency, amount: '' }); await load();
  };
  const delBank = async (b) => { await settingsApi.deleteBankBalance(b.person, b.entryId); await load(); };
  const addCustom = async () => {
    const f = nc(); if (!f.person || !f.name) return props.showMessage?.('Person and name required', 'error');
    const payload = { person: f.person, name: f.name, category: f.category, currency: f.currency, mode: f.mode };
    if (f.mode === 'lots') {
      payload.lots = String(f.lots).split(/[;\n]/).map((s) => { const [q, p] = s.split(/[x@,]/).map((t) => Number(t.trim())); return { quantity: q || 0, price: p || 0 }; }).filter((l) => l.quantity || l.price);
      payload.currentPrice = Number(f.currentPrice) || 0;
    } else { payload.cost = Number(f.cost) || 0; payload.currentValue = Number(f.currentValue) || 0; }
    await settingsApi.saveCustomInvestment(payload);
    setNc({ ...f, name: '', cost: '', currentValue: '', currentPrice: '', lots: '' }); await load();
  };
  const delCustom = async (c) => { await settingsApi.deleteCustomInvestment(c.person, c.investmentId); await load(); };
  const logins = () => [...new Set(accounts().map((a) => a.personName))];
  const saveMapping = (login, name) => { const m = { ...personMap(), [login]: name }; if (!name) delete m[login]; setPersonMap(m); localStorage.setItem(PMAP_KEY, JSON.stringify(m)); };

  return (
    <div class="nw-wrap">
      <style id="nw-print-style">{PRINT_CSS}</style>

      {/* top bar: print always available */}
      <div class="nw-toolbar">
        <button class="nw-btn" onClick={printReport} disabled={loading()}>🖨 Print / Save PDF</button>
        <button class="nw-btn ghost" onClick={() => settingsApi.syncAccountBalances().then(load)} disabled={loading()}>Sync Balances</button>
        <button class="nw-btn ghost" onClick={load} disabled={loading()}>Refresh</button>
        <span class="nw-note">USD/CAD {rate().toFixed(4)}</span>
      </div>

      {/* tab bar */}
      <div class="nw-tabs">
        <For each={TABS}>{(t) => (
          <button class={`nw-tab ${tab() === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        )}</For>
      </div>

      {/* BANK */}
      <Show when={tab() === 'bank'}>
        <div class="nw-report" innerHTML={buildBank(data())} />
        <div class="nw-manage">
          <h3>Add bank / cash balance</h3>
          <div class="nw-rowform">
            <input placeholder="Person" value={nb().person} onInput={(e) => setNb({ ...nb(), person: e.target.value })} />
            <input placeholder="Bank name" value={nb().bankName} onInput={(e) => setNb({ ...nb(), bankName: e.target.value })} />
            <select value={nb().currency} onChange={(e) => setNb({ ...nb(), currency: e.target.value })}><option>CAD</option><option>USD</option></select>
            <input type="number" placeholder="Amount" value={nb().amount} onInput={(e) => setNb({ ...nb(), amount: e.target.value })} />
            <button class="nw-btn" onClick={addBank} disabled={loading()}>Add</button>
          </div>
          <div class="nw-list"><For each={bank()}>{(b) => (
            <div class="nw-li"><button class="nw-del" onClick={() => delBank(b)} title="delete">×</button>{b.person} · {b.bankName} · {b.currency} ${b.amount}</div>
          )}</For></div>
        </div>
      </Show>

      {/* INVESTMENTS */}
      <Show when={tab() === 'investments'}>
        <div class="nw-report" innerHTML={buildQuestrade(data())} />
        <div class="nw-manage">
          <h3>Person mapping (Questrade login → report name)</h3>
          <div class="nw-list"><For each={logins()}>{(login) => (
            <div class="nw-li"><span style="width:90px">{login} →</span>
              <input value={personMap()[login] || ''} placeholder={login} onInput={(e) => saveMapping(login, e.target.value)} /></div>
          )}</For></div>
          <div class="nw-sub">Investments are pulled live from Questrade. Click <b>Sync Balances</b> (top) to refresh.</div>
        </div>
      </Show>

      {/* CUSTOM */}
      <Show when={tab() === 'custom'}>
        <div class="nw-report" innerHTML={buildCustom(data())} />
        <div class="nw-manage">
          <h3>Add custom investment</h3>
          <div class="nw-rowform">
            <input placeholder="Person" value={nc().person} onInput={(e) => setNc({ ...nc(), person: e.target.value })} />
            <input placeholder="Name" value={nc().name} onInput={(e) => setNc({ ...nc(), name: e.target.value })} />
            <select value={nc().category} onChange={(e) => setNc({ ...nc(), category: e.target.value })}><For each={CATS}>{(c) => <option value={c}>{c || '(category)'}</option>}</For></select>
            <select value={nc().currency} onChange={(e) => setNc({ ...nc(), currency: e.target.value })}><option>CAD</option><option>USD</option></select>
            <select value={nc().mode} onChange={(e) => setNc({ ...nc(), mode: e.target.value })}><option value="simple">simple</option><option value="lots">lots</option></select>
            <Show when={nc().mode === 'simple'} fallback={
              <><input placeholder="lots: qty@price; qty@price" style="width:220px" value={nc().lots} onInput={(e) => setNc({ ...nc(), lots: e.target.value })} />
                <input type="number" placeholder="current price" value={nc().currentPrice} onInput={(e) => setNc({ ...nc(), currentPrice: e.target.value })} /></>
            }>
              <input type="number" placeholder="cost" value={nc().cost} onInput={(e) => setNc({ ...nc(), cost: e.target.value })} />
              <input type="number" placeholder="current value" value={nc().currentValue} onInput={(e) => setNc({ ...nc(), currentValue: e.target.value })} />
            </Show>
            <button class="nw-btn" onClick={addCustom} disabled={loading()}>Add</button>
          </div>
          <div class="nw-sub">Lots: <code>qty@price; qty@price</code> (e.g. <code>1@3339.99; 1@3399.99</code>).</div>
          <div class="nw-list"><For each={custom()}>{(c) => (
            <div class="nw-li"><button class="nw-del" onClick={() => delCustom(c)} title="delete">×</button>{c.person} · {c.name} · {c.category || '—'} · {c.currency} · cost ${c.cost} → value ${c.currentValue} (P&L ${c.pnl})</div>
          )}</For></div>
        </div>
      </Show>

      {/* TOTAL & BREAKDOWN */}
      <Show when={tab() === 'total'}>
        <div class="nw-report" innerHTML={buildTotalCards(data()) + buildInvestedVsMarket(data()) + buildCategory(data())} />
      </Show>

      {/* REPORT (A4 preview) */}
      <Show when={tab() === 'report'}>
        <div class="nw-a4-hint nw-note">A4 print preview — use <b>🖨 Print / Save PDF</b> (top) for the clean printout.</div>
        <div class="nw-report page" innerHTML={buildFullReport(data())} />
      </Show>
    </div>
  );
};

// Raw print CSS (unscoped) for the print popup.
const PRINT_CSS = `
:root{--ink:#1c2530;--muted:#6b7785;--line:#d7dee6;--line2:#aeb9c5;--accent:#1f5f8b;--soft:#eaf2f8;--pos:#137a4b;--neg:#b4232a;--cad:#1f5f8b;--usd:#6a3fa0;--band:#eef3f7;--p0:#1f5f8b;--p1:#8a5a1f;}
*{box-sizing:border-box;}body{margin:0;font-family:"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink);font-size:12px;line-height:1.4;}
.page{max-width:1040px;margin:0 auto;padding:20px 26px;background:#fff;}
.report-head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid var(--ink);padding-bottom:12px;}
.report-head h1{margin:0;font-size:23px;}.report-head .sub{color:var(--muted);font-size:12px;margin-top:3px;}
.meta-box{text-align:right;font-size:12px;color:var(--muted);}.rate-pill{display:inline-block;margin-top:6px;padding:4px 10px;background:var(--soft);color:var(--accent);border-radius:20px;font-weight:600;font-size:12px;}
section{margin-top:22px;}.sec-head{display:flex;align-items:baseline;gap:10px;margin-bottom:8px;}
.sec-tag{background:var(--accent);color:#fff;font-weight:700;width:22px;height:22px;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;}
.sec-head h2{margin:0;font-size:16px;}.sec-head .hint{color:var(--muted);font-size:11px;font-weight:400;}
table{width:100%;border-collapse:collapse;}th,td{padding:4px 8px;}.num{font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right;}
.pos{color:var(--pos);}.neg{color:var(--neg);}.gap{width:14px;border:none!important;background:#fff!important;padding:0;}
.person-head{text-align:center;font-size:12px;font-weight:700;letter-spacing:.5px;color:#fff;padding:5px;border-radius:3px 3px 0 0;}
.person-head.p0{background:var(--p0);}.person-head.p1{background:var(--p1);}
thead .colh th{font-size:10.5px;text-transform:uppercase;letter-spacing:.3px;color:var(--muted);border-bottom:1px solid var(--line2);font-weight:600;text-align:right;}.colh th.lbl{text-align:left;}
tbody td{border-bottom:1px solid var(--line);}tbody td.lbl{text-align:left;}
tr.subtotal td{border-top:1px solid var(--line2);border-bottom:none;font-weight:600;background:#fbfcfd;}
tr.grand td{border-top:2px solid var(--ink);border-bottom:none;font-weight:700;}
tr.ccy-band td{background:var(--band);font-weight:700;font-size:11px;letter-spacing:.6px;text-transform:uppercase;color:var(--accent);border-bottom:1px solid var(--line);}
.tag-manual{font-size:9px;font-weight:700;color:var(--accent);background:var(--soft);padding:1px 5px;border-radius:3px;margin-left:6px;}.muted{color:var(--muted);}
.mini-title{font-weight:700;font-size:13px;margin:0 0 4px;}.ccy-cad{color:var(--cad);}.ccy-usd{color:var(--usd);}
.two-up{display:grid;grid-template-columns:1fr 1fr;gap:26px;}
.totals-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;}.total-card{border:1px solid var(--line2);border-radius:8px;padding:16px 18px;}
.total-card.cad{border-top:4px solid var(--cad);}.total-card.usd{border-top:4px solid var(--usd);}.total-card h3{margin:0 0 8px;font-size:13px;}
.total-card .big{font-size:25px;font-weight:700;}.total-card .breakdown{margin-top:12px;font-size:12px;}.total-card .breakdown div{display:flex;justify-content:space-between;padding:3px 0;border-top:1px dashed var(--line);}
.cat-row{display:grid;grid-template-columns:130px 1fr 110px 56px;gap:10px;align-items:center;padding:4px 0;}
.cat-bar-track{background:var(--soft);border-radius:4px;height:14px;overflow:hidden;}.cat-bar-fill{height:100%;border-radius:4px;}
.cat-name{font-weight:600;}.cat-pct{text-align:right;font-weight:700;}.cat-amt{text-align:right;color:var(--muted);}.footnote{margin-top:8px;font-size:11px;color:var(--muted);font-style:italic;}
@page{size:A4 portrait;margin:12mm 10mm;}
@media print{section{break-inside:avoid;}.page-break{break-before:page;}}
`;

export default NetWorthReport;
