# Troubleshooting 500 Error - Access Token Endpoint

## 🔍 Problem
`GET /api/auth/access-token/Vivek` returns 500 Internal Server Error

## 🎯 Root Cause Analysis

The error is happening in the **auth-service** Lambda, not the sync-operations Lambda. This suggests:

1. **Possible Cause 1:** The deployment updated all Lambdas, and `auth-service` might have an issue
2. **Possible Cause 2:** Environment variables (ENCRYPTION_KEY, TOKENS_TABLE) might not be set correctly
3. **Possible Cause 3:** DynamoDB permissions issue for auth-service

---

## 🛠️ Diagnostic Steps

### Step 1: Check Lambda Function Configuration
```bash
aws lambda get-function-configuration --function-name questrade-auth-service-dev --query "{Timeout:Timeout,Memory:MemorySize,LastModified:LastModified,Runtime:Runtime,Handler:Handler}" --output table
```

### Step 2: Check Environment Variables
```bash
aws lambda get-function-configuration --function-name questrade-auth-service-dev --query "Environment.Variables" --output json
```

**Expected variables:**
- `TOKENS_TABLE`: questrade-tokens-dev
- `PERSONS_TABLE`: questrade-persons-dev
- `ENCRYPTION_KEY`: (should be set)
- `CACHE_TABLE`: questrade-cache-dev (NEW)

### Step 3: Check Recent Deployments
```bash
aws lambda list-versions-by-function --function-name questrade-auth-service-dev --query "Versions[-2:].{Version:Version,Modified:LastModified}" --output table
```

### Step 4: Test Token Manager Directly
```bash
aws lambda invoke \
  --function-name questrade-auth-service-dev \
  --payload '{"rawPath":"/dev/api/auth/access-token/Vivek","requestContext":{"http":{"method":"GET"}},"pathParameters":{"personName":"Vivek"}}' \
  response.json

cat response.json
```

### Step 5: Check CloudWatch Logs (if you have permissions)
```bash
aws logs tail /aws/lambda/questrade-auth-service-dev --since 10m --follow
```

---

## 🔧 Likely Fixes

### Fix 1: Check if auth-service needs CACHE_TABLE variable

The `auth-service` might be failing because it's trying to access `CACHE_TABLE` which might not be defined for it.

**Check template.yaml - auth-service should NOT use CACHE_TABLE:**
```yaml
AuthServiceFunction:
  Properties:
    # Should NOT have CACHE_TABLE in environment
```

### Fix 2: Verify ENCRYPTION_KEY is set

```bash
aws lambda get-function-configuration --function-name questrade-auth-service-dev --query "Environment.Variables.ENCRYPTION_KEY" --output text
```

If it returns empty, the ENCRYPTION_KEY is missing.

### Fix 3: Check DynamoDB Access

```bash
# Test if Lambda can read from tokens table
aws dynamodb get-item \
  --table-name questrade-tokens-dev \
  --key '{"personName":{"S":"Vivek"},"tokenType":{"S":"access"}}' \
  --query "Item" --output json
```

---

## 🚑 Quick Fix (Most Likely)

The issue is probably that `auth-service` Lambda is trying to import or access something that doesn't exist after the deployment.

### Solution A: Rollback auth-service only

Since we only modified sync-operations, auth-service shouldn't have changed. But SAM might have rebuilt it.

```bash
cd D:\Project\3\AWS-Backend

# Rebuild just to ensure nothing broke
sam build

# Deploy again
sam deploy --no-confirm-changeset
```

### Solution B: Check if auth-service has proper dependencies

```bash
cd D:\Project\3\AWS-Backend\lambda-functions\auth-service
npm install
```

---

## 🔍 Manual Test

Try calling the endpoint directly to see the error:

```bash
curl -v -X GET "https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev/api/auth/access-token/Vivek" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Look at the response body for the actual error message.

---

## 📝 Most Probable Issue

Based on the deployment you just did, here's what likely happened:

1. ✅ **sync-operations** Lambda updated successfully (has new cache logic)
2. ❌ **auth-service** Lambda was rebuilt by SAM and might have:
   - Missing dependencies
   - Environment variable mismatch
   - Code syntax error during rebuild

### Immediate Action:

1. **Check if auth-service Lambda has the CACHE_TABLE environment variable** (it shouldn't need it)
2. **Verify ENCRYPTION_KEY is set** for auth-service
3. **Rebuild and redeploy** to fix any corruption

---

## 🔄 Recommended Fix

Run these commands:

```bash
cd D:\Project\3\AWS-Backend

# Clean build
rm -rf .aws-sam

# Fresh build
sam build

# Check what will be deployed
sam deploy --no-confirm-changeset --no-execute-changeset

# If it looks good, deploy
sam deploy --no-confirm-changeset
```

---

## ⚠️ Prevention for Next Time

When deploying Phase 2, 3, etc., we should:
1. Only modify the specific Lambda functions needed
2. Test each Lambda independently after deployment
3. Have rollback plan ready

---

## 📊 Expected vs Actual

| Component | Expected | Status |
|-----------|----------|--------|
| sync-operations Lambda | Updated with cache | ✅ (probably) |
| auth-service Lambda | Unchanged | ❌ (500 error) |
| Cache table | Created | ✅ (probably) |
| EventBridge rule | Created | ✅ (probably) |

---

## 🎯 Next Steps

1. Run the diagnostic commands above
2. Share the output of the environment variables check
3. Check if CACHE_TABLE was accidentally added to auth-service
4. Rebuild and redeploy if needed

**Let me know the output of these commands, and I can help fix it!**
