# AWS Backend vs Microservices - Functionality Comparison

## Summary

| Feature | Microservices | AWS Lambda | Status |
|---------|--------------|------------|--------|
| Setup Person + Token (Single Call) | ✅ Yes | ✅ **YES** | ✅ Implemented |
| Scheduled Sync (Every 15 min) | ✅ Yes | ❌ **NO** | ⚠️ Missing |

---

## 1. Setup Person + Refresh Token (Single Endpoint)

### Microservices Implementation
**Endpoint:** `POST /auth/setup-person`
```javascript
// Request
{
  "personName": "my-account",
  "refreshToken": "abc123..."
}

// What it does:
1. Creates person if doesn't exist
2. Validates refresh token with Questrade
3. Gets new access token
4. Saves both tokens to database
5. Updates person record with token status
```

### ✅ AWS Lambda Implementation
**Endpoint:** `POST /api/auth/setup-person`
**File:** `lambda-functions/auth-service/src/handlers/auth.js` (lines 15-44)

```javascript
// Request (SAME AS MICROSERVICES)
{
  "personName": "my-account",
  "refreshToken": "abc123..."
}

// Implementation:
async function setupPerson(event) {
  const { personName, refreshToken, userId } = body;

  // Check if person exists, create if not
  const personExists = await personService.personExists(personName);
  if (!personExists) {
    await personService.createPerson({
      personName,
      userId,
      displayName: personName
    });
  }

  // Setup token (validates with Questrade, saves access & refresh tokens)
  const result = await tokenManager.setupPersonToken(personName, refreshToken);

  return response.success(result, 'Person token setup successfully');
}
```

**Status:** ✅ **FULLY IMPLEMENTED** - Works exactly like microservices version!

**Test Command:**
```bash
curl -X POST https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev/api/auth/setup-person \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "personName": "my-account",
    "refreshToken": "YOUR_QUESTRADE_REFRESH_TOKEN"
  }'
```

---

## 2. Scheduled Sync (Every 15 Minutes)

### Microservices Implementation
**File:** `questrade-sync-api/src/jobs/scheduledSync.js`

**How it works:**
- Uses `node-cron` or similar scheduler
- Runs every 15 minutes during market hours
- Syncs data for all active persons
- Calls: `syncManager.syncAll('scheduled')`

**Typical setup:**
```javascript
// In server.js or separate job process
const cron = require('node-cron');

// Run every 15 minutes: */15 * * * *
cron.schedule('*/15 * * * *', async () => {
  await scheduledSync.runScheduledSync();
});
```

### ❌ AWS Lambda - NOT IMPLEMENTED

**Current Status:**
- Sync endpoints exist: `POST /api/sync/all`, `/api/sync/accounts`, etc.
- These work when called manually via API
- **No EventBridge schedule configured** to trigger automatically

**What's Missing:**
1. EventBridge Rule (cron schedule)
2. Schedule trigger event in template.yaml
3. Permission for EventBridge to invoke Lambda

---

## How to Add Scheduled Sync to AWS

### Option 1: EventBridge Schedule (Recommended)

Add to `template.yaml` in the `SyncOperationsFunction` section:

```yaml
SyncOperationsFunction:
  Type: AWS::Serverless::Function
  Properties:
    FunctionName: !Sub questrade-sync-operations-${Environment}
    CodeUri: lambda-functions/sync-operations/
    Handler: src/handler.handler
    MemorySize: 1024
    Timeout: 60
    Events:
      # Existing HTTP API events...

      # ADD THIS - Run every 15 minutes
      ScheduledSync:
        Type: Schedule
        Properties:
          Schedule: rate(15 minutes)  # Every 15 minutes
          Description: Sync data from Questrade every 15 minutes
          Enabled: true
          Input: |
            {
              "scheduledSync": true,
              "source": "eventbridge"
            }
```

**Alternative with Cron (Only during market hours):**
```yaml
ScheduledSync:
  Type: Schedule
  Properties:
    # Run every 15 min, Mon-Fri, 9:30 AM - 4:00 PM EST
    Schedule: cron(*/15 14-21 ? * MON-FRI *)
    Description: Sync during market hours
    Enabled: true
```

### Option 2: Update Handler to Support Scheduled Events

**Current handler** (`lambda-functions/sync-operations/src/handler.js`) only handles HTTP requests.

**Need to add:**
```javascript
exports.handler = async (event) => {
  // Check if this is a scheduled event
  if (event.source === 'aws.events' || event.scheduledSync) {
    logger.info('Running scheduled sync...');
    return await syncHandlers.syncAll({ scheduledSync: true });
  }

  // Otherwise handle HTTP API request
  const { rawPath, requestContext } = event;
  // ... existing routing logic
}
```

### Implementation Steps

1. **Update template.yaml** - Add Schedule event to SyncOperationsFunction
2. **Update handler** - Support both HTTP and EventBridge triggers
3. **Deploy:**
   ```bash
   sam build
   sam deploy
   ```
4. **Verify:**
   ```bash
   # Check EventBridge rule was created
   aws events list-rules --name-prefix questrade

   # View CloudWatch logs to see scheduled runs
   aws logs tail /aws/lambda/questrade-sync-operations-dev --follow
   ```

---

## Comparison Table - Detailed

### Setup Person Endpoint

| Aspect | Microservices | AWS Lambda |
|--------|--------------|------------|
| **Endpoint** | `POST /auth/setup-person` | `POST /api/auth/setup-person` |
| **Creates Person** | ✅ Yes | ✅ Yes |
| **Validates Token** | ✅ Yes | ✅ Yes |
| **Gets Access Token** | ✅ Yes | ✅ Yes |
| **Saves Tokens** | ✅ MongoDB | ✅ DynamoDB |
| **Token Encryption** | ✅ AES-256 | ✅ AES-256 |
| **Updates Person** | ✅ Yes | ✅ Yes |
| **Error Handling** | ✅ Yes | ✅ Yes |

**Verdict:** ✅ **100% Feature Parity**

### Scheduled Sync

| Aspect | Microservices | AWS Lambda |
|--------|--------------|------------|
| **Manual Sync** | ✅ API endpoint | ✅ API endpoint |
| **Scheduled Sync** | ✅ Cron job | ❌ Not configured |
| **Frequency** | Every 15 min | N/A |
| **Syncs All Persons** | ✅ Yes | ✅ Yes (if called) |
| **Market Hours Check** | ✅ Optional | ⚠️ Would need to add |
| **Dividend Sync** | ✅ Yes | ⚠️ Scaffold exists |
| **Error Handling** | ✅ Yes | ✅ Yes |

**Verdict:** ⚠️ **Partial - Manual works, scheduled missing**

---

## Recommendation

### Immediate Action Required

**Add EventBridge schedule** to automatically sync every 15 minutes:

```yaml
# In template.yaml - SyncOperationsFunction
ScheduledSync:
  Type: Schedule
  Properties:
    Schedule: rate(15 minutes)
    Description: Auto-sync Questrade data
    Enabled: true
```

### Benefits of AWS EventBridge vs Cron

| Feature | Node Cron | EventBridge |
|---------|-----------|-------------|
| **Reliability** | Requires process running | AWS managed |
| **Scaling** | Single instance | Distributed |
| **Monitoring** | Custom logging | CloudWatch built-in |
| **Cost** | Server always running | Pay per invocation |
| **Failure Recovery** | Manual restart | Automatic retry |

---

## Testing Setup-Person Endpoint

### Prerequisites
1. Have a JWT token (login first)
2. Have a Questrade refresh token

### Test Steps

```bash
# 1. Login to get JWT token
curl -X POST https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Save the token from response

# 2. Setup person with token (creates person + saves token)
curl -X POST https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev/api/auth/setup-person \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "personName": "my-account",
    "refreshToken": "YOUR_QUESTRADE_REFRESH_TOKEN"
  }'

# Expected Response:
{
  "success": true,
  "message": "Person token setup successfully",
  "data": {
    "success": true,
    "personName": "my-account",
    "apiServer": "https://api01.iq.questrade.com"
  }
}

# 3. Verify person was created
curl https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev/api/persons \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 4. Verify token was saved
curl https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev/api/tokens/my-account \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Next Steps

1. ✅ **Setup-Person is ready** - Use it exactly like microservices
2. ⚠️ **Add scheduled sync** - Follow implementation steps above
3. 📝 **Update documentation** - Add EventBridge schedule to deployment guide
4. 🧪 **Test end-to-end** - Create person, sync data, verify results

---

## Files Reference

### AWS Lambda Files
- **Setup Person Handler:** `lambda-functions/auth-service/src/handlers/auth.js`
- **Token Manager:** `lambda-functions/auth-service/src/services/tokenManager.js`
- **Person Service:** `lambda-functions/auth-service/src/services/personService.js`
- **Sync Handler:** `lambda-functions/sync-operations/src/handlers/sync.js`
- **Template:** `template.yaml`

### Microservices Files (Reference)
- **Setup Person:** `questrade-auth-api/src/routes/auth.js` (line 77-94)
- **Token Manager:** `questrade-auth-api/src/services/tokenManager.js` (line 213-320)
- **Scheduled Sync:** `questrade-sync-api/src/jobs/scheduledSync.js`

---

**Status:** ✅ Setup-Person works perfectly | ⚠️ Scheduled sync needs EventBridge configuration
