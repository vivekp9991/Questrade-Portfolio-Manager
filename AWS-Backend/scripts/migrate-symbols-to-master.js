/**
 * Migration Script: Populate SymbolsMasterTable
 *
 * This script:
 * 1. Scans questrade-positions-dev to get all unique symbols
 * 2. Extracts symbolId, currency, companyName
 * 3. Fetches current dividend data from SymbolDividendsTable
 * 4. Populates questrade-symbols-master-dev
 *
 * Usage: node migrate-symbols-to-master.js [environment]
 * Example: node migrate-symbols-to-master.js dev
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  QueryCommand
} = require('@aws-sdk/lib-dynamodb');

const environment = process.argv[2] || 'dev';
const region = process.env.AWS_REGION || 'us-east-1';

const client = new DynamoDBClient({ region });
const ddbDocClient = DynamoDBDocumentClient.from(client);

const POSITIONS_TABLE = `questrade-positions-${environment}`;
const SYMBOL_DIVIDENDS_TABLE = `questrade-symbol-dividends-${environment}`;
const SYMBOLS_MASTER_TABLE = `questrade-symbols-master-${environment}`;

console.log('\n========================================');
console.log('Symbol Master Table Migration');
console.log('========================================');
console.log(`Environment: ${environment}`);
console.log(`Region: ${region}`);
console.log(`Source: ${POSITIONS_TABLE}`);
console.log(`Target: ${SYMBOLS_MASTER_TABLE}\n`);

/**
 * Scan positions table and extract unique symbols
 */
async function extractUniqueSymbols() {
  console.log('📊 Step 1: Scanning positions table...');

  const symbolsMap = new Map();
  let lastEvaluatedKey;
  let scannedCount = 0;

  do {
    const command = new ScanCommand({
      TableName: POSITIONS_TABLE,
      ProjectionExpression: 'symbol, symbolId, currency, companyName, openQuantity',
      ExclusiveStartKey: lastEvaluatedKey
    });

    const response = await ddbDocClient.send(command);

    response.Items?.forEach(item => {
      if (item.symbol && item.symbolId) {
        scannedCount++;

        // Only keep first occurrence of each symbol
        if (!symbolsMap.has(item.symbol)) {
          symbolsMap.set(item.symbol, {
            symbol: item.symbol,
            symbolId: item.symbolId,
            currency: item.currency || 'USD',
            companyName: item.companyName || item.symbol,
            firstSeenInPositions: true
          });
        }
      }
    });

    lastEvaluatedKey = response.LastEvaluatedKey;

    process.stdout.write(`\r   Scanned ${scannedCount} positions, found ${symbolsMap.size} unique symbols...`);

  } while (lastEvaluatedKey);

  console.log(`\n✅ Found ${symbolsMap.size} unique symbols\n`);
  return symbolsMap;
}

/**
 * Fetch dividend data for a symbol from SymbolDividendsTable
 */
async function getDividendData(symbol) {
  try {
    const command = new QueryCommand({
      TableName: SYMBOL_DIVIDENDS_TABLE,
      KeyConditionExpression: 'symbol = :symbol',
      ExpressionAttributeValues: {
        ':symbol': symbol
      },
      Limit: 1
    });

    const response = await ddbDocClient.send(command);
    return response.Items?.[0] || null;
  } catch (error) {
    console.error(`   ⚠️  Failed to fetch dividend data for ${symbol}:`, error.message);
    return null;
  }
}

/**
 * Populate SymbolsMasterTable
 */
async function populateMasterTable(symbolsMap) {
  console.log('📝 Step 2: Populating master table...');

  const symbols = Array.from(symbolsMap.values());
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < symbols.length; i++) {
    const symbolData = symbols[i];

    try {
      // Fetch existing dividend data if available
      const dividendData = await getDividendData(symbolData.symbol);

      // Prepare master record
      const masterRecord = {
        symbol: symbolData.symbol,
        symbolId: symbolData.symbolId,
        currency: symbolData.currency,
        companyName: symbolData.companyName,

        // Dividend data (from existing table or defaults)
        dividendData: dividendData ? {
          dividendPerMonth: dividendData.monthlyDividendPerShare || 0,
          dividendFrequency: dividendData.dividendFrequency || 0,
          annualDividend: dividendData.annualDividendPerShare || 0,
          currentYield: dividendData.currentYield || 0,
          lastDividendDate: dividendData.lastDividendDate || null,
          lastDividendAmount: dividendData.lastDividendAmount || 0,
          isManualOverride: dividendData.isManualOverride === 'true',
          questradeLastAmount: dividendData.lastDividendAmount || 0,
          lastVerifiedDate: new Date().toISOString().split('T')[0],
          notes: null
        } : {
          dividendPerMonth: 0,
          dividendFrequency: 0,
          annualDividend: 0,
          currentYield: 0,
          lastDividendDate: null,
          lastDividendAmount: 0,
          isManualOverride: false,
          questradeLastAmount: 0,
          lastVerifiedDate: null,
          notes: null
        },

        // Portfolio settings (global defaults)
        portfolioSettings: {
          includeInYOC: true,  // Default: include in YOC calculation
          excludeReason: null,
          isWatchlistOnly: false,
          category: null
        },

        // Metadata
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastQuestradeSyncAt: dividendData?.updatedAt || null,
        syncStatus: dividendData?.isManualOverride === 'true' ? 'manual_override' : 'auto_synced',
        needsReview: 'false',  // String for GSI compatibility

        // Migration metadata
        migratedFrom: 'positions',
        migrationDate: new Date().toISOString()
      };

      // Insert into master table
      const command = new PutCommand({
        TableName: SYMBOLS_MASTER_TABLE,
        Item: masterRecord
      });

      await ddbDocClient.send(command);
      successCount++;

      process.stdout.write(`\r   Processed ${i + 1}/${symbols.length} symbols (✅ ${successCount}, ❌ ${failCount})...`);

    } catch (error) {
      failCount++;
      console.error(`\n   ❌ Failed to insert ${symbolData.symbol}:`, error.message);
    }
  }

  console.log(`\n✅ Migration complete: ${successCount} succeeded, ${failCount} failed\n`);
}

/**
 * Main migration function
 */
async function migrate() {
  try {
    const startTime = Date.now();

    // Step 1: Extract unique symbols from positions
    const symbolsMap = await extractUniqueSymbols();

    // Step 2: Populate master table
    await populateMasterTable(symbolsMap);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('========================================');
    console.log(`✅ Migration completed in ${duration}s`);
    console.log('========================================\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrate();
