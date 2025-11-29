/**
 * Cash Balances Handler
 * Get cash balances for accounts
 */

const logger = require('../../shared/utils/logger');
const { success, internalError } = require('../../shared/utils/response');
const { query, scan } = require('../../shared/utils/dynamodb');

const ACCOUNTS_TABLE = process.env.ACCOUNTS_TABLE;

/**
 * GET /api/portfolio/cash-balances
 * Get cash balances with view mode support
 */
exports.getCashBalances = async (event) => {
  try {
    const { viewMode = 'all', personName, accountId } = event.queryStringParameters || {};

    logger.info('Getting cash balances', {
      viewMode,
      personName,
      accountId
    });

    let accounts = [];

    // Fetch accounts based on view mode
    if (viewMode === 'person' && personName) {
      // Get accounts for specific person
      const result = await query(
        ACCOUNTS_TABLE,
        'personName = :personName',
        { ':personName': personName },
        { IndexName: 'personName-index' }
      );
      accounts = result.items || [];
    } else if (viewMode === 'account' && accountId) {
      // Get specific account
      const result = await query(
        ACCOUNTS_TABLE,
        'accountId = :accountId',
        { ':accountId': accountId }
      );
      accounts = result.items || [];
    } else {
      // Get all accounts
      const result = await scan(ACCOUNTS_TABLE);
      accounts = result.items || [];
    }

    // Transform to match frontend expected format
    // Frontend expects: accounts[].cashBalances[] with { cash, currency }
    const balances = {
      accounts: accounts.map(acc => {
        const cashBalances = [];

        // Check if we have the new summary structure from sync service
        if (acc.summary) {
          // Add CAD balance if present
          if (acc.summary.cashCAD !== undefined) {
            cashBalances.push({
              currency: 'CAD',
              cash: acc.summary.cashCAD || 0,
              marketValue: acc.summary.marketValueCAD || 0,
              totalEquity: acc.summary.totalEquityCAD || 0
            });
          }

          // Add USD balance if present
          if (acc.summary.cashUSD !== undefined) {
            cashBalances.push({
              currency: 'USD',
              cash: acc.summary.cashUSD || 0,
              marketValue: acc.summary.marketValueUSD || 0,
              totalEquity: acc.summary.totalEquityUSD || 0
            });
          }
        } else {
          // Fallback to legacy format (single currency per account)
          cashBalances.push({
            currency: acc.currency || 'CAD',
            cash: acc.cash || 0,
            marketValue: acc.marketValue || 0,
            totalEquity: acc.totalEquity || 0
          });
        }

        return {
          accountId: acc.accountId,
          accountNumber: acc.number,
          accountType: acc.type,
          personName: acc.personName,
          cashBalances: cashBalances,
          buyingPower: acc.summary?.buyingPowerCAD || acc.buyingPower || 0,
          status: acc.status || 'Active'
        };
      }),
      summary: calculateSummary(accounts)
    };

    logger.info(`Returning ${balances.accounts.length} account balances`);

    return success(balances);

  } catch (error) {
    logger.error('Get cash balances handler error', {
      error: error.message,
      stack: error.stack
    });
    return internalError(error.message, error);
  }
};

/**
 * Calculate summary totals
 */
function calculateSummary(accounts) {
  const summary = {
    totalCAD: 0,
    totalUSD: 0,
    totalCashCAD: 0,
    totalCashUSD: 0,
    totalMarketValue: 0,
    totalEquity: 0,
    totalAccounts: accounts.length,
    byType: {}
  };

  for (const account of accounts) {
    const type = account.type || 'Unknown';

    // Check if we have the new summary structure from sync service
    if (account.summary) {
      // New format: summary contains CAD and USD separately
      const cashCAD = account.summary.cashCAD || 0;
      const cashUSD = account.summary.cashUSD || 0;
      const equityCAD = account.summary.totalEquityCAD || 0;
      const equityUSD = account.summary.totalEquityUSD || 0;
      const marketValueCAD = account.summary.marketValueCAD || 0;
      const marketValueUSD = account.summary.marketValueUSD || 0;

      summary.totalCAD += equityCAD;
      summary.totalUSD += equityUSD;
      summary.totalCashCAD += cashCAD;
      summary.totalCashUSD += cashUSD;
      summary.totalMarketValue += marketValueCAD + marketValueUSD;
      summary.totalEquity += equityCAD + equityUSD;

      // Sum by account type
      if (!summary.byType[type]) {
        summary.byType[type] = {
          count: 0,
          totalCash: 0,
          totalEquity: 0
        };
      }
      summary.byType[type].count++;
      summary.byType[type].totalCash += cashCAD + cashUSD;
      summary.byType[type].totalEquity += equityCAD + equityUSD;
    } else {
      // Legacy format: single currency per account
      const cash = account.cash || 0;
      const marketValue = account.marketValue || 0;
      const totalEquity = account.totalEquity || 0;
      const currency = account.currency || 'CAD';

      // Sum by currency
      if (currency === 'CAD') {
        summary.totalCAD += totalEquity;
        summary.totalCashCAD += cash;
      } else if (currency === 'USD') {
        summary.totalUSD += totalEquity;
        summary.totalCashUSD += cash;
      }

      summary.totalMarketValue += marketValue;
      summary.totalEquity += totalEquity;

      // Sum by account type
      if (!summary.byType[type]) {
        summary.byType[type] = {
          count: 0,
          totalCash: 0,
          totalEquity: 0
        };
      }
      summary.byType[type].count++;
      summary.byType[type].totalCash += cash;
      summary.byType[type].totalEquity += totalEquity;
    }
  }

  return summary;
}
