# Lambda Functions Specification

## Table of Contents
1. [Overview](#overview)
2. [Lambda Architecture](#lambda-architecture)
3. [Individual Lambda Specs](#individual-lambda-specs)
4. [Shared Components](#shared-components)
5. [Environment Variables](#environment-variables)
6. [IAM Permissions](#iam-permissions)

---

## Overview

### Total Lambda Functions: 7

#### Business Lambdas (6)
1. **Auth Service** - Authentication, users, persons, tokens
2. **Sync Operations** - Questrade data synchronization
3. **Data Read Service** - Read-only data access
4. **Portfolio Analytics** - Complex calculations and reports
5. **Market Data Service** - Market quotes and symbols
6. **Watchlist Service** - User watchlists

#### Infrastructure Lambda (1)
7. **JWT Authorizer** - Token validation for API Gateway

---

## Lambda Architecture

### Common Structure
Each Lambda follows this pattern:
```
lambda-function/
├── src/
│   ├── handler.js          # Lambda entry point
│   ├── app.js              # Express/Fastify app
│   ├── routes/             # Route handlers
│   ├── services/           # Business logic
│   ├── models/             # DynamoDB models
│   ├── middleware/         # Express middleware
│   └── utils/              # Utility functions
├── package.json
└── README.md
```

### Request Flow
```
API Gateway
    ↓
Lambda Handler (handler.js)
    ↓
Express/Fastify App (app.js)
    ↓
Route Handler (routes/)
    ↓
Service Layer (services/)
    ↓
DynamoDB Client (models/)
    ↓
DynamoDB
```

---

## Individual Lambda Specs

### Lambda 1: Auth Service

**Function Name:** `questrade-auth-service`

**Purpose:** Handle all authentication and user/person management

**Runtime Configuration:**
```
Runtime: Node.js 18.x
Memory: 512 MB
Timeout: 10 seconds
Architecture: arm64 (Graviton2 - 20% cost savings)
```

**Environment Variables:**
```
JWT_SECRET: (from Parameter Store)
JWT_EXPIRES_IN: 24h
DYNAMODB_USERS_TABLE: questrade-users
DYNAMODB_PERSONS_TABLE: questrade-persons
DYNAMODB_TOKENS_TABLE: questrade-tokens
QUESTRADE_API_URL: https://login.questrade.com
LOG_LEVEL: info
NODE_ENV: production
```

**Endpoints (24 total):**

**Login (3):**
- `POST /api/login` - User login
- `POST /api/login/verify` - Verify JWT
- `POST /api/login/refresh` - Refresh JWT

**Persons (6):**
- `POST /api/persons`
- `GET /api/persons`
- `GET /api/persons/{personName}`
- `PUT /api/persons/{personName}`
- `DELETE /api/persons/{personName}`
- `POST /api/persons/{personName}/token`

**Auth/OAuth (5):**
- `POST /api/auth/setup-person`
- `POST /api/auth/refresh-token/{personName}`
- `GET /api/auth/token-status/{personName}`
- `GET /api/auth/access-token/{personName}`
- `POST /api/auth/test-connection/{personName}`

**Tokens (4):**
- `GET /api/tokens`
- `GET /api/tokens/{personName}`
- `DELETE /api/tokens/expired`
- `GET /api/tokens/stats/summary`

**Health (1):**
- `GET /health`

**Dependencies:**
```json
{
  "express": "^4.18.0",
  "aws-sdk": "^2.1400.0",
  "@aws-sdk/client-dynamodb": "^3.400.0",
  "@aws-sdk/lib-dynamodb": "^3.400.0",
  "bcryptjs": "^2.4.3",
  "jsonwebtoken": "^9.0.0",
  "axios": "^1.5.0",
  "joi": "^17.10.0"
}
```

**DynamoDB Tables Used:**
- Users (read/write)
- Persons (read/write)
- Tokens (read/write)

**External APIs:**
- Questrade OAuth API

**Estimated Invocations/Month:** 10,000
**Estimated Cost/Month:** $0.13

---

### Lambda 2: Sync Operations

**Function Name:** `questrade-sync-operations`

**Purpose:** Synchronize data from Questrade API

**Runtime Configuration:**
```
Runtime: Node.js 18.x
Memory: 1024 MB (needs more for API processing)
Timeout: 60 seconds (external API calls)
Architecture: arm64
Reserved Concurrency: 5 (prevent Questrade API rate limiting)
```

**Environment Variables:**
```
DYNAMODB_ACCOUNTS_TABLE: questrade-accounts
DYNAMODB_POSITIONS_TABLE: questrade-positions
DYNAMODB_ACTIVITIES_TABLE: questrade-activities
DYNAMODB_SYMBOLS_TABLE: questrade-symbols
DYNAMODB_SYNC_HISTORY_TABLE: questrade-sync-history
DYNAMODB_TOKENS_TABLE: questrade-tokens
QUESTRADE_API_TIMEOUT: 30000
LOG_LEVEL: info
NODE_ENV: production
```

**Endpoints (7):**
- `POST /api/sync/all` - Sync all persons
- `POST /api/sync/person/{personName}` - Sync specific person
- `POST /api/sync/accounts/{personName}` - Sync accounts only
- `POST /api/sync/positions/{personName}` - Sync positions only
- `POST /api/sync/activities/{personName}` - Sync activities only
- `GET /api/sync/status` - Get sync status
- `GET /api/sync/history` - Get sync history

**Dependencies:**
```json
{
  "express": "^4.18.0",
  "@aws-sdk/client-dynamodb": "^3.400.0",
  "@aws-sdk/lib-dynamodb": "^3.400.0",
  "axios": "^1.5.0",
  "p-queue": "^7.3.0",
  "date-fns": "^2.30.0"
}
```

**DynamoDB Tables Used:**
- Tokens (read)
- Accounts (write)
- Positions (write)
- Activities (write)
- Symbols (write)
- SyncHistory (write)

**External APIs:**
- Questrade REST API (rate limited)

**Special Considerations:**
- Implements retry logic for failed API calls
- Batch writes to DynamoDB (max 25 items)
- Transaction support for atomic updates
- Error handling for partial sync failures

**Estimated Invocations/Month:** 10,000
**Estimated Cost/Month:** $3.42

---

### Lambda 3: Data Read Service

**Function Name:** `questrade-data-read-service`

**Purpose:** Handle all read-only data queries (accounts, positions, activities, stats)

**Runtime Configuration:**
```
Runtime: Node.js 18.x
Memory: 512 MB
Timeout: 10 seconds
Architecture: arm64
```

**Environment Variables:**
```
DYNAMODB_ACCOUNTS_TABLE: questrade-accounts
DYNAMODB_POSITIONS_TABLE: questrade-positions
DYNAMODB_ACTIVITIES_TABLE: questrade-activities
DYNAMODB_SYNC_HISTORY_TABLE: questrade-sync-history
LOG_LEVEL: info
NODE_ENV: production
```

**Endpoints (27):**

**Accounts (5):**
- `GET /api/accounts`
- `GET /api/accounts/{personName}`
- `GET /api/accounts/detail/{accountId}`
- `GET /api/accounts/summary/{personName}`
- `GET /api/accounts/dropdown-options`

**Positions (6):**
- `GET /api/positions`
- `GET /api/positions/{accountId}`
- `GET /api/positions/person/{personName}`
- `GET /api/positions/summary/{personName}`
- `GET /api/positions/top/{personName}`
- `GET /api/positions/pnl/{personName}`

**Activities (5):**
- `GET /api/activities`
- `GET /api/activities/{accountId}`
- `GET /api/activities/person/{personName}`
- `GET /api/activities/summary/{personName}`
- `GET /api/activities/types/list`

**Statistics (5):**
- `GET /api/stats/sync`
- `GET /api/stats/data`
- `GET /api/stats/errors`
- `GET /api/stats/person/{personName}`
- `GET /api/stats/performance`

**Health (1):**
- `GET /health`

**Dependencies:**
```json
{
  "express": "^4.18.0",
  "@aws-sdk/client-dynamodb": "^3.400.0",
  "@aws-sdk/lib-dynamodb": "^3.400.0",
  "date-fns": "^2.30.0"
}
```

**DynamoDB Tables Used:**
- Accounts (read)
- Positions (read)
- Activities (read)
- SyncHistory (read)

**Caching Strategy:**
- In-memory cache for frequently accessed data (5 minutes TTL)
- Response caching at API Gateway level

**Estimated Invocations/Month:** 70,000
**Estimated Cost/Month:** $1.20

---

### Lambda 4: Portfolio Analytics

**Function Name:** `questrade-portfolio-analytics`

**Purpose:** Complex calculations, reports, performance analysis

**Runtime Configuration:**
```
Runtime: Node.js 18.x
Memory: 2048 MB (high for complex calculations)
Timeout: 30 seconds
Architecture: arm64
```

**Environment Variables:**
```
DYNAMODB_ACCOUNTS_TABLE: questrade-accounts
DYNAMODB_POSITIONS_TABLE: questrade-positions
DYNAMODB_ACTIVITIES_TABLE: questrade-activities
DYNAMODB_SYMBOLS_TABLE: questrade-symbols
LOG_LEVEL: info
NODE_ENV: production
```

**Endpoints (38):**

**Portfolio (8):**
- `GET /api/portfolio/summary`
- `GET /api/portfolio/positions`
- `GET /api/portfolio/{personName}`
- `GET /api/portfolio/{personName}/summary`
- `GET /api/portfolio/{personName}/holdings`
- `GET /api/portfolio/{personName}/value`
- `GET /api/portfolio/{personName}/positions`
- `POST /api/portfolio/{personName}/snapshot`

**Performance (4):**
- `GET /api/performance/{personName}`
- `GET /api/performance/{personName}/history`
- `GET /api/performance/{personName}/returns`
- `GET /api/performance/{personName}/daily`

**Allocation (6):**
- `GET /api/allocation/{personName}`
- `GET /api/allocation/{personName}/sector`
- `GET /api/allocation/{personName}/geographic`
- `GET /api/allocation/{personName}/currency`
- `GET /api/allocation/{personName}/account-type`
- `GET /api/allocation/{personName}/market-cap`

**Analytics (5):**
- `GET /api/analytics/{personName}/risk`
- `GET /api/analytics/{personName}/diversification`
- `GET /api/analytics/{personName}/correlation`
- `GET /api/analytics/{personName}/concentration`
- `GET /api/analytics/{personName}/drawdown`

**Reports (4):**
- `GET /api/reports/{personName}/summary`
- `GET /api/reports/{personName}/detailed`
- `GET /api/reports/{personName}/tax`
- `POST /api/reports/{personName}/custom`

**Comparison (3):**
- `GET /api/comparison/persons`
- `GET /api/comparison/{personName}/benchmark`
- `GET /api/comparison/{personName}/period`

**Health (1):**
- `GET /health`

**Dependencies:**
```json
{
  "express": "^4.18.0",
  "@aws-sdk/client-dynamodb": "^3.400.0",
  "@aws-sdk/lib-dynamodb": "^3.400.0",
  "mathjs": "^11.11.0",
  "date-fns": "^2.30.0",
  "lodash": "^4.17.21"
}
```

**DynamoDB Tables Used:**
- Accounts (read)
- Positions (read)
- Activities (read)
- Symbols (read)

**Special Considerations:**
- Implements complex financial calculations (Sharpe ratio, correlation matrix, etc.)
- Memory-intensive operations
- May benefit from result caching
- Consider moving heavy calculations to Step Functions for very large portfolios

**Estimated Invocations/Month:** 20,000
**Estimated Cost/Month:** $3.42

---

### Lambda 5: Market Data Service

**Function Name:** `questrade-market-data-service`

**Purpose:** Market quotes, symbols, and market data

**Runtime Configuration:**
```
Runtime: Node.js 18.x
Memory: 512 MB
Timeout: 10 seconds
Architecture: arm64
```

**Environment Variables:**
```
DYNAMODB_SYMBOLS_TABLE: questrade-symbols
DYNAMODB_TOKENS_TABLE: questrade-tokens
QUESTRADE_API_TIMEOUT: 10000
LOG_LEVEL: info
NODE_ENV: production
```

**Endpoints (15):**

**Markets (5):**
- `GET /api/markets/status`
- `GET /api/markets/summary`
- `GET /api/markets/movers`
- `GET /api/markets/sectors`
- `GET /api/markets/breadth`

**Quotes (5):**
- `GET /api/quotes/{symbol}`
- `GET /api/quotes`
- `GET /api/quotes/{symbol}/stream`
- `GET /api/quotes/{symbol}/history`
- `POST /api/quotes/{symbol}/refresh`

**Symbols (5):**
- `GET /api/symbols/search`
- `GET /api/symbols/{symbolId}`
- `GET /api/symbols/{symbol}/options`
- `GET /api/symbols/{symbol}/fundamentals`
- `POST /api/symbols/{symbol}/sync`

**Health (1):**
- `GET /health`

**Dependencies:**
```json
{
  "express": "^4.18.0",
  "@aws-sdk/client-dynamodb": "^3.400.0",
  "@aws-sdk/lib-dynamodb": "^3.400.0",
  "axios": "^1.5.0",
  "node-cache": "^5.1.2"
}
```

**DynamoDB Tables Used:**
- Symbols (read/write)
- Tokens (read)

**External APIs:**
- Questrade Market Data API

**Caching Strategy:**
- Aggressive in-memory caching (1-5 minutes)
- Quote data cached for 1 minute
- Symbol metadata cached for 1 hour

**Estimated Invocations/Month:** 15,000
**Estimated Cost/Month:** $0.26

---

### Lambda 6: Watchlist Service

**Function Name:** `questrade-watchlist-service`

**Purpose:** Manage user watchlists and alerts

**Runtime Configuration:**
```
Runtime: Node.js 18.x
Memory: 512 MB
Timeout: 10 seconds
Architecture: arm64
```

**Environment Variables:**
```
DYNAMODB_WATCHLISTS_TABLE: questrade-watchlists
DYNAMODB_WATCHLIST_SYMBOLS_TABLE: questrade-watchlist-symbols
DYNAMODB_SYMBOLS_TABLE: questrade-symbols
LOG_LEVEL: info
NODE_ENV: production
```

**Endpoints (9):**
- `GET /api/watchlists/{personName}`
- `GET /api/watchlists/{personName}/{watchlistId}`
- `GET /api/watchlists/{personName}/{watchlistId}/quotes`
- `POST /api/watchlists/{personName}`
- `PUT /api/watchlists/{watchlistId}`
- `POST /api/watchlists/{watchlistId}/symbols`
- `DELETE /api/watchlists/{watchlistId}/symbols/{symbol}`
- `DELETE /api/watchlists/{watchlistId}`
- `POST /api/watchlists/{watchlistId}/alerts`

**Dependencies:**
```json
{
  "express": "^4.18.0",
  "@aws-sdk/client-dynamodb": "^3.400.0",
  "@aws-sdk/lib-dynamodb": "^3.400.0",
  "uuid": "^9.0.0"
}
```

**DynamoDB Tables Used:**
- Watchlists (read/write)
- WatchlistSymbols (read/write)
- Symbols (read)

**Special Considerations:**
- Transaction support for atomic watchlist operations
- Cascading deletes (delete watchlist → delete all symbols)

**Estimated Invocations/Month:** 5,000
**Estimated Cost/Month:** $0.06

---

### Lambda 7: JWT Authorizer

**Function Name:** `questrade-jwt-authorizer`

**Purpose:** Validate JWT tokens for API Gateway

**Runtime Configuration:**
```
Runtime: Node.js 18.x
Memory: 256 MB (lightweight)
Timeout: 5 seconds
Architecture: arm64
```

**Environment Variables:**
```
JWT_SECRET: (from Parameter Store)
DYNAMODB_USERS_TABLE: questrade-users
CACHE_TTL: 300 (5 minutes)
LOG_LEVEL: info
NODE_ENV: production
```

**Function Type:** API Gateway Lambda Authorizer (Token-based)

**Input:**
```json
{
  "type": "TOKEN",
  "authorizationToken": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "methodArn": "arn:aws:execute-api:us-east-1:123456789012:abcd1234/prod/GET/api/accounts"
}
```

**Output:**
```json
{
  "principalId": "usr_1a2b3c4d",
  "policyDocument": {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Action": "execute-api:Invoke",
        "Effect": "Allow",
        "Resource": "arn:aws:execute-api:us-east-1:123456789012:abcd1234/prod/*/*"
      }
    ]
  },
  "context": {
    "userId": "usr_1a2b3c4d",
    "username": "johndoe",
    "role": "admin",
    "personName": "john_questrade"
  }
}
```

**Dependencies:**
```json
{
  "jsonwebtoken": "^9.0.0",
  "@aws-sdk/client-dynamodb": "^3.400.0",
  "@aws-sdk/lib-dynamodb": "^3.400.0"
}
```

**Logic Flow:**
1. Extract JWT from `Authorization` header
2. Verify JWT signature and expiration
3. Decode JWT payload (userId, username, role)
4. Query DynamoDB Users table (check if user active)
5. Generate IAM policy (Allow or Deny)
6. Return policy + user context

**Caching:**
- API Gateway caches result for 5 minutes per token
- Reduces Lambda invocations by ~95%

**DynamoDB Tables Used:**
- Users (read)

**Estimated Invocations/Month:** 100,000
**Estimated Cost/Month:** $0.21

---

## Shared Components

### 1. DynamoDB Client Wrapper
```javascript
// Shared across all Lambdas
// utils/dynamodb.js

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1'
});

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertEmptyValues: false
  }
});

module.exports = docClient;
```

### 2. Logger
```javascript
// Shared logging utility
// utils/logger.js

const logLevels = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

const currentLevel = logLevels[process.env.LOG_LEVEL] || logLevels.info;

const logger = {
  debug: (message, meta) => {
    if (currentLevel <= logLevels.debug) {
      console.log(JSON.stringify({ level: 'debug', message, meta, timestamp: new Date().toISOString() }));
    }
  },
  info: (message, meta) => {
    if (currentLevel <= logLevels.info) {
      console.log(JSON.stringify({ level: 'info', message, meta, timestamp: new Date().toISOString() }));
    }
  },
  warn: (message, meta) => {
    if (currentLevel <= logLevels.warn) {
      console.warn(JSON.stringify({ level: 'warn', message, meta, timestamp: new Date().toISOString() }));
    }
  },
  error: (message, error) => {
    if (currentLevel <= logLevels.error) {
      console.error(JSON.stringify({
        level: 'error',
        message,
        error: error?.message,
        stack: error?.stack,
        timestamp: new Date().toISOString()
      }));
    }
  }
};

module.exports = logger;
```

### 3. Error Handler Middleware
```javascript
// Shared error handling
// middleware/errorHandler.js

const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  logger.error('Request error', err);

  // Known errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized'
    });
  }

  // DynamoDB errors
  if (err.name === 'ConditionalCheckFailedException') {
    return res.status(409).json({
      success: false,
      message: 'Resource conflict'
    });
  }

  // Default error
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
};

module.exports = errorHandler;
```

### 4. Request Validator
```javascript
// Shared request validation
// middleware/validator.js

const Joi = require('joi');
const logger = require('../utils/logger');

const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false });

    if (error) {
      logger.warn('Validation error', { errors: error.details });
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(d => d.message)
      });
    }

    next();
  };
};

module.exports = validate;
```

---

## Environment Variables

### Common Variables (All Lambdas)
```
AWS_REGION: us-east-1
NODE_ENV: production
LOG_LEVEL: info
```

### Security Variables (Parameter Store)
```
JWT_SECRET: /questrade/prod/jwt-secret (SecureString)
QUESTRADE_CLIENT_ID: /questrade/prod/client-id (SecureString)
QUESTRADE_CLIENT_SECRET: /questrade/prod/client-secret (SecureString)
```

### DynamoDB Table Names
```
DYNAMODB_USERS_TABLE: questrade-users
DYNAMODB_PERSONS_TABLE: questrade-persons
DYNAMODB_TOKENS_TABLE: questrade-tokens
DYNAMODB_ACCOUNTS_TABLE: questrade-accounts
DYNAMODB_POSITIONS_TABLE: questrade-positions
DYNAMODB_ACTIVITIES_TABLE: questrade-activities
DYNAMODB_SYMBOLS_TABLE: questrade-symbols
DYNAMODB_WATCHLISTS_TABLE: questrade-watchlists
DYNAMODB_WATCHLIST_SYMBOLS_TABLE: questrade-watchlist-symbols
DYNAMODB_SYNC_HISTORY_TABLE: questrade-sync-history
```

---

## IAM Permissions

### Lambda Execution Role (All Lambdas)
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    }
  ]
}
```

### DynamoDB Read Permissions
```json
{
  "Effect": "Allow",
  "Action": [
    "dynamodb:GetItem",
    "dynamodb:Query",
    "dynamodb:Scan",
    "dynamodb:BatchGetItem"
  ],
  "Resource": [
    "arn:aws:dynamodb:us-east-1:*:table/questrade-*",
    "arn:aws:dynamodb:us-east-1:*:table/questrade-*/index/*"
  ]
}
```

### DynamoDB Write Permissions (Auth, Sync, Watchlist Lambdas)
```json
{
  "Effect": "Allow",
  "Action": [
    "dynamodb:PutItem",
    "dynamodb:UpdateItem",
    "dynamodb:DeleteItem",
    "dynamodb:BatchWriteItem"
  ],
  "Resource": [
    "arn:aws:dynamodb:us-east-1:*:table/questrade-*"
  ]
}
```

### Parameter Store (Auth Lambda, Authorizer)
```json
{
  "Effect": "Allow",
  "Action": [
    "ssm:GetParameter",
    "ssm:GetParameters"
  ],
  "Resource": [
    "arn:aws:ssm:us-east-1:*:parameter/questrade/*"
  ]
}
```

---

## Deployment Package

### Package Structure
```
lambda-function.zip
├── node_modules/
├── src/
│   ├── handler.js
│   ├── app.js
│   └── ...
└── package.json
```

### Build Script (package.json)
```json
{
  "scripts": {
    "build": "npm ci --production",
    "package": "zip -r function.zip . -x '*.git*' 'tests/*' '*.md'",
    "deploy": "aws lambda update-function-code --function-name questrade-auth-service --zip-file fileb://function.zip"
  }
}
```

---

## Monitoring & Alerts

### CloudWatch Metrics (Auto-created)
- Invocations
- Duration
- Errors
- Throttles
- Concurrent Executions
- Iterator Age (for event source mappings)

### Custom Metrics
```javascript
// Example: Track business metrics
const { CloudWatch } = require('@aws-sdk/client-cloudwatch');

async function trackSyncSuccess(personName) {
  await cloudwatch.putMetricData({
    Namespace: 'Questrade/Sync',
    MetricData: [{
      MetricName: 'SyncSuccess',
      Value: 1,
      Unit: 'Count',
      Dimensions: [{ Name: 'PersonName', Value: personName }]
    }]
  });
}
```

### Recommended Alarms
1. **Error Rate > 5%** → Alert
2. **Duration > 80% of timeout** → Warning
3. **Throttles > 0** → Alert
4. **Concurrent Executions > 80% of limit** → Warning

---

## Best Practices

### 1. Cold Start Optimization
- Use arm64 architecture (faster cold starts)
- Minimize package size (use webpack/esbuild)
- Keep dependencies lean
- Initialize SDK clients outside handler

### 2. Error Handling
- Always catch and log errors
- Return proper HTTP status codes
- Implement retry logic for transient failures
- Use dead letter queues for failed events

### 3. Security
- Never log sensitive data (tokens, passwords)
- Use Parameter Store for secrets
- Validate all inputs
- Implement least-privilege IAM roles

### 4. Performance
- Reuse database connections
- Implement caching where appropriate
- Use batch operations
- Avoid recursive calls

### 5. Cost Optimization
- Right-size memory allocation
- Use arm64 architecture
- Implement efficient queries
- Clean up unused logs

---

## Testing Strategy

### Unit Tests
- Test service functions in isolation
- Mock DynamoDB calls
- Test error handling
- Test input validation

### Integration Tests
- Test with real DynamoDB (local or test account)
- Test API Gateway integration
- Test authorizer flow
- Test external API calls (Questrade)

### Load Tests
- Simulate concurrent requests
- Test cold start performance
- Test under throttling conditions
- Measure cost at scale

---

## Deployment Checklist

- [ ] Install dependencies (npm ci)
- [ ] Run tests (npm test)
- [ ] Build deployment package
- [ ] Update environment variables
- [ ] Deploy Lambda function
- [ ] Update API Gateway integration
- [ ] Test endpoints
- [ ] Monitor CloudWatch logs
- [ ] Verify metrics and alarms

---

## References
- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [Lambda Node.js Guide](https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html)
- [Lambda Authorizers](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-lambda-authorizer-input.html)
