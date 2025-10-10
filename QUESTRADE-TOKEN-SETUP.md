# Questrade Token Setup Guide

This guide explains how to add Questrade API tokens to enable **live market quotes** in your portfolio application.

---

## Prerequisites

Before you start, you need:

1. ✅ **Questrade Account** with API access enabled
2. ✅ **Refresh Token** from Questrade
3. ✅ **Services Running** (all 4 backend services + frontend)

---

## Step 1: Get Your Questrade Refresh Token

### Option A: Get Token from Questrade Practice Account (Recommended for Testing)

1. Go to https://practicelogin.questrade.com/
2. Login to your practice account
3. Navigate to **My Account > API Access**
4. Click **"Generate Token"** or **"Reset Token"**
5. Copy the **Refresh Token** (starts with a long string of characters)

**⚠️ Important**:
- Refresh tokens expire after 7 days of inactivity
- Save your token in a secure location
- Never share or commit tokens to Git

### Option B: Get Token from Production Account

1. Go to https://login.questrade.com/
2. Login to your real account
3. Navigate to **My Account > API Access**
4. Generate a new API token
5. Copy the **Refresh Token**

**⚠️ PRODUCTION WARNING**: Be extremely careful with production tokens!

---

## Step 2: Add Token to Your Application

There are 3 ways to add your token:

### Method 1: Using cURL (Recommended)

```bash
curl -X POST http://localhost:4001/api/auth/setup-person \
  -H "Content-Type: application/json" \
  -d '{
    "personName": "Vivek",
    "refreshToken": "YOUR_REFRESH_TOKEN_HERE"
  }'
```

**Replace**:
- `Vivek` with your person name (must match database)
- `YOUR_REFRESH_TOKEN_HERE` with your actual Questrade refresh token

**Expected Response**:
```json
{
  "success": true,
  "message": "Person and token setup successfully",
  "data": {
    "personName": "Vivek",
    "apiServer": "https://api01.iq.questrade.com/",
    "accessTokenExpiresAt": "2025-01-09T20:30:00.000Z",
    "refreshTokenExpiresAt": "2025-04-09T19:00:00.000Z"
  }
}
```

### Method 2: Using PowerShell

```powershell
$body = @{
    personName = "Vivek"
    refreshToken = "YOUR_REFRESH_TOKEN_HERE"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:4001/api/auth/setup-person" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body
```

### Method 3: Using Postman or Insomnia

**Request:**
- **Method**: POST
- **URL**: `http://localhost:4001/api/auth/setup-person`
- **Headers**:
  - `Content-Type: application/json`
- **Body** (JSON):
```json
{
  "personName": "Vivek",
  "refreshToken": "YOUR_REFRESH_TOKEN_HERE"
}
```

---

## Step 3: Verify Token Was Added

### Check Token Status

```bash
curl http://localhost:4001/api/auth/token-status/Vivek
```

**Expected Response**:
```json
{
  "success": true,
  "data": {
    "personName": "Vivek",
    "hasRefreshToken": true,
    "hasAccessToken": true,
    "accessTokenValid": true,
    "accessTokenExpiresAt": "2025-01-09T20:30:00.000Z",
    "refreshTokenExpiresAt": "2025-04-09T19:00:00.000Z",
    "apiServer": "https://api01.iq.questrade.com/"
  }
}
```

### Test Connection

```bash
curl -X POST http://localhost:4001/api/auth/test-connection/Vivek
```

**Expected Response**:
```json
{
  "success": true,
  "message": "Connection test successful",
  "data": {
    "connected": true,
    "accounts": 4,
    "accountNumbers": ["40058790", "53413547", "53580857", "53510361"]
  }
}
```

---

## Step 4: Verify Live Quotes Work

1. **Refresh your browser** at http://localhost:5000
2. **Wait 10-15 seconds** for quotes to update
3. **Check browser console** (F12) - You should see:
   - No more "No active persons with valid tokens" errors ✅
   - Quote updates appearing ✅
4. **Check Current Value** card - Should update with live prices

---

## Token Management

### Refresh Token Manually (If Expired)

Access tokens expire every 30 minutes. The system auto-refreshes them, but you can manually refresh:

```bash
curl -X POST http://localhost:4001/api/auth/refresh-token/Vivek
```

### Check All Persons

```bash
curl http://localhost:4001/api/persons
```

This shows all configured persons and their token status.

### Remove/Update Token

To update a token, simply run the setup command again with the new token:

```bash
curl -X POST http://localhost:4001/api/auth/setup-person \
  -H "Content-Type: application/json" \
  -d '{
    "personName": "Vivek",
    "refreshToken": "NEW_REFRESH_TOKEN_HERE"
  }'
```

---

## Environment Variables

### Required for Token Encryption

Your `.env` file must have an `ENCRYPTION_KEY` set:

**Location**: `Backend/questrade-portfolio-microservices/questrade-auth-api/.env`

```env
ENCRYPTION_KEY=your-32-character-secret-key-here
```

If you don't have this, create one:

```bash
# Generate a random 32-character key
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

Then add it to your `.env` file.

---

## Troubleshooting

### Error: "ENCRYPTION_KEY environment variable is not set"

**Solution**: Add `ENCRYPTION_KEY` to your `.env` file (see above)

### Error: "Invalid refresh token"

**Causes**:
1. Token expired (7 days of inactivity)
2. Token was revoked in Questrade account
3. Typo in token string

**Solution**: Generate a new token from Questrade

### Error: "Person not found"

**Cause**: The `personName` doesn't exist in database

**Solution**:
1. Check existing persons:
   ```bash
   curl http://localhost:4001/api/persons
   ```
2. Use the exact name from the response (case-sensitive)

### Quotes Still Not Updating

**Checklist**:
1. ✅ Token added successfully (check token-status)
2. ✅ Test connection passes
3. ✅ Refresh browser (Ctrl + F5)
4. ✅ Wait 15 seconds for first quote update
5. ✅ Check browser console for errors
6. ✅ Check backend logs:
   ```bash
   tail -f Backend/questrade-portfolio-microservices/questrade-market-api/logs/app.log
   ```

---

## Token Lifecycle

1. **Refresh Token** (provided by Questrade)
   - Valid for 7 days of inactivity
   - Used to generate access tokens
   - Stored encrypted in database

2. **Access Token** (auto-generated)
   - Valid for 30 minutes
   - Used for all API calls
   - Auto-refreshed by system

3. **Auto-Refresh Process**
   - System checks token before each API call
   - If expired or expiring soon (< 5 min), refreshes automatically
   - New refresh token returned and stored

---

## Security Best Practices

1. ✅ **Never commit tokens** to Git
2. ✅ Use `.env` files for secrets
3. ✅ Use practice account tokens for development
4. ✅ Tokens are encrypted in database (AES-256)
5. ✅ Rotate tokens regularly
6. ✅ Monitor token expiry notifications

---

## API Endpoints Reference

### Auth API (Port 4001)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/setup-person` | POST | Add/update person token |
| `/api/auth/token-status/:personName` | GET | Check token status |
| `/api/auth/refresh-token/:personName` | POST | Manually refresh token |
| `/api/auth/test-connection/:personName` | POST | Test Questrade connection |
| `/api/auth/access-token/:personName` | GET | Get current access token |
| `/api/persons` | GET | List all persons |

---

## Quick Start (TL;DR)

```bash
# 1. Get your Questrade refresh token from https://practicelogin.questrade.com/

# 2. Add token to system
curl -X POST http://localhost:4001/api/auth/setup-person \
  -H "Content-Type: application/json" \
  -d '{"personName":"Vivek","refreshToken":"YOUR_TOKEN"}'

# 3. Verify it worked
curl http://localhost:4001/api/auth/token-status/Vivek

# 4. Refresh browser at http://localhost:5000

# 5. Check for live quote updates!
```

---

## Next Steps After Setup

Once your token is added and verified:

1. ✅ Live quotes will update every 5 seconds
2. ✅ Current values reflect real-time market prices
3. ✅ "Sync Data" button fetches latest portfolio data
4. ✅ All 3 fixes we made earlier will work perfectly:
   - Account filtering
   - Last sync timestamp
   - Cash balance display

---

## Support

If you encounter issues:

1. Check backend logs
2. Verify token status endpoint
3. Test connection endpoint
4. Check browser console for errors
5. Ensure all services are running

The token system is fully automated - once configured, it handles refreshing and maintaining valid tokens automatically!
