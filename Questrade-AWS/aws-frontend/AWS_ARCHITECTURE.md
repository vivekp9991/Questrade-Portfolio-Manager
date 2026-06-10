# AWS Architecture - Portfolio Manager

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER BROWSER                             │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐  │
│  │  React/Solid │  │ JWT Token    │  │ Questrade Token     │  │
│  │  Frontend    │  │ Cache        │  │ Cache (30min)       │  │
│  └──────┬───────┘  └──────┬───────┘  └─────────┬───────────┘  │
│         │                  │                    │               │
└─────────┼──────────────────┼────────────────────┼───────────────┘
          │                  │                    │
          │ HTTPS            │ JWT Auth           │ WebSocket
          │                  │                    │
┌─────────▼──────────────────▼────────────────────▼───────────────┐
│                      AWS CLOUD                                   │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │              CloudFront CDN (Edge Locations)              │ │
│  │  • Global CDN with HTTPS                                  │ │
│  │  • Cache static assets (JS, CSS, images)                 │ │
│  │  • ~$0.50-2/month                                         │ │
│  └─────────────┬─────────────────────────────────────────────┘ │
│                │                                                 │
│  ┌─────────────▼─────────────────────────────────────────────┐ │
│  │              S3 Static Website Hosting                    │ │
│  │  • Stores built frontend files (HTML, JS, CSS)           │ │
│  │  • ~$0.50/month for 1GB                                   │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │           API Gateway (HTTP API)                          │ │
│  │  • /api/login → Auth Service                              │ │
│  │  • /api/persons → Auth Service                            │ │
│  │  • /api/data/* → Data Read Service                        │ │
│  │  • /api/sync/* → Sync Operations                          │ │
│  │  • /api/portfolio/* → Portfolio Analytics                 │ │
│  │  • /api/market/* → Market Data Service                    │ │
│  │  • CORS enabled for frontend domain                       │ │
│  └─────┬──────────┬──────────┬──────────┬──────────┬─────────┘ │
│        │          │          │          │          │            │
│  ┌─────▼──┐  ┌───▼───┐  ┌──▼────┐  ┌──▼────┐  ┌─▼──────┐    │
│  │ Auth   │  │ Data  │  │ Sync  │  │Portfo-│  │ Market │    │
│  │Service │  │ Read  │  │ Ops   │  │ lio   │  │  Data  │    │
│  │Lambda  │  │Lambda │  │Lambda │  │Lambda │  │ Lambda │    │
│  │512MB   │  │512MB  │  │1GB    │  │2GB    │  │ 512MB  │    │
│  └────┬───┘  └───┬───┘  └───┬───┘  └───┬───┘  └────┬───┘    │
│       │          │          │          │          │            │
│       └──────────┴──────────┴──────────┴──────────┘            │
│                          │                                      │
│  ┌───────────────────────▼───────────────────────────────────┐ │
│  │                  DynamoDB Tables                           │ │
│  │  • Users (userId, username, password hash)                │ │
│  │  • Persons (personName, userId, Questrade info)           │ │
│  │  • Tokens (personName, accessToken, refreshToken)         │ │
│  │  • Accounts (accountId, personName, balance)              │ │
│  │  • Positions (accountId, symbolId, quantity)              │ │
│  │  • Activities (accountId, activityDateTime, type)         │ │
│  │  • Symbols (symbolId, symbol, name, sector)               │ │
│  │  • SyncHistory (personName, syncTimestamp, status)        │ │
│  │  • PAY_PER_REQUEST billing (only pay for actual usage)    │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                            │
                            │ HTTPS API
                            │
┌───────────────────────────▼───────────────────────────────────┐
│                  Questrade API (External)                      │
│  • Authentication: OAuth 2.0 Refresh Token Flow               │
│  • Access Token: Expires every 30 minutes                     │
│  • WebSocket: wss://api.questrade.com:port                    │
│  • REST API: https://api.questrade.com/v1/                    │
└────────────────────────────────────────────────────────────────┘
```

---

## Component Details

### 1. Frontend Layer (CloudFront + S3)

#### CloudFront Configuration
```yaml
Distribution Settings:
  Origin: portfolio-manager-frontend.s3-website-us-east-1.amazonaws.com
  Price Class: Use Only North America and Europe (cheapest)
  Alternate Domain Name (Optional): portfolio.yourdomain.com
  SSL Certificate: AWS Certificate Manager (free)
  Viewer Protocol Policy: Redirect HTTP to HTTPS
  Allowed HTTP Methods: GET, HEAD, OPTIONS

Cache Behaviors:
  - Path: /static/*
    TTL: 31536000 (1 year)
    Cache Policy: CachingOptimized

  - Path: /index.html
    TTL: 0 (no cache - for SPA updates)
    Cache Policy: CachingDisabled

  - Path: /*
    TTL: 86400 (1 day)
    Cache Policy: CachingOptimized

Custom Error Responses:
  - Error Code: 403 (Forbidden)
    Response: /index.html
    Status Code: 200
    (Handles SPA routing for /dashboard, /settings, etc.)

  - Error Code: 404 (Not Found)
    Response: /index.html
    Status Code: 200
```

#### S3 Bucket Configuration
```yaml
Bucket Name: portfolio-manager-frontend
Region: us-east-1 (same as API Gateway for lowest latency)
Versioning: Enabled (rollback deployments if needed)
Encryption: AES-256 (SSE-S3)

Static Website Hosting:
  Index Document: index.html
  Error Document: index.html (SPA routing)

Bucket Policy:
  Effect: Allow
  Principal: "*"
  Action: s3:GetObject
  Resource: arn:aws:s3:::portfolio-manager-frontend/*

Lifecycle Policy (Optional - Cost Optimization):
  - Delete old versions after 30 days
  - Move to Intelligent-Tiering after 30 days (if >128KB files)
```

---

### 2. API Layer (API Gateway + Lambda)

#### API Gateway Configuration
```yaml
API Type: HTTP API (cheaper than REST API)
Stage: dev
Base URL: https://abc123.execute-api.us-east-1.amazonaws.com/dev

CORS Configuration:
  AllowOrigins:
    - https://d1234567890.cloudfront.net (CloudFront domain)
    - https://portfolio.yourdomain.com (if custom domain)
  AllowMethods:
    - GET, POST, PUT, DELETE, OPTIONS
  AllowHeaders:
    - Content-Type, Authorization
  ExposeHeaders:
    - Content-Length, X-Request-Id
  MaxAge: 3600

Throttling (Cost Control):
  Rate Limit: 100 requests/second
  Burst Limit: 200 requests

Routes:
  # Auth Service (512MB Lambda)
  POST   /api/login                    → AuthServiceFunction
  POST   /api/login/verify             → AuthServiceFunction
  POST   /api/login/refresh            → AuthServiceFunction
  GET    /api/persons                  → AuthServiceFunction
  POST   /api/persons                  → AuthServiceFunction
  GET    /api/auth/access-token/{personName} → AuthServiceFunction

  # Data Read Service (512MB Lambda)
  GET    /api/data/accounts            → DataReadServiceFunction
  GET    /api/data/positions           → DataReadServiceFunction
  GET    /api/data/activities          → DataReadServiceFunction

  # Sync Operations (1GB Lambda - heavy processing)
  POST   /api/sync/person/{personName} → SyncOperationsFunction
  POST   /api/sync/all                 → SyncOperationsFunction
  GET    /api/sync/status              → SyncOperationsFunction

  # Portfolio Analytics (2GB Lambda - complex calculations)
  GET    /api/portfolio/{personName}   → PortfolioAnalyticsFunction
  GET    /api/performance/{personName} → PortfolioAnalyticsFunction
  GET    /api/allocation/{personName}  → PortfolioAnalyticsFunction

  # Market Data Service (512MB Lambda)
  GET    /api/market/quotes/{symbols}  → MarketDataServiceFunction
  GET    /api/market/symbols/search    → MarketDataServiceFunction
```

#### Lambda Functions
```yaml
# Auth Service Function
FunctionName: questrade-auth-service-dev
Runtime: nodejs20.x
Architecture: arm64 (Graviton2 - 20% cheaper)
MemorySize: 512MB
Timeout: 10 seconds
Environment Variables:
  USERS_TABLE: questrade-users-dev
  PERSONS_TABLE: questrade-persons-dev
  TOKENS_TABLE: questrade-tokens-dev
  JWT_SECRET: ${SecretFromSecretsManager}
  ENCRYPTION_KEY: ${SecretFromSecretsManager}

# Sync Operations Function
FunctionName: questrade-sync-operations-dev
Runtime: nodejs20.x
Architecture: arm64
MemorySize: 1024MB
Timeout: 60 seconds
ReservedConcurrentExecutions: 5 (prevent parallel sync conflicts)
Environment Variables:
  ACCOUNTS_TABLE: questrade-accounts-dev
  POSITIONS_TABLE: questrade-positions-dev
  ACTIVITIES_TABLE: questrade-activities-dev
  SYNC_HISTORY_TABLE: questrade-sync-history-dev
```

---

### 3. Data Layer (DynamoDB)

#### Table Designs
```yaml
# Users Table
TableName: questrade-users-dev
BillingMode: PAY_PER_REQUEST
KeySchema:
  HASH: userId (String)
GSI:
  username-index:
    HASH: username (String)
Attributes:
  userId: Unique user ID
  username: Login username
  passwordHash: bcrypt hash
  createdAt: ISO timestamp
  lastLoginAt: ISO timestamp

# Tokens Table (Questrade Access Tokens)
TableName: questrade-tokens-dev
BillingMode: PAY_PER_REQUEST
KeySchema:
  HASH: personName (String)
  RANGE: tokenType (String - "access" or "refresh")
Attributes:
  personName: "Vivek", "Reshma", etc.
  tokenType: "access" or "refresh"
  token: Encrypted token
  apiServer: "https://api02.iq.questrade.com"
  expiresAt: Unix timestamp
  createdAt: Unix timestamp
TTL: ttl (auto-delete expired tokens)

# Positions Table
TableName: questrade-positions-dev
BillingMode: PAY_PER_REQUEST
KeySchema:
  HASH: accountId (String)
  RANGE: symbolId (String)
GSI:
  personName-symbol-index:
    HASH: personName (String)
    RANGE: symbol (String)
Attributes:
  accountId: "12345678"
  symbolId: "9876543"
  personName: "Vivek"
  symbol: "AAPL"
  quantity: 100
  currentMarketValue: 17500.50
  currentPrice: 175.00
  averageEntryPrice: 150.00
  totalCost: 15000.00
  openPnl: 2500.50
  updatedAt: ISO timestamp

# SyncHistory Table
TableName: questrade-sync-history-dev
BillingMode: PAY_PER_REQUEST
KeySchema:
  HASH: personName (String)
  RANGE: syncTimestamp (Number - Unix timestamp)
GSI:
  status-date-index:
    HASH: status (String - "success" or "failure")
    RANGE: syncTimestamp (Number)
Attributes:
  personName: "Vivek"
  syncTimestamp: 1698765432000
  status: "success"
  syncType: "full" or "incremental"
  itemsSynced: {accounts: 3, positions: 25, activities: 150}
  duration: 4523 (milliseconds)
  error: null (or error message if failed)
TTL: ttl (auto-delete after 90 days)
```

---

## Authentication Flow

### JWT Authentication (Frontend ↔ Backend)
```
┌──────────┐                          ┌──────────────┐
│  Browser │                          │ Auth Lambda  │
└────┬─────┘                          └──────┬───────┘
     │                                       │
     │  POST /api/login                      │
     │  {username, password}                 │
     ├──────────────────────────────────────>│
     │                                       │
     │                                       │ Verify password hash
     │                                       │ Generate JWT token
     │                                       │
     │  200 OK                               │
     │  {accessToken, refreshToken, userId}  │
     │<──────────────────────────────────────┤
     │                                       │
     │  Store in localStorage:               │
     │  - accessToken (expires in 1 hour)    │
     │  - refreshToken (expires in 7 days)   │
     │  - expiresAt timestamp                │
     │                                       │
     │  GET /api/data/positions              │
     │  Authorization: Bearer <JWT>          │
     ├──────────────────────────────────────>│
     │                                       │
     │                                       │ Validate JWT
     │                                       │ Check expiry
     │                                       │
     │  200 OK {positions: [...]}            │
     │<──────────────────────────────────────┤
     │                                       │
     │  (5 minutes before JWT expiry)        │
     │  POST /api/login/refresh              │
     │  {refreshToken}                       │
     ├──────────────────────────────────────>│
     │                                       │
     │  200 OK {newAccessToken, expiresAt}   │
     │<──────────────────────────────────────┤
     │                                       │
     │  Update localStorage with new token   │
     │                                       │
```

### Questrade Token Flow (Backend ↔ Questrade)
```
┌──────────┐        ┌──────────────┐        ┌──────────────┐
│  Browser │        │ Market Lambda│        │ Questrade API│
└────┬─────┘        └──────┬───────┘        └──────┬───────┘
     │                     │                       │
     │  WebSocket connect  │                       │
     ├────────────────────>│                       │
     │                     │                       │
     │                     │  GET /v1/accounts    │
     │                     │  Authorization: Bearer <QT_TOKEN>
     │                     ├──────────────────────>│
     │                     │                       │
     │                     │  401 Unauthorized     │
     │                     │  (token expired)      │
     │                     │<──────────────────────┤
     │                     │                       │
     │                     │  Fetch refresh token from DynamoDB
     │                     │                       │
     │                     │  POST /v1/token       │
     │                     │  {grant_type, refresh_token}
     │                     ├──────────────────────>│
     │                     │                       │
     │                     │  200 OK {access_token,│
     │                     │  api_server, expires_in}
     │                     │<──────────────────────┤
     │                     │                       │
     │                     │  Store new token in DynamoDB
     │                     │                       │
     │                     │  GET /v1/accounts     │
     │                     │  Authorization: Bearer <NEW_TOKEN>
     │                     ├──────────────────────>│
     │                     │                       │
     │                     │  200 OK {accounts}    │
     │                     │<──────────────────────┤
     │                     │                       │
     │  Connected          │                       │
     │<────────────────────┤                       │
     │                     │                       │
```

---

## Cost Breakdown (Detailed)

### Monthly Costs for 1-2 Users

#### Frontend Hosting
```
S3 Storage:
  - 1GB static files × $0.023/GB = $0.023/month
  - 1,000 GET requests × $0.0004/1000 = $0.0004/month
  - 100 PUT requests × $0.005/1000 = $0.0005/month
  Subtotal: ~$0.03/month

CloudFront CDN:
  - 2GB data transfer × $0.085/GB = $0.17/month
  - 10,000 HTTPS requests × $0.0100/10000 = $0.01/month
  Subtotal: ~$0.18/month

Frontend Total: $0.21/month
```

#### Backend (API Gateway + Lambda)
```
API Gateway (HTTP API):
  - 100,000 requests × $1.00/million = $0.10/month

Lambda:
  - Auth Service: 10,000 invocations × 512MB × 200ms
    = 10,000 × 0.0000166667 (GB-seconds) × $0.0000166667
    = $0.003/month

  - Data Read: 50,000 invocations × 512MB × 100ms
    = $0.009/month

  - Sync Operations: 100 invocations × 1024MB × 30s
    = $0.05/month

  - Portfolio Analytics: 5,000 invocations × 2048MB × 1s
    = $0.17/month

Lambda Total: $0.23/month

Backend Total: $0.33/month
```

#### Database (DynamoDB)
```
DynamoDB (PAY_PER_REQUEST):
  - 100,000 read units × $0.25/million = $0.025/month
  - 10,000 write units × $1.25/million = $0.0125/month
  - 1GB storage × $0.25/GB = $0.25/month

DynamoDB Total: $0.29/month
```

#### Total Monthly Cost
```
Frontend:  $0.21
Backend:   $0.33
Database:  $0.29
─────────────────
TOTAL:     $0.83/month

With 20% AWS tax/rounding: ~$1.00-1.50/month
```

### Free Tier (First 12 Months)
If you're on AWS Free Tier, you get:
- ✅ **Lambda:** 1M requests + 400,000 GB-seconds/month → **FREE**
- ✅ **API Gateway:** 1M requests/month → **FREE**
- ✅ **DynamoDB:** 25GB storage + 25 read/write units → **FREE**
- ❌ **S3:** 5GB storage + 20,000 GET → **FREE**
- ❌ **CloudFront:** 50GB data transfer → **FREE**

**Free Tier Total: $0/month for first year!** 🎉

---

## Deployment Architecture Comparison

### Current (Local Development)
```
Frontend (Vite Dev Server)  :3000
  ↓
API Proxy /api → http://localhost:4003
  ↓
Main Backend (Express)      :4003
  ↓ (proxy)
Auth Backend                :4001
Data Backend                :4002
Sync Backend                :4003
Market Backend              :4004
  ↓
SQLite Database (local file)
```

**Problems:**
- ❌ Single machine (no redundancy)
- ❌ No HTTPS
- ❌ Manual server management
- ❌ Can't scale beyond 1 user
- ❌ No backups

### Production (AWS Serverless)
```
CloudFront CDN (global)
  ↓
S3 Static Hosting (HTML/JS/CSS)
  ↓
API Gateway (managed)
  ↓
Lambda Functions (auto-scale)
  ↓
DynamoDB (managed, replicated)
```

**Benefits:**
- ✅ 99.99% uptime SLA
- ✅ Auto-scaling (0 to millions)
- ✅ HTTPS by default
- ✅ Zero server maintenance
- ✅ Global CDN (fast worldwide)
- ✅ Automatic backups
- ✅ Pay only for usage

---

## Security Best Practices

### 1. Frontend Security
```javascript
// Store JWT in localStorage (accessible to JS)
// NOT in cookies (prevents XSS if httpOnly)
localStorage.setItem('authToken', token);

// Add security headers in CloudFront
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Content-Security-Policy: default-src 'self'

// Never log sensitive data in production
if (process.env.NODE_ENV !== 'production') {
  console.log('Token:', token);
}
```

### 2. Backend Security
```javascript
// JWT validation on every protected route
const decoded = jwt.verify(token, process.env.JWT_SECRET);

// Encrypt sensitive data in DynamoDB
const encryptedToken = encrypt(accessToken, process.env.ENCRYPTION_KEY);

// Use AWS Secrets Manager for secrets (not env vars)
const secret = await secretsManager.getSecretValue({
  SecretId: 'questrade-jwt-secret'
}).promise();

// Rate limiting on API Gateway
const throttleSettings = {
  rateLimit: 100,  // requests per second
  burstLimit: 200  // max concurrent
};
```

### 3. Database Security
```yaml
DynamoDB:
  Encryption: AWS-managed keys (KMS)
  Backup: Point-in-time recovery (PITR)
  VPC: Private subnet (no public access)

IAM Policies (Least Privilege):
  - Lambda functions can ONLY access specific tables
  - Read-only Lambda cannot write to DynamoDB
  - Sync Lambda has write access ONLY to sync tables
```

---

## Performance Optimization

### 1. CloudFront Caching Strategy
```
Asset Type          | Cache TTL | Compress
--------------------|-----------|----------
/index.html         | 0 sec     | Yes
/static/js/*.js     | 1 year    | Yes (Gzip)
/static/css/*.css   | 1 year    | Yes (Gzip)
/static/img/*.png   | 1 year    | No
/api/*              | 0 sec     | No (dynamic)
```

### 2. Frontend Bundle Optimization
```javascript
// Vite code splitting
import { lazy } from 'solid-js';

const Holdings = lazy(() => import('./pages/Holdings'));
const Analysis = lazy(() => import('./pages/Analysis'));

// Result: Smaller initial bundle
// - main.js: 150KB → 80KB
// - holdings.js: Lazy loaded (70KB)
// - analysis.js: Lazy loaded (50KB)
```

### 3. Lambda Cold Start Optimization
```javascript
// Provisioned Concurrency (optional - costs $0.015/hour)
// Keeps 1 Lambda "warm" at all times (no cold starts)
ProvisionedConcurrencyConfig:
  ProvisionedConcurrentExecutions: 1

// Alternative: Use Lambda Snapstart (Java only)
// Or: Accept 200-500ms cold start for Node.js
```

### 4. DynamoDB Query Optimization
```javascript
// BAD: Scan entire table (slow + expensive)
const items = await dynamoDB.scan({
  TableName: 'positions'
}).promise();

// GOOD: Query with partition key (fast + cheap)
const items = await dynamoDB.query({
  TableName: 'positions',
  KeyConditionExpression: 'accountId = :accountId',
  ExpressionAttributeValues: {
    ':accountId': 'ACC123'
  }
}).promise();

// Use GSI for non-primary key queries
const items = await dynamoDB.query({
  TableName: 'positions',
  IndexName: 'personName-symbol-index',
  KeyConditionExpression: 'personName = :personName',
  ExpressionAttributeValues: {
    ':personName': 'Vivek'
  }
}).promise();
```

---

## Monitoring & Alerts

### CloudWatch Dashboards
```yaml
Dashboard: Portfolio-Manager-Production

Widgets:
  - API Gateway:
      - Request Count (per minute)
      - 4xx Error Rate (%)
      - 5xx Error Rate (%)
      - Latency (p50, p95, p99)

  - Lambda:
      - Invocation Count (per function)
      - Error Count (per function)
      - Duration (p50, p95, p99)
      - Throttles

  - DynamoDB:
      - Read/Write Capacity Used
      - Throttled Requests
      - User Errors (4xx)

  - CloudFront:
      - Requests (per minute)
      - Cache Hit Rate (%)
      - Error Rate (%)
```

### Alerts (SNS → Email)
```yaml
Alarm 1: High Error Rate
  Metric: API Gateway 5xx Errors
  Threshold: > 5% for 5 minutes
  Action: Send email to admin@yourdomain.com

Alarm 2: Lambda Failures
  Metric: Lambda Errors
  Threshold: > 10 errors in 5 minutes
  Action: Send email

Alarm 3: DynamoDB Throttling
  Metric: ThrottledRequests
  Threshold: > 0 for 5 minutes
  Action: Send email (may need to increase capacity)

Alarm 4: High Cost
  Metric: Estimated Charges
  Threshold: > $10/day
  Action: Send email (investigate spike)
```

---

## Disaster Recovery

### Backup Strategy
```yaml
DynamoDB:
  Point-in-Time Recovery: Enabled
  Retention: 35 days
  Manual Snapshots: Weekly (before major updates)

S3:
  Versioning: Enabled
  Cross-Region Replication: Optional (adds cost)
  Lifecycle Policy: Keep last 10 versions

CloudFormation:
  Stack Backup: Git repository
  Infrastructure as Code: template.yaml
  Recovery Time: ~10 minutes (redeploy stack)
```

### Rollback Procedures
```bash
# Frontend Rollback (S3)
aws s3 sync s3://portfolio-manager-frontend-backup/ \
  s3://portfolio-manager-frontend/ --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id E1234567890 --paths "/*"

# Backend Rollback (Lambda)
aws lambda update-function-code \
  --function-name questrade-auth-service-dev \
  --s3-bucket my-lambda-bucket \
  --s3-key auth-service-v1.2.3.zip

# Database Rollback (DynamoDB)
aws dynamodb restore-table-to-point-in-time \
  --source-table-name questrade-positions-dev \
  --target-table-name questrade-positions-dev-restored \
  --restore-date-time 2024-01-15T10:00:00Z
```

---

## Next Steps Checklist

### ✅ Phase 1: Folder Structure (COMPLETED)
- [x] Create `aws-frontend/` folder
- [x] Create `aws/` folder (note: AWS-Backend needs manual move)

### 📝 Phase 2: Documentation (COMPLETED)
- [x] Implementation plan with WebSocket token caching
- [x] AWS architecture diagram
- [x] Cost breakdown
- [x] Security best practices

### ⏳ Phase 3: Code Migration (PENDING)
- [ ] Copy `Frontend-v2/` code to `aws-frontend/`
- [ ] Create `.env.production` with API Gateway URL
- [ ] Update `src/services/api.js` to use AWS endpoints
- [ ] Implement JWT token caching
- [ ] Implement Questrade token caching
- [ ] Test build process (`npm run build`)

### ⏳ Phase 4: AWS Setup (PENDING)
- [ ] Get API Gateway URL from AWS Backend deployment
- [ ] Create S3 bucket for frontend
- [ ] Create CloudFront distribution
- [ ] Deploy frontend to S3
- [ ] Test end-to-end integration

### ⏳ Phase 5: Testing (PENDING)
- [ ] Test login flow
- [ ] Test data fetching (positions, accounts, activities)
- [ ] Test WebSocket real-time updates
- [ ] Test token refresh logic
- [ ] Performance testing (load time < 2 sec)

---

**Ready to proceed? Let me know which phase to start!**
