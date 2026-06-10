/**
 * Custom Investments (R3) — see docs/net-worth-report.md (Section C)
 * Manual assets the owner adds. Two modes:
 *  - 'lots'  : lots [{quantity, price}] + currentPrice → cost/avg/currentValue/pnl (Image 4)
 *  - 'simple': enter cost + currentValue directly (quick one-off line)
 * Each carries person (free-form), currency (CAD|USD), and category (reuse symbol category list).
 */

const crypto = require('crypto');
const { scan, putItem, deleteItem } = require('../../shared/utils/dynamodb');

const CUSTOM_INVESTMENTS_TABLE = process.env.CUSTOM_INVESTMENTS_TABLE;
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

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

// Derive totals (not stored) so the report and the editor always agree.
function compute(item) {
  const mode = item.mode === 'simple' ? 'simple' : 'lots';
  let totalQty = 0, cost = 0, currentValue = 0, avgPrice = 0;
  if (mode === 'lots') {
    for (const l of (Array.isArray(item.lots) ? item.lots : [])) {
      const q = Number(l.quantity) || 0, p = Number(l.price) || 0;
      totalQty += q; cost += q * p;
    }
    avgPrice = totalQty ? cost / totalQty : 0;
    currentValue = totalQty * (Number(item.currentPrice) || 0);
  } else {
    cost = Number(item.cost) || 0;
    currentValue = Number(item.currentValue) || 0;
  }
  const pnl = currentValue - cost;
  return {
    ...item, mode,
    totalQty: r2(totalQty), cost: r2(cost), avgPrice: r2(avgPrice),
    currentValue: r2(currentValue), pnl: r2(pnl), pnlPct: cost ? r2((pnl / cost) * 100) : 0
  };
}

async function listCustomInvestments() {
  const items = await scanAll(CUSTOM_INVESTMENTS_TABLE);
  return items.map(compute).sort((a, b) => `${a.person}${a.name}`.localeCompare(`${b.person}${b.name}`));
}

async function upsertCustomInvestment(body) {
  if (!body.person) throw new Error('person is required');
  const item = {
    person: String(body.person),
    investmentId: body.investmentId || crypto.randomUUID(),
    name: body.name || '',
    category: body.category || '',
    currency: body.currency === 'USD' ? 'USD' : 'CAD',
    account: body.account || '',
    mode: body.mode === 'simple' ? 'simple' : 'lots',
    lots: Array.isArray(body.lots) ? body.lots.map((l) => ({ quantity: Number(l.quantity) || 0, price: Number(l.price) || 0 })) : [],
    currentPrice: Number(body.currentPrice) || 0,
    cost: Number(body.cost) || 0,
    currentValue: Number(body.currentValue) || 0,
    updatedAt: new Date().toISOString()
  };
  await putItem(CUSTOM_INVESTMENTS_TABLE, item);
  return compute(item);
}

async function deleteCustomInvestment(person, investmentId) {
  await deleteItem(CUSTOM_INVESTMENTS_TABLE, { person, investmentId });
  return { person, investmentId, deleted: true };
}

module.exports = { listCustomInvestments, upsertCustomInvestment, deleteCustomInvestment };
