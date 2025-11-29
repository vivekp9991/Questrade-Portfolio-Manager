# Phase 1: Testing Guide

## Overview
This guide will help you test the 5 new Phase 1 endpoints after deployment.

## Prerequisites
1. Deploy the updated SAM application:
   ```bash
   sam build
   sam deploy --no-confirm-changeset
   ```
2. Import the updated Postman collection: `Questrade-Portfolio-API.postman_collection.json`
3. Set your JWT token in Postman environment variable: `{{jwtToken}}`

## API Endpoint
```
https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev
```

## Phase 1 Endpoints

### 1. Sync Accounts Only ⭐ NEW
**Endpoint:** `POST /api/sync/accounts/:personName`
**Purpose:** Syncs ONLY accounts for a person (faster than full sync)

**Test in Postman:**
- Request: "Sync Accounts Only"
- Set `personName` to "Vivek"
- Click Send

**Expected Response:**
```json
{
  "success": true,
  "message": "Account sync completed successfully",
  "data": {
    "personName": "Vivek",
    "syncId": "Vivek-1234567890",
    "syncType": "accounts",
    "status": "completed",
    "accounts": 4,
    "duration": 2345
  }
}
```

**Automated Tests:**
- ✓ Status code is 200
- ✓ Sync type is 'accounts'
- ✓ Response contains accounts count

---

### 2. Sync Positions Only ⭐ NEW
**Endpoint:** `POST /api/sync/positions/:personName`
**Purpose:** Syncs ONLY current positions for all accounts

**Test in Postman:**
- Request: "Sync Positions Only"
- Set `personName` to "Vivek"
- Click Send

**Expected Response:**
```json
{
  "success": true,
  "message": "Position sync completed successfully",
  "data": {
    "personName": "Vivek",
    "syncId": "Vivek-1234567890",
    "syncType": "positions",
    "status": "completed",
    "positions": 92,
    "duration": 5678
  }
}
```

**Automated Tests:**
- ✓ Status code is 200
- ✓ Sync type is 'positions'
- ✓ Response contains positions count

---

### 3. Sync Activities Only ⭐ NEW
**Endpoint:** `POST /api/sync/activities/:personName`
**Purpose:** Syncs ONLY activities (1 year history) for all accounts

**Test in Postman:**
- Request: "Sync Activities Only"
- Set `personName` to "Vivek"
- Click Send

**Expected Response:**
```json
{
  "success": true,
  "message": "Activity sync completed successfully",
  "data": {
    "personName": "Vivek",
    "syncId": "Vivek-1234567890",
    "syncType": "activities",
    "status": "completed",
    "activities": 176,
    "duration": 12345
  }
}
```

**Automated Tests:**
- ✓ Status code is 200
- ✓ Sync type is 'activities'
- ✓ Response contains activities count

---

### 4. Get Sync Status ⭐ NEW
**Endpoint:** `GET /api/sync/status`
**Purpose:** Gets current sync status for all persons

**Test in Postman:**
- Request: "Get Sync Status"
- Click Send

**Expected Response:**
```json
{
  "success": true,
  "message": "Sync status retrieved",
  "data": [
    {
      "personName": "Vivek",
      "lastSync": 1234567890000,
      "lastSyncType": "full",
      "status": "completed",
      "accounts": 4,
      "positions": 92,
      "activities": 176
    },
    {
      "personName": "Miral",
      "lastSync": 1234567890000,
      "lastSyncType": "accounts",
      "status": "completed",
      "accounts": 2
    }
  ]
}
```

**Automated Tests:**
- ✓ Status code is 200
- ✓ Response contains status array
- ✓ Each person has lastSync timestamp

---

### 5. Get Sync History ⭐ NEW
**Endpoint:** `GET /api/sync/history`
**Purpose:** Gets sync history with optional filters

**Test in Postman:**
- Request: "Get Sync History"
- Click Send (with default limit=50)

**Query Parameters (all optional):**
- `limit` - Number of records (default: 50)
- `personName` - Filter by person (e.g., "Vivek")
- `status` - Filter by status ("completed", "failed", "in_progress")
- `syncType` - Filter by type ("full", "accounts", "positions", "activities")

**Expected Response:**
```json
{
  "success": true,
  "message": "Sync history retrieved",
  "data": [
    {
      "personName": "Vivek",
      "syncTimestamp": 1234567890000,
      "syncType": "accounts",
      "status": "completed",
      "startTime": 1234567890000,
      "endTime": 1234567892345,
      "duration": 2345,
      "stats": {
        "accounts": 4
      }
    },
    {
      "personName": "Vivek",
      "syncTimestamp": 1234567880000,
      "syncType": "full",
      "status": "completed",
      "startTime": 1234567880000,
      "endTime": 1234567900000,
      "duration": 20000,
      "stats": {
        "accounts": 4,
        "positions": 92,
        "activities": 176
      }
    }
  ]
}
```

**Automated Tests:**
- ✓ Status code is 200
- ✓ Response contains history array
- ✓ History records have required fields (personName, syncTimestamp, syncType, status)

**Test with Filters:**
1. Enable `personName=Vivek` query param → should only return Vivek's history
2. Enable `status=completed` → should only return completed syncs
3. Enable `syncType=accounts` → should only return account syncs
4. Combine filters → should return records matching ALL filters

---

## Testing Workflow

### Step 1: Authentication
1. Run "Login User" request to get JWT token
2. Token is automatically saved to `{{jwtToken}}` variable

### Step 2: Test Individual Syncs
Run these in order to test selective syncing:

1. **Sync Accounts Only** → Should sync 4 accounts (~2-3 seconds)
2. **Get Sync Status** → Verify accounts were synced
3. **Sync Positions Only** → Should sync ~92 positions (~5-10 seconds)
4. **Get Sync Status** → Verify positions were synced
5. **Sync Activities Only** → Should sync ~176 activities (~10-15 seconds)
6. **Get Sync Status** → Verify activities were synced

### Step 3: Check History
1. **Get Sync History** → Should show all 3 syncs
2. Enable `syncType=accounts` filter → Should show only accounts sync
3. Enable `personName=Vivek` filter → Should show only Vivek's syncs

### Step 4: Full Sync Comparison
1. **Trigger Person Sync** (full sync) → Should sync everything (~15-20 seconds)
2. Compare timing:
   - Full sync: ~15-20 seconds
   - Accounts only: ~2-3 seconds ✨
   - Positions only: ~5-10 seconds ✨
   - Activities only: ~10-15 seconds ✨

---

## Troubleshooting

### 404 Not Found
- Verify deployment completed successfully
- Check API Gateway has the new routes:
  ```bash
  aws apigatewayv2 get-routes --api-id 1p9dtyfkgi --region us-east-1
  ```
- Redeploy if routes are missing:
  ```bash
  sam build && sam deploy --no-confirm-changeset
  ```

### 401 Unauthorized
- Your JWT token expired (30 min lifetime)
- Run "Login User" request again to get a fresh token

### 500 Internal Server Error
- Check CloudWatch Logs:
  ```bash
  aws logs tail /aws/lambda/questrade-portfolio-backend-SyncOperationsFunction --follow
  ```
- Common issues:
  - Missing DynamoDB permissions
  - Invalid personName (person doesn't exist)
  - Questrade token expired

### Empty Results
- Person might not have been synced yet
- Run a full sync first: "Trigger Person Sync"
- Then test selective syncs

---

## Success Criteria

Phase 1 is complete when:

- ✅ All 5 endpoints return 200 status
- ✅ Sync accounts returns accounts count
- ✅ Sync positions returns positions count
- ✅ Sync activities returns activities count
- ✅ Get sync status shows all persons
- ✅ Get sync history shows all syncs
- ✅ Filters work on sync history
- ✅ All Postman tests pass (green checkmarks)
- ✅ Selective syncs are faster than full sync

---

## Next Steps After Phase 1

Once Phase 1 is verified:

1. **Phase 2: Data Retrieval** (6 endpoints)
   - Get accounts by person
   - Get account summary
   - Get dropdown options
   - Get account details
   - Get positions by person
   - Get activities by person

2. **Compare Responses with Localhost**
   - Run same requests against localhost microservices
   - Ensure AWS responses match localhost format exactly
   - UI must work with AWS endpoints without changes

---

## Quick Test Command

Run all Phase 1 tests at once using Postman Collection Runner:

1. Open Postman Collection Runner
2. Select "6. Sync Operations" folder
3. Set environment to "AWS Production"
4. Click "Run 6. Sync Operations"
5. All tests should pass ✅

**Expected Results:**
- 7 requests executed
- 0 failed tests
- All response times < 30 seconds
