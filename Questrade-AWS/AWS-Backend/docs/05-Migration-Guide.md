# MongoDB to AWS Migration Guide

## Table of Contents
1. [Migration Overview](#migration-overview)
2. [Pre-Migration Checklist](#pre-migration-checklist)
3. [Data Export from MongoDB](#data-export-from-mongodb)
4. [Data Transformation](#data-transformation)
5. [DynamoDB Import](#dynamodb-import)
6. [Code Migration](#code-migration)
7. [Testing Strategy](#testing-strategy)
8. [Cutover Plan](#cutover-plan)
9. [Rollback Plan](#rollback-plan)

---

## Migration Overview

### Migration Phases

**Phase 1: Infrastructure Setup (Week 1)**
- Create DynamoDB tables
- Deploy Lambda functions (read-only mode)
- Configure API Gateway
- Setup monitoring and alarms

**Phase 2: Data Migration (Week 2)**
- Export MongoDB collections
- Transform data format
- Import to DynamoDB
- Validate data integrity

**Phase 3: Parallel Testing (Week 3)**
- Run both MongoDB and DynamoDB
- Compare responses
- Fix discrepancies
- Performance testing

**Phase 4: Cutover (Week 4)**
- Switch frontend to new API
- Monitor for 48 hours
- Decommission MongoDB
- Celebrate!

---

## Pre-Migration Checklist

### Infrastructure
- [ ] AWS account setup
- [ ] IAM users/roles created
- [ ] VPC configuration (if needed)
- [ ] Parameter Store secrets configured
- [ ] CloudWatch alarms configured

### Database
- [ ] All DynamoDB tables created
- [ ] GSIs configured
- [ ] TTL enabled on appropriate tables
- [ ] Point-in-time recovery enabled
- [ ] Backup strategy in place

### Lambda Functions
- [ ] All 7 Lambda functions deployed
- [ ] Environment variables configured
- [ ] IAM permissions granted
- [ ] CloudWatch logs enabled
- [ ] Test invocations successful

### API Gateway
- [ ] HTTP API created
- [ ] All routes configured
- [ ] Lambda integrations working
- [ ] Authorizer configured
- [ ] CORS enabled
- [ ] Throttling configured

### Monitoring
- [ ] CloudWatch dashboards created
- [ ] Alarms configured
- [ ] SNS topics for notifications
- [ ] Error tracking setup

### Data
- [ ] MongoDB backup created
- [ ] Data export scripts ready
- [ ] Transformation scripts tested
- [ ] Import scripts tested
- [ ] Validation scripts ready

---

## Data Export from MongoDB

### Export All Collections

**Collections to Export:**
1. users
2. persons
3. tokens
4. accounts
5. positions
6. activities
7. symbols
8. watchlists
9. watchlistSymbols (or equivalent)
10. syncHistory

### Export Script (Node.js)

```javascript
// scripts/export-mongodb.js
const MongoClient = require('mongodb').MongoClient;
const fs = require('fs');
const path = require('path');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/questrade';
const EXPORT_DIR = './exports';

// Collections to export
const collections = [
  'users',
  'persons',
  'tokens',
  'accounts',
  'positions',
  'activities',
  'symbols',
  'watchlists',
  'syncHistory'
];

async function exportCollection(db, collectionName) {
  console.log(`Exporting ${collectionName}...`);

  const collection = db.collection(collectionName);
  const count = await collection.countDocuments();

  console.log(`Total documents: ${count}`);

  // Export in batches
  const batchSize = 1000;
  let skip = 0;
  let allDocs = [];

  while (skip < count) {
    const docs = await collection.find({})
      .skip(skip)
      .limit(batchSize)
      .toArray();

    allDocs = allDocs.concat(docs);
    skip += batchSize;

    console.log(`Exported ${Math.min(skip, count)}/${count} documents`);
  }

  // Write to file
  const filename = path.join(EXPORT_DIR, `${collectionName}.json`);
  fs.writeFileSync(filename, JSON.stringify(allDocs, null, 2));

  console.log(`Saved to ${filename}`);
  console.log('');

  return allDocs.length;
}

async function main() {
  // Create export directory
  if (!fs.existsSync(EXPORT_DIR)) {
    fs.mkdirSync(EXPORT_DIR);
  }

  // Connect to MongoDB
  const client = await MongoClient.connect(MONGO_URI);
  const db = client.db();

  console.log('Connected to MongoDB');
  console.log('Starting export...\n');

  const stats = {};

  // Export all collections
  for (const collectionName of collections) {
    try {
      stats[collectionName] = await exportCollection(db, collectionName);
    } catch (error) {
      console.error(`Error exporting ${collectionName}:`, error.message);
      stats[collectionName] = 0;
    }
  }

  // Close connection
  await client.close();

  // Print summary
  console.log('Export Summary:');
  console.log('===============');
  for (const [collection, count] of Object.entries(stats)) {
    console.log(`${collection}: ${count} documents`);
  }

  const total = Object.values(stats).reduce((a, b) => a + b, 0);
  console.log(`\nTotal: ${total} documents`);
}

main().catch(console.error);
```

**Usage:**
```bash
# Set MongoDB connection string
export MONGODB_URI="mongodb://username:password@host:27017/questrade"

# Run export
node scripts/export-mongodb.js
```

**Output:**
```
exports/
├── users.json
├── persons.json
├── tokens.json
├── accounts.json
├── positions.json
├── activities.json
├── symbols.json
├── watchlists.json
└── syncHistory.json
```

---

## Data Transformation

### Transformation Rules

#### 1. Date to Timestamp
```javascript
// MongoDB: Date object
{ createdAt: ISODate("2025-10-27T12:00:00.000Z") }

// DynamoDB: Unix timestamp (milliseconds)
{ createdAt: 1730000000000 }
```

#### 2. ObjectId to String
```javascript
// MongoDB: ObjectId
{ _id: ObjectId("507f1f77bcf86cd799439011") }

// DynamoDB: String with prefix
{ userId: "usr_507f1f77bcf86cd799439011" }
```

#### 3. Nested Objects
```javascript
// MongoDB: Nested object
{ preferences: { theme: "dark", lang: "en" } }

// DynamoDB: Map (same structure)
{ preferences: { theme: "dark", lang: "en" } }
```

#### 4. Arrays
```javascript
// MongoDB: Array
{ errors: ["Error 1", "Error 2"] }

// DynamoDB: List (same structure)
{ errors: ["Error 1", "Error 2"] }
```

### Transformation Script

```javascript
// scripts/transform-data.js
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const EXPORT_DIR = './exports';
const TRANSFORM_DIR = './transformed';

// Transform functions
function transformDate(value) {
  if (!value) return null;
  if (value.$date) return new Date(value.$date).getTime();
  if (value instanceof Date) return value.getTime();
  return new Date(value).getTime();
}

function transformObjectId(value, prefix = '') {
  if (!value) return null;
  if (value.$oid) return prefix + value.$oid;
  if (typeof value === 'object' && value.toString) {
    return prefix + value.toString();
  }
  return prefix + value;
}

function transformUser(doc) {
  return {
    userId: transformObjectId(doc._id, 'usr_'),
    username: doc.username,
    password: doc.password,
    displayName: doc.displayName,
    email: doc.email || null,
    role: doc.role || 'admin',
    isActive: doc.isActive !== false,
    lastLogin: transformDate(doc.lastLogin),
    loginAttempts: doc.loginAttempts || 0,
    lockUntil: transformDate(doc.lockUntil),
    createdAt: transformDate(doc.createdAt),
    updatedAt: transformDate(doc.updatedAt)
  };
}

function transformPerson(doc) {
  return {
    personName: doc.personName,
    userId: doc.userId || null,
    displayName: doc.displayName,
    email: doc.email || null,
    preferences: doc.preferences || {},
    isActive: doc.isActive !== false,
    createdAt: transformDate(doc.createdAt),
    updatedAt: transformDate(doc.updatedAt),
    lastSyncAt: transformDate(doc.lastSyncAt)
  };
}

function transformToken(doc) {
  return {
    personName: doc.personName,
    tokenType: doc.tokenType || 'access',
    token: doc.token,
    expiresAt: transformDate(doc.expiresAt),
    issuedAt: transformDate(doc.issuedAt),
    apiServer: doc.apiServer,
    accountType: doc.accountType || 'Practice',
    createdAt: transformDate(doc.createdAt),
    updatedAt: transformDate(doc.updatedAt)
  };
}

function transformAccount(doc) {
  return {
    accountId: doc.accountId || doc.number,
    personName: doc.personName,
    type: doc.type,
    number: doc.number,
    status: doc.status || 'Active',
    isPrimary: doc.isPrimary || false,
    isBilling: doc.isBilling || false,
    clientAccountType: doc.clientAccountType,
    currency: doc.currency || 'CAD',
    balance: doc.balance || 0,
    totalEquity: doc.totalEquity || 0,
    buyingPower: doc.buyingPower || 0,
    maintenanceExcess: doc.maintenanceExcess || 0,
    isMarginAccount: doc.isMarginAccount || false,
    createdAt: transformDate(doc.createdAt),
    updatedAt: transformDate(doc.updatedAt),
    lastSyncAt: transformDate(doc.lastSyncAt)
  };
}

function transformPosition(doc) {
  return {
    accountId: doc.accountId,
    symbolId: doc.symbolId,
    personName: doc.personName,
    symbol: doc.symbol,
    symbolDescription: doc.symbolDescription || doc.description,
    openQuantity: doc.openQuantity || 0,
    closedQuantity: doc.closedQuantity || 0,
    currentMarketValue: doc.currentMarketValue || 0,
    currentPrice: doc.currentPrice || 0,
    averageEntryPrice: doc.averageEntryPrice || 0,
    closedPnL: doc.closedPnL || 0,
    openPnL: doc.openPnL || 0,
    totalCost: doc.totalCost || 0,
    isRealTime: doc.isRealTime || false,
    isUnderReorg: doc.isUnderReorg || false,
    currency: doc.currency || 'USD',
    createdAt: transformDate(doc.createdAt),
    updatedAt: transformDate(doc.updatedAt),
    lastSyncAt: transformDate(doc.lastSyncAt)
  };
}

function transformActivity(doc) {
  return {
    accountId: doc.accountId,
    activityDateTime: transformDate(doc.activityDateTime || doc.transactionDate),
    activityId: doc.activityId || transformObjectId(doc._id, 'act_'),
    personName: doc.personName,
    tradeDate: transformDate(doc.tradeDate),
    transactionDate: transformDate(doc.transactionDate),
    settlementDate: transformDate(doc.settlementDate),
    action: doc.action,
    symbol: doc.symbol || '',
    symbolId: doc.symbolId || 0,
    description: doc.description,
    currency: doc.currency || 'CAD',
    quantity: doc.quantity || 0,
    price: doc.price || 0,
    grossAmount: doc.grossAmount || 0,
    commission: doc.commission || 0,
    netAmount: doc.netAmount || 0,
    type: doc.type,
    createdAt: transformDate(doc.createdAt),
    lastSyncAt: transformDate(doc.lastSyncAt)
  };
}

function transformSymbol(doc) {
  return {
    symbolId: doc.symbolId,
    symbol: doc.symbol,
    symbolName: doc.symbolName || doc.description,
    description: doc.description,
    securityType: doc.securityType || 'Stock',
    listingExchange: doc.listingExchange,
    currency: doc.currency || 'USD',
    isQuotable: doc.isQuotable !== false,
    isTradable: doc.isTradable !== false,
    sector: doc.sector || null,
    industry: doc.industry || null,
    marketCap: doc.marketCap || null,
    dividendYield: doc.dividendYield || null,
    lastUpdated: transformDate(doc.lastUpdated),
    createdAt: transformDate(doc.createdAt)
  };
}

function transformWatchlist(doc) {
  return {
    watchlistId: doc.watchlistId || transformObjectId(doc._id, 'wl_'),
    personName: doc.personName,
    name: doc.name,
    description: doc.description || '',
    isDefault: doc.isDefault || false,
    sortOrder: doc.sortOrder || 0,
    createdAt: transformDate(doc.createdAt),
    updatedAt: transformDate(doc.updatedAt)
  };
}

function transformSyncHistory(doc) {
  return {
    personName: doc.personName,
    syncTimestamp: transformDate(doc.syncTimestamp || doc.createdAt),
    syncId: doc.syncId || transformObjectId(doc._id, 'sync_'),
    syncType: doc.syncType || 'full',
    status: doc.status || 'success',
    recordsSynced: doc.recordsSynced || 0,
    duration: doc.duration || 0,
    errors: doc.errors || [],
    expiresAt: transformDate(doc.createdAt) + (90 * 24 * 60 * 60 * 1000), // 90 days from now
    createdAt: transformDate(doc.createdAt)
  };
}

// Transform collection
function transformCollection(collectionName, docs) {
  console.log(`Transforming ${collectionName}... (${docs.length} documents)`);

  const transformers = {
    users: transformUser,
    persons: transformPerson,
    tokens: transformToken,
    accounts: transformAccount,
    positions: transformPosition,
    activities: transformActivity,
    symbols: transformSymbol,
    watchlists: transformWatchlist,
    syncHistory: transformSyncHistory
  };

  const transformer = transformers[collectionName];
  if (!transformer) {
    console.warn(`No transformer for ${collectionName}, skipping`);
    return [];
  }

  const transformed = [];
  const errors = [];

  for (const doc of docs) {
    try {
      const transformedDoc = transformer(doc);
      transformed.push(transformedDoc);
    } catch (error) {
      errors.push({ doc, error: error.message });
    }
  }

  if (errors.length > 0) {
    console.warn(`  Errors: ${errors.length}/${docs.length}`);
    const errorFile = path.join(TRANSFORM_DIR, `${collectionName}_errors.json`);
    fs.writeFileSync(errorFile, JSON.stringify(errors, null, 2));
  }

  console.log(`  Transformed: ${transformed.length}/${docs.length}`);
  return transformed;
}

async function main() {
  // Create transform directory
  if (!fs.existsSync(TRANSFORM_DIR)) {
    fs.mkdirSync(TRANSFORM_DIR);
  }

  console.log('Starting transformation...\n');

  const files = fs.readdirSync(EXPORT_DIR).filter(f => f.endsWith('.json'));

  for (const file of files) {
    const collectionName = path.basename(file, '.json');
    const inputPath = path.join(EXPORT_DIR, file);
    const outputPath = path.join(TRANSFORM_DIR, file);

    // Read input
    const docs = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

    // Transform
    const transformed = transformCollection(collectionName, docs);

    // Write output
    fs.writeFileSync(outputPath, JSON.stringify(transformed, null, 2));
    console.log(`  Saved to ${outputPath}\n`);
  }

  console.log('Transformation complete!');
}

main().catch(console.error);
```

**Usage:**
```bash
node scripts/transform-data.js
```

---

## DynamoDB Import

### Import Methods

**Option 1: AWS CLI (Batch Write)**
- Good for small datasets (< 100K items)
- Simple and straightforward
- No additional code needed

**Option 2: Custom Script (Recommended)**
- Better for large datasets
- Batch writes (25 items max)
- Error handling and retry logic
- Progress tracking

**Option 3: AWS Data Pipeline**
- Best for very large datasets (> 1M items)
- Parallel import
- Automatic retries
- Cost: $1/day + compute

### Import Script (Node.js)

```javascript
// scripts/import-dynamodb.js
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const fs = require('fs');
const path = require('path');

const TRANSFORM_DIR = './transformed';
const BATCH_SIZE = 25; // DynamoDB limit
const DELAY_MS = 100; // Delay between batches

// Table mapping
const tableNames = {
  users: 'questrade-users',
  persons: 'questrade-persons',
  tokens: 'questrade-tokens',
  accounts: 'questrade-accounts',
  positions: 'questrade-positions',
  activities: 'questrade-activities',
  symbols: 'questrade-symbols',
  watchlists: 'questrade-watchlists',
  syncHistory: 'questrade-sync-history'
};

// Initialize DynamoDB client
const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);

// Delay function
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function batchWrite(tableName, items) {
  const requestItems = {
    [tableName]: items.map(item => ({
      PutRequest: { Item: item }
    }))
  };

  try {
    const command = new BatchWriteCommand({ RequestItems: requestItems });
    const response = await docClient.send(command);

    // Handle unprocessed items
    if (response.UnprocessedItems && Object.keys(response.UnprocessedItems).length > 0) {
      console.warn('  Unprocessed items, retrying...');
      await delay(1000);
      return batchWrite(tableName,
        response.UnprocessedItems[tableName].map(item => item.PutRequest.Item)
      );
    }

    return true;
  } catch (error) {
    console.error('  Batch write error:', error.message);
    throw error;
  }
}

async function importCollection(collectionName, docs) {
  const tableName = tableNames[collectionName];
  if (!tableName) {
    console.warn(`No table mapping for ${collectionName}, skipping`);
    return;
  }

  console.log(`Importing ${collectionName} to ${tableName}... (${docs.length} items)`);

  let imported = 0;
  let errors = 0;

  // Split into batches
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = docs.slice(i, i + BATCH_SIZE);

    try {
      await batchWrite(tableName, batch);
      imported += batch.length;
      console.log(`  Progress: ${imported}/${docs.length}`);

      // Delay to avoid throttling
      await delay(DELAY_MS);
    } catch (error) {
      errors += batch.length;
      console.error(`  Failed batch at ${i}`);
    }
  }

  console.log(`  Imported: ${imported}, Errors: ${errors}\n`);

  return { imported, errors };
}

async function main() {
  console.log('Starting DynamoDB import...\n');

  const files = fs.readdirSync(TRANSFORM_DIR).filter(f =>
    f.endsWith('.json') && !f.endsWith('_errors.json')
  );

  const stats = {};

  for (const file of files) {
    const collectionName = path.basename(file, '.json');
    const filePath = path.join(TRANSFORM_DIR, file);

    // Read file
    const docs = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Import
    try {
      stats[collectionName] = await importCollection(collectionName, docs);
    } catch (error) {
      console.error(`Failed to import ${collectionName}:`, error.message);
      stats[collectionName] = { imported: 0, errors: docs.length };
    }
  }

  // Print summary
  console.log('Import Summary:');
  console.log('===============');
  for (const [collection, stat] of Object.entries(stats)) {
    console.log(`${collection}: ${stat.imported} imported, ${stat.errors} errors`);
  }

  const totalImported = Object.values(stats).reduce((sum, s) => sum + s.imported, 0);
  const totalErrors = Object.values(stats).reduce((sum, s) => sum + s.errors, 0);
  console.log(`\nTotal: ${totalImported} imported, ${totalErrors} errors`);
}

main().catch(console.error);
```

**Usage:**
```bash
# Set AWS credentials
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_REGION="us-east-1"

# Run import
node scripts/import-dynamodb.js
```

---

## Code Migration

### Update Lambda Functions

**Before (MongoDB):**
```javascript
const { MongoClient } = require('mongodb');

const client = await MongoClient.connect(process.env.MONGODB_URI);
const db = client.db('questrade');

// Find user
const user = await db.collection('users').findOne({ username: 'johndoe' });

// Insert account
await db.collection('accounts').insertOne(accountData);

// Update position
await db.collection('positions').updateOne(
  { accountId: '12345', symbolId: 8049 },
  { $set: { currentPrice: 175.00 } }
);
```

**After (DynamoDB):**
```javascript
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);

// Find user (Query GSI)
const { Item: user } = await docClient.send(new GetCommand({
  TableName: 'questrade-users',
  Key: { userId: 'usr_123' }
}));

// Insert account
await docClient.send(new PutCommand({
  TableName: 'questrade-accounts',
  Item: accountData
}));

// Update position
await docClient.send(new UpdateCommand({
  TableName: 'questrade-positions',
  Key: { accountId: '12345', symbolId: 8049 },
  UpdateExpression: 'SET currentPrice = :price',
  ExpressionAttributeValues: { ':price': 175.00 }
}));
```

### Query Pattern Changes

**MongoDB (Find with filter):**
```javascript
const accounts = await db.collection('accounts').find({
  personName: 'john_questrade'
}).toArray();
```

**DynamoDB (Query GSI):**
```javascript
const { Items: accounts } = await docClient.send(new QueryCommand({
  TableName: 'questrade-accounts',
  IndexName: 'personName-index',
  KeyConditionExpression: 'personName = :personName',
  ExpressionAttributeValues: {
    ':personName': 'john_questrade'
  }
}));
```

---

## Testing Strategy

### 1. Data Validation

**Verify Record Counts:**
```bash
# MongoDB
mongo questrade --eval "db.users.count()"

# DynamoDB
aws dynamodb scan --table-name questrade-users --select COUNT
```

**Verify Data Integrity:**
```javascript
// scripts/validate-data.js
// Compare MongoDB vs DynamoDB data
// Check for missing records
// Verify transformations
```

### 2. API Testing

**Parallel Testing:**
- Keep MongoDB running
- Deploy Lambda functions with DynamoDB
- Use feature flag to switch between databases
- Compare responses

**Test Cases:**
- Login flow
- CRUD operations
- Complex queries
- Error handling
- Performance benchmarks

### 3. Load Testing

```bash
# Use Apache Bench
ab -n 1000 -c 10 https://api.yourdomain.com/api/accounts/john_questrade

# Use Artillery
artillery quick --count 100 --num 10 https://api.yourdomain.com/api/accounts/john_questrade
```

---

## Cutover Plan

### Day Before Cutover
1. Final data sync from MongoDB
2. Verify all Lambda functions deployed
3. Test critical flows
4. Brief stakeholders
5. Prepare rollback plan

### Cutover Day (Low Traffic Time)
1. Put application in maintenance mode
2. Final MongoDB export and DynamoDB import
3. Update frontend API URLs
4. Deploy frontend
5. Remove maintenance mode
6. Monitor intensely for 2 hours

### Post-Cutover (48 Hours)
1. Monitor CloudWatch metrics
2. Check error logs
3. User acceptance testing
4. Performance monitoring
5. Address any issues immediately

### Decommission (After 1 Week)
1. Verify no MongoDB calls
2. Export final MongoDB backup
3. Stop MongoDB instances
4. Delete MongoDB resources
5. Update documentation

---

## Rollback Plan

### Triggers for Rollback
- Error rate > 10%
- Critical functionality broken
- Data integrity issues
- Performance degradation > 50%

### Rollback Steps
1. Switch frontend back to old API
2. Revert Lambda environment variables to MongoDB
3. Redeploy old Lambda code
4. Verify MongoDB still running
5. Test critical flows
6. Notify stakeholders

### Rollback Testing
- Test rollback in staging environment
- Time the rollback (should be < 10 minutes)
- Document rollback procedures
- Assign rollback decision maker

---

## Migration Checklist

### Pre-Migration
- [ ] Create all AWS resources
- [ ] Deploy Lambda functions
- [ ] Configure API Gateway
- [ ] Export MongoDB data
- [ ] Transform data
- [ ] Import to DynamoDB
- [ ] Validate data integrity

### Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Load tests pass
- [ ] Parallel testing completed
- [ ] Performance benchmarks met
- [ ] Error handling verified

### Cutover
- [ ] Stakeholders notified
- [ ] Maintenance window scheduled
- [ ] Final data sync completed
- [ ] Frontend updated
- [ ] Cutover executed
- [ ] Monitoring active

### Post-Migration
- [ ] No critical errors
- [ ] Performance acceptable
- [ ] User acceptance passed
- [ ] Documentation updated
- [ ] Team trained
- [ ] MongoDB decommissioned

---

## Troubleshooting

### Common Issues

**1. Data Import Fails**
```
Error: ProvisionedThroughputExceededException
Solution: Increase batch delay, use on-demand mode
```

**2. Query Returns Empty**
```
Error: No items found
Solution: Check GSI configuration, verify data imported correctly
```

**3. Lambda Timeout**
```
Error: Task timed out after 10 seconds
Solution: Increase timeout, optimize queries, add pagination
```

**4. CORS Errors**
```
Error: CORS policy blocked
Solution: Update CORS configuration in API Gateway
```

---

## References
- [DynamoDB Migration Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Migration.html)
- [AWS Database Migration Service](https://aws.amazon.com/dms/)
- [MongoDB to DynamoDB Migration Guide](https://aws.amazon.com/blogs/database/how-to-migrate-from-mongodb-to-amazon-dynamodb/)
