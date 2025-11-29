# Phase 4: Auto-Sync After Setup-Person (Optional Enhancement)

## Status: 🔴 Not Started

## Overview
Add automatic data sync (accounts, positions, activities) after `setup-person` endpoint completes, so users don't need to make a separate sync call.

---

## Current Behavior

### What `POST /api/auth/setup-person` Does Now

**Both in Microservices AND AWS Lambda:**
- ✅ Creates person (if doesn't exist)
- ✅ Validates refresh token with Questrade
- ✅ Gets new access token
- ✅ Saves both tokens to database
- ✅ Updates person record
- ❌ **Does NOT sync positions/activities**

### Current Workflow (2 API Calls Required)

```bash
# Step 1: Setup person with token
curl -X POST https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev/api/auth/setup-person \
  -H "Authorization: Bearer JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"personName":"my-account","refreshToken":"QUESTRADE_TOKEN"}'

# Step 2: Manually sync data (REQUIRED - separate call)
curl -X POST https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev/api/sync/all \
  -H "Authorization: Bearer JWT_TOKEN"
```

---

## Proposed Enhancement

### Option A: Auto-Sync Immediately (Recommended)

Add automatic sync right after token setup completes:

**File:** `lambda-functions/auth-service/src/handlers/auth.js`

**Current Code (lines 15-44):**
```javascript
async function setupPerson(event) {
  try {
    const body = JSON.parse(event.body || '{}');
    const { personName, refreshToken, userId } = body;

    if (!personName || !refreshToken) {
      return response.badRequest('personName and refreshToken are required');
    }

    // Check if person exists, create if not
    const personExists = await personService.personExists(personName);
    if (!personExists) {
      await personService.createPerson({
        personName,
        userId,
        displayName: personName
      });
      logger.info(`Person '${personName}' created during token setup`);
    }

    // Setup token
    const result = await tokenManager.setupPersonToken(personName, refreshToken);

    return response.success(result, 'Person token setup successfully');

  } catch (error) {
    logger.error('Setup person handler error', { error: error.message });
    return response.handleError(error);
  }
}
```

**Update to:**
```javascript
async function setupPerson(event) {
  try {
    const body = JSON.parse(event.body || '{}');
    const { personName, refreshToken, userId, autoSync = true } = body;

    if (!personName || !refreshToken) {
      return response.badRequest('personName and refreshToken are required');
    }

    // Check if person exists, create if not
    const personExists = await personService.personExists(personName);
    if (!personExists) {
      await personService.createPerson({
        personName,
        userId,
        displayName: personName
      });
      logger.info(`Person '${personName}' created during token setup`);
    }

    // Setup token
    const result = await tokenManager.setupPersonToken(personName, refreshToken);

    // NEW: Auto-sync data if requested (default: true)
    let syncResult = null;
    if (autoSync) {
      try {
        logger.info(`Auto-syncing data for ${personName}...`);

        // Call sync service (Lambda to Lambda invocation)
        const syncResponse = await invokeSyncLambda(personName);
        syncResult = syncResponse;

        logger.info(`Auto-sync completed for ${personName}`, syncResult);
      } catch (syncError) {
        logger.error(`Auto-sync failed for ${personName}:`, syncError);
        // Don't fail the entire setup if sync fails
        syncResult = {
          success: false,
          error: syncError.message,
          message: 'Token setup succeeded but auto-sync failed. You can sync manually.'
        };
      }
    }

    return response.success({
      ...result,
      autoSyncPerformed: autoSync,
      syncResult
    }, 'Person token setup successfully' + (autoSync ? ' and data synced' : ''));

  } catch (error) {
    logger.error('Setup person handler error', { error: error.message });
    return response.handleError(error);
  }
}

// NEW: Helper function to invoke sync Lambda
async function invokeSyncLambda(personName) {
  const AWS = require('aws-sdk');
  const lambda = new AWS.Lambda({ region: process.env.AWS_REGION || 'us-east-1' });

  const payload = {
    source: 'setup-person',
    personName,
    syncAll: true
  };

  const params = {
    FunctionName: process.env.SYNC_LAMBDA_NAME || 'questrade-sync-operations-dev',
    InvocationType: 'RequestResponse', // Synchronous
    Payload: JSON.stringify(payload)
  };

  const result = await lambda.invoke(params).promise();
  const response = JSON.parse(result.Payload);

  return response;
}
```

### Option B: Async Sync (Fire and Forget)

Don't wait for sync to complete - start it in background:

```javascript
// In setupPerson function, after token setup:

if (autoSync) {
  // Fire and forget - don't wait for sync to complete
  invokeSyncLambdaAsync(personName).catch(err => {
    logger.error('Failed to trigger async sync:', err);
  });

  logger.info(`Async sync triggered for ${personName}`);
}

return response.success({
  ...result,
  autoSyncTriggered: autoSync,
  syncStatus: 'running_in_background'
}, 'Person token setup successfully. Sync running in background.');

// NEW: Async invocation
async function invokeSyncLambdaAsync(personName) {
  const AWS = require('aws-sdk');
  const lambda = new AWS.Lambda({ region: process.env.AWS_REGION || 'us-east-1' });

  const params = {
    FunctionName: process.env.SYNC_LAMBDA_NAME || 'questrade-sync-operations-dev',
    InvocationType: 'Event', // Asynchronous - fire and forget
    Payload: JSON.stringify({
      source: 'setup-person',
      personName,
      syncAll: true
    })
  };

  return lambda.invoke(params).promise();
}
```

### Option C: Optional Query Parameter

Let user decide via query parameter:

```javascript
// Parse query parameter
const autoSync = event.queryStringParameters?.autoSync !== 'false'; // Default true

// In request body, also allow override
const { personName, refreshToken, userId, autoSync: bodyAutoSync } = body;
const shouldAutoSync = bodyAutoSync ?? autoSync;
```

**Usage:**
```bash
# Sync automatically (default)
POST /api/auth/setup-person
{"personName": "my-account", "refreshToken": "token"}

# Skip auto-sync
POST /api/auth/setup-person?autoSync=false
{"personName": "my-account", "refreshToken": "token"}

# Or in body
POST /api/auth/setup-person
{"personName": "my-account", "refreshToken": "token", "autoSync": false}
```

---

## Required Changes

### 1. Update template.yaml - Add Lambda Invoke Permission

**File:** `template.yaml`

**Add to AuthServiceFunction Policies:**
```yaml
AuthServiceFunction:
  Type: AWS::Serverless::Function
  Properties:
    # ... existing properties
    Environment:
      Variables:
        # ... existing variables
        SYNC_LAMBDA_NAME: !Ref SyncOperationsFunction
    Policies:
      # ... existing policies

      # NEW: Permission to invoke Sync Lambda
      - LambdaInvokePolicy:
          FunctionName: !Ref SyncOperationsFunction
```

### 2. Update Sync Handler - Support Direct Invocation

**File:** `lambda-functions/sync-operations/src/handler.js`

Add support for direct Lambda invocation (not just HTTP):

```javascript
exports.handler = async (event) => {
  // Check if invoked directly from another Lambda
  if (event.source === 'setup-person' && event.personName) {
    logger.info('Sync triggered from setup-person', {
      personName: event.personName
    });

    return await syncHandlers.syncAll({
      personName: event.personName,
      source: 'setup-person'
    });
  }

  // Check if this is a scheduled EventBridge event
  if (event.source === 'aws.events' || event.scheduledSync) {
    logger.info('Running scheduled sync from EventBridge');
    return await syncHandlers.syncAll({
      scheduledSync: true,
      source: 'eventbridge'
    });
  }

  // Otherwise handle HTTP API request
  // ... existing HTTP routing logic
}
```

### 3. Update Sync Handler Logic

**File:** `lambda-functions/sync-operations/src/handlers/sync.js`

Support syncing specific person (not just active):

```javascript
async function syncAll(options = {}) {
  try {
    const { personName, source, scheduledSync } = options;

    // If personName provided, sync for that specific person
    if (personName) {
      logger.info(`Syncing all data for person: ${personName}`);

      const result = await syncService.syncAllForPerson(personName);

      return response.success({
        personName,
        source,
        ...result
      }, `All data synced successfully for ${personName}`);
    }

    // Otherwise, sync for active person (existing logic)
    // ... existing sync logic
  } catch (error) {
    logger.error('Sync all handler error', { error: error.message });
    return response.handleError(error);
  }
}
```

### 4. Add AWS SDK Dependency

**File:** `lambda-functions/auth-service/package.json`

AWS SDK is usually included in Lambda runtime, but verify:

```json
{
  "dependencies": {
    "aws-sdk": "^2.1491.0",
    // ... other dependencies
  }
}
```

---

## Testing Plan

### Test 1: Setup with Auto-Sync (Default)

```bash
# Should create person, save token, AND sync data
curl -X POST https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev/api/auth/setup-person \
  -H "Authorization: Bearer JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "personName": "test-auto-sync",
    "refreshToken": "YOUR_QUESTRADE_TOKEN"
  }'

# Expected Response:
{
  "success": true,
  "message": "Person token setup successfully and data synced",
  "data": {
    "personName": "test-auto-sync",
    "apiServer": "https://api01.iq.questrade.com",
    "autoSyncPerformed": true,
    "syncResult": {
      "accounts": 2,
      "positions": 15,
      "activities": 50
    }
  }
}
```

### Test 2: Setup WITHOUT Auto-Sync

```bash
# Skip auto-sync
curl -X POST https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev/api/auth/setup-person \
  -H "Authorization: Bearer JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "personName": "test-no-sync",
    "refreshToken": "YOUR_QUESTRADE_TOKEN",
    "autoSync": false
  }'

# Expected Response:
{
  "success": true,
  "message": "Person token setup successfully",
  "data": {
    "personName": "test-no-sync",
    "apiServer": "https://api01.iq.questrade.com",
    "autoSyncPerformed": false,
    "syncResult": null
  }
}
```

### Test 3: Verify Data Synced

```bash
# Check if accounts were synced
curl https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev/api/data/accounts \
  -H "Authorization: Bearer JWT_TOKEN"

# Check if positions were synced
curl https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev/api/data/positions \
  -H "Authorization: Bearer JWT_TOKEN"
```

### Test 4: Check CloudWatch Logs

```powershell
# Check auth service logs
aws logs tail /aws/lambda/questrade-auth-service-dev --follow

# Check sync service logs (should show invocation from setup-person)
aws logs tail /aws/lambda/questrade-sync-operations-dev --follow
```

---

## Pros and Cons

### Option A: Auto-Sync Immediately (Synchronous)

**Pros:**
- ✅ User gets complete setup in one call
- ✅ Data is immediately available
- ✅ User knows if sync succeeded/failed
- ✅ Better user experience

**Cons:**
- ❌ Longer response time (5-15 seconds)
- ❌ May timeout if sync takes too long
- ❌ Uses more Lambda execution time
- ❌ Higher cost per setup call

### Option B: Async Sync (Fire and Forget)

**Pros:**
- ✅ Fast response time
- ✅ User doesn't wait for sync
- ✅ Lower perceived latency

**Cons:**
- ❌ User doesn't know if sync failed
- ❌ Need to poll or check later
- ❌ Less clear user experience

### Option C: Keep Current Behavior (2 Separate Calls)

**Pros:**
- ✅ More flexible - user controls when to sync
- ✅ Faster setup response
- ✅ Can sync multiple times if needed
- ✅ Clear separation of concerns

**Cons:**
- ❌ Requires 2 API calls
- ❌ User might forget to sync
- ❌ More steps for user

---

## Recommendation

**Use Option A (Auto-Sync with opt-out):**

1. **Default behavior:** Auto-sync after setup
2. **Allow opt-out:** `autoSync: false` to skip
3. **Timeout handling:** Set reasonable timeout (30s)
4. **Error handling:** Don't fail setup if sync fails

**Why:**
- Best user experience
- Matches user expectation (setup = ready to use)
- Flexible (can opt-out if needed)
- Clear feedback on success/failure

---

## Implementation Steps

1. ✅ Update `auth-service/src/handlers/auth.js` - Add auto-sync logic
2. ✅ Update `template.yaml` - Add Lambda invoke permission
3. ✅ Update `sync-operations/src/handler.js` - Support direct invocation
4. ✅ Update `sync-operations/src/handlers/sync.js` - Support specific person sync
5. ✅ Add AWS SDK if not present
6. ✅ Deploy changes: `sam build && sam deploy`
7. ✅ Test with real Questrade token
8. ✅ Verify data in DynamoDB
9. ✅ Update documentation

---

## Cost Impact

### Current (2 API Calls):
- Auth service: 1 invocation (~500ms) = $0.000001
- Sync service: 1 invocation (~5s) = $0.00001
- **Total:** $0.000011 per setup

### With Auto-Sync (1 API Call):
- Auth service: 1 invocation (~10s with sync) = $0.00002
- Sync service: 1 invocation (internal) = $0.00001
- **Total:** $0.00003 per setup

**Difference:** ~3x cost per setup, but:
- Still negligible ($0.03 per 1000 setups)
- Better user experience
- Reduces total Lambda invocations (1 HTTP call instead of 2)

---

## Migration Path

### Phase 1: Add Feature (Backward Compatible)
- Add auto-sync with default `true`
- Existing API calls continue to work
- Users can opt-out with `autoSync: false`

### Phase 2: Monitor Usage
- Track how many users use auto-sync
- Monitor sync success/failure rates
- Check for timeout issues

### Phase 3: Optimize if Needed
- If timeouts occur, switch to async
- If users prefer manual sync, change default to `false`
- Add progress tracking endpoint

---

## Rollback Plan

If auto-sync causes issues:

1. **Quick disable:**
   ```javascript
   const autoSync = false; // Force disable
   ```

2. **Deploy with default off:**
   ```javascript
   const { autoSync = false } = body; // Default to false
   ```

3. **Remove feature entirely:**
   - Revert changes to `auth.js`
   - Keep 2-call workflow

---

## Documentation Updates Needed

### Update Postman Collection
Add `autoSync` field to setup-person request:
```json
{
  "personName": "{{personName}}",
  "refreshToken": "YOUR_QUESTRADE_TOKEN",
  "autoSync": true
}
```

### Update TESTING-GUIDE.md
Document the auto-sync behavior and opt-out option.

### Update API Documentation
Add response fields:
- `autoSyncPerformed`: boolean
- `syncResult`: object (accounts, positions, activities counts)

---

## Priority
**Low-Medium** - Nice enhancement, but current workflow works fine.

**Implement after:**
1. ✅ Core functionality tested
2. ✅ Manual sync verified
3. ✅ Scheduled sync working (Phase 3)
4. User feedback on workflow

---

## Success Criteria

- ✅ Setup-person creates person, saves token, AND syncs data
- ✅ User can opt-out with `autoSync: false`
- ✅ Sync failures don't break token setup
- ✅ Response time under 15 seconds
- ✅ CloudWatch logs show both operations
- ✅ Data appears in DynamoDB after setup
- ✅ No timeout errors

---

## Estimated Time
- **Implementation:** 45 minutes
- **Testing:** 30 minutes
- **Documentation:** 15 minutes
- **Deployment:** 5 minutes

**Total:** ~1.5 hours

---

## Alternative: Keep Current Workflow

**Reasons to NOT implement auto-sync:**
1. Current 2-step workflow is clear and explicit
2. Gives user control over when to sync
3. Simpler error handling
4. No timeout concerns
5. Lower cost per operation
6. Matches microservices behavior (they also don't auto-sync)

**If keeping current workflow:**
- Update Postman collection with 2-step examples
- Document the workflow clearly
- Maybe add a "Quick Setup Guide" showing both steps

---

## Notes

- Microservices also use 2-step workflow (setup, then sync)
- Most users will want data immediately after setup
- Auto-sync provides better UX for new users
- Power users can disable for more control
- Consider adding setup status endpoint to check sync progress

---

**Decision:** Review with user - do they prefer:
- A) Auto-sync by default (1 call, slower, convenient)
- B) Manual sync (2 calls, faster, more control)
- C) Optional auto-sync (configurable, flexible)
