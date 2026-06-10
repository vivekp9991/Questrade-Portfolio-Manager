# API Gateway Configuration

## Table of Contents
1. [Overview](#overview)
2. [HTTP API vs REST API](#http-api-vs-rest-api)
3. [API Gateway Structure](#api-gateway-structure)
4. [Route Configuration](#route-configuration)
5. [Authorizer Configuration](#authorizer-configuration)
6. [CORS Configuration](#cors-configuration)
7. [Throttling & Rate Limiting](#throttling--rate-limiting)
8. [Monitoring & Logging](#monitoring--logging)

---

## Overview

### API Gateway Type: HTTP API
**Why HTTP API?**
- 71% cheaper than REST API
- Lower latency
- Automatic deployment
- Native CORS support
- JWT authorizer support
- Modern and simplified

### API Configuration
```
API Name: questrade-portfolio-api
Protocol: HTTPS
Stage: prod
Region: us-east-1 (or your preferred region)
```

### Base URL Format
```
https://{api-id}.execute-api.{region}.amazonaws.com/prod
```

**Example:**
```
https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod
```

---

## HTTP API vs REST API

### Comparison Table

| Feature | HTTP API | REST API | Chosen |
|---------|----------|----------|--------|
| **Pricing** | $1.00 per million | $3.50 per million | HTTP API ✓ |
| **Latency** | Lower | Higher | HTTP API ✓ |
| **Authorizers** | Lambda, JWT, IAM | All + API Keys, Cognito | HTTP API ✓ |
| **Request Validation** | No | Yes | - |
| **Caching** | No | Yes | - |
| **WAF Support** | No | Yes | - |
| **WebSocket** | No | Yes (separate) | - |
| **Minimum Timeout** | 30s | 29s | Similar |
| **Max Payload** | 10 MB | 10 MB | Similar |

**Decision:** HTTP API is sufficient for our needs and significantly cheaper.

---

## API Gateway Structure

### Single Gateway Architecture
```
API Gateway (HTTP API)
│
├── Stage: prod
│   ├── Default Route: $default (404 handler)
│   ├── Health Route: /health
│   │
│   ├── Auth Routes (/api/login, /api/persons, /api/auth, /api/tokens)
│   │   └── Integration: questrade-auth-service Lambda
│   │
│   ├── Sync Routes (/api/sync/*)
│   │   └── Integration: questrade-sync-operations Lambda
│   │
│   ├── Data Read Routes (/api/accounts, /api/positions, /api/activities, /api/stats)
│   │   └── Integration: questrade-data-read-service Lambda
│   │
│   ├── Portfolio Routes (/api/portfolio, /api/performance, /api/allocation, /api/analytics, /api/reports, /api/comparison)
│   │   └── Integration: questrade-portfolio-analytics Lambda
│   │
│   ├── Market Routes (/api/markets, /api/quotes, /api/symbols)
│   │   └── Integration: questrade-market-data-service Lambda
│   │
│   └── Watchlist Routes (/api/watchlists)
│       └── Integration: questrade-watchlist-service Lambda
│
└── Authorizer: questrade-jwt-authorizer
    └── Applied to all routes except /api/login and /health
```

---

## Route Configuration

### Route Format
```
Method: GET, POST, PUT, DELETE
Route: /path/{parameter}
Integration: Lambda Function (Proxy)
Authorization: JWT Authorizer or None
```

### Complete Route List (120 routes)

#### Public Routes (No Authorization)
```
POST /api/login
POST /api/login/verify
POST /api/login/refresh
GET  /health
```

#### Protected Routes (JWT Authorization Required)

**Auth Service Routes (20):**
```
# Persons
POST   /api/persons
GET    /api/persons
GET    /api/persons/{personName}
PUT    /api/persons/{personName}
DELETE /api/persons/{personName}
POST   /api/persons/{personName}/token

# Auth/OAuth
POST   /api/auth/setup-person
POST   /api/auth/refresh-token/{personName}
GET    /api/auth/token-status/{personName}
GET    /api/auth/access-token/{personName}
POST   /api/auth/test-connection/{personName}

# Tokens
GET    /api/tokens
GET    /api/tokens/{personName}
DELETE /api/tokens/expired
GET    /api/tokens/stats/summary
```

**Sync Service Routes (7):**
```
POST   /api/sync/all
POST   /api/sync/person/{personName}
POST   /api/sync/accounts/{personName}
POST   /api/sync/positions/{personName}
POST   /api/sync/activities/{personName}
GET    /api/sync/status
GET    /api/sync/history
```

**Data Read Service Routes (26):**
```
# Accounts
GET    /api/accounts
GET    /api/accounts/{personName}
GET    /api/accounts/detail/{accountId}
GET    /api/accounts/summary/{personName}
GET    /api/accounts/dropdown-options

# Positions
GET    /api/positions
GET    /api/positions/{accountId}
GET    /api/positions/person/{personName}
GET    /api/positions/summary/{personName}
GET    /api/positions/top/{personName}
GET    /api/positions/pnl/{personName}

# Activities
GET    /api/activities
GET    /api/activities/{accountId}
GET    /api/activities/person/{personName}
GET    /api/activities/summary/{personName}
GET    /api/activities/types/list

# Statistics
GET    /api/stats/sync
GET    /api/stats/data
GET    /api/stats/errors
GET    /api/stats/person/{personName}
GET    /api/stats/performance

# Health
GET    /health
```

**Portfolio Analytics Routes (37):**
```
# Portfolio
GET    /api/portfolio/summary
GET    /api/portfolio/positions
GET    /api/portfolio/{personName}
GET    /api/portfolio/{personName}/summary
GET    /api/portfolio/{personName}/holdings
GET    /api/portfolio/{personName}/value
GET    /api/portfolio/{personName}/positions
POST   /api/portfolio/{personName}/snapshot

# Performance
GET    /api/performance/{personName}
GET    /api/performance/{personName}/history
GET    /api/performance/{personName}/returns
GET    /api/performance/{personName}/daily

# Allocation
GET    /api/allocation/{personName}
GET    /api/allocation/{personName}/sector
GET    /api/allocation/{personName}/geographic
GET    /api/allocation/{personName}/currency
GET    /api/allocation/{personName}/account-type
GET    /api/allocation/{personName}/market-cap

# Analytics
GET    /api/analytics/{personName}/risk
GET    /api/analytics/{personName}/diversification
GET    /api/analytics/{personName}/correlation
GET    /api/analytics/{personName}/concentration
GET    /api/analytics/{personName}/drawdown

# Reports
GET    /api/reports/{personName}/summary
GET    /api/reports/{personName}/detailed
GET    /api/reports/{personName}/tax
POST   /api/reports/{personName}/custom

# Comparison
GET    /api/comparison/persons
GET    /api/comparison/{personName}/benchmark
GET    /api/comparison/{personName}/period

# Health
GET    /health
```

**Market Data Routes (14):**
```
# Markets
GET    /api/markets/status
GET    /api/markets/summary
GET    /api/markets/movers
GET    /api/markets/sectors
GET    /api/markets/breadth

# Quotes
GET    /api/quotes/{symbol}
GET    /api/quotes
GET    /api/quotes/{symbol}/stream
GET    /api/quotes/{symbol}/history
POST   /api/quotes/{symbol}/refresh

# Symbols
GET    /api/symbols/search
GET    /api/symbols/{symbolId}
GET    /api/symbols/{symbol}/options
GET    /api/symbols/{symbol}/fundamentals
POST   /api/symbols/{symbol}/sync

# Health
GET    /health
```

**Watchlist Routes (9):**
```
GET    /api/watchlists/{personName}
GET    /api/watchlists/{personName}/{watchlistId}
GET    /api/watchlists/{personName}/{watchlistId}/quotes
POST   /api/watchlists/{personName}
PUT    /api/watchlists/{watchlistId}
POST   /api/watchlists/{watchlistId}/symbols
DELETE /api/watchlists/{watchlistId}/symbols/{symbol}
DELETE /api/watchlists/{watchlistId}
POST   /api/watchlists/{watchlistId}/alerts
```

---

## Authorizer Configuration

### Lambda Authorizer Setup

**Type:** Token-based Lambda Authorizer

**Configuration:**
```
Authorizer Name: questrade-jwt-authorizer
Type: Lambda
Lambda Function: questrade-jwt-authorizer
Authorization Token Source: $request.header.Authorization
Identity Validation Expression: ^Bearer [-0-9a-zA-Z\._]*$
Cache TTL: 300 seconds (5 minutes)
```

**Authorization Header Format:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Context Passed to Lambda:**
```json
{
  "userId": "usr_1a2b3c4d",
  "username": "johndoe",
  "role": "admin",
  "personName": "john_questrade"
}
```

**Lambda Functions Receive Context:**
```javascript
// In Lambda handler
exports.handler = async (event, context) => {
  // User context from authorizer
  const userId = event.requestContext.authorizer.userId;
  const username = event.requestContext.authorizer.username;
  const role = event.requestContext.authorizer.role;

  // Business logic
  // ...
};
```

### Routes Without Authorization
```
POST /api/login
POST /api/login/verify
POST /api/login/refresh
GET  /health
```

### Routes With Authorization
All other routes require JWT token validation.

---

## CORS Configuration

### CORS Settings
```
Allow Origins: https://your-frontend-domain.com
Allow Methods: GET, POST, PUT, DELETE, OPTIONS
Allow Headers: Content-Type, Authorization, X-Requested-With
Expose Headers: Content-Length, X-Request-Id
Max Age: 86400 (24 hours)
Allow Credentials: true
```

### Development CORS (Permissive)
```
Allow Origins: * (all origins)
Allow Methods: *
Allow Headers: *
```

### Production CORS (Restrictive)
```
Allow Origins:
  - https://app.yourdomain.com
  - https://www.yourdomain.com
Allow Methods: GET, POST, PUT, DELETE, OPTIONS
Allow Headers: Content-Type, Authorization, X-Requested-With
```

### CORS Configuration (Console)
```
API Gateway Console → APIs → questrade-portfolio-api → CORS
```

### CORS Configuration (CLI)
```bash
aws apigatewayv2 update-api \
  --api-id abc123xyz \
  --cors-configuration '{
    "AllowOrigins": ["https://app.yourdomain.com"],
    "AllowMethods": ["GET","POST","PUT","DELETE","OPTIONS"],
    "AllowHeaders": ["content-type","authorization","x-requested-with"],
    "MaxAge": 86400,
    "AllowCredentials": true
  }'
```

---

## Throttling & Rate Limiting

### Default Throttling
```
Burst Limit: 5,000 requests
Steady State: 10,000 requests per second
```

### Route-Specific Throttling

**Login Endpoint (Prevent Brute Force):**
```
Route: POST /api/login
Rate: 10 requests per second
Burst: 20 requests
```

**Sync Operations (Prevent Questrade API Overload):**
```
Route: POST /api/sync/*
Rate: 5 requests per second
Burst: 10 requests
```

**Read Operations (Allow Higher Traffic):**
```
Route: GET /api/*
Rate: 100 requests per second
Burst: 200 requests
```

### Configuration (CLI)
```bash
aws apigatewayv2 update-route \
  --api-id abc123xyz \
  --route-id xyz789 \
  --throttling-rate-limit 10 \
  --throttling-burst-limit 20
```

---

## Integration Configuration

### Lambda Proxy Integration

**Integration Type:** AWS_PROXY (Lambda Proxy)

**Payload Format:** 2.0

**Configuration:**
```json
{
  "type": "AWS_PROXY",
  "httpMethod": "POST",
  "uri": "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:123456789012:function:questrade-auth-service/invocations",
  "payloadFormatVersion": "2.0",
  "timeoutInMillis": 10000
}
```

**Event Format (Payload 2.0):**
```json
{
  "version": "2.0",
  "routeKey": "POST /api/login",
  "rawPath": "/api/login",
  "rawQueryString": "",
  "headers": {
    "authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "content-type": "application/json"
  },
  "requestContext": {
    "accountId": "123456789012",
    "apiId": "abc123xyz",
    "domainName": "abc123xyz.execute-api.us-east-1.amazonaws.com",
    "http": {
      "method": "POST",
      "path": "/api/login",
      "protocol": "HTTP/1.1",
      "sourceIp": "1.2.3.4",
      "userAgent": "Mozilla/5.0..."
    },
    "requestId": "abc123",
    "routeKey": "POST /api/login",
    "stage": "prod",
    "time": "27/Oct/2025:12:00:00 +0000",
    "timeEpoch": 1730000000000,
    "authorizer": {
      "userId": "usr_1a2b3c4d",
      "username": "johndoe",
      "role": "admin"
    }
  },
  "body": "{\"username\":\"johndoe\",\"password\":\"secret\"}",
  "isBase64Encoded": false
}
```

**Response Format:**
```json
{
  "statusCode": 200,
  "headers": {
    "Content-Type": "application/json"
  },
  "body": "{\"success\":true,\"token\":\"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...\"}"
}
```

---

## Custom Domain Configuration

### Why Custom Domain?
- Professional appearance
- SSL certificate management
- Better for SEO
- Easier to remember

### Setup Steps

**1. Register Domain (Route 53 or external)**
```
Domain: api.yourdomain.com
```

**2. Request SSL Certificate (ACM)**
```
Domain: api.yourdomain.com
Validation: DNS or Email
Region: us-east-1 (must be same as API Gateway)
```

**3. Create Custom Domain (API Gateway)**
```
Domain Name: api.yourdomain.com
Certificate: (select from ACM)
Endpoint Type: Regional
```

**4. Create API Mapping**
```
API: questrade-portfolio-api
Stage: prod
Path: (empty or /v1)
```

**5. Create DNS Record (Route 53)**
```
Type: A Record (Alias)
Name: api.yourdomain.com
Target: API Gateway domain name
```

### Result
```
Old: https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod/api/accounts
New: https://api.yourdomain.com/api/accounts
```

---

## Monitoring & Logging

### CloudWatch Metrics (Auto-created)

**Request Metrics:**
- Count (total requests)
- 4XXError (client errors)
- 5XXError (server errors)
- Latency (response time)
- IntegrationLatency (Lambda execution time)

**Example Queries:**
```
# Total requests
Sum(Count)

# Error rate
(Sum(4XXError) + Sum(5XXError)) / Sum(Count) * 100

# Average latency
Average(Latency)
```

### Access Logging

**Log Format (JSON):**
```json
{
  "requestId": "$context.requestId",
  "ip": "$context.identity.sourceIp",
  "requestTime": "$context.requestTime",
  "httpMethod": "$context.httpMethod",
  "routeKey": "$context.routeKey",
  "status": "$context.status",
  "protocol": "$context.protocol",
  "responseLength": "$context.responseLength",
  "integrationLatency": "$context.integrationLatency",
  "responseLatency": "$context.responseLatency",
  "error": "$context.error.message",
  "userId": "$context.authorizer.userId"
}
```

**Log Group:**
```
/aws/apigateway/questrade-portfolio-api
```

**Retention:** 7 days (configurable)

### Alarms

**High Error Rate:**
```
Metric: 5XXError
Condition: Sum > 10 (in 5 minutes)
Action: SNS notification
```

**High Latency:**
```
Metric: Latency
Condition: Average > 2000ms (in 5 minutes)
Action: SNS notification
```

**Throttling:**
```
Metric: Count (throttled)
Condition: Sum > 100 (in 1 minute)
Action: SNS notification
```

---

## Cost Analysis

### Pricing (HTTP API)
```
First 300 million requests: $1.00 per million
Over 300 million requests: $0.90 per million
```

### Cost Examples

**100K requests/month:**
```
Cost: 100,000 / 1,000,000 × $1.00 = $0.10/month
```

**1M requests/month:**
```
Cost: 1,000,000 / 1,000,000 × $1.00 = $1.00/month
```

**10M requests/month:**
```
Cost: 10,000,000 / 1,000,000 × $1.00 = $10.00/month
```

### Additional Costs
- **Data Transfer Out:** $0.09/GB (first 10TB)
- **CloudWatch Logs:** $0.50/GB ingested
- **Custom Domain:** Free (SSL certificate via ACM is free)

---

## Security Best Practices

### 1. Authentication & Authorization
- Use JWT authorizer for all protected routes
- Implement token expiration (24 hours)
- Refresh token mechanism
- Store JWT secret in Parameter Store

### 2. Input Validation
- Validate all inputs in Lambda functions
- Use request validation schemas
- Sanitize user inputs
- Implement rate limiting

### 3. CORS Configuration
- Restrict origins to frontend domains only
- Don't use wildcard (*) in production
- Set appropriate headers
- Enable credentials only when needed

### 4. Monitoring & Logging
- Enable access logging
- Monitor error rates
- Set up alarms
- Audit logs with CloudTrail

### 5. DDoS Protection
- Enable throttling
- Use AWS WAF (if needed)
- Implement IP-based rate limiting
- CloudFront as CDN (optional)

---

## Deployment

### Manual Deployment (Console)

**1. Create API Gateway (HTTP API)**
```
Console → API Gateway → Create API → HTTP API
Name: questrade-portfolio-api
```

**2. Create Routes**
```
Routes → Create → Method + Path
```

**3. Create Integrations**
```
Integrations → Create → Lambda Function
```

**4. Create Authorizer**
```
Authorization → Create → Lambda Authorizer
```

**5. Configure CORS**
```
CORS → Configure
```

**6. Deploy**
```
Deployments → Create → Stage: prod
```

### CLI Deployment

**Create API:**
```bash
aws apigatewayv2 create-api \
  --name questrade-portfolio-api \
  --protocol-type HTTP \
  --cors-configuration '{
    "AllowOrigins": ["https://app.yourdomain.com"],
    "AllowMethods": ["*"],
    "AllowHeaders": ["*"]
  }'
```

**Create Integration:**
```bash
aws apigatewayv2 create-integration \
  --api-id abc123xyz \
  --integration-type AWS_PROXY \
  --integration-uri arn:aws:lambda:us-east-1:123456789012:function:questrade-auth-service \
  --payload-format-version 2.0
```

**Create Route:**
```bash
aws apigatewayv2 create-route \
  --api-id abc123xyz \
  --route-key 'POST /api/login' \
  --target integrations/abc123
```

**Create Authorizer:**
```bash
aws apigatewayv2 create-authorizer \
  --api-id abc123xyz \
  --authorizer-type REQUEST \
  --authorizer-uri arn:aws:lambda:us-east-1:123456789012:function:questrade-jwt-authorizer \
  --name questrade-jwt-authorizer \
  --identity-source '$request.header.Authorization' \
  --authorizer-result-ttl-in-seconds 300
```

**Deploy Stage:**
```bash
aws apigatewayv2 create-stage \
  --api-id abc123xyz \
  --stage-name prod \
  --auto-deploy
```

### Infrastructure as Code (SAM)

See separate file: `05-Infrastructure-as-Code.md`

---

## Testing

### Testing with curl

**Login:**
```bash
curl -X POST https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"johndoe","password":"secret123"}'
```

**Get Accounts (with JWT):**
```bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

curl -X GET https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod/api/accounts/john_questrade \
  -H "Authorization: Bearer $TOKEN"
```

### Testing with Postman

**1. Create Environment**
```
Variable: baseUrl
Value: https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod
```

**2. Login Request**
```
POST {{baseUrl}}/api/login
Body: {"username":"johndoe","password":"secret123"}
```

**3. Save Token**
```javascript
// Postman Tests tab
const response = pm.response.json();
pm.environment.set("authToken", response.token);
```

**4. Use Token in Requests**
```
GET {{baseUrl}}/api/accounts/john_questrade
Authorization: Bearer {{authToken}}
```

---

## Troubleshooting

### Common Issues

**1. CORS Error**
```
Error: Access to fetch at '...' from origin '...' has been blocked by CORS policy
Solution: Enable CORS in API Gateway, include Authorization header
```

**2. 401 Unauthorized**
```
Error: {"message":"Unauthorized"}
Solution: Check JWT token validity, ensure authorizer is configured correctly
```

**3. 403 Forbidden**
```
Error: {"message":"Forbidden"}
Solution: Check Lambda permissions, ensure API Gateway can invoke Lambda
```

**4. 502 Bad Gateway**
```
Error: {"message":"Internal server error"}
Solution: Check Lambda function errors in CloudWatch Logs
```

**5. 504 Gateway Timeout**
```
Error: Endpoint request timed out
Solution: Increase Lambda timeout, optimize function performance
```

### Debug Checklist
- [ ] Check CloudWatch Logs (API Gateway)
- [ ] Check CloudWatch Logs (Lambda)
- [ ] Verify Lambda permissions
- [ ] Test Lambda function directly
- [ ] Check authorizer logs
- [ ] Verify CORS configuration
- [ ] Test with curl/Postman
- [ ] Check API Gateway integration

---

## References
- [API Gateway HTTP API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api.html)
- [Lambda Authorizers](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-lambda-authorizer.html)
- [CORS Configuration](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-cors.html)
- [API Gateway Pricing](https://aws.amazon.com/api-gateway/pricing/)
