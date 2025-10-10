# Complete Questrade API Token Guide

This comprehensive guide explains everything about Questrade API tokens, how they work, and how to use them in your portfolio application.

---

## Table of Contents

1. [Token Types & Lifecycle](#token-types--lifecycle)
2. [How to Get Questrade Tokens](#how-to-get-questrade-tokens)
3. [OAuth 2.0 Flow](#oauth-20-flow)
4. [Token Validation & Security](#token-validation--security)
5. [Adding Tokens to Your App](#adding-tokens-to-your-app)
6. [Token Management](#token-management)
7. [Troubleshooting](#troubleshooting)

---

## Token Types & Lifecycle

### 1. Refresh Token

**Purpose**: Used to obtain access tokens

**Characteristics**:
- ✅ **Long-lived**: Valid for 7 days of inactivity
- ✅ **One-time generation**: Get it once from Questrade
- ✅ **Reusable**: Can generate multiple access tokens
- ✅ **Self-renewing**: Each token request returns a new refresh token
- ✅ **Manually generated**: From Questrade API Centre

**Format**: Long alphanumeric string (e.g., `aSBe7wAAdx88QTbwut0tiu3SYic3ox8F`)

**Expiration**:
- Expires after **7 days of no use**
- Resets when you exchange it for an access token
- If expired, must generate a new one from Questrade

### 2. Access Token

**Purpose**: Used to make actual API calls

**Characteristics**:
- ⏱️ **Short-lived**: Valid for 1800 seconds (30 minutes)
- 🔄 **Auto-generated**: Created by exchanging refresh token
- 🔐 **Bearer token**: Used in Authorization header
- ♻️ **Refreshable**: Get new one before expiration

**Format**: Alphanumeric string (e.g., `C3lTUKuNQrAAmSD/TPjuV/HI7aNrAwDp`)

**Usage**: Include in every API request:
```
Authorization: Bearer C3lTUKuNQrAAmSD/TPjuV/HI7aNrAwDp
```

### 3. API Server URL

**Purpose**: The specific Questrade server to make API calls to

**Characteristics**:
- 🌐 **Dynamic**: Changes with each token refresh
- 📍 **Load-balanced**: Questrade assigns you to a specific server
- 🔗 **Required**: All API calls use this base URL

**Example**: `https://api01.iq.questrade.com`

---

## How to Get Questrade Tokens

### Step 1: Choose Account Type

#### Option A: Practice Account (Recommended for Development)
- **URL**: https://practicelogin.questrade.com/
- **Purpose**: Testing with fake data
- **Benefit**: Risk-free development
- **Data**: Simulated market data and portfolio

#### Option B: Production Account
- **URL**: https://login.questrade.com/
- **Purpose**: Real trading account
- **Risk**: ⚠️ Real money, real trades
- **Use only**: For production deployment

### Step 2: Generate Token in Questrade

1. **Login** to your Questrade account
2. Navigate to **"My Account"** → **"API Access"**
3. Click **"App Hub"** or **"Personal Apps"**
4. Click **"Generate Token"** or **"Create New App"**
5. **Copy the token immediately** (you can't see it again!)
6. **Save it securely** (password manager, encrypted file)

**⚠️ Important**: The token is shown only once. If you lose it, generate a new one.

### Step 3: Token Looks Like This

```
Your refresh token (save this):
aSBe7wAAdx88QTbwut0tiu3SYic3ox8F
```

---

## OAuth 2.0 Flow

Questrade uses **OAuth 2.0** for authentication. Here's how it works:

### Flow Diagram

```
1. User generates refresh token in Questrade
   ↓
2. App exchanges refresh token for access token
   ↓
3. Questrade returns:
   - Access token (30 min validity)
   - New refresh token (7 days)
   - API server URL
   ↓
4. App makes API calls with access token
   ↓
5. Before access token expires, refresh it
   (Go back to step 2)
```

### Token Exchange API Call

**Endpoint**:
- **Production**: `https://login.questrade.com/oauth2/token`
- **Practice**: `https://practicelogin.questrade.com/oauth2/token`

**Request**:
```bash
POST https://login.questrade.com/oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&refresh_token=YOUR_REFRESH_TOKEN
```

**Response**:
```json
{
  "access_token": "C3lTUKuNQrAAmSD/TPjuV/HI7aNrAwDp",
  "token_type": "Bearer",
  "expires_in": 1800,
  "refresh_token": "aSBe7wAAdx88QTbwut0tiu3SYic3ox8F",
  "api_server": "https://api01.iq.questrade.com/"
}
```

**Your app handles this automatically!** You just need to provide the initial refresh token.

---

## Token Validation & Security

### OAuth Scopes

Questrade tokens have different permission levels:

| Scope | Description | Your App Uses |
|-------|-------------|---------------|
| `read_acc` | Read account information | ✅ Yes |
| `read_md` | Read market data | ✅ Yes |
| `trade` | Place trades | ❌ No (partner only) |

Your tokens automatically include `read_acc` and `read_md` scopes.

### Security Requirements

#### 1. HTTPS Only
- ✅ All API calls **must** use HTTPS (TLS)
- ❌ HTTP is rejected
- 🔒 Ensures encrypted communication

#### 2. Token Storage
Your app stores tokens securely:
- ✅ **Encrypted at rest**: AES-256 encryption
- ✅ **Never in plaintext**: Stored encrypted in MongoDB
- ✅ **Never logged**: Tokens not written to logs
- ✅ **Never committed**: .env files in .gitignore

#### 3. Token Rotation
- 🔄 Access tokens auto-refresh every 25 minutes
- 🔄 Refresh tokens updated with each exchange
- 🔄 Old tokens automatically invalidated

#### 4. Token Expiration Handling

**Access Token Expiration (30 minutes)**:
- Your app checks expiration before each API call
- If expired or expiring soon (< 5 min), auto-refreshes
- Transparent to you - happens in background

**Refresh Token Expiration (7 days)**:
- Resets every time you use it
- If unused for 7 days, must generate new one
- App will show error if refresh token expired

### Token Validation Process

Your app validates tokens by:

1. **Expiration Check**:
   ```javascript
   isExpired = currentTime > expiresAt
   isExpiringSoon = (expiresAt - currentTime) < 5 minutes
   ```

2. **Test API Call**:
   ```bash
   GET {api_server}/v1/time
   Authorization: Bearer {access_token}
   ```
   If succeeds, token is valid.

3. **Error Handling**:
   - 401 Unauthorized → Token expired, refresh it
   - 403 Forbidden → Invalid token, check scopes
   - 404 Not Found → Wrong API server URL

---

## Adding Tokens to Your App

### Prerequisites

1. ✅ All services running (`npm run dev`)
2. ✅ MongoDB running
3. ✅ Have your Questrade refresh token ready

### Quick Setup

**Step 1: Set Encryption Key** (First time only)

Create/edit: `Backend/questrade-portfolio-microservices/questrade-auth-api/.env`

```env
# Generate a random 32-character key
ENCRYPTION_KEY=ab12cd34ef56gh78ij90kl12mn34op56

# MongoDB connection
MONGODB_URI=mongodb://localhost:27017/questrade_auth_db

# Questrade API
QUESTRADE_PRACTICE_MODE=true
QUESTRADE_TOKEN_URL=https://practicelogin.questrade.com/oauth2/token
```

**Step 2: Add Your Token**

```bash
curl -X POST http://localhost:4001/api/auth/setup-person \
  -H "Content-Type: application/json" \
  -d '{
    "personName": "Vivek",
    "refreshToken": "YOUR_QUESTRADE_REFRESH_TOKEN_HERE"
  }'
```

**Expected Success Response**:
```json
{
  "success": true,
  "message": "Person and token setup successfully",
  "data": {
    "personName": "Vivek",
    "apiServer": "https://api01.iq.questrade.com/",
    "accessTokenExpiresAt": "2025-01-09T20:30:00.000Z",
    "refreshTokenExpiresAt": "2025-04-09T19:00:00.000Z",
    "hasValidToken": true
  }
}
```

**Step 3: Verify Token Works**

```bash
# Check token status
curl http://localhost:4001/api/auth/token-status/Vivek

# Test connection to Questrade
curl -X POST http://localhost:4001/api/auth/test-connection/Vivek
```

**Step 4: Check Live Quotes**

1. Refresh browser at http://localhost:5000
2. Wait 10-15 seconds
3. Check backend logs - should see successful quote fetches
4. Current Value should update with live prices

---

## Token Management

### Automatic Management (Built-in)

Your app automatically handles:

✅ **Access token refresh**: Every 25 minutes
✅ **Token expiration checks**: Before each API call
✅ **New refresh token storage**: After each exchange
✅ **API server updates**: Dynamically uses correct server
✅ **Error recovery**: Retries with fresh token on failure

You don't need to do anything - it's all automatic!

### Manual Management (When Needed)

#### Check Token Status

```bash
curl http://localhost:4001/api/auth/token-status/Vivek
```

**Response Indicates**:
- `hasRefreshToken`: true/false - Do you have a refresh token stored?
- `hasAccessToken`: true/false - Is there an access token?
- `accessTokenValid`: true/false - Is access token still valid?
- `accessTokenExpiresAt`: When access token expires
- `refreshTokenExpiresAt`: When refresh token expires

#### Manually Refresh Access Token

```bash
curl -X POST http://localhost:4001/api/auth/refresh-token/Vivek
```

**When to use**: Testing, or if automatic refresh failed

#### Update Refresh Token

If your refresh token expired (7 days unused):

1. Generate new token in Questrade
2. Run setup command again:
```bash
curl -X POST http://localhost:4001/api/auth/setup-person \
  -H "Content-Type: application/json" \
  -d '{
    "personName": "Vivek",
    "refreshToken": "NEW_REFRESH_TOKEN"
  }'
```

#### View All Persons

```bash
curl http://localhost:4001/api/persons
```

Shows all configured persons and their token status.

---

## API Endpoints Reference

### Auth API (Port 4001)

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/auth/setup-person` | POST | Add/update person token | No |
| `/api/auth/token-status/:personName` | GET | Check token status | Optional |
| `/api/auth/refresh-token/:personName` | POST | Manually refresh token | Optional |
| `/api/auth/test-connection/:personName` | POST | Test Questrade connection | Optional |
| `/api/auth/access-token/:personName` | GET | Get current access token | Optional |
| `/api/persons` | GET | List all persons | No |

### Market API (Port 4004)

Once token is added, these work automatically:

| Endpoint | Description | Questrade API Used |
|----------|-------------|-------------------|
| `/api/quotes?symbols=AAPL,GOOG` | Get multiple quotes | `/v1/markets/quotes` |
| `/api/quotes/:id` | Get single quote | `/v1/markets/quotes/:id` |
| `/api/symbols/search?prefix=AAPL` | Search symbols | `/v1/symbols/search` |
| `/api/candles/:symbolId` | Get historical candles | `/v1/markets/candles/:id` |

**Example Using Candles Endpoint**:
```bash
# Your app's endpoint
curl "http://localhost:4004/api/candles/8049?startTime=2025-01-01&endTime=2025-01-09&interval=OneDay"

# This internally calls Questrade:
# GET https://api01.iq.questrade.com/v1/markets/candles/8049
# With your access token in Authorization header
```

---

## Troubleshooting

### Issue: "No active persons with valid tokens available"

**Cause**: No refresh token configured

**Solution**:
```bash
# Add token
curl -X POST http://localhost:4001/api/auth/setup-person \
  -H "Content-Type: application/json" \
  -d '{"personName":"Vivek","refreshToken":"YOUR_TOKEN"}'
```

---

### Issue: "ENCRYPTION_KEY environment variable is not set"

**Cause**: Missing encryption key in .env

**Solution**:
1. Generate key:
   ```bash
   node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
   ```
2. Add to `Backend/questrade-portfolio-microservices/questrade-auth-api/.env`:
   ```env
   ENCRYPTION_KEY=<generated-key-here>
   ```
3. Restart Auth API

---

### Issue: "Invalid refresh token"

**Causes**:
1. Token expired (7 days unused)
2. Token revoked in Questrade
3. Typo when copying token
4. Using production token with practice API (or vice versa)

**Solution**:
1. Generate new token from Questrade
2. Verify you're using correct account type (practice vs production)
3. Double-check token was copied completely
4. Re-run setup command

---

### Issue: Access token expired but not refreshing

**Check**:
1. Verify refresh token is still valid:
   ```bash
   curl http://localhost:4001/api/auth/token-status/Vivek
   ```
2. Check Auth API logs:
   ```bash
   tail -f Backend/questrade-portfolio-microservices/questrade-auth-api/logs/app.log
   ```
3. Manually trigger refresh:
   ```bash
   curl -X POST http://localhost:4001/api/auth/refresh-token/Vivek
   ```

---

### Issue: Getting 401 Unauthorized from Questrade

**Causes**:
1. Access token expired
2. Token doesn't have required scope
3. Using wrong API server URL
4. Token was revoked

**Debug Steps**:
1. Check token status
2. Test connection to Questrade
3. Verify token scopes include `read_acc` and `read_md`
4. Check if using correct api_server URL
5. Try refreshing token

---

### Issue: Rate Limiting (429 Too Many Requests)

**Questrade Limits**:
- Market data: 100 requests per minute
- Account data: 250 requests per minute

**Your app handles**:
- Quote polling: Every 5 seconds (12/min per symbol)
- Respects rate limits
- Implements exponential backoff

**If you hit limits**:
- Reduce quote polling frequency
- Decrease number of symbols
- Check for infinite loops in code

---

## Best Practices

### Development

1. ✅ **Use Practice Account**: Always develop with practice tokens
2. ✅ **Test Token Expiry**: Manually expire tokens to test refresh
3. ✅ **Monitor Logs**: Check Auth API logs regularly
4. ✅ **Version Control**: Never commit tokens to Git
5. ✅ **Environment Variables**: Store tokens in .env files

### Production

1. ✅ **Rotate Tokens**: Generate new tokens monthly
2. ✅ **Monitor Expiry**: Set up alerts for token expiration
3. ✅ **Backup Tokens**: Store refresh tokens securely (encrypted vault)
4. ✅ **Access Control**: Limit who can view/modify tokens
5. ✅ **Audit Logs**: Track token usage and refreshes

### Security

1. ✅ **Encrypt at Rest**: Tokens encrypted in database (done)
2. ✅ **HTTPS Only**: All API calls use HTTPS (done)
3. ✅ **No Logging**: Tokens never written to logs (done)
4. ✅ **Secure Storage**: Use environment variables (done)
5. ✅ **Regular Rotation**: Change tokens periodically

---

## Token Flow in Your App

```
┌─────────────────┐
│  Questrade API  │
│  (Manual Token  │
│   Generation)   │
└────────┬────────┘
         │
         │ Refresh Token
         ↓
┌─────────────────────────┐
│  Your Auth API (4001)   │
│  - Store refresh token  │
│  - Exchange for access  │
│  - Auto-refresh         │
└──────────┬──────────────┘
           │
           │ Access Token
           ↓
┌─────────────────────────┐
│  Your Market API (4004) │
│  - Use access token     │
│  - Fetch quotes         │
│  - Get market data      │
└──────────┬──────────────┘
           │
           │ Quote Data
           ↓
┌─────────────────────────┐
│  Frontend UI (5000)     │
│  - Display quotes       │
│  - Live updates         │
│  - No token handling    │
└─────────────────────────┘
```

---

## Quick Reference Card

### Token Characteristics

| Property | Refresh Token | Access Token |
|----------|---------------|--------------|
| **Validity** | 7 days | 30 minutes |
| **Source** | Manual (Questrade) | Auto (Exchange) |
| **Usage** | Get access tokens | Make API calls |
| **Storage** | Encrypted in DB | Encrypted in DB |
| **Renewal** | Manual regeneration | Auto-refresh |
| **Format** | Long alphanumeric | Long alphanumeric |

### Essential Commands

```bash
# Add token
curl -X POST http://localhost:4001/api/auth/setup-person \
  -H "Content-Type: application/json" \
  -d '{"personName":"Vivek","refreshToken":"TOKEN"}'

# Check status
curl http://localhost:4001/api/auth/token-status/Vivek

# Test connection
curl -X POST http://localhost:4001/api/auth/test-connection/Vivek

# Refresh token
curl -X POST http://localhost:4001/api/auth/refresh-token/Vivek
```

---

## Summary

1. **Get** refresh token from Questrade (practice account)
2. **Add** token using `/api/auth/setup-person` endpoint
3. **Verify** token status and connection
4. **Enjoy** automatic token management and live quotes!

Your app handles all the complex OAuth 2.0 flow, token refresh, expiration handling, and API server management automatically. You just provide the initial refresh token once!

---

## Additional Resources

- **Questrade API Docs**: https://www.questrade.com/api/documentation
- **Practice Login**: https://practicelogin.questrade.com/
- **Production Login**: https://login.questrade.com/
- **API Support**: Contact Questrade support

---

**Need Help?** Check the troubleshooting section or review backend logs for detailed error messages.
