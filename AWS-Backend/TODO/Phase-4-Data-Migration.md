# Phase 4: MongoDB Data Migration

**Duration:** 2-3 days
**Goal:** Export data from MongoDB, transform for DynamoDB, and import to AWS

---

## **Checklist**

### **4.1 Prepare MongoDB for Export**

- [ ] Verify MongoDB connection
  ```bash
  # Test connection to MongoDB
  mongo --host localhost --port 27017
  # Or if remote:
  mongo "mongodb://username:password@host:27017/questrade"
  ```

- [ ] Check existing collections
  ```mongo
  use questrade
  show collections
  ```
  - [ ] List all collections
  - [ ] Note collection names and document counts

- [ ] Count documents in each collection
  ```mongo
  db.users.count()
  db.persons.count()
  db.tokens.count()
  db.accounts.count()
  db.positions.count()
  db.activities.count()
  db.symbols.count()
  db.watchlists.count()
  db.syncHistory.count()
  ```

- [ ] Record counts for validation later
  ```
  users: _____
  persons: _____
  tokens: _____
  accounts: _____
  positions: _____
  activities: _____
  symbols: _____
  watchlists: _____
  syncHistory: _____
  Total: _____
  ```

- [ ] Create MongoDB backup (safety first!)
  ```bash
  mongodump --db questrade --out ./mongodb-backup
  ```

**Verification:**
```bash
✅ MongoDB connection works
✅ All collections listed
✅ Document counts recorded
✅ Backup created
```

---

### **4.2 Create Export Scripts**

- [ ] Create scripts directory (if not exists)
  ```bash
  mkdir -p scripts/migration
  cd scripts/migration
  ```

- [ ] Create export-mongodb.js
  - [ ] Connection to MongoDB
  - [ ] Export users collection
  - [ ] Export persons collection
  - [ ] Export tokens collection
  - [ ] Export accounts collection
  - [ ] Export positions collection
  - [ ] Export activities collection
  - [ ] Export symbols collection
  - [ ] Export watchlists collection
  - [ ] Export syncHistory collection
  - [ ] Write to JSON files in exports/ directory

- [ ] Create package.json for migration scripts
  ```bash
  npm init -y
  ```

- [ ] Install dependencies
  ```bash
  npm install mongodb
  ```

- [ ] Test export script
  ```bash
  node export-mongodb.js
  ```

**Verification:**
```bash
✅ export-mongodb.js created
✅ Dependencies installed
✅ Script runs without errors
```

---

### **4.3 Export MongoDB Data**

- [ ] Create exports directory
  ```bash
  mkdir -p exports
  ```

- [ ] Set MongoDB connection string
  ```bash
  export MONGODB_URI="mongodb://localhost:27017/questrade"
  # Or with auth:
  export MONGODB_URI="mongodb://username:password@host:27017/questrade"
  ```

- [ ] Run export script
  ```bash
  node export-mongodb.js
  ```

- [ ] Verify exports created
  ```bash
  ls -lh exports/
  ```
  - [ ] users.json
  - [ ] persons.json
  - [ ] tokens.json
  - [ ] accounts.json
  - [ ] positions.json
  - [ ] activities.json
  - [ ] symbols.json
  - [ ] watchlists.json
  - [ ] syncHistory.json

- [ ] Check file sizes (should not be 0 bytes)
  ```bash
  du -sh exports/*.json
  ```

- [ ] Verify JSON is valid
  ```bash
  # Test one file
  cat exports/users.json | jq . > /dev/null
  echo $?  # Should output: 0 (success)
  ```

- [ ] Count records in exported files
  ```bash
  cat exports/users.json | jq 'length'
  cat exports/persons.json | jq 'length'
  # ... repeat for all files
  ```

- [ ] Verify counts match MongoDB
  - [ ] users: matches count
  - [ ] persons: matches count
  - [ ] (etc.)

**Verification:**
```bash
✅ All JSON files created
✅ File sizes reasonable (not 0 bytes)
✅ JSON is valid
✅ Record counts match MongoDB
```

---

### **4.4 Create Transformation Scripts**

- [ ] Create transform-data.js
  - [ ] Transform users collection
    - [ ] Convert _id to userId with "usr_" prefix
    - [ ] Convert Date objects to timestamps
    - [ ] Transform boolean fields

  - [ ] Transform persons collection
    - [ ] Keep personName as-is
    - [ ] Convert dates to timestamps

  - [ ] Transform tokens collection
    - [ ] Create composite key (personName + tokenType)
    - [ ] Convert expiresAt to timestamp (for TTL)

  - [ ] Transform accounts collection
    - [ ] Use accountId as primary key
    - [ ] Convert dates to timestamps

  - [ ] Transform positions collection
    - [ ] Create composite key (accountId + symbolId)
    - [ ] Convert dates to timestamps

  - [ ] Transform activities collection
    - [ ] Create composite key (accountId + activityDateTime)
    - [ ] Convert all dates to timestamps

  - [ ] Transform symbols collection
    - [ ] Use symbolId as primary key
    - [ ] Convert dates to timestamps

  - [ ] Transform watchlists collection
    - [ ] Generate watchlistId if missing
    - [ ] Convert dates to timestamps

  - [ ] Transform syncHistory collection
    - [ ] Create composite key (personName + syncTimestamp)
    - [ ] Set expiresAt (90 days from now)

- [ ] Install additional dependencies
  ```bash
  npm install uuid date-fns
  ```

- [ ] Test transformation script
  ```bash
  node transform-data.js
  ```

**Verification:**
```bash
✅ transform-data.js created
✅ All transformations defined
✅ Script runs without errors
```

---

### **4.5 Transform Data**

- [ ] Create transformed directory
  ```bash
  mkdir -p transformed
  ```

- [ ] Run transformation
  ```bash
  node transform-data.js
  ```

- [ ] Verify transformed files created
  ```bash
  ls -lh transformed/
  ```
  - [ ] users.json
  - [ ] persons.json
  - [ ] tokens.json
  - [ ] accounts.json
  - [ ] positions.json
  - [ ] activities.json
  - [ ] symbols.json
  - [ ] watchlists.json
  - [ ] syncHistory.json

- [ ] Verify record counts (should match exports)
  ```bash
  cat transformed/users.json | jq 'length'
  cat transformed/persons.json | jq 'length'
  # ... repeat for all
  ```

- [ ] Spot-check transformations
  ```bash
  # Check users - should have userId, createdAt as number
  cat transformed/users.json | jq '.[0]'

  # Check tokens - should have personName, tokenType
  cat transformed/tokens.json | jq '.[0]'

  # Check activities - should have accountId, activityDateTime as number
  cat transformed/activities.json | jq '.[0]'
  ```

- [ ] Check for transformation errors
  ```bash
  # Look for error files
  ls transformed/*_errors.json

  # If exist, review errors
  cat transformed/users_errors.json | jq .
  ```

**Verification:**
```bash
✅ All transformed files created
✅ Record counts match original exports
✅ Data format looks correct (timestamps, not Date objects)
✅ No critical transformation errors
```

---

### **4.6 Create Import Scripts**

- [ ] Create import-dynamodb.js
  - [ ] Initialize DynamoDB client
  - [ ] Map collection names to table names
  - [ ] Implement batch write function (max 25 items)
  - [ ] Add retry logic for throttling
  - [ ] Import users → questrade-users
  - [ ] Import persons → questrade-persons
  - [ ] Import tokens → questrade-tokens
  - [ ] Import accounts → questrade-accounts
  - [ ] Import positions → questrade-positions
  - [ ] Import activities → questrade-activities
  - [ ] Import symbols → questrade-symbols
  - [ ] Import watchlists → questrade-watchlists
  - [ ] Import syncHistory → questrade-sync-history

- [ ] Install AWS SDK
  ```bash
  npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
  ```

- [ ] Test import script (dry run)
  ```bash
  # Add --dry-run flag to script
  node import-dynamodb.js --dry-run
  ```

**Verification:**
```bash
✅ import-dynamodb.js created
✅ AWS SDK installed
✅ Dry run completes without errors
```

---

### **4.7 Import Data to DynamoDB**

- [ ] Verify AWS credentials
  ```bash
  aws sts get-caller-identity
  ```

- [ ] Verify DynamoDB tables exist
  ```bash
  aws dynamodb list-tables --region us-east-1
  ```
  - [ ] questrade-users exists
  - [ ] questrade-persons exists
  - [ ] questrade-tokens exists
  - [ ] questrade-accounts exists
  - [ ] questrade-positions exists
  - [ ] questrade-activities exists
  - [ ] questrade-symbols exists
  - [ ] questrade-watchlists exists
  - [ ] questrade-watchlist-symbols exists
  - [ ] questrade-sync-history exists

- [ ] Set AWS region
  ```bash
  export AWS_REGION=us-east-1
  ```

- [ ] Run import (start with small table first)
  ```bash
  # Test with users table first
  node import-dynamodb.js --table users
  ```

- [ ] Verify users imported
  ```bash
  aws dynamodb scan --table-name questrade-users --select COUNT
  ```

- [ ] If successful, import remaining tables
  ```bash
  node import-dynamodb.js
  ```

- [ ] Monitor progress
  - [ ] Watch for batch write errors
  - [ ] Note any throttling warnings
  - [ ] Track progress percentage

- [ ] Wait for completion
  - [ ] Small tables (< 1000 items): 1-5 minutes
  - [ ] Medium tables (1000-10000 items): 5-15 minutes
  - [ ] Large tables (> 10000 items): 15+ minutes

**Verification:**
```bash
✅ Import script completes
✅ No critical errors
✅ All batches processed
```

---

### **4.8 Validate Data Migration**

- [ ] Count items in each DynamoDB table
  ```bash
  aws dynamodb scan --table-name questrade-users --select COUNT
  aws dynamodb scan --table-name questrade-persons --select COUNT
  aws dynamodb scan --table-name questrade-tokens --select COUNT
  aws dynamodb scan --table-name questrade-accounts --select COUNT
  aws dynamodb scan --table-name questrade-positions --select COUNT
  aws dynamodb scan --table-name questrade-activities --select COUNT
  aws dynamodb scan --table-name questrade-symbols --select COUNT
  aws dynamodb scan --table-name questrade-watchlists --select COUNT
  aws dynamodb scan --table-name questrade-sync-history --select COUNT
  ```

- [ ] Compare counts with MongoDB
  ```
  Table: users
    MongoDB: _____
    DynamoDB: _____
    Match: ✅ / ❌

  Table: persons
    MongoDB: _____
    DynamoDB: _____
    Match: ✅ / ❌

  (Repeat for all tables)
  ```

- [ ] Verify specific records
  ```bash
  # Get a user from DynamoDB
  aws dynamodb get-item \
    --table-name questrade-users \
    --key '{"userId":{"S":"usr_xxxxx"}}'

  # Compare with MongoDB export
  cat exports/users.json | jq '.[] | select(._id.$oid=="xxxxx")'
  ```

- [ ] Check GSIs exist and populated
  ```bash
  # Describe users table
  aws dynamodb describe-table --table-name questrade-users
  # Check GlobalSecondaryIndexes section
  # Verify username-index exists and has ItemCount
  ```

- [ ] Spot-check data integrity
  - [ ] Pick random user → verify all fields present
  - [ ] Pick random account → verify linked to correct person
  - [ ] Pick random position → verify accountId and symbolId
  - [ ] Pick random activity → verify dates are timestamps (not strings)

**Verification:**
```bash
✅ All record counts match MongoDB
✅ Sample records verified
✅ GSIs populated
✅ Data types correct (timestamps as numbers)
✅ No data corruption
```

---

### **4.9 Create Test User (for Testing)**

- [ ] Create a test user directly in DynamoDB
  ```bash
  node -e "
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('password123', 10);
  console.log(hash);
  "
  # Copy the hash
  ```

- [ ] Put test user in DynamoDB
  ```bash
  aws dynamodb put-item \
    --table-name questrade-users \
    --item '{
      "userId": {"S": "usr_test123"},
      "username": {"S": "testuser"},
      "password": {"S": "$2a$10$...hashed-password..."},
      "displayName": {"S": "Test User"},
      "email": {"S": "test@example.com"},
      "role": {"S": "admin"},
      "isActive": {"BOOL": true},
      "loginAttempts": {"N": "0"},
      "createdAt": {"N": "1730000000000"},
      "updatedAt": {"N": "1730000000000"}
    }'
  ```

- [ ] Verify test user created
  ```bash
  aws dynamodb get-item \
    --table-name questrade-users \
    --key '{"userId":{"S":"usr_test123"}}'
  ```

- [ ] Create test person for test user
  ```bash
  aws dynamodb put-item \
    --table-name questrade-persons \
    --item '{
      "personName": {"S": "test_person"},
      "userId": {"S": "usr_test123"},
      "displayName": {"S": "Test Person"},
      "isActive": {"BOOL": true},
      "createdAt": {"N": "1730000000000"},
      "updatedAt": {"N": "1730000000000"}
    }'
  ```

**Verification:**
```bash
✅ Test user created
✅ Test person created
✅ Linked via userId
✅ Can query via username GSI
```

---

### **4.10 Document Migration**

- [ ] Create migration-report.md
  ```markdown
  # Data Migration Report

  **Date:** 2025-10-27
  **Duration:** X hours
  **Status:** ✅ Success

  ## Summary
  - Exported 9 collections from MongoDB
  - Transformed X,XXX documents
  - Imported to 10 DynamoDB tables
  - Zero data loss

  ## Record Counts
  | Collection/Table | MongoDB | DynamoDB | Status |
  |------------------|---------|----------|--------|
  | users            | 5       | 5        | ✅     |
  | persons          | 3       | 3        | ✅     |
  | tokens           | 6       | 6        | ✅     |
  | accounts         | 10      | 10       | ✅     |
  | positions        | 150     | 150      | ✅     |
  | activities       | 500     | 500      | ✅     |
  | symbols          | 200     | 200      | ✅     |
  | watchlists       | 5       | 5        | ✅     |
  | syncHistory      | 50      | 50       | ✅     |
  | **Total**        | **929** | **929**  | ✅     |

  ## Issues
  - None

  ## Next Steps
  - Test APIs with migrated data
  - Update Lambda functions if needed
  - Decommission MongoDB (after 1 week)
  ```

- [ ] Save migration artifacts
  ```bash
  # Create migration-YYYY-MM-DD/ folder
  mkdir -p migration-artifacts-2025-10-27

  # Copy exports, transformed, and scripts
  cp -r exports/ migration-artifacts-2025-10-27/
  cp -r transformed/ migration-artifacts-2025-10-27/
  cp scripts/migration/*.js migration-artifacts-2025-10-27/

  # Zip for archival
  tar -czf migration-artifacts-2025-10-27.tar.gz migration-artifacts-2025-10-27/
  ```

- [ ] Commit to Git
  ```bash
  git add migration-report.md
  git add scripts/migration/
  git commit -m "docs: Add data migration report and scripts"
  ```

**Verification:**
```bash
✅ Migration report created
✅ Artifacts saved
✅ Committed to Git
```

---

## **Completion Criteria**

**Phase 4 is complete when:**
- ✅ All MongoDB data exported
- ✅ Data transformed for DynamoDB
- ✅ All data imported to DynamoDB
- ✅ Record counts validated (match MongoDB)
- ✅ Data integrity verified
- ✅ Test user/person created
- ✅ GSIs populated
- ✅ Migration documented
- ✅ Ready for Phase 5 (API Testing)

**Estimated Time:** 4-8 hours (depending on data volume)

---

## **Troubleshooting**

### **Issue: Export fails - Connection timeout**
**Solution:**
- Check MongoDB is running
- Verify connection string
- Check firewall/network settings

### **Issue: Transformation fails - Invalid date**
**Solution:**
- Check date format in MongoDB
- Handle null dates gracefully
- Use fallback timestamp

### **Issue: Import fails - ProvisionedThroughputExceededException**
**Solution:**
- Reduce batch size (use 10 instead of 25)
- Add delay between batches (100-500ms)
- Temporarily switch to provisioned capacity

### **Issue: Record count mismatch**
**Solution:**
- Check for duplicates (primary key conflicts)
- Review error logs
- Verify transformation didn't filter records
- Re-import missing records

### **Issue: GSI not populated**
**Solution:**
- Wait a few minutes (GSI population is async)
- Check table status in AWS Console
- Verify GSI attributes exist in items

---

## **Next Phase**

👉 **[Phase 5: API Testing with Postman](Phase-5-API-Testing-Postman.md)**
