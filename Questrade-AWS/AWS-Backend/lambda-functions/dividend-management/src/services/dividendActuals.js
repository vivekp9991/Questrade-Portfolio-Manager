/**
 * Dividend Actuals (D1 — review assist data, read-only)
 *
 * Derives, per symbol, what the owner ACTUALLY received from the activities table —
 * the ground truth for reviewing dividend values. Does NOT change any yield calculation
 * (that's D2). Pure read: one scan of dividend activities + one scan of positions,
 * bucketed in memory. See docs/dividend-system-requirements.md (R2/R3, D1).
 *
 * Per-share is derived as amount ÷ shares held (dividend activities carry only netAmount;
 * quantity/grossAmount are 0), aggregated at the symbol level across all holders.
 */

const logger = require('../../shared/utils/logger');
const response = require('../../shared/utils/response');
const { scan } = require('../../shared/utils/dynamodb');

const ACTIVITIES_TABLE = process.env.ACTIVITIES_TABLE;
const POSITIONS_TABLE = process.env.POSITIONS_TABLE;
const SYMBOL_DIVIDENDS_TABLE = process.env.SYMBOL_DIVIDENDS_TABLE;
const DAY = 24 * 60 * 60 * 1000;

const round = (n, d = 4) => { const f = 10 ** d; return Math.round((Number(n) || 0) * f) / f; };
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

async function scanAll(tableName, options = {}) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const r = await scan(tableName, { ...options, ExclusiveStartKey });
    items.push(...(r.items || []));
    ExclusiveStartKey = r.lastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

// Total current shares per symbol (summed across all accounts/persons).
async function getSharesBySymbol() {
  const items = await scanAll(POSITIONS_TABLE, {
    ProjectionExpression: '#s, openQuantity',
    ExpressionAttributeNames: { '#s': 'symbol' }
  });
  const shares = {};
  for (const p of items) {
    if (!p.symbol) continue;
    shares[p.symbol] = (shares[p.symbol] || 0) + (Number(p.openQuantity) || 0);
  }
  return shares;
}

// Dividend activities grouped by symbol: [{ dateMs, amt }].
async function getDividendsBySymbol() {
  const items = await scanAll(ACTIVITIES_TABLE, {
    FilterExpression: 'contains(#t, :d)',
    ExpressionAttributeNames: { '#t': 'type', '#s': 'symbol' },
    ExpressionAttributeValues: { ':d': 'ividend' },
    ProjectionExpression: '#s, transactionDate, netAmount, grossAmount'
  });
  const bySym = {};
  for (const a of items) {
    if (!a.symbol) continue;
    const amt = Math.abs(Number(a.netAmount) || Number(a.grossAmount) || 0);
    const dateMs = Date.parse(a.transactionDate);
    if (!amt || isNaN(dateMs)) continue;
    (bySym[a.symbol] = bySym[a.symbol] || []).push({ dateMs, amt });
  }
  return bySym;
}

// Trade (Buy/Sell) activities per symbol: [{ dateMs, signedQty }] (Buy +, Sell -).
// Used to reconstruct shares held at each dividend date (a dividend is paid on the
// shares held at the ex/record date, NOT current shares — the holder may have since
// bought/sold more). NOTE: only type 'Trades' handled here; 'Transfers' of shares are
// an edge case (flagged in docs) and not yet reconstructed.
async function getTradesBySymbol() {
  const items = await scanAll(ACTIVITIES_TABLE, {
    FilterExpression: '#t = :tr',
    ExpressionAttributeNames: { '#t': 'type', '#s': 'symbol', '#a': 'action' },
    ExpressionAttributeValues: { ':tr': 'Trades' },
    ProjectionExpression: '#s, transactionDate, quantity, #a, netAmount'
  });
  const bySym = {};
  for (const t of items) {
    if (!t.symbol) continue;
    const qty = Math.abs(Number(t.quantity) || 0);
    const dateMs = Date.parse(t.transactionDate);
    if (!qty || isNaN(dateMs)) continue;
    const action = String(t.action || '');
    const net = Number(t.netAmount) || 0;
    // Buy => shares +, Sell => shares -. Prefer the action label; fall back to netAmount sign
    // (a Buy costs cash → netAmount < 0; a Sell yields cash → netAmount > 0).
    const isSell = /sell/i.test(action) || (net > 0 && !/buy/i.test(action));
    (bySym[t.symbol] = bySym[t.symbol] || []).push({ dateMs, signedQty: (isSell ? -1 : 1) * qty });
  }
  return bySym;
}

// Shares held as of `dateMs` = current shares minus net trades AFTER that date.
function sharesAsOf(dateMs, trades, currentShares) {
  let after = 0;
  for (const t of (trades || [])) if (t.dateMs > dateMs) after += t.signedQty;
  return currentShares - after;
}

// Current stored value source for a symbol (for the review badge).
async function getValueSources() {
  const items = await scanAll(SYMBOL_DIVIDENDS_TABLE, {
    ProjectionExpression: '#s, isManualOverride, overrideValue, dividendPerShare',
    ExpressionAttributeNames: { '#s': 'symbol' }
  });
  const map = {};
  for (const d of items) {
    if (!d.symbol) continue;
    if (d.isManualOverride === 'true' && d.overrideValue) map[d.symbol] = 'override';
    else if (d.dividendPerShare) map[d.symbol] = 'questrade';
    else map[d.symbol] = 'none';
  }
  return map;
}

function computeForSymbol(divs, trades, currentShares) {
  const cur = currentShares || 0;
  // Group payments by day, sum same-day amounts (across holders).
  const byDate = {};
  for (const d of (divs || [])) {
    const k = dayKey(d.dateMs);
    byDate[k] = byDate[k] || { dateMs: d.dateMs, total: 0 };
    byDate[k].total += d.amt;
  }
  const dates = Object.entries(byDate).map(([key, v]) => ({ key, ...v })).sort((a, b) => b.dateMs - a.dateMs);
  if (dates.length === 0) {
    return { lastActualDate: null, lastActualAmount: 0, lastActualPerShare: null, sharesAtLastPayment: null,
      ttmIncome: 0, ttmPerShare: null, paymentsLast12mo: 0, isVariable: false, variability: 0, shares: cur };
  }
  const now = Date.now();

  // Per-payment per-share computed on the shares held AT that payment (reconstructed from trades),
  // so buying/selling more of the same symbol later doesn't distort the figure.
  const enriched = dates.map((d) => {
    const sh = sharesAsOf(d.dateMs, trades, cur);
    return { ...d, sharesAt: sh, perShare: sh > 0 ? d.total / sh : null };
  });

  const last = enriched[0];
  const ttm = enriched.filter((d) => now - d.dateMs <= 365 * DAY);
  const ttmIncome = ttm.reduce((s, d) => s + d.total, 0);
  // Trailing-12-month per share = sum of each payment's own per-share (handles changing share counts).
  const ttmPerShare = ttm.length && ttm.every((d) => d.perShare != null)
    ? ttm.reduce((s, d) => s + d.perShare, 0) : null;

  // Variability from the per-payment per-share series (coefficient of variation).
  let isVariable = false; let cov = 0;
  const ps = ttm.map((d) => d.perShare).filter((v) => v != null);
  if (ps.length >= 2) {
    const mean = ps.reduce((a, b) => a + b, 0) / ps.length;
    const variance = ps.reduce((a, b) => a + (b - mean) ** 2, 0) / ps.length;
    cov = mean > 0 ? Math.sqrt(variance) / mean : 0;
    isVariable = cov > 0.10;
  }

  return {
    lastActualDate: last.key,
    lastActualAmount: round(last.total),
    lastActualPerShare: last.perShare != null ? round(last.perShare, 6) : null,
    sharesAtLastPayment: last.sharesAt,
    ttmIncome: round(ttmIncome),
    ttmPerShare: ttmPerShare != null ? round(ttmPerShare, 6) : null,
    paymentsLast12mo: ttm.length,
    isVariable,
    variability: round(cov, 3),
    shares: cur
  };
}

async function computeAllActuals() {
  const [bySym, tradesBySym, shares, sources] = await Promise.all([
    getDividendsBySymbol(), getTradesBySymbol(), getSharesBySymbol(), getValueSources()
  ]);
  const symbols = new Set([...Object.keys(bySym), ...Object.keys(shares)]);
  const out = {};
  for (const sym of symbols) {
    out[sym] = { ...computeForSymbol(bySym[sym], tradesBySym[sym], shares[sym]), valueSource: sources[sym] || 'none' };
  }
  return out;
}

// GET /api/symbol-dividends/actuals[/{symbol}]
async function getActuals(event) {
  try {
    const all = await computeAllActuals();
    const m = (event.rawPath || '').match(/\/actuals\/([^/]+)$/);
    if (m) {
      const sym = decodeURIComponent(m[1]).toUpperCase();
      return response.success(all[sym] || null, all[sym] ? 'OK' : `No data for ${sym}`);
    }
    const arr = Object.entries(all).map(([symbol, v]) => ({ symbol, ...v }))
      .sort((a, b) => (b.ttmIncome || 0) - (a.ttmIncome || 0));
    return response.success(arr, `${arr.length} symbols`);
  } catch (error) {
    logger.error('getActuals failed', { error: error.message });
    return response.handleError(error);
  }
}

module.exports = { computeAllActuals, computeForSymbol, getActuals };
