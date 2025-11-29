# Phase 3: Add Scheduled Sync (EventBridge)

## Status: 🔴 Not Started

## Overview
Add EventBridge schedule to automatically sync data from Questrade every 15 minutes, matching the microservices functionality.

---

## Current State

### ✅ What Works
- ✅ Manual sync endpoints work perfectly:
  - `POST /api/sync/all` - Sync everything
  - `POST /api/sync/accounts` - Sync accounts only
  - `POST /api/sync/positions` - Sync positions only
  - `POST /api/sync/activities` - Sync activities only
- ✅ Sync logic is implemented in `lambda-functions/sync-operations/`
- ✅ All Lambda functions are deployed and healthy

### ❌ What's Missing
- ❌ No EventBridge schedule configured
- ❌ Sync handler doesn't support EventBridge events (only HTTP)
- ❌ No automatic trigger every 15 minutes

---

## Tasks

### Task 1: Update template.yaml - Add EventBridge Schedule
**File:** `template.yaml`
**Section:** `SyncOperationsFunction` (around line 236)

**Add this to the Events section:**
```yaml
SyncOperationsFunction:
  Type: AWS::Serverless::Function
  Properties:
    FunctionName: !Sub questrade-sync-operations-${Environment}
    CodeUri: lambda-functions/sync-operations/
    Handler: src/handler.handler
    MemorySize: 1024
    Timeout: 60
    ReservedConcurrentExecutions: 5
    Policies:
      # ... existing policies
    Events:
      # Existing HTTP API events...

      # ADD THIS - Scheduled sync every 15 minutes
      ScheduledSync:
        Type: Schedule
        Properties:
          Schedule: rate(15 minutes)
          Description: Auto-sync Questrade data every 15 minutes
          Enabled: true
          Input: |
            {
              "source": "aws.events",
              "scheduledSync": true,
              "syncType": "all"
            }
```

**Alternative: Only during market hours (Mon-Fri, 9:30 AM - 4:00 PM EST)**
```yaml
ScheduledSync:
  Type: Schedule
  Properties:
    # Run every 15 min, Mon-Fri, 9:30 AM - 4:00 PM EST (14:30-21:00 UTC)
    Schedule: cron(*/15 14-21 ? * MON-FRI *)
    Description: Sync during market hours
    Enabled: true
    Input: |
      {
        "source": "aws.events",
        "scheduledSync": true,
        "syncType": "all"
      }
```

---

### Task 2: Update Sync Handler - Support EventBridge Events
**File:** `lambda-functions/sync-operations/src/handler.js`

**Current Code (line 19):**
```javascript
exports.handler = async (event) => {
  logger.info('Sync operations request', {
    path: event.rawPath,
    method: event.requestContext.http.method
  });

  try {
    const { rawPath, requestContext } = event;
    const method = requestContext.http.method;

    // ... HTTP routing logic
```

**Update to:**
```javascript
exports.handler = async (event) => {
  // Check if this is a scheduled EventBridge event
  if (event.source === 'aws.events' || event.scheduledSync) {
    logger.info('Running scheduled sync from EventBridge', {
      syncType: event.syncType || 'all'
    });

    return await syncHandlers.syncAll({
      scheduledSync: true,
      source: 'eventbridge'
    });
  }

  // Otherwise handle HTTP API request
  logger.info('Sync operations request', {
    path: event.rawPath,
    method: event.requestContext?.http?.method
  });

  try {
    const { rawPath, requestContext } = event;
    const method = requestContext.http.method;

    // Remove stage prefix if present
    const path = rawPath.replace(/^\/[^\/]+\/api\//, '/api/');

    // ... existing HTTP routing logic
```

---

### Task 3: Deploy Changes
```bash
cd d:\Project\3\AWS-Backend

# Build with updated template and handler
sam build

# Deploy
sam deploy

# When prompted "Deploy this changeset? [y/N]:" → type y
```

---

### Task 4: Verify Schedule is Working

**Check EventBridge Rule:**
```powershell
# List EventBridge rules
aws events list-rules --region us-east-1 | Select-String -Pattern "questrade"

# Get rule details
aws events describe-rule --name <rule-name> --region us-east-1
```

**Monitor CloudWatch Logs:**
```powershell
# Watch for scheduled sync executions
aws logs tail /aws/lambda/questrade-sync-operations-dev --follow --region us-east-1
```

**Expected Log Output (every 15 minutes):**
```json
{
  "timestamp": "2025-10-27T23:45:00Z",
  "level": "INFO",
  "message": "Running scheduled sync from EventBridge",
  "syncType": "all"
}
```

---

### Task 5: Test Manually Before Waiting 15 Minutes

**Invoke Lambda with EventBridge-like event:**
```powershell
# Create test event file
@"
{
  "source": "aws.events",
  "scheduledSync": true,
  "syncType": "all"
}
"@ | Out-File -FilePath event.json -Encoding utf8

# Invoke Lambda
aws lambda invoke --function-name questrade-sync-operations-dev --payload file://event.json --region us-east-1 response.json

# Check response
Get-Content response.json
```

---

## Additional Enhancements (Optional)

### Enhancement 1: Add Market Hours Check
**File:** `lambda-functions/sync-operations/src/utils/marketHours.js`

```javascript
function isMarketOpen() {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sunday, 1=Monday, ..., 5=Friday
  const hour = now.getUTCHours();

  // Market is closed on weekends
  if (day === 0 || day === 6) {
    return false;
  }

  // Market hours: 9:30 AM - 4:00 PM EST = 14:30 - 21:00 UTC
  if (hour < 14 || hour >= 21) {
    return false;
  }

  return true;
}

module.exports = { isMarketOpen };
```

**Use in handler:**
```javascript
const { isMarketOpen } = require('../utils/marketHours');

if (event.source === 'aws.events' || event.scheduledSync) {
  // Skip sync if market is closed
  if (!isMarketOpen()) {
    logger.info('Market is closed, skipping scheduled sync');
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Market closed, sync skipped'
      })
    };
  }

  // ... proceed with sync
}
```

### Enhancement 2: Add Sync for All Active Persons
**File:** `lambda-functions/sync-operations/src/handlers/sync.js`

Currently syncs for active person only. Update to sync ALL persons with valid tokens:

```javascript
async function syncAll(event) {
  try {
    const isScheduled = event.scheduledSync || false;

    if (isScheduled) {
      // Get all persons with valid tokens
      const persons = await query(
        process.env.PERSONS_TABLE,
        'hasValidToken = :hasToken',
        { ':hasToken': true }
      );

      logger.info(`Scheduled sync for ${persons.items.length} persons`);

      const results = [];
      for (const person of persons.items) {
        try {
          const result = await syncService.syncAllForPerson(person.personName);
          results.push({ personName: person.personName, success: true, ...result });
        } catch (error) {
          logger.error(`Sync failed for ${person.personName}:`, error);
          results.push({ personName: person.personName, success: false, error: error.message });
        }
      }

      return response.success({
        totalPersons: persons.items.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results
      }, 'Scheduled sync completed');
    }

    // ... existing manual sync logic
  }
}
```

### Enhancement 3: Add CloudWatch Alarms
**File:** `template.yaml`

```yaml
# Add to Resources section
SyncErrorAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: !Sub ${AWS::StackName}-sync-errors
    AlarmDescription: Alert when sync operations fail
    MetricName: Errors
    Namespace: AWS/Lambda
    Statistic: Sum
    Period: 900  # 15 minutes
    EvaluationPeriods: 1
    Threshold: 5
    ComparisonOperator: GreaterThanThreshold
    Dimensions:
      - Name: FunctionName
        Value: !Ref SyncOperationsFunction

SyncDurationAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: !Sub ${AWS::StackName}-sync-duration
    AlarmDescription: Alert when sync takes too long
    MetricName: Duration
    Namespace: AWS/Lambda
    Statistic: Average
    Period: 900
    EvaluationPeriods: 1
    Threshold: 50000  # 50 seconds (timeout is 60s)
    ComparisonOperator: GreaterThanThreshold
    Dimensions:
      - Name: FunctionName
        Value: !Ref SyncOperationsFunction
```

---

## Testing Plan

### Test 1: Manual Invocation
```bash
# Invoke sync manually to verify it works
curl -X POST https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev/api/sync/all \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Test 2: EventBridge Test Event
```bash
# Invoke with EventBridge-like event
aws lambda invoke \
  --function-name questrade-sync-operations-dev \
  --payload '{"source":"aws.events","scheduledSync":true}' \
  --region us-east-1 \
  response.json
```

### Test 3: Wait for Scheduled Run
- Wait 15 minutes after deployment
- Check CloudWatch Logs for automatic execution
- Verify data is synced in DynamoDB

### Test 4: Verify Data Synced
```bash
# Check if data was synced
curl https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev/api/data/accounts \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

curl https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev/api/data/positions \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Cost Implications

### Current Cost (Manual Only)
- **Lambda Invocations:** Only when manually triggered (~ $0.00)
- **DynamoDB:** Pay-per-request, minimal cost

### After Adding Schedule
- **Lambda Invocations:** 96 times per day (every 15 min × 24 hours)
  - At $0.20 per 1M requests = $0.000019 per day
  - ~$0.58 per month
- **Lambda Duration:** ~5-10 seconds per sync
  - At 1024 MB, $0.0000166667 per GB-second
  - ~$0.10 per month
- **DynamoDB:** More reads/writes due to automated syncs
  - Estimated: +$1-2 per month

**Total Additional Cost:** ~$2-3 per month

### To Reduce Costs
1. Use market hours only schedule: `cron(*/15 14-21 ? * MON-FRI *)`
   - Reduces from 96 to ~30 invocations per day
   - Saves ~60% on Lambda costs
2. Increase interval to 30 minutes: `rate(30 minutes)`
   - Reduces invocations by 50%

---

## Rollback Plan

If scheduled sync causes issues:

### Option 1: Disable Schedule
```powershell
# Disable the EventBridge rule
aws events disable-rule --name <rule-name> --region us-east-1
```

### Option 2: Quick Redeploy
Update `template.yaml`:
```yaml
ScheduledSync:
  Type: Schedule
  Properties:
    Schedule: rate(15 minutes)
    Enabled: false  # <-- Change to false
```

Then redeploy:
```bash
sam build && sam deploy
```

### Option 3: Delete Rule
```powershell
aws events remove-targets --rule <rule-name> --ids "1" --region us-east-1
aws events delete-rule --name <rule-name> --region us-east-1
```

---

## References

### Microservices Implementation
- **File:** `Backend/questrade-portfolio-microservices/questrade-sync-api/src/jobs/scheduledSync.js`
- **Schedule:** Every 15 minutes using node-cron
- **Logic:** Syncs all active persons with valid tokens

### AWS Documentation
- [EventBridge Schedule Expressions](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-create-rule-schedule.html)
- [SAM Schedule Events](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-property-function-schedule.html)
- [Lambda Event Sources](https://docs.aws.amazon.com/lambda/latest/dg/invocation-eventsourcemapping.html)

### Files to Modify
1. `template.yaml` - Add EventBridge schedule
2. `lambda-functions/sync-operations/src/handler.js` - Support EventBridge events
3. `lambda-functions/sync-operations/src/handlers/sync.js` - Sync all persons (optional)

---

## Success Criteria

- ✅ EventBridge rule created and enabled
- ✅ Lambda receives EventBridge events
- ✅ Sync runs automatically every 15 minutes
- ✅ CloudWatch Logs show scheduled executions
- ✅ Data is synced to DynamoDB
- ✅ No errors in CloudWatch Logs
- ✅ Matches microservices functionality

---

## Notes

- **Market Hours:** Consider only syncing during market hours to reduce costs
- **Multiple Persons:** Current implementation syncs active person only. Update to sync ALL persons with valid tokens
- **Error Handling:** Add retry logic and alerts for failed syncs
- **Monitoring:** Set up CloudWatch alarms for errors and duration
- **Testing:** Test thoroughly before relying on scheduled syncs

---

## Estimated Time
- **Implementation:** 30 minutes
- **Testing:** 30 minutes
- **Deployment:** 5 minutes
- **Verification:** 15 minutes (wait for first scheduled run)

**Total:** ~1.5 hours

---

## Priority
**Medium** - Nice to have, but not critical. Manual sync works perfectly.

**Recommendation:** Implement after:
1. Testing authentication flow
2. Testing person creation
3. Testing manual sync
4. Confirming data quality

This ensures the core functionality works before adding automation.
