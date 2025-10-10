# 🚀 Quick Token Setup - Get Live Quotes in 5 Minutes!

## Step-by-Step Visual Guide

---

### 📋 Step 1: Get Your Token from Questrade

1. **Go to Practice Account**:
   ```
   https://practicelogin.questrade.com/
   ```

2. **Login** with your credentials

3. **Navigate**: My Account → API Access → App Hub

4. **Click**: "Generate Token" or "Create New App"

5. **Copy the token** - It looks like this:
   ```
   aSBe7wAAdx88QTbwut0tiu3SYic3ox8F
   ```

⚠️ **IMPORTANT**: Save this token immediately! You can't see it again.

---

### 🔧 Step 2: Add Token to Your App

Open **PowerShell** or **Command Prompt** and run:

```powershell
curl -X POST http://localhost:4001/api/auth/setup-person `
  -H "Content-Type: application/json" `
  -d '{"personName":"Vivek","refreshToken":"PASTE_YOUR_TOKEN_HERE"}'
```

**Replace `PASTE_YOUR_TOKEN_HERE`** with your actual token!

**✅ Success Response**:
```json
{
  "success": true,
  "message": "Person and token setup successfully",
  "data": {
    "personName": "Vivek",
    "apiServer": "https://api01.iq.questrade.com/",
    "hasValidToken": true
  }
}
```

---

### ✅ Step 3: Verify It Works

**Test 1 - Check Token Status**:
```bash
curl http://localhost:4001/api/auth/token-status/Vivek
```

Should show:
```json
{
  "success": true,
  "data": {
    "hasRefreshToken": true,
    "hasAccessToken": true,
    "accessTokenValid": true
  }
}
```

**Test 2 - Test Questrade Connection**:
```bash
curl -X POST http://localhost:4001/api/auth/test-connection/Vivek
```

Should show your accounts:
```json
{
  "success": true,
  "data": {
    "connected": true,
    "accounts": 4
  }
}
```

---

### 🎉 Step 4: See Live Quotes!

1. **Refresh your browser** at http://localhost:5000
2. **Wait 10-15 seconds** for first quote update
3. **Watch the magic**:
   - ✅ Current Value updates in real-time
   - ✅ No more token errors in console
   - ✅ Live price updates every 5 seconds

---

## 🐛 Troubleshooting

### ❌ Error: "ENCRYPTION_KEY not set"

**Fix**:
1. Create file: `Backend/questrade-portfolio-microservices/questrade-auth-api/.env`
2. Add this line:
   ```
   ENCRYPTION_KEY=my-super-secret-32-character-key-here-123456
   ```
3. Restart services:
   ```bash
   npm run stop
   npm run dev
   ```

---

### ❌ Error: "Invalid refresh token"

**Common Causes**:
- ✗ Token expired (7 days old)
- ✗ Copied token incorrectly (missing characters)
- ✗ Using production token with practice API

**Fix**: Generate a new token from Questrade and try again

---

### ❌ Error: "Person not found"

**Fix**: Check your person name matches the database:
```bash
curl http://localhost:4001/api/persons
```

Use the exact name from the response (case-sensitive!)

---

## 📚 More Information

- **Complete Guide**: See [QUESTRADE-TOKEN-COMPLETE-GUIDE.md](QUESTRADE-TOKEN-COMPLETE-GUIDE.md)
- **Setup Details**: See [QUESTRADE-TOKEN-SETUP.md](QUESTRADE-TOKEN-SETUP.md)

---

## 🎯 What You Get After Setup

✅ **Live Market Quotes**: Real-time price updates every 5 seconds
✅ **Current Value**: Always up-to-date portfolio value
✅ **Historical Data**: Access to market candles and charts
✅ **Symbol Search**: Search for any stock symbol
✅ **Automatic Refresh**: Tokens auto-refresh every 25 minutes

---

## 🔐 Token Security

Your tokens are:
- ✅ **Encrypted** in database (AES-256)
- ✅ **Never logged** to files
- ✅ **HTTPS only** for all API calls
- ✅ **Auto-managed** by the system

You're all set! Enjoy your live portfolio tracking! 🚀
