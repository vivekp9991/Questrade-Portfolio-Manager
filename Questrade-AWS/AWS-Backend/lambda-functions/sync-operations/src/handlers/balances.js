/**
 * Account Balances HTTP handlers (B1) — see docs/account-balance-tracking.md
 */

const response = require('../../shared/utils/response');
const balanceSyncService = require('../services/balanceSyncService');
const bankBalancesService = require('../services/bankBalancesService');
const customInvestmentsService = require('../services/customInvestmentsService');

// POST /api/sync/balances — sync current balances for all eligible logins.
async function syncBalances(event) {
  try {
    const result = await balanceSyncService.syncAllBalances();
    const accounts = Object.values(result).flat();
    const ok = accounts.filter((r) => !r.error).length;
    return response.success({ result }, `Balances synced: ${ok}/${accounts.length} accounts across ${Object.keys(result).length} logins`);
  } catch (error) {
    return response.handleError(error);
  }
}

// POST /api/sync/balances/{personName}
async function syncBalancesPerson(event) {
  try {
    const personName = event.pathParameters?.personName;
    if (!personName) return response.badRequest('personName is required');
    const accounts = await balanceSyncService.syncBalancesForPerson(personName);
    const ok = accounts.filter((r) => !r.error).length;
    return response.success({ personName, accounts }, `Balances synced for ${personName}: ${ok}/${accounts.length} accounts`);
  } catch (error) {
    return response.handleError(error);
  }
}

// POST /api/sync/contributions — (re)compute net contributions from activities.
async function syncContributions(event) {
  try {
    const contrib = await balanceSyncService.syncAllContributions();
    return response.success({ contrib }, `Contributions computed for ${Object.keys(contrib).length} accounts`);
  } catch (error) {
    return response.handleError(error);
  }
}

// GET /api/account-balances — read all account balances, enriched with net contributions + gain.
async function getAccountBalances(event) {
  try {
    const items = await balanceSyncService.getEnrichedBalances();
    return response.success(items, `${items.length} account balances`);
  } catch (error) {
    return response.handleError(error);
  }
}

// POST /api/account-balances/{personName}/{accountId} — set/clear the manual baseline override.
// Body: { manualBaseline: { CAD?, USD? } | null, baselineDate: 'YYYY-MM-DD' | null }
async function setAccountBaseline(event) {
  try {
    const personName = event.pathParameters?.personName;
    const accountId = event.pathParameters?.accountId;
    if (!personName || !accountId) return response.badRequest('personName and accountId are required');
    const body = event.body ? JSON.parse(event.body) : {};
    const updated = await balanceSyncService.setBaseline(personName, accountId, {
      manualBaseline: body.manualBaseline,
      baselineDate: body.baselineDate
    });
    return response.success(updated, `Baseline set for ${personName}/${accountId}`);
  } catch (error) {
    return response.handleError(error);
  }
}

// ---- R2: bank / cash balances (manual) ----
// GET /api/bank-balances
async function getBankBalances(event) {
  try {
    const items = await bankBalancesService.listBankBalances();
    return response.success(items, `${items.length} bank balances`);
  } catch (error) { return response.handleError(error); }
}

// POST /api/bank-balances — create (no entryId) or update (entryId in body).
async function postBankBalance(event) {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    if (!body.person) return response.badRequest('person is required');
    const item = await bankBalancesService.upsertBankBalance(body);
    return response.success(item, 'Bank balance saved');
  } catch (error) { return response.handleError(error); }
}

// DELETE /api/bank-balances/{person}/{entryId}
async function deleteBankBalance(event) {
  try {
    const person = event.pathParameters?.person;
    const entryId = event.pathParameters?.entryId;
    if (!person || !entryId) return response.badRequest('person and entryId are required');
    const res = await bankBalancesService.deleteBankBalance(person, entryId);
    return response.success(res, 'Bank balance deleted');
  } catch (error) { return response.handleError(error); }
}

// ---- R3: custom investments (manual) ----
// GET /api/custom-investments
async function getCustomInvestments(event) {
  try {
    const items = await customInvestmentsService.listCustomInvestments();
    return response.success(items, `${items.length} custom investments`);
  } catch (error) { return response.handleError(error); }
}

// POST /api/custom-investments — create (no investmentId) or update (investmentId in body).
async function postCustomInvestment(event) {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    if (!body.person) return response.badRequest('person is required');
    const item = await customInvestmentsService.upsertCustomInvestment(body);
    return response.success(item, 'Custom investment saved');
  } catch (error) { return response.handleError(error); }
}

// DELETE /api/custom-investments/{person}/{investmentId}
async function deleteCustomInvestment(event) {
  try {
    const person = event.pathParameters?.person;
    const investmentId = event.pathParameters?.investmentId;
    if (!person || !investmentId) return response.badRequest('person and investmentId are required');
    const res = await customInvestmentsService.deleteCustomInvestment(person, investmentId);
    return response.success(res, 'Custom investment deleted');
  } catch (error) { return response.handleError(error); }
}

module.exports = {
  syncBalances, syncBalancesPerson, syncContributions, getAccountBalances, setAccountBaseline,
  getBankBalances, postBankBalance, deleteBankBalance,
  getCustomInvestments, postCustomInvestment, deleteCustomInvestment
};
