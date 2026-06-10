# AWS Lambda Deployment Steps

## Changes Made (Ready to Deploy)

### 1. **Cash Balances Fix**
- **File**: `lambda-functions/portfolio-analytics/src/handlers/cashBalances.js`
- **Issue**: Handler was expecting old data format, but sync service stores data in `account.summary` structure
- **Fix**: Updated to read from `summary.cashCAD` and `summary.cashUSD`, transform to `cashBalances` array

### 2. **Activities Sync Date Bug Fix**
- **File**: `lambda-functions/sync-operations/src/services/syncService.js`
- **Issue**: Date chunking logic created chunks extending into the future, causing Questrade API 400 errors
- **Fix**: Added break condition to stop creating chunks when `currentStart >= now`

## How to Deploy

### Option 1: Using SAM CLI (Recommended)

```bash
# Navigate to AWS-Backend directory
cd D:\Project\3\AWS-Backend

# Build the SAM application
sam build

# Deploy to AWS (will prompt for confirmation)
sam deploy

# Or deploy without prompts (uses saved config)
sam deploy --no-confirm-changeset
```

### Option 2: Using AWS Console

1. **Zip the Lambda functions**:
   ```bash
   cd D:\Project\3\AWS-Backend\lambda-functions\portfolio-analytics
   zip -r portfolio-analytics.zip .

   cd D:\Project\3\AWS-Backend\lambda-functions\sync-operations
   zip -r sync-operations.zip .
   ```

2. **Upload via AWS Console**:
   - Go to AWS Lambda console
   - Find `PortfolioAnalyticsFunction`
   - Upload `portfolio-analytics.zip`
   - Find `SyncOperationsFunction`
   - Upload `sync-operations.zip`

### Option 3: Manual Deployment via PowerShell

```powershell
# Open PowerShell in AWS-Backend directory
cd D:\Project\3\AWS-Backend

# Build
& 'C:\Users\shopc\AppData\Local\Programs\SAM\sam.cmd' build

# Deploy
& 'C:\Users\shopc\AppData\Local\Programs\SAM\sam.cmd' deploy --no-confirm-changeset
```

## After Deployment

### 1. Test Cash Balances
- Refresh the frontend page (Ctrl+Shift+R)
- Cash should now display:
  - Expected: CAD $34,356.13, USD $26,106.03
  - Currently showing: $0.00

### 2. Test Activities Sync
- Click SYNC button
- Activities should now sync successfully (no more 400 errors)
- Check CloudWatch logs - should see activities being fetched

### 3. Test YoC Calculation
- After successful activities sync
- Refresh page
- YoC should display correctly (currently showing 0.00%)
- Should show actual yield based on dividend data

## Expected Results

### Before Deployment:
- ❌ Cash: $0.00 (wrong)
- ❌ YoC: 0.00% (missing dividend data)
- ❌ Activities sync: failing with 400 errors

### After Deployment:
- ✅ Cash: ~$34,356 CAD, ~$26,106 USD
- ✅ YoC: Calculated from dividend data
- ✅ Activities sync: succeeds without errors

## Troubleshooting

### If cash still shows $0.00:
1. Check CloudWatch logs for cashBalances Lambda
2. Verify DynamoDB has data in Accounts table
3. Check if `summary` field exists in account records

### If activities still fail:
1. Check CloudWatch logs for syncOperations Lambda
2. Verify the date chunks don't go into the future
3. Look for the break condition in logs

### If YoC still shows 0.00%:
1. Ensure activities sync completed successfully
2. Check if positions have `dividendData` field populated
3. Verify dividend calculation logic in frontend

## Files Modified

1. `AWS-Backend/lambda-functions/portfolio-analytics/src/handlers/cashBalances.js`
2. `AWS-Backend/lambda-functions/sync-operations/src/services/syncService.js`

## Deployment Command Summary

```bash
# Quick deployment (one command)
cd D:\Project\3\AWS-Backend && sam build && sam deploy --no-confirm-changeset
```
