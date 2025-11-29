# AWS Backend Testing Guide

## Deployment Status

**Status:** DEPLOYED AND RUNNING
**Stack Name:** questrade-portfolio-backend
**Region:** us-east-1

### API Endpoint
```
https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev
```

### DynamoDB Tables Created
- questrade-users-dev
- questrade-persons-dev
- questrade-tokens-dev
- questrade-accounts-dev
- questrade-positions-dev
- questrade-activities-dev
- questrade-symbols-dev
- questrade-watchlists-dev

## Testing with Postman

### 1. Import the Collection
1. Open Postman
2. Click Import
3. Select the file: `Questrade-Portfolio-API.postman_collection.json`
4. The collection will be imported with all endpoints and the base URL pre-configured

### 2. Test Health Endpoints (No Auth Required)

Run these requests in order to verify all services are running:

1. **Auth Service Health** - `GET /api/auth/health`
2. **Sync Service Health** - `GET /api/sync/health`
3. **Data Service Health** - `GET /api/data/health`
4. **Portfolio Service Health** - `GET /api/portfolio/health`
5. **Market Service Health** - `GET /api/market/health`
6. **Watchlist Service Health** - `GET /api/watchlist/health`

All should return:
```json
{
  "success": true,
  "message": "Service is healthy",
  "data": {
    "status": "ok",
    "service": "...",
    "timestamp": "..."
  }
}
```

### 3. Test Authentication Flow

#### Step 1: Login
- **Request:** `POST /api/login`
- **Body:**
```json
{
  "username": "admin",
  "password": "admin123"
}
```
- **Expected Response:** JWT token (automatically saved to collection variable)
- **Note:** The token is valid for 24 hours

#### Step 2: Verify Token
- **Request:** `GET /api/verify`
- **Headers:** `Authorization: Bearer {{jwtToken}}`
- **Expected Response:** Token verification success

#### Step 3: Refresh Token (Optional)
- **Request:** `POST /api/refresh`
- **Headers:** `Authorization: Bearer {{jwtToken}}`
- **Expected Response:** New JWT token

### 4. Test Person Management

All requests require JWT token in Authorization header.

#### Create a Person
- **Request:** `POST /api/persons`
- **Body:**
```json
{
  "name": "test-person",
  "description": "Test person for API testing"
}
```
- **Expected Response:** Person created (name saved to collection variable)

#### Get All Persons
- **Request:** `GET /api/persons`
- **Expected Response:** Array of all persons

#### Get Person by Name
- **Request:** `GET /api/persons/{{personName}}`
- **Expected Response:** Person details

#### Update Person
- **Request:** `PUT /api/persons/{{personName}}`
- **Body:**
```json
{
  "description": "Updated description"
}
```

#### Set Active Person
- **Request:** `POST /api/persons/active`
- **Body:**
```json
{
  "name": "{{personName}}"
}
```

#### Get Active Person
- **Request:** `GET /api/persons/active`
- **Expected Response:** Currently active person

### 5. Test Questrade Token Management

**IMPORTANT:** You need a valid Questrade refresh token from your Questrade Practice account.

#### Setup Questrade Token
- **Request:** `POST /api/auth/setup`
- **Body:**
```json
{
  "personName": "{{personName}}",
  "refreshToken": "YOUR_QUESTRADE_REFRESH_TOKEN"
}
```
- **Note:** Get your refresh token from Questrade Practice Account

#### Get Active Token
- **Request:** `GET /api/auth/token`
- **Expected Response:** Current access token details

#### Test Connection
- **Request:** `GET /api/auth/test`
- **Expected Response:** Connection test results from Questrade API

#### Get Token Status
- **Request:** `GET /api/auth/status`
- **Expected Response:** Token validity and expiration info

#### Refresh Questrade Token
- **Request:** `POST /api/auth/refresh-token`
- **Expected Response:** New access token

### 6. Test Data Sync

#### Sync All Data
- **Request:** `POST /api/sync/all`
- **Expected Response:** Synced accounts, positions, and activities

#### Sync Individual Resources
- `POST /api/sync/accounts`
- `POST /api/sync/positions`
- `POST /api/sync/activities`

### 7. Test Data Retrieval

#### Get Accounts
- `GET /api/data/accounts` - All accounts
- `GET /api/data/accounts/:accountNumber` - Specific account

#### Get Positions
- `GET /api/data/positions` - All positions
- `GET /api/data/positions/:accountNumber` - Positions for account

#### Get Activities
- `GET /api/data/activities` - All activities
- `GET /api/data/activities/:accountNumber` - Activities for account

#### Get Stats
- `GET /api/data/stats` - Portfolio statistics

### 8. Test Portfolio Analytics

- `GET /api/portfolio/summary` - Portfolio summary
- `GET /api/portfolio/performance` - Performance metrics
- `GET /api/portfolio/allocation` - Asset allocation
- `GET /api/portfolio/analytics` - Detailed analytics

### 9. Test Market Data

- `GET /api/market/status` - Market status
- `GET /api/market/quotes/:symbolId` - Get quote for symbol
- `GET /api/market/symbols/search?query=AAPL` - Search symbols

### 10. Test Watchlists

- `GET /api/watchlist` - Get all watchlists
- `POST /api/watchlist` - Create watchlist
- `PUT /api/watchlist/:id` - Update watchlist
- `DELETE /api/watchlist/:id` - Delete watchlist

## Testing with cURL

### Health Check Example
```bash
curl https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev/api/auth/health
```

### Login Example
```bash
curl -X POST https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

### Authenticated Request Example
```bash
# Save token to variable
TOKEN="your-jwt-token-here"

# Make authenticated request
curl https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev/api/persons \
  -H "Authorization: Bearer $TOKEN"
```

## Common Issues

### 1. Unauthorized (401)
- Make sure you've logged in and have a valid JWT token
- Check that the Authorization header is correctly formatted
- Token may have expired (24 hour expiry)

### 2. Forbidden (403)
- JWT token is invalid or malformed
- Try logging in again to get a fresh token

### 3. Not Found (404)
- Check the endpoint URL is correct
- Ensure resource exists (e.g., person name, account number)

### 4. Internal Server Error (500)
- Check CloudWatch Logs for Lambda function errors
- Verify DynamoDB tables are accessible
- For Questrade-related errors, verify refresh token is valid

## Monitoring

### View CloudWatch Logs
```bash
# Auth Service logs
aws logs tail /aws/lambda/questrade-portfolio-backend-AuthServiceFunction --follow

# Sync Operations logs
aws logs tail /aws/lambda/questrade-portfolio-backend-SyncOperationsFunction --follow

# Data Read Service logs
aws logs tail /aws/lambda/questrade-portfolio-backend-DataReadServiceFunction --follow
```

### Check DynamoDB Tables
```bash
# List all tables
aws dynamodb list-tables --region us-east-1

# Scan a table (e.g., persons)
aws dynamodb scan --table-name questrade-persons-dev --region us-east-1
```

## Next Steps

1. **Initial Setup:**
   - Login to get JWT token
   - Create a person
   - Set as active person
   - Setup Questrade refresh token

2. **Data Population:**
   - Sync all data from Questrade
   - Verify data in DynamoDB tables

3. **Analytics Testing:**
   - Test portfolio analytics endpoints
   - Verify calculations are correct

4. **Frontend Integration:**
   - Update frontend API base URL to use this endpoint
   - Test full application flow

## Deployment Commands

### Check Status
```bash
powershell.exe -ExecutionPolicy Bypass -File scripts/check-deployment.ps1
```

### View Stack
```bash
aws cloudformation describe-stacks --stack-name questrade-portfolio-backend --region us-east-1
```

### Update Deployment (after code changes)
```bash
cd AWS-Backend
sam build
sam deploy
```

## Security Notes

1. **JWT Secret:** Currently using `MyJWTSecret123` - change this in production
2. **Encryption Key:** Currently using a test key - use a secure 32-character key in production
3. **Refresh Tokens:** Stored encrypted in DynamoDB
4. **Access Tokens:** Cached in memory with automatic refresh
5. **CORS:** Currently configured for local development, update for production

## Performance Optimization

- Lambda functions use ARM64 architecture for cost savings
- In-memory caching of Questrade access tokens (30-minute TTL)
- DynamoDB PAY_PER_REQUEST billing mode
- Efficient GSI indexes for fast queries
