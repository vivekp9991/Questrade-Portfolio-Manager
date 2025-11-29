# Phase 2: Data Retrieval Testing Guide

## Overview
This guide will help you test the 6 new Phase 2 Data Retrieval endpoints after deployment.

## Prerequisites
1. Deploy the updated SAM application:
   ```bash
   sam build
   sam deploy --no-confirm-changeset
   ```
2. Import the updated Postman collection: `Questrade-Portfolio-API.postman_collection.json`
3. Set your JWT token in Postman environment variable: `{{jwtToken}}`
4. **IMPORTANT**: Sync data first by running "Sync All Persons" or "Trigger Person Sync" before testing

## API Endpoint
```
https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev
```

## Phase 2 Endpoints

### 1. Get Person Accounts ⭐ NEW
**Endpoint:** `GET /api/accounts/:personName`
**Purpose:** Get all accounts for a specific person (sorted by isPrimary and totalEquity)

**Test in Postman:**
- Request: "Get Person Accounts"
- Set `personName` to "Vivek"
- Click Send

**Expected Response:**
```json
{
  "success": true,
  "message": "Retrieved 4 accounts for Vivek",
  "data": [
    {
      "accountId": "53413547",
      "number": "53413547",
      "type": "TFSA",
      "personName": "Vivek",
      "isPrimary": true,
      "status": "Active",
      "summary": {
        "totalEquityCAD": 145623.45,
        "cashCAD": 5234.12,
        "marketValueCAD": 140389.33
      },
      "lastSyncTime": 1761663350601
    },
    ...
  ]
}
```

**Automated Tests:**
- ✓ Status code is 200
- ✓ Response contains accounts array

---

### 2. Get Account Summary ⭐ NEW
**Endpoint:** `GET /api/accounts/summary/:personName`
**Purpose:** Get account summary totals for a person

**Test in Postman:**
- Request: "Get Account Summary"
- Set `personName` to "Vivek"
- Click Send

**Expected Response:**
```json
{
  "success": true,
  "message": "Account summary for Vivek",
  "data": {
    "totalEquityCAD": 287456.89,
    "totalCashCAD": 12345.67,
    "totalMarketValueCAD": 275111.22,
    "accountCount": 4
  }
}
```

**Automated Tests:**
- ✓ Status code is 200
- ✓ Response contains totalEquityCAD
- ✓ Response contains accountCount

**Use Cases:**
- Display total portfolio value in dashboard
- Show combined account summary
- Calculate net worth

---

### 3. Get Account Dropdown Options ⭐ NEW
**Endpoint:** `GET /api/accounts/dropdown-options?personName={personName}`
**Purpose:** Get account options formatted for UI dropdowns

**Test in Postman:**
- Request: "Get Account Dropdown Options"
- Query param: `personName=Vivek` (or leave empty for all persons)
- Click Send

**Expected Response:**
```json
{
  "success": true,
  "message": "Account dropdown options retrieved",
  "data": [
    {
      "value": "53413547",
      "label": "TFSA - 53413547 (Primary)",
      "personName": "Vivek",
      "accountType": "TFSA",
      "isPrimary": true
    },
    {
      "value": "40058790",
      "label": "RRSP - 40058790",
      "personName": "Vivek",
      "accountType": "RRSP",
      "isPrimary": false
    },
    ...
  ]
}
```

**Automated Tests:**
- ✓ Status code is 200
- ✓ Response contains dropdown options array
- ✓ Each option has value and label

**Use Cases:**
- Populate account selection dropdowns in UI
- Filter data by account
- Account selector components

---

### 4. Get Account Detail ⭐ NEW
**Endpoint:** `GET /api/accounts/detail/:accountId`
**Purpose:** Get detailed information for a specific account

**Test in Postman:**
- Request: "Get Account Detail"
- Set `accountId` to "53413547"
- Click Send

**Expected Response:**
```json
{
  "success": true,
  "message": "Account details retrieved",
  "data": {
    "accountId": "53413547",
    "number": "53413547",
    "type": "TFSA",
    "personName": "Vivek",
    "isPrimary": true,
    "status": "Active",
    "clientAccountType": "Individual",
    "summary": {
      "totalEquityCAD": 145623.45,
      "cashCAD": 5234.12,
      "marketValueCAD": 140389.33,
      "buyingPowerCAD": 5234.12
    },
    "lastSyncTime": 1761663350601
  }
}
```

**Automated Tests:**
- ✓ Status code is 200
- ✓ Response contains accountId
- ✓ Response contains number

**Use Cases:**
- Display account details page
- Show full account information
- Account management

---

### 5. Get Person Positions ⭐ NEW
**Endpoint:** `GET /api/positions/person/:personName?aggregated=true`
**Purpose:** Get all positions for a person (optionally aggregated by symbol)

**Test in Postman:**
- Request: "Get Person Positions"
- Set `personName` to "Vivek"
- Query param: `aggregated=true` (default)
- Click Send

**Expected Response (Aggregated=true):**
```json
{
  "success": true,
  "message": "Retrieved 45 aggregated positions for Vivek",
  "data": {
    "aggregated": true,
    "personName": "Vivek",
    "positions": [
      {
        "symbol": "TD.TO",
        "personName": "Vivek",
        "openQuantity": 250,
        "currentMarketValue": 18750.00,
        "currentPrice": 75.00,
        "averageEntryPrice": 68.50,
        "totalCost": 17125.00,
        "openPnl": 1625.00,
        "accounts": [
          {
            "accountId": "53413547",
            "openQuantity": 150,
            "currentMarketValue": 11250.00
          },
          {
            "accountId": "40058790",
            "openQuantity": 100,
            "currentMarketValue": 7500.00
          }
        ]
      },
      ...
    ],
    "count": 45
  }
}
```

**Expected Response (Aggregated=false):**
```json
{
  "success": true,
  "message": "Retrieved 92 positions for Vivek",
  "data": {
    "aggregated": false,
    "personName": "Vivek",
    "positions": [
      {
        "positionId": "53413547_TD.TO",
        "accountId": "53413547",
        "personName": "Vivek",
        "symbol": "TD.TO",
        "openQuantity": 150,
        "currentMarketValue": 11250.00,
        "currentPrice": 75.00,
        "averageEntryPrice": 70.00,
        "totalCost": 10500.00,
        "openPnl": 750.00
      },
      ...
    ],
    "count": 92
  }
}
```

**Automated Tests:**
- ✓ Status code is 200
- ✓ Response contains positions data
- ✓ positions is an array

**Use Cases:**
- Portfolio overview page
- Holdings summary
- Position tracking across accounts
- Symbol-level aggregation for consolidated view

**Query Parameters:**
- `aggregated=true` (default) - Aggregates positions by symbol across all accounts
- `aggregated=false` - Returns raw positions per account

---

### 6. Get Person Activities ⭐ NEW
**Endpoint:** `GET /api/activities/person/:personName?limit=100`
**Purpose:** Get all activities for a person with optional filters

**Test in Postman:**
- Request: "Get Person Activities"
- Set `personName` to "Vivek"
- Query params (all optional):
  - `limit=100` (default)
  - `type=Dividend` (filter by activity type)
  - `symbol=TD` (filter by symbol)
  - `startDate=2024-01-01` (filter by date range)
  - `endDate=2024-12-31`
- Click Send

**Expected Response:**
```json
{
  "success": true,
  "message": "Retrieved 176 activities for Vivek",
  "data": {
    "personName": "Vivek",
    "activities": [
      {
        "activityDateTime": "2024-11-27T15:30:00_0_123456",
        "accountId": "53413547",
        "personName": "Vivek",
        "transactionDate": "2024-11-27T15:30:00-05:00",
        "type": "Dividend",
        "symbol": "TD.TO",
        "description": "TD BANK Cash Dividend",
        "netAmount": 95.50,
        "currency": "CAD",
        "symbolId": 123456
      },
      {
        "activityDateTime": "2024-11-25T10:15:00_1_987654",
        "accountId": "40058790",
        "personName": "Vivek",
        "transactionDate": "2024-11-25T10:15:00-05:00",
        "type": "Buy",
        "symbol": "AAPL",
        "description": "APPLE INC",
        "quantity": 10,
        "price": 185.50,
        "netAmount": -1855.00,
        "commission": 5.00,
        "currency": "USD",
        "symbolId": 987654
      },
      ...
    ],
    "count": 176,
    "filters": {
      "type": null,
      "symbol": null,
      "startDate": null,
      "endDate": null,
      "limit": 100
    }
  }
}
```

**Automated Tests:**
- ✓ Status code is 200
- ✓ Response contains activities data
- ✓ activities is an array

**Use Cases:**
- Transaction history page
- Activity feed
- Dividend tracking
- Trade history
- Tax reporting

**Query Parameters:**
- `limit` - Number of activities to return (default: 100)
- `type` - Filter by activity type (Buy, Sell, Dividend, Deposit, Withdrawal, etc.)
- `symbol` - Filter by specific symbol
- `startDate` - Filter from this date (YYYY-MM-DD)
- `endDate` - Filter to this date (YYYY-MM-DD)

---

## Testing Workflow

### Step 1: Prerequisites
1. Run "Login User" to get JWT token
2. Run "Sync All Persons" or "Trigger Person Sync" for Vivek
3. Verify sync completed successfully

### Step 2: Test Account Endpoints
Run in order:

1. **Get Person Accounts** → Should return 4 accounts for Vivek
2. **Get Account Summary** → Should show total equity, cash, market value
3. **Get Account Dropdown Options** → Should return UI-friendly options
4. **Get Account Detail** → Should show full details for account 53413547

### Step 3: Test Position Endpoint
1. **Get Person Positions** (aggregated=true) → Should return ~45 aggregated positions
2. **Get Person Positions** (aggregated=false) → Should return ~92 raw positions
3. Compare: Aggregated should have fewer positions (combined by symbol)

### Step 4: Test Activity Endpoint
1. **Get Person Activities** (no filters) → Should return up to 100 activities
2. Enable `type=Dividend` filter → Should only return dividend activities
3. Enable `symbol=TD` filter → Should only return TD-related activities
4. Enable date range filters → Should return activities within range

---

## Troubleshooting

### 404 Not Found
- Verify deployment completed successfully
- Check API Gateway has the new routes:
  ```bash
  aws apigatewayv2 get-routes --api-id 1p9dtyfkgi --region us-east-1 | grep -E "accounts|positions|activities"
  ```
- Redeploy if routes are missing

### Empty Arrays
- **Problem**: Endpoints return empty arrays `[]`
- **Solution**: Sync data first! Run "Sync All Persons" before testing retrieval endpoints
- Data must exist in DynamoDB before you can retrieve it

### 401 Unauthorized
- JWT token expired (30 min lifetime)
- Run "Login User" again

### 500 Internal Server Error
- Check CloudWatch Logs:
  ```bash
  aws logs tail /aws/lambda/questrade-data-read-service-dev --follow
  ```
- Common issues:
  - Missing DynamoDB permissions
  - Invalid personName (person doesn't exist)
  - Missing required indexes

### Wrong Response Format
- Compare with localhost response
- Check if response structure matches localhost
- Report differences for fixing

---

## Success Criteria

Phase 2 is complete when:

- ✅ All 6 endpoints return 200 status
- ✅ Get Person Accounts returns accounts array
- ✅ Get Account Summary returns totals
- ✅ Get Account Dropdown Options returns UI options
- ✅ Get Account Detail returns full account info
- ✅ Get Person Positions returns positions (both aggregated and raw)
- ✅ Get Person Activities returns activities with filters working
- ✅ All Postman tests pass (green checkmarks)
- ✅ Responses match expected format

---

## Response Format Comparison

After testing, compare responses with localhost:

1. **Run same request** on localhost microservices (port 4002)
2. **Run same request** on AWS Lambda
3. **Compare** response structures
4. **Report** any differences

**Localhost URL**: `http://localhost:4002`
**AWS URL**: `https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev`

**Example Comparison**:
```bash
# Localhost
curl http://localhost:4002/api/accounts/Vivek

# AWS
curl https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev/api/accounts/Vivek -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Both should return identical data structure (different values OK, structure must match).

---

## Next Steps After Phase 2

Once Phase 2 is verified:

1. **Test with UI** - Point your frontend to AWS endpoints
2. **Verify UI functionality** - Ensure dropdowns, tables, charts work
3. **Phase 3 (if needed)** - Advanced features (position/activity summaries, stats)
4. **Performance testing** - Test with multiple users, large data sets
5. **Documentation** - Document API for frontend developers

---

## Quick Test Command

Run all Phase 2 tests at once using Postman Collection Runner:

1. Open Postman Collection Runner
2. Select "7. Data Read" folder
3. Filter to only Phase 2 requests (ones with ⭐ NEW)
4. Set environment to "AWS Production"
5. Click "Run 7. Data Read"

**Expected Results:**
- 6 Phase 2 requests executed
- 0 failed tests
- All response times < 5 seconds
- All data matches synced data

---

## Phase 2 Benefits

These 6 endpoints enable your UI to:

✅ **Display account lists** - Show all accounts with balances
✅ **Show account summaries** - Total portfolio value across accounts
✅ **Populate dropdowns** - Account selectors in UI components
✅ **Display account details** - Full account information pages
✅ **Show portfolio positions** - Holdings view (aggregated or detailed)
✅ **Display activity history** - Transaction feed with filters

This completes the **Data Retrieval API** needed for your portfolio management UI!
