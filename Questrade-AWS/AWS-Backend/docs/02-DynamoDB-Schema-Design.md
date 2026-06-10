# DynamoDB Schema Design

## Table of Contents
1. [Overview](#overview)
2. [Table Designs](#table-designs)
3. [Access Patterns](#access-patterns)
4. [GSI Strategy](#gsi-strategy)
5. [Data Migration Mapping](#data-migration-mapping)

---

## Overview

### Design Philosophy
- **Multiple tables approach** (not single-table design)
- Each entity gets its own table for simplicity
- Strategic use of GSIs for alternate access patterns
- On-demand billing for cost efficiency

### Total Tables: 10
1. Users (login system)
2. Persons (Questrade account holders)
3. Tokens (Questrade OAuth tokens)
4. Accounts (Questrade accounts)
5. Positions (Portfolio positions)
6. Activities (Trading activities)
7. Symbols (Stock/ETF/Option symbols)
8. Watchlists (User watchlists)
9. WatchlistSymbols (Many-to-many relationship)
10. SyncHistory (Sync operation logs)

---

## Table Designs

### Table 1: Users
**Purpose:** User authentication and authorization

```
Table Name: questrade-users
Billing Mode: On-Demand
Encryption: SSE (AWS Managed)
Point-in-time Recovery: Enabled

Primary Key:
- PK (Partition Key): userId (String) - UUID v4
- SK (Sort Key): None (simple primary key)

Attributes:
- userId: String (PK) - e.g., "usr_1a2b3c4d"
- username: String - lowercase, unique
- password: String - bcrypt hashed
- displayName: String
- email: String (optional)
- role: String - "admin" | "user"
- isActive: Boolean
- lastLogin: Number (timestamp)
- loginAttempts: Number
- lockUntil: Number (timestamp, null if not locked)
- createdAt: Number (timestamp)
- updatedAt: Number (timestamp)

Global Secondary Indexes (GSI):
GSI1: username-index
- PK: username (String)
- Projection: ALL
- Purpose: Login lookup by username

GSI2: email-index (optional)
- PK: email (String)
- Projection: ALL
- Purpose: User lookup by email
```

**Example Item:**
```json
{
  "userId": "usr_1a2b3c4d5e6f",
  "username": "johndoe",
  "password": "$2a$10$abc123...",
  "displayName": "John Doe",
  "email": "john@example.com",
  "role": "admin",
  "isActive": true,
  "lastLogin": 1730000000000,
  "loginAttempts": 0,
  "lockUntil": null,
  "createdAt": 1729000000000,
  "updatedAt": 1730000000000
}
```

**Access Patterns:**
- Login by username (GSI1)
- Get user by userId (PK)
- Find user by email (GSI2)
- List all users (Scan - admin only)

---

### Table 2: Persons
**Purpose:** Questrade account holders linked to users

```
Table Name: questrade-persons
Billing Mode: On-Demand

Primary Key:
- PK: personName (String) - e.g., "john_questrade"
- SK: None

Attributes:
- personName: String (PK) - unique identifier
- userId: String - links to Users table
- displayName: String
- email: String
- preferences: Map - user preferences JSON
- isActive: Boolean
- createdAt: Number (timestamp)
- updatedAt: Number (timestamp)
- lastSyncAt: Number (timestamp)

Global Secondary Indexes:
GSI1: userId-index
- PK: userId (String)
- Projection: ALL
- Purpose: Get all persons for a user
```

**Example Item:**
```json
{
  "personName": "john_questrade",
  "userId": "usr_1a2b3c4d5e6f",
  "displayName": "John's Questrade Account",
  "email": "john@example.com",
  "preferences": {
    "defaultView": "portfolio",
    "refreshInterval": 300
  },
  "isActive": true,
  "createdAt": 1729000000000,
  "updatedAt": 1730000000000,
  "lastSyncAt": 1730000000000
}
```

---

### Table 3: Tokens
**Purpose:** Questrade OAuth access and refresh tokens

```
Table Name: questrade-tokens
Billing Mode: On-Demand
TTL Attribute: expiresAt (auto-delete expired tokens)

Primary Key:
- PK: personName (String)
- SK: tokenType (String) - "access" | "refresh"

Attributes:
- personName: String (PK)
- tokenType: String (SK)
- token: String - encrypted token value
- expiresAt: Number (timestamp) - TTL attribute
- issuedAt: Number (timestamp)
- apiServer: String - Questrade API server URL
- accountType: String - "Practice" | "Live"
- createdAt: Number (timestamp)
- updatedAt: Number (timestamp)

Global Secondary Indexes:
GSI1: expiresAt-index
- PK: tokenType (String)
- SK: expiresAt (Number)
- Projection: KEYS_ONLY
- Purpose: Find expiring tokens
```

**Example Items:**
```json
// Access Token
{
  "personName": "john_questrade",
  "tokenType": "access",
  "token": "abc123xyz...",
  "expiresAt": 1730003600,
  "issuedAt": 1730000000,
  "apiServer": "https://api01.iq.questrade.com",
  "accountType": "Practice",
  "createdAt": 1730000000000,
  "updatedAt": 1730000000000
}

// Refresh Token
{
  "personName": "john_questrade",
  "tokenType": "refresh",
  "token": "refresh_xyz789...",
  "expiresAt": 1732592000,
  "issuedAt": 1730000000,
  "apiServer": "https://api01.iq.questrade.com",
  "accountType": "Practice",
  "createdAt": 1730000000000,
  "updatedAt": 1730000000000
}
```

---

### Table 4: Accounts
**Purpose:** Questrade account details

```
Table Name: questrade-accounts
Billing Mode: On-Demand

Primary Key:
- PK: accountId (String) - Questrade account ID
- SK: None

Attributes:
- accountId: String (PK)
- personName: String
- type: String - "Margin", "TFSA", "RRSP", etc.
- number: String - account number
- status: String - "Active", "Closed"
- isPrimary: Boolean
- isBilling: Boolean
- clientAccountType: String
- currency: String - "CAD" | "USD"
- balance: Number
- totalEquity: Number
- buyingPower: Number
- maintenanceExcess: Number
- isMarginAccount: Boolean
- createdAt: Number (timestamp)
- updatedAt: Number (timestamp)
- lastSyncAt: Number (timestamp)

Global Secondary Indexes:
GSI1: personName-index
- PK: personName (String)
- SK: accountId (String)
- Projection: ALL
- Purpose: Get all accounts for a person
```

**Example Item:**
```json
{
  "accountId": "26598145",
  "personName": "john_questrade",
  "type": "TFSA",
  "number": "26598145",
  "status": "Active",
  "isPrimary": true,
  "isBilling": false,
  "clientAccountType": "Individual",
  "currency": "CAD",
  "balance": 50000.00,
  "totalEquity": 52500.00,
  "buyingPower": 50000.00,
  "maintenanceExcess": 0,
  "isMarginAccount": false,
  "createdAt": 1729000000000,
  "updatedAt": 1730000000000,
  "lastSyncAt": 1730000000000
}
```

---

### Table 5: Positions
**Purpose:** Current portfolio positions

```
Table Name: questrade-positions
Billing Mode: On-Demand

Primary Key:
- PK: accountId (String)
- SK: symbolId (Number) - Composite: accountId#symbolId

Attributes:
- accountId: String (PK)
- symbolId: Number (SK)
- personName: String
- symbol: String - ticker symbol
- symbolDescription: String
- openQuantity: Number
- closedQuantity: Number
- currentMarketValue: Number
- currentPrice: Number
- averageEntryPrice: Number
- closedPnL: Number
- openPnL: Number
- totalCost: Number
- isRealTime: Boolean
- isUnderReorg: Boolean
- currency: String
- createdAt: Number (timestamp)
- updatedAt: Number (timestamp)
- lastSyncAt: Number (timestamp)

Global Secondary Indexes:
GSI1: personName-symbol-index
- PK: personName (String)
- SK: symbol (String)
- Projection: ALL
- Purpose: Get all positions for a person

GSI2: symbol-index
- PK: symbol (String)
- Projection: ALL
- Purpose: Find all accounts holding a specific symbol
```

**Example Item:**
```json
{
  "accountId": "26598145",
  "symbolId": 8049,
  "personName": "john_questrade",
  "symbol": "AAPL",
  "symbolDescription": "Apple Inc.",
  "openQuantity": 100,
  "closedQuantity": 0,
  "currentMarketValue": 17500.00,
  "currentPrice": 175.00,
  "averageEntryPrice": 150.00,
  "closedPnL": 0,
  "openPnL": 2500.00,
  "totalCost": 15000.00,
  "isRealTime": true,
  "isUnderReorg": false,
  "currency": "USD",
  "createdAt": 1729000000000,
  "updatedAt": 1730000000000,
  "lastSyncAt": 1730000000000
}
```

---

### Table 6: Activities
**Purpose:** Transaction and activity history

```
Table Name: questrade-activities
Billing Mode: On-Demand

Primary Key:
- PK: accountId (String)
- SK: activityDateTime (Number) - Composite: accountId#timestamp

Attributes:
- accountId: String (PK)
- activityDateTime: Number (SK) - timestamp
- activityId: String - unique activity ID
- personName: String
- tradeDate: Number (timestamp)
- transactionDate: Number (timestamp)
- settlementDate: Number (timestamp)
- action: String - "Buy", "Sell", "Dividend", etc.
- symbol: String
- symbolId: Number
- description: String
- currency: String
- quantity: Number
- price: Number
- grossAmount: Number
- commission: Number
- netAmount: Number
- type: String - "Trades", "Dividends", "Deposits", etc.
- createdAt: Number (timestamp)
- lastSyncAt: Number (timestamp)

Global Secondary Indexes:
GSI1: personName-date-index
- PK: personName (String)
- SK: activityDateTime (Number)
- Projection: ALL
- Purpose: Get activities for a person, sorted by date

GSI2: symbol-date-index
- PK: symbol (String)
- SK: activityDateTime (Number)
- Projection: ALL
- Purpose: Get all activities for a symbol
```

**Example Item:**
```json
{
  "accountId": "26598145",
  "activityDateTime": 1730000000000,
  "activityId": "act_abc123",
  "personName": "john_questrade",
  "tradeDate": 1729900000000,
  "transactionDate": 1730000000000,
  "settlementDate": 1730200000000,
  "action": "Buy",
  "symbol": "AAPL",
  "symbolId": 8049,
  "description": "Bought 100 AAPL @ $150.00",
  "currency": "USD",
  "quantity": 100,
  "price": 150.00,
  "grossAmount": 15000.00,
  "commission": 4.95,
  "netAmount": 15004.95,
  "type": "Trades",
  "createdAt": 1730000000000,
  "lastSyncAt": 1730000000000
}
```

---

### Table 7: Symbols
**Purpose:** Stock, ETF, option symbol information

```
Table Name: questrade-symbols
Billing Mode: On-Demand

Primary Key:
- PK: symbolId (Number)
- SK: None

Attributes:
- symbolId: Number (PK)
- symbol: String
- symbolName: String
- description: String
- securityType: String - "Stock", "Option", "ETF", etc.
- listingExchange: String - "NYSE", "NASDAQ", "TSX", etc.
- currency: String
- isQuotable: Boolean
- isTradable: Boolean
- sector: String (optional)
- industry: String (optional)
- marketCap: Number (optional)
- dividendYield: Number (optional)
- lastUpdated: Number (timestamp)
- createdAt: Number (timestamp)

Global Secondary Indexes:
GSI1: symbol-index
- PK: symbol (String)
- Projection: ALL
- Purpose: Lookup by ticker symbol

GSI2: sector-index
- PK: sector (String)
- SK: symbol (String)
- Projection: ALL
- Purpose: Get all symbols in a sector
```

**Example Item:**
```json
{
  "symbolId": 8049,
  "symbol": "AAPL",
  "symbolName": "Apple Inc.",
  "description": "Apple Inc. - Common Stock",
  "securityType": "Stock",
  "listingExchange": "NASDAQ",
  "currency": "USD",
  "isQuotable": true,
  "isTradable": true,
  "sector": "Technology",
  "industry": "Consumer Electronics",
  "marketCap": 2800000000000,
  "dividendYield": 0.52,
  "lastUpdated": 1730000000000,
  "createdAt": 1729000000000
}
```

---

### Table 8: Watchlists
**Purpose:** User-created watchlists

```
Table Name: questrade-watchlists
Billing Mode: On-Demand

Primary Key:
- PK: watchlistId (String) - UUID
- SK: None

Attributes:
- watchlistId: String (PK)
- personName: String
- name: String
- description: String
- isDefault: Boolean
- sortOrder: Number
- createdAt: Number (timestamp)
- updatedAt: Number (timestamp)

Global Secondary Indexes:
GSI1: personName-index
- PK: personName (String)
- SK: sortOrder (Number)
- Projection: ALL
- Purpose: Get all watchlists for a person, sorted
```

**Example Item:**
```json
{
  "watchlistId": "wl_abc123xyz",
  "personName": "john_questrade",
  "name": "Tech Stocks",
  "description": "Technology sector stocks to watch",
  "isDefault": false,
  "sortOrder": 1,
  "createdAt": 1729000000000,
  "updatedAt": 1730000000000
}
```

---

### Table 9: WatchlistSymbols
**Purpose:** Many-to-many relationship between watchlists and symbols

```
Table Name: questrade-watchlist-symbols
Billing Mode: On-Demand

Primary Key:
- PK: watchlistId (String)
- SK: symbol (String)

Attributes:
- watchlistId: String (PK)
- symbol: String (SK)
- symbolId: Number
- notes: String (optional)
- alertPrice: Number (optional)
- alertType: String (optional) - "above" | "below"
- addedAt: Number (timestamp)
- sortOrder: Number

Global Secondary Indexes:
GSI1: symbol-index
- PK: symbol (String)
- Projection: KEYS_ONLY
- Purpose: Find which watchlists contain a symbol
```

**Example Item:**
```json
{
  "watchlistId": "wl_abc123xyz",
  "symbol": "AAPL",
  "symbolId": 8049,
  "notes": "Watch for earnings report",
  "alertPrice": 180.00,
  "alertType": "above",
  "addedAt": 1729000000000,
  "sortOrder": 1
}
```

---

### Table 10: SyncHistory
**Purpose:** Track synchronization operations

```
Table Name: questrade-sync-history
Billing Mode: On-Demand
TTL Attribute: expiresAt (keep only 90 days of history)

Primary Key:
- PK: personName (String)
- SK: syncTimestamp (Number) - timestamp

Attributes:
- personName: String (PK)
- syncTimestamp: Number (SK)
- syncId: String - UUID
- syncType: String - "full" | "accounts" | "positions" | "activities"
- status: String - "success" | "failed" | "partial"
- recordsSynced: Number
- duration: Number - milliseconds
- errors: List - array of error messages
- expiresAt: Number (timestamp) - TTL (90 days)
- createdAt: Number (timestamp)

Global Secondary Indexes:
GSI1: status-date-index
- PK: status (String)
- SK: syncTimestamp (Number)
- Projection: ALL
- Purpose: Find failed syncs
```

**Example Item:**
```json
{
  "personName": "john_questrade",
  "syncTimestamp": 1730000000000,
  "syncId": "sync_abc123",
  "syncType": "full",
  "status": "success",
  "recordsSynced": 1523,
  "duration": 4567,
  "errors": [],
  "expiresAt": 1737763200,
  "createdAt": 1730000000000
}
```

---

## Access Patterns

### User Authentication
1. **Login by username**
   - Query: GSI1 on Users table (username-index)
   - Pattern: `username = "johndoe"`

2. **Get user by ID**
   - Query: Primary key on Users table
   - Pattern: `userId = "usr_1a2b3c4d"`

### Person Management
3. **Get person by name**
   - Query: Primary key on Persons table
   - Pattern: `personName = "john_questrade"`

4. **Get all persons for a user**
   - Query: GSI1 on Persons table (userId-index)
   - Pattern: `userId = "usr_1a2b3c4d"`

### Account Data
5. **Get all accounts for a person**
   - Query: GSI1 on Accounts table (personName-index)
   - Pattern: `personName = "john_questrade"`

6. **Get account details**
   - Query: Primary key on Accounts table
   - Pattern: `accountId = "26598145"`

### Position Data
7. **Get all positions for an account**
   - Query: Primary key on Positions table
   - Pattern: `accountId = "26598145"`

8. **Get all positions for a person**
   - Query: GSI1 on Positions table (personName-symbol-index)
   - Pattern: `personName = "john_questrade"`

9. **Find who holds a symbol**
   - Query: GSI2 on Positions table (symbol-index)
   - Pattern: `symbol = "AAPL"`

### Activity History
10. **Get activities for an account**
    - Query: Primary key on Activities table
    - Pattern: `accountId = "26598145"`, sort by `activityDateTime`

11. **Get activities for a person**
    - Query: GSI1 on Activities table (personName-date-index)
    - Pattern: `personName = "john_questrade"`, sort by date

12. **Get recent activities (with date filter)**
    - Query: GSI1 on Activities table
    - Pattern: `personName = "john_questrade" AND activityDateTime > 1729000000000`

### Watchlists
13. **Get all watchlists for a person**
    - Query: GSI1 on Watchlists table (personName-index)
    - Pattern: `personName = "john_questrade"`

14. **Get symbols in a watchlist**
    - Query: Primary key on WatchlistSymbols table
    - Pattern: `watchlistId = "wl_abc123"`

15. **Find watchlists containing a symbol**
    - Query: GSI1 on WatchlistSymbols table (symbol-index)
    - Pattern: `symbol = "AAPL"`

---

## GSI Strategy

### Why Use GSIs?
- Enable alternate access patterns without full table scans
- Improve query performance
- Reduce read capacity consumption

### GSI Design Principles
1. **Project ALL** when attributes are frequently accessed together
2. **Project KEYS_ONLY** when only checking existence
3. **Keep GSI simple** - usually one or two attributes
4. **Sparse indexes** - not all items need to be in GSI

### GSI Count Summary
- Users: 2 GSIs (username, email)
- Persons: 1 GSI (userId)
- Tokens: 1 GSI (expiring tokens)
- Accounts: 1 GSI (personName)
- Positions: 2 GSIs (personName-symbol, symbol)
- Activities: 2 GSIs (personName-date, symbol-date)
- Symbols: 2 GSIs (symbol, sector)
- Watchlists: 1 GSI (personName)
- WatchlistSymbols: 1 GSI (symbol)
- SyncHistory: 1 GSI (status-date)

**Total GSIs: 14**

---

## Data Migration Mapping

### MongoDB to DynamoDB Field Mapping

#### Users Collection → Users Table
```
MongoDB                  → DynamoDB
_id                      → userId (transform to "usr_" prefix)
username                 → username
password                 → password (already hashed)
displayName              → displayName
email                    → email
role                     → role
isActive                 → isActive
lastLogin (Date)         → lastLogin (timestamp)
loginAttempts            → loginAttempts
lockUntil (Date)         → lockUntil (timestamp)
createdAt (Date)         → createdAt (timestamp)
updatedAt (Date)         → updatedAt (timestamp)
```

#### Persons Collection → Persons Table
```
MongoDB                  → DynamoDB
personName               → personName
displayName              → displayName
email                    → email
preferences (Object)     → preferences (Map)
isActive                 → isActive
createdAt (Date)         → createdAt (timestamp)
updatedAt (Date)         → updatedAt (timestamp)
lastSyncAt (Date)        → lastSyncAt (timestamp)
```

#### Tokens Collection → Tokens Table
```
MongoDB                  → DynamoDB
personName               → personName (PK)
tokenType                → tokenType (SK)
token                    → token
expiresAt (Date)         → expiresAt (timestamp)
issuedAt (Date)          → issuedAt (timestamp)
apiServer                → apiServer
accountType              → accountType
createdAt (Date)         → createdAt (timestamp)
updatedAt (Date)         → updatedAt (timestamp)
```

#### Similar mapping for other collections...

### Data Type Transformations
```
Date → Number (timestamp: Date.getTime())
ObjectId → String (transform to prefixed UUID)
Object → Map (nested structure preserved)
Array → List (ordered array)
Boolean → Boolean (no change)
Number → Number (no change)
String → String (no change)
```

---

## Capacity Planning

### Initial Configuration
- **Billing Mode:** On-Demand (auto-scaling)
- **Read Capacity:** Auto-scaled
- **Write Capacity:** Auto-scaled

### When to Switch to Provisioned
- Predictable traffic patterns
- Sustained throughput > 40 RCU or > 40 WCU
- Cost optimization for steady-state workloads

### Estimated Capacity (100K requests/month)
```
Read Operations:
- Users: 10K reads/month → ~0.4 RCU avg
- Persons: 10K reads/month → ~0.4 RCU avg
- Accounts: 20K reads/month → ~0.8 RCU avg
- Positions: 30K reads/month → ~1.2 RCU avg
- Activities: 20K reads/month → ~0.8 RCU avg
Total: ~3.6 RCU average

Write Operations:
- Sync operations: 5K writes/month → ~0.2 WCU avg
- User updates: 2K writes/month → ~0.08 WCU avg
Total: ~0.3 WCU average
```

---

## Best Practices

### 1. Key Design
- Use meaningful partition keys (avoid hot partitions)
- Composite sort keys for hierarchical data
- UUID for globally unique identifiers

### 2. Attribute Design
- Store timestamps as numbers (milliseconds since epoch)
- Use consistent naming (camelCase)
- Avoid nested objects > 2 levels deep

### 3. Query Optimization
- Always query with partition key
- Use sort key ranges for filtering
- Avoid scans (use GSIs instead)
- Batch operations when possible

### 4. Cost Optimization
- Use TTL to auto-delete old data
- On-demand for unpredictable workloads
- Provisioned for steady traffic
- Sparse indexes to reduce GSI costs

### 5. Security
- Enable encryption at rest
- Use IAM roles (not access keys)
- Enable point-in-time recovery
- Audit with CloudTrail

---

## Migration Checklist

- [ ] Create all 10 DynamoDB tables
- [ ] Configure TTL on Tokens and SyncHistory tables
- [ ] Create all 14 GSIs
- [ ] Enable point-in-time recovery on all tables
- [ ] Enable encryption (SSE)
- [ ] Export MongoDB collections to JSON
- [ ] Transform data (dates to timestamps, ObjectIds to strings)
- [ ] Batch import to DynamoDB
- [ ] Validate record counts
- [ ] Test all access patterns
- [ ] Update Lambda functions to use DynamoDB SDK
- [ ] Run parallel testing (MongoDB + DynamoDB)
- [ ] Complete cutover

---

## References
- [DynamoDB Data Modeling](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-modeling-nosql.html)
- [DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)
- [GSI Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-indexes.html)
