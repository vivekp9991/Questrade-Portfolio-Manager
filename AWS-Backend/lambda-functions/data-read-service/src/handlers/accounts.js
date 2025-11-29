/**
 * Account Handlers
 * Read account data
 */

const logger = require('../../shared/utils/logger');
const response = require('../../shared/utils/response');
const { query, getItem } = require('../../shared/utils/dynamodb');

const ACCOUNTS_TABLE = process.env.ACCOUNTS_TABLE;

/**
 * GET /api/data/accounts?personName=xxx
 * Get all accounts for a person
 */
async function getAccounts(event) {
  try {
    // Get personName from query parameters
    const personName = event.queryStringParameters?.personName;

    if (!personName) {
      return response.badRequest('personName query parameter is required');
    }

    const result = await query(
      ACCOUNTS_TABLE,
      'personName = :personName',
      { ':personName': personName },
      { IndexName: 'personName-index' }
    );

    return response.success({
      personName,
      accounts: result.items,
      count: result.items.length
    });

  } catch (error) {
    logger.error('Get accounts handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * GET /api/data/accounts/:accountNumber
 * Get specific account by account number
 */
async function getAccount(event) {
  try {
    const accountNumber = event.pathParameters?.accountNumber;

    if (!accountNumber) {
      return response.badRequest('accountNumber is required');
    }

    // Query by account number using GSI
    const result = await query(
      ACCOUNTS_TABLE,
      'accountNumber = :accountNumber',
      { ':accountNumber': accountNumber },
      { IndexName: 'accountNumber-index', Limit: 1 }
    );

    if (!result.items || result.items.length === 0) {
      return response.notFound('Account not found');
    }

    return response.success(result.items[0]);

  } catch (error) {
    logger.error('Get account handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * GET /api/accounts/:personName
 * Get accounts for a specific person (Phase 2 endpoint)
 */
async function getPersonAccounts(event) {
  try {
    const personName = event.pathParameters?.personName;

    if (!personName) {
      return response.badRequest('personName is required');
    }

    const result = await query(
      ACCOUNTS_TABLE,
      'personName = :personName',
      { ':personName': personName },
      { IndexName: 'personName-index' }
    );

    // Sort by isPrimary desc, then by totalEquity desc
    const accounts = result.items.sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) {
        return b.isPrimary ? 1 : -1;
      }
      const aEquity = a.summary?.totalEquityCAD || 0;
      const bEquity = b.summary?.totalEquityCAD || 0;
      return bEquity - aEquity;
    });

    return response.success(accounts, `Retrieved ${accounts.length} accounts for ${personName}`);

  } catch (error) {
    logger.error('Get person accounts handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * GET /api/accounts/summary/:personName
 * Get account summary totals for a person (Phase 2 endpoint)
 */
async function getAccountSummary(event) {
  try {
    const personName = event.pathParameters?.personName;

    if (!personName) {
      return response.badRequest('personName is required');
    }

    const result = await query(
      ACCOUNTS_TABLE,
      'personName = :personName',
      { ':personName': personName },
      { IndexName: 'personName-index' }
    );

    const summary = result.items.reduce((acc, account) => {
      acc.totalEquityCAD += account.summary?.totalEquityCAD || 0;
      acc.totalCashCAD += account.summary?.cashCAD || 0;
      acc.totalMarketValueCAD += account.summary?.marketValueCAD || 0;
      acc.accountCount++;
      return acc;
    }, {
      totalEquityCAD: 0,
      totalCashCAD: 0,
      totalMarketValueCAD: 0,
      accountCount: 0
    });

    return response.success(summary, `Account summary for ${personName}`);

  } catch (error) {
    logger.error('Get account summary handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * GET /api/accounts/dropdown-options
 * Get account dropdown options for UI (Phase 2 endpoint)
 */
async function getAccountDropdownOptions(event) {
  try {
    const personName = event.queryStringParameters?.personName;

    let accounts;
    if (personName) {
      const result = await query(
        ACCOUNTS_TABLE,
        'personName = :personName',
        { ':personName': personName },
        { IndexName: 'personName-index' }
      );
      accounts = result.items;
    } else {
      // Scan all accounts if no personName provided
      const { scan } = require('../../shared/utils/dynamodb');
      const result = await scan(ACCOUNTS_TABLE);
      accounts = result.items;
    }

    // Sort by personName, then isPrimary
    accounts.sort((a, b) => {
      if (a.personName !== b.personName) {
        return a.personName.localeCompare(b.personName);
      }
      return b.isPrimary ? 1 : -1;
    });

    const options = accounts.map(account => ({
      value: account.accountId,
      label: `${account.type} - ${account.number}${account.isPrimary ? ' (Primary)' : ''}`,
      personName: account.personName,
      accountType: account.type,
      isPrimary: account.isPrimary
    }));

    return response.success(options, 'Account dropdown options retrieved');

  } catch (error) {
    logger.error('Get account dropdown options handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * GET /api/accounts/detail/:accountId
 * Get detailed account info by accountId (Phase 2 endpoint)
 */
async function getAccountDetail(event) {
  try {
    const accountId = event.pathParameters?.accountId;

    if (!accountId) {
      return response.badRequest('accountId is required');
    }

    const account = await getItem(ACCOUNTS_TABLE, { accountId });

    if (!account) {
      return response.notFound('Account not found');
    }

    return response.success(account, 'Account details retrieved');

  } catch (error) {
    logger.error('Get account detail handler error', { error: error.message });
    return response.handleError(error);
  }
}

module.exports = {
  getAccounts,
  getAccount,
  getPersonAccounts,
  getAccountSummary,
  getAccountDropdownOptions,
  getAccountDetail
};
