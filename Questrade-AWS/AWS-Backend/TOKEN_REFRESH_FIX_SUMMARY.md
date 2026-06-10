# Token Refresh Scheduler Fix - Critical Update

## Problem Identified

### Root Cause
According to [Questrade API Documentation](https://www.questrade.com/api/documentation/getting-started):

1. **Access tokens expire in 5 minutes** (NOT 30 minutes!)
2. **Refresh tokens expire in 7 days**
3. **Each token refresh returns a NEW refresh token** (old one becomes invalid)

### What Was Wrong
- Token-refresh-scheduler was running every **25 minutes**
- Access tokens expire in **5 minutes**
- By the time scheduler ran, tokens were already expired
- This caused constant "No active refresh token found" errors

## Solution

Changed token refresh schedule from **25 minutes to 3 minutes**.

### File Modified
**File**: `AWS-Backend/template.yaml` (line 843-844)

**Before**:
```yaml
Schedule: rate(25 minutes)
Description: Automatically refresh Questrade tokens every 25 minutes
```

**After**:
```yaml
Schedule: rate(3 minutes)
Description: Automatically refresh Questrade tokens every 3 minutes (access tokens expire in 5 min)
```

## Why 3 Minutes?

- **Access token expires**: 5 minutes
- **Refresh interval**: 3 minutes
- **Buffer**: 2 minutes (40% safety margin)

This ensures tokens are refreshed BEFORE they expire.

## Deployment Instructions

### Backend Only (No Frontend Changes)

```bash
cd D:\Project\3\AWS-Backend
sam build
sam deploy
```

## After Deployment

### Step 1: Update Vivek's Token Manually (ONE TIME)

1. **Get fresh refresh token from Questrade**:
   - Log into Questrade
   - Go to Apps & API section
   - Generate new refresh token
   - Copy it

2. **Update in Portfolio Manager**:
   - Go to **Settings → TOKEN MANAGEMENT** tab
   - Select "Vivek" from dropdown
   - Scroll to **"UPDATE REFRESH TOKEN"** section
   - Paste the new token
   - Click **"UPDATE TOKEN"**

### Step 2: Verify Automatic Refresh Works

After updating the token manually, the scheduler should keep it fresh automatically.

**Verify**:
```bash
# Wait 3-5 minutes, then check if token was refreshed
aws dynamodb get-item --table-name questrade-tokens-dev \
  --key '{"personName":{"S":"Vivek"},"tokenType":{"S":"access"}}' \
  --query "Item.[isActive.BOOL,expiresAt.N,updatedAt.N]" --output table
```

Expected: `updatedAt` should be recent (within last 3 minutes)

## Token Lifecycle After Fix

```
Time: 0:00  → Manual token update (via UI)
           → Refresh token: Active ✅
           → Access token: Valid for 5 min ✅

Time: 3:00  → Scheduler runs
           → Gets new access token + NEW refresh token
           → Old refresh token: Deactivated ❌
           → New refresh token: Active ✅
           → Access token: Valid for 5 min ✅

Time: 6:00  → Scheduler runs again
           → Gets new access token + NEW refresh token
           → Process repeats...
```

## Important Notes

1. **First-time setup**: You MUST manually update the token once after deployment
2. **After that**: Scheduler maintains tokens automatically
3. **If tokens fail**: Manually update via UI (the UPDATE TOKEN feature exists for this)
4. **7-day expiry**: Even with auto-refresh, Questrade refresh tokens expire in 7 days. You may need to manually update weekly.

## Testing Checklist

After deployment:

- [ ] Backend deployed successfully
- [ ] Manual token update via UI works
- [ ] Wait 3 minutes
- [ ] Check DynamoDB - access token `updatedAt` is recent
- [ ] WebSocket connects without errors
- [ ] No more "Failed to get access token" errors

## Files Modified

### Backend:
- ✅ `template.yaml` - Changed schedule from 25 min to 3 min

### Frontend:
- ❌ No changes needed

## Deployment Needed

**Backend Only**:
```bash
cd D:\Project\3\AWS-Backend
sam build
sam deploy
```

Then manually update Vivek's token via the UI.

---

## Expected Result

After this fix:
- ✅ Tokens refresh automatically every 3 minutes
- ✅ Access tokens never expire (refreshed before 5-min expiry)
- ✅ WebSocket connection stays stable
- ✅ No more 500 errors
- ✅ Portfolio loads reliably

---

**Ready to deploy!**
