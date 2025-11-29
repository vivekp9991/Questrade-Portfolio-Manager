# Phase 2: SAM Template Creation - Progress Report

## ✅ Completed Tasks

### 1. Directory Structure ✅
```
AWS-Backend/
├── docs/
├── lambda-functions/
│   ├── auth-service/
│   │   ├── src/
│   │   │   └── handler.js ✅
│   │   └── package.json ✅
│   ├── sync-operations/src/
│   ├── data-read-service/src/
│   ├── portfolio-analytics/src/
│   ├── market-data-service/src/
│   ├── watchlist-service/src/
│   └── jwt-authorizer/
│       ├── src/
│       │   └── handler.js ✅
│       └── package.json ✅
├── shared/
│   └── utils/
│       ├── logger.js ✅
│       ├── dynamodb.js ✅
│       ├── response.js ✅
│       └── crypto.js ✅
├── scripts/
├── events/
├── tests/
├── TODO/
├── template.yaml ✅
└── .gitignore ✅
```

### 2. Core Infrastructure ✅

**Files Created:**
- ✅ `template.yaml` - Complete SAM template with:
  - 6 Lambda functions defined
  - 10 DynamoDB tables
  - API Gateway (HttpApi)
  - All routes configured
  - IAM policies
  - Environment variables

- ✅ `.gitignore` - Comprehensive ignore rules

### 3. Shared Utilities ✅

Created in `/shared/utils/`:

1. **logger.js** ✅
   - Structured JSON logging for CloudWatch
   - Log levels: DEBUG, INFO, WARN, ERROR
   - Context support
   - Child logger capability

2. **dynamodb.js** ✅
   - DynamoDB DocumentClient wrapper
   - Helper functions: getItem, putItem, updateItem, deleteItem
   - Query and Scan functions
   - Batch operations (batchWrite, batchGet)

3. **response.js** ✅
   - Standardized API responses
   - Helper functions: success, created, badRequest, unauthorized, etc.
   - Error handling with handleError()
   - CORS headers

4. **crypto.js** ✅
   - AES-256-CBC encryption/decryption
   - Password hashing (PBKDF2)
   - Password verification

### 4. Lambda Functions Created ✅

#### JWT Authorizer ✅
- **Location**: `lambda-functions/jwt-authorizer/`
- **Files**:
  - `package.json` ✅
  - `src/handler.js` ✅
- **Features**:
  - JWT token verification
  - User validation from DynamoDB
  - IAM policy generation
  - Context passing to downstream functions

#### Auth Service (Partial) ✅
- **Location**: `lambda-functions/auth-service/`
- **Files**:
  - `package.json` ✅
  - `src/handler.js` ✅ (main router)
- **Routes Defined**:
  - Login: `/api/login`, `/api/login/verify`, `/api/login/refresh`
  - Persons: CRUD operations on `/api/persons`
  - Auth: `/api/auth/*` endpoints
  - Tokens: `/api/tokens/*` endpoints

---

## 🔄 In Progress / Needs Completion

### Auth Service Handlers (Need Implementation)

The main `handler.js` routes to these handlers, but they need to be created:

1. **`src/handlers/login.js`** ⏳
   - `login(event)` - User login with JWT generation
   - `verifyToken(event)` - Verify JWT token
   - `refreshJWT(event)` - Refresh JWT token

2. **`src/handlers/persons.js`** ⏳
   - `getAllPersons(event)`
   - `getPerson(event)`
   - `createPerson(event)`
   - `updatePerson(event)`
   - `deletePerson(event)`
   - `updatePersonToken(event)`

3. **`src/handlers/auth.js`** ⏳
   - `setupPerson(event)` - Setup Questrade refresh token
   - `refreshToken(event)` - Refresh Questrade access token
   - `getTokenStatus(event)` - Get token status
   - `getAccessToken(event)` - Get valid access token
   - `testConnection(event)` - Test Questrade API connection

4. **`src/handlers/tokens.js`** ⏳
   - `getAllTokens(event)`
   - `getPersonTokens(event)`
   - `deleteExpiredTokens(event)`
   - `getTokenStats(event)`

5. **`src/services/tokenManager.js`** ⏳
   - Business logic for token management
   - Similar to Backend/questrade-auth-api/src/services/tokenManager.js
   - Adapted for DynamoDB instead of MongoDB

6. **`src/services/personService.js`** ⏳
   - Business logic for person operations

7. **`src/services/userService.js`** ⏳
   - Business logic for user operations

---

## 📝 Remaining Lambda Functions (Need Implementation)

### 1. Sync Operations Lambda
**Location**: `lambda-functions/sync-operations/`

**Need to Create**:
- `package.json`
- `src/handler.js` - Main router
- `src/handlers/sync.js` - Sync handlers
- `src/services/syncService.js` - Sync logic
- `src/services/questradeApiService.js` - Questrade API client
- `src/utils/batchWriter.js` - DynamoDB batch write helper

**Reference**: `Backend/questrade-sync-api/`

---

### 2. Data Read Service Lambda
**Location**: `lambda-functions/data-read-service/`

**Need to Create**:
- `package.json`
- `src/handler.js` - Main router
- `src/handlers/accounts.js`
- `src/handlers/positions.js`
- `src/handlers/activities.js`
- `src/handlers/stats.js`
- `src/services/accountService.js`
- `src/services/positionService.js`
- `src/services/activityService.js`

**Reference**: `Backend/questrade-sync-api/src/routes/`

---

### 3. Portfolio Analytics Lambda
**Location**: `lambda-functions/portfolio-analytics/`

**Need to Create**:
- `package.json`
- `src/handler.js` - Main router
- `src/handlers/portfolio.js`
- `src/handlers/performance.js`
- `src/handlers/allocation.js`
- `src/handlers/analytics.js`
- `src/handlers/reports.js`
- `src/handlers/comparison.js`
- `src/services/portfolioCalculator.js` - Core calculation logic
- `src/services/analyticsService.js`
- `src/utils/financialCalculations.js`

**Reference**: `Backend/questrade-portfolio-api/`

---

### 4. Market Data Service Lambda
**Location**: `lambda-functions/market-data-service/`

**Need to Create**:
- `package.json`
- `src/handler.js` - Main router
- `src/handlers/markets.js`
- `src/handlers/quotes.js`
- `src/handlers/symbols.js`
- `src/services/marketService.js`
- `src/services/quoteService.js`
- `src/utils/cache.js` - In-memory caching

**Reference**: `Backend/questrade-market-api/`

---

### 5. Watchlist Service Lambda
**Location**: `lambda-functions/watchlist-service/`

**Need to Create**:
- `package.json`
- `src/handler.js` - Main router
- `src/handlers/watchlists.js`
- `src/services/watchlistService.js`

**Reference**: `Backend/questrade-market-api/src/routes/watchlists.js`

---

## 🎯 Next Steps (Priority Order)

### Immediate (Before Validation)

1. **Complete Auth Service Handlers**
   - Create all handler files in `auth-service/src/handlers/`
   - Create service layer in `auth-service/src/services/`
   - Copy logic from `Backend/questrade-auth-api/` and adapt:
     - MongoDB → DynamoDB
     - Mongoose → AWS SDK
     - Remove Express, use pure Lambda handlers

2. **Create Remaining Lambda Scaffolds**
   - Copy structure from auth-service for consistency
   - Create package.json for each
   - Create main handler.js router for each
   - Create handler subdirectories

3. **Create Test Events**
   - `events/login.json`
   - `events/get-persons.json`
   - `events/sync-person.json`
   - etc.

4. **Create Deployment Scripts**
   - `scripts/build.sh`
   - `scripts/deploy.sh`
   - `scripts/local-test.sh`
   - `scripts/validate.sh`

5. **Create Root README**
   - Architecture overview
   - Setup instructions
   - Deployment guide
   - API documentation

### Before First Deployment

6. **Install Dependencies**
   ```bash
   cd lambda-functions/jwt-authorizer && npm install
   cd ../auth-service && npm install
   # ... repeat for all functions
   ```

7. **Validate SAM Template**
   ```bash
   sam validate --lint
   ```

8. **Local Testing**
   ```bash
   sam build
   sam local start-api
   ```

9. **Fix Any Issues**
   - Syntax errors
   - Missing dependencies
   - Route mismatches

---

## 📊 Completion Estimate

### What's Done: ~35%
- ✅ Infrastructure (SAM template, DynamoDB tables)
- ✅ Shared utilities
- ✅ Directory structure
- ✅ JWT Authorizer (complete)
- ✅ Auth Service (structure only)

### What Remains: ~65%
- ⏳ Auth Service handlers (15%)
- ⏳ Sync Operations Lambda (15%)
- ⏳ Data Read Service Lambda (10%)
- ⏳ Portfolio Analytics Lambda (15%)
- ⏳ Market Data Service Lambda (5%)
- ⏳ Watchlist Service Lambda (5%)

---

## 🚀 How to Continue

### Option 1: Manual Implementation
Use the existing `Backend/questrade-portfolio-microservices/` code as reference and:
1. Copy business logic from services
2. Adapt Mongoose calls to DynamoDB SDK
3. Convert Express routes to Lambda handlers
4. Test each function individually

### Option 2: AI-Assisted (Recommended)
Ask Claude to:
1. "Create auth-service handlers based on Backend/questrade-auth-api"
2. "Create sync-operations Lambda based on Backend/questrade-sync-api"
3. Continue for each service

### Key Conversion Patterns

**Express Route → Lambda Handler:**
```javascript
// Before (Express)
router.get('/api/persons/:personName', async (req, res) => {
  const person = await Person.findOne({ personName: req.params.personName });
  res.json({ success: true, data: person });
});

// After (Lambda)
async function getPerson(event) {
  const personName = event.pathParameters.personName;
  const person = await dynamodb.getItem(PERSONS_TABLE, { personName });
  return response.success(person);
}
```

**Mongoose → DynamoDB:**
```javascript
// Before (Mongoose)
await Person.findOne({ personName });
await Person.findOneAndUpdate({ personName }, { hasValidToken: true });

// After (DynamoDB)
await dynamodb.getItem(PERSONS_TABLE, { personName });
await dynamodb.updateItem(PERSONS_TABLE, { personName }, { hasValidToken: true });
```

---

## 📦 Dependencies Summary

All Lambda functions will need:
```json
{
  "@aws-sdk/client-dynamodb": "^3.600.0",
  "@aws-sdk/lib-dynamodb": "^3.600.0"
}
```

Additional by service:
- **Auth**: `jsonwebtoken`, `axios`, `uuid`
- **Sync**: `axios`, `uuid`
- **Portfolio**: `decimal.js` (for calculations)
- **Market**: `axios`

---

## ✅ Success Criteria for Phase 2

Phase 2 is complete when:
- ✅ `sam validate` passes with no errors
- ✅ All Lambda functions have package.json
- ✅ All Lambda functions have working handlers
- ✅ All dependencies installed (`npm install` in each function)
- ✅ Local API starts: `sam local start-api`
- ✅ Health endpoints return 200
- ✅ Ready for Phase 3 deployment

---

**Current Status**: Foundation Complete, Implementation in Progress
**Next Action**: Complete auth-service handlers or create scaffolds for remaining Lambda functions
