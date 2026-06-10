/**
 * Bank / Cash balances (R2) — see docs/net-worth-report.md (Section A)
 * Pure manual data: per free-form person, per bank, currency (CAD|USD), amount.
 */

const crypto = require('crypto');
const { scan, putItem, deleteItem } = require('../../shared/utils/dynamodb');

const BANK_BALANCES_TABLE = process.env.BANK_BALANCES_TABLE;

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

async function listBankBalances() {
  const items = await scanAll(BANK_BALANCES_TABLE);
  return items.sort((a, b) => `${a.person}${a.bankName}`.localeCompare(`${b.person}${b.bankName}`));
}

// Create (no entryId) or update (entryId provided).
async function upsertBankBalance({ person, entryId, bankName, currency, amount }) {
  if (!person) throw new Error('person is required');
  const item = {
    person: String(person),
    entryId: entryId || crypto.randomUUID(),
    bankName: bankName || '',
    currency: currency === 'USD' ? 'USD' : 'CAD',
    amount: Number(amount) || 0,
    updatedAt: new Date().toISOString()
  };
  await putItem(BANK_BALANCES_TABLE, item);
  return item;
}

async function deleteBankBalance(person, entryId) {
  await deleteItem(BANK_BALANCES_TABLE, { person, entryId });
  return { person, entryId, deleted: true };
}

module.exports = { listBankBalances, upsertBankBalance, deleteBankBalance };
