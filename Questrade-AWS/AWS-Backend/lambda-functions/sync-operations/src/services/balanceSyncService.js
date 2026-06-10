/**
 * Account Balance Sync (B1) — see docs/account-balance-tracking.md
 *
 * Fetches the CURRENT per-currency account value from Questrade
 * (GET /v1/accounts/{id}/balances) and stores it in the account-balances table.
 * This is the "current value" half of the contribution-tracking feature; the manual
 * baseline (B3) and the activity-derived contributions (B2) are added later.
 *
 * Writes ONLY the balance fields via updateItem (SET merge), so future baseline/override
 * fields on the same item are never clobbered.
 */

const logger = require('../../shared/utils/logger');
const { scan, updateItem } = require('../../shared/utils/dynamodb');
const questradeApi = require('./questradeApiService');
const syncService = require('./syncService');

const ACCOUNT_BALANCES_TABLE = process.env.ACCOUNT_BALANCES_TABLE;
const ACTIVITIES_TABLE = process.env.ACTIVITIES_TABLE;
const POSITIONS_TABLE = process.env.POSITIONS_TABLE;

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

// Sync current balances for every account of one login.
async function syncBalancesForPerson(personName) {
  const accounts = await syncService.getAccountsWithCache(personName, { forceFresh: true });
  const results = [];
  for (const acct of (accounts || [])) {
    const accountId = String(acct.number || acct.accountId || '');
    if (!accountId) continue;
    try {
      const perCurrency = await questradeApi.getBalances(personName, accountId); // [{currency, cash, marketValue, totalEquity}]
      const currentBalances = {};
      for (const b of (perCurrency || [])) {
        if (!b.currency) continue;
        currentBalances[b.currency] = {
          cash: Number(b.cash) || 0,
          marketValue: Number(b.marketValue) || 0,
          totalEquity: Number(b.totalEquity) || 0
        };
      }
      await updateItem(ACCOUNT_BALANCES_TABLE, { personName, accountId }, {
        accountType: acct.type || '',
        accountStatus: acct.status || '',
        currentBalances,
        currentValueUpdatedAt: new Date().toISOString(),
        updatedAt: Date.now()
      });
      results.push({ accountId, accountType: acct.type, currencies: Object.keys(currentBalances), currentBalances });
    } catch (e) {
      logger.error(`[BALANCES] sync failed for ${personName}/${accountId}`, { error: e.message });
      results.push({ accountId, error: e.message });
    }
  }
  logger.info(`[BALANCES] ${personName}: ${results.filter((r) => !r.error).length}/${results.length} accounts synced`);
  return results;
}

// Sync balances for all eligible logins (valid tokens).
async function syncAllBalances() {
  const persons = await syncService.getEligiblePersonNames();
  const out = {};
  for (const p of persons) {
    out[p] = await syncBalancesForPerson(p);
  }
  return out;
}

// Read all stored account balances (for the UI / verification).
async function getAllAccountBalances() {
  const items = [];
  let ExclusiveStartKey;
  do {
    const r = await scan(ACCOUNT_BALANCES_TABLE, { ExclusiveStartKey });
    items.push(...(r.items || []));
    ExclusiveStartKey = r.lastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

// ---- B2: contributions from cash-movement activities ----
// Net contribution per account/currency = Σ netAmount over Deposits + Transfers − Withdrawals.
// Questrade's sign convention: deposit/transfer-in netAmount > 0, withdrawal/transfer-out < 0,
// so a signed sum of netAmount IS the net cash the owner put in. When a baseline date exists
// (B3) only activities STRICTLY AFTER it are counted (the baseline already covers prior history).
const CASH_MOVE_TYPES = ['Deposits', 'Transfers', 'Withdrawals'];

async function computeAllContributions(baselineByAccount = {}) {
  const items = await scanAll(ACTIVITIES_TABLE, {
    FilterExpression: '#t = :d OR #t = :tr OR #t = :w',
    ExpressionAttributeNames: { '#t': 'type' },
    ExpressionAttributeValues: { ':d': 'Deposits', ':tr': 'Transfers', ':w': 'Withdrawals' },
    ProjectionExpression: 'personName, accountId, #t, netAmount, currency, transactionDate'
  });
  const out = {}; // "person|account" -> { CAD: {autoContributions, deposits, withdrawals, transfers, count}, USD: {...} }
  for (const a of items) {
    if (!a.personName || !a.accountId) continue;
    const key = `${a.personName}|${a.accountId}`;
    const baseDate = baselineByAccount[key];
    if (baseDate && Date.parse(a.transactionDate) <= Date.parse(baseDate)) continue; // only after baseline
    const ccy = a.currency || 'CAD';
    const net = Number(a.netAmount) || 0;
    out[key] = out[key] || {};
    const g = out[key][ccy] = out[key][ccy] || { autoContributions: 0, deposits: 0, withdrawals: 0, transfers: 0, count: 0 };
    g.autoContributions += net;
    if (a.type === 'Deposits') g.deposits += net;
    else if (a.type === 'Withdrawals') g.withdrawals += net;
    else if (a.type === 'Transfers') g.transfers += net;
    g.count++;
  }
  // round
  for (const byCcy of Object.values(out)) {
    for (const g of Object.values(byCcy)) {
      for (const k of ['autoContributions', 'deposits', 'withdrawals', 'transfers']) g[k] = Math.round(g[k] * 100) / 100;
    }
  }
  return out;
}

// Compute contributions (honoring any stored baseline date) and persist per account.
async function syncAllContributions() {
  const existing = await getAllAccountBalances();
  const baselineByAccount = {};
  existing.forEach((r) => { if (r.baselineDate) baselineByAccount[`${r.personName}|${r.accountId}`] = r.baselineDate; });

  const contrib = await computeAllContributions(baselineByAccount);
  // Write for EVERY known account (not just those with results) so an account whose activities
  // are all before its baseline gets its autoContributions reset to {} instead of keeping a stale value.
  const keys = new Set([...existing.map((r) => `${r.personName}|${r.accountId}`), ...Object.keys(contrib)]);
  for (const key of keys) {
    const [personName, accountId] = key.split('|');
    await updateItem(ACCOUNT_BALANCES_TABLE, { personName, accountId }, {
      autoContributions: contrib[key] || {},
      contributionsUpdatedAt: new Date().toISOString()
    });
  }
  return contrib;
}

// R1: invested (cost basis) + market value per account/currency, summed from positions.
async function getPositionAggregates() {
  const items = await scanAll(POSITIONS_TABLE, {
    ProjectionExpression: 'personName, accountId, currency, totalCost, currentMarketValue'
  });
  const agg = {}; // "person|account" -> { CAD: { invested, marketValue }, USD: {...} }
  for (const p of items) {
    if (!p.personName || !p.accountId) continue;
    const key = `${p.personName}|${p.accountId}`;
    const ccy = p.currency || 'CAD';
    agg[key] = agg[key] || {};
    const g = agg[key][ccy] = agg[key][ccy] || { invested: 0, marketValue: 0 };
    g.invested += Number(p.totalCost) || 0;
    g.marketValue += Number(p.currentMarketValue) || 0;
  }
  return agg;
}

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Enriched read per currency: invested/marketValue/pnl (R1), cash, total, and
// netContributions = manualBaseline + autoContributions; gain = totalEquity - netContributions.
function enrichAccount(item, posAgg = {}) {
  const cb = item.currentBalances || {};
  const ac = item.autoContributions || {};
  const mb = item.manualBaseline || {}; // B3: { CAD: number, USD: number }
  const pa = posAgg[`${item.personName}|${item.accountId}`] || {};
  const currencies = [...new Set([...Object.keys(cb), ...Object.keys(ac), ...Object.keys(mb), ...Object.keys(pa)])];
  const perCurrency = {};
  for (const c of currencies) {
    const totalEquity = Number(cb[c]?.totalEquity) || 0;
    const cash = Number(cb[c]?.cash) || 0;
    // marketValue from the real-time balances (so marketValue + cash = total exactly);
    // invested (cost basis) only from positions — Questrade balances doesn't expose it.
    const marketValue = r2(cb[c]?.marketValue);
    const invested = r2(pa[c]?.invested);
    const pnl = r2(marketValue - invested);
    const auto = Number(ac[c]?.autoContributions) || 0;
    const baseline = Number(mb[c]) || 0;
    const hasBaseline = mb[c] != null && mb[c] !== '';
    const netContributions = baseline + auto;
    const gain = totalEquity - netContributions;
    perCurrency[c] = {
      totalEquity: r2(totalEquity), cash: r2(cash),
      invested, marketValue, pnl, // R1: cost basis / current market / unrealized P&L
      autoContributions: r2(auto),
      manualBaseline: hasBaseline ? r2(baseline) : null,
      netContributions: r2(netContributions),
      estimated: !hasBaseline, // no baseline set -> contributions are activity-derived only
      gain: r2(gain),
      gainPct: netContributions ? Math.round((gain / netContributions) * 10000) / 100 : 0
    };
  }
  return { ...item, perCurrency };
}

async function getEnrichedBalances() {
  const [items, posAgg] = await Promise.all([getAllAccountBalances(), getPositionAggregates()]);
  return items.map((it) => enrichAccount(it, posAgg));
}

// ---- B3: manual baseline override ----
// Set/clear the owner's per-currency contribution baseline + baselineDate for one account.
// `manualBaseline` = { CAD?: number, USD?: number } (null clears); `baselineDate` = 'YYYY-MM-DD'
// (null clears → contributions count ALL activity again). Merged via updateItem so the synced
// balances/contributions on the same item are preserved.
async function setBaseline(personName, accountId, { manualBaseline, baselineDate }) {
  const updates = { baselineUpdatedAt: new Date().toISOString() };
  if (manualBaseline !== undefined) {
    if (manualBaseline === null) updates.manualBaseline = null;
    else {
      const clean = {};
      for (const c of ['CAD', 'USD']) {
        if (manualBaseline[c] != null && manualBaseline[c] !== '') clean[c] = Number(manualBaseline[c]) || 0;
      }
      updates.manualBaseline = Object.keys(clean).length ? clean : null;
    }
  }
  if (baselineDate !== undefined) updates.baselineDate = baselineDate || null;
  await updateItem(ACCOUNT_BALANCES_TABLE, { personName, accountId }, updates);
  // Recompute contributions so the after-baseline window is applied immediately.
  await syncAllContributions();
  const all = await getEnrichedBalances();
  return all.find((a) => a.personName === personName && a.accountId === accountId) || null;
}

module.exports = {
  syncBalancesForPerson, syncAllBalances, getAllAccountBalances,
  computeAllContributions, syncAllContributions, getEnrichedBalances, setBaseline
};
