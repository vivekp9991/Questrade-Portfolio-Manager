# Exchange Rate Endpoint - Deployment Guide

## Changes Made

### 1. New Handler File
**File:** `lambda-functions/portfolio-analytics/src/handlers/exchangeRate.js`

**Features:**
- Fetches live USD/CAD rate from exchangerate-api.com (free API)
- Falls back to default rate (1.40) if API fails
- Returns rate with timestamp and source

**Response Format:**
```json
{
  "success": true,
  "data": {
    "rate": 1.3654,
    "base": "USD",
    "target": "CAD",
    "timestamp": 1730123456789,
    "source": "exchangerate-api.com",
    "lastUpdated": "2024-10-28T10:30:00Z"
  }
}
```

### 2. Updated Handler
**File:** `lambda-functions/portfolio-analytics/src/handler.js`

**Changes:**
- Added import: `const exchangeRateHandlers = require('./handlers/exchangeRate');`
- Added route: `if (path === '/api/portfolio/exchange-rate' && method === 'GET')`

### 3. Updated CloudFormation Template
**File:** `template.yaml`

**Changes:**
- Added event mapping under `PortfolioAnalyticsFunction`:
```yaml
GetExchangeRate:
  Type: HttpApi
  Properties:
    ApiId: !Ref QuestradeApi
    Path: /api/portfolio/exchange-rate
    Method: GET
```

---

## Deployment Steps

### Step 1: Build the Lambda Function
```bash
cd D:\Project\3\AWS-Backend
sam build
```

**Expected Output:**
```
Building function 'PortfolioAnalyticsFunction'
...
Build Succeeded
```

### Step 2: Deploy to AWS
```bash
sam deploy
```

**Expected Output:**
```
Deploying with following values
===============================
Stack name                   : questrade-portfolio-backend-dev
...
Successfully created/updated stack - questrade-portfolio-backend-dev
```

### Step 3: Test the Endpoint
```bash
# Get your API Gateway URL from outputs
aws cloudformation describe-stacks \
  --stack-name questrade-portfolio-backend-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
  --output text
```

**Test with curl:**
```bash
curl https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev/api/portfolio/exchange-rate
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "rate": 1.3654,
    "base": "USD",
    "target": "CAD",
    "timestamp": 1730123456789,
    "source": "exchangerate-api.com",
    "lastUpdated": "2024-10-28"
  }
}
```

---

## Frontend Integration

### Update `aws-frontend/src/services/api.js`

**Replace the temporary implementation:**

**OLD (Temporary):**
```javascript
export async function fetchExchangeRate() {
  console.warn('[API] Exchange rate endpoint not implemented - using default');
  return 1.40; // Default USD/CAD rate
}
```

**NEW (Production):**
```javascript
export async function fetchExchangeRate() {
  try {
    console.log('[API] Fetching exchange rate...');

    const url = `${API_BASE_URL}/api/portfolio/exchange-rate`;
    const response = await fetch(url, {
      headers: getAuthHeaders()
    });

    const data = await handleResponse(response);

    console.log('[API] Exchange rate:', data.rate, 'from', data.source);

    return parseFloat(data.rate);
  } catch (error) {
    console.error('[API] Exchange rate fetch failed:', error);
    // Fallback to default
    return 1.40;
  }
}
```

### Redeploy Frontend
```bash
cd D:\Project\3\aws-frontend
npm run build
aws s3 sync dist/ s3://questrade-portfolio-frontend --delete
```

---

## Testing Checklist

### Backend Tests
- [ ] Build succeeds (`sam build`)
- [ ] Deploy succeeds (`sam deploy`)
- [ ] Endpoint returns 200 status
- [ ] Response has correct format
- [ ] Rate is a valid number
- [ ] Source is present (exchangerate-api.com or fallback)

### Frontend Tests
- [ ] Login to frontend
- [ ] Open browser console
- [ ] Check exchange rate API call in Network tab
- [ ] Verify rate is displayed correctly
- [ ] Check fallback works if API fails

### Integration Tests
```javascript
// Test in browser console after login:
const token = JSON.parse(localStorage.getItem('authToken')).accessToken;

fetch('https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev/api/portfolio/exchange-rate', {
  headers: { 'Authorization': `Bearer ${token}` }
})
.then(r => r.json())
.then(console.log);

// Expected output:
// {
//   "success": true,
//   "data": {
//     "rate": 1.3654,
//     "base": "USD",
//     "target": "CAD",
//     ...
//   }
// }
```

---

## API Rate Limits

**exchangerate-api.com Free Tier:**
- 1,500 requests/month
- Updates: Once per day
- No credit card required

**For your use case (1-2 users):**
- ~30 requests/day × 30 days = 900 requests/month
- Well within free tier limits ✅

**If you exceed limits:**
- Fallback to default 1.40 automatically
- No impact on frontend functionality

---

## Alternative Exchange Rate APIs

If you need more requests or real-time updates:

### Option 1: Alpha Vantage (Free)
```javascript
const url = 'https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=USD&to_currency=CAD&apikey=YOUR_API_KEY';
```
- 25 requests/day (free)
- Requires API key

### Option 2: Fixer.io (Free)
```javascript
const url = 'https://api.fixer.io/latest?base=USD&symbols=CAD&access_key=YOUR_API_KEY';
```
- 100 requests/month (free)
- Requires API key

### Option 3: Static Rate (Simplest)
```javascript
// Just return a fixed rate
return { rate: 1.40, source: 'static' };
```
- No external API calls
- Update manually when needed

---

## Monitoring

### CloudWatch Logs
Check Lambda logs for exchange rate fetches:
```bash
aws logs tail /aws/lambda/questrade-portfolio-analytics-dev --follow
```

**Look for:**
- `Exchange rate fetched successfully` - API call succeeded
- `Exchange rate API failed, using fallback` - API call failed

### CloudWatch Metrics
Monitor API Gateway requests:
```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApiGateway \
  --metric-name Count \
  --dimensions Name=ApiId,Value=1p9dtyfkgi \
  --start-time 2024-10-28T00:00:00Z \
  --end-time 2024-10-28T23:59:59Z \
  --period 3600 \
  --statistics Sum
```

---

## Cost Impact

**Exchange Rate API Calls:**
- External API: FREE (within 1,500/month limit)
- Lambda execution: ~$0.0000002 per request
- API Gateway: ~$0.000001 per request

**Monthly cost (30 requests/day × 30 days):**
- 900 Lambda invocations × $0.0000002 = $0.0002
- 900 API Gateway requests × $0.000001 = $0.0009
- **Total: < $0.001/month** (negligible)

---

## Rollback Plan

If the new endpoint causes issues:

### Option 1: Rollback Backend
```bash
cd D:\Project\3\AWS-Backend
git checkout HEAD~1
sam build && sam deploy
```

### Option 2: Disable in Frontend
Update `api.js` to use fallback only:
```javascript
export async function fetchExchangeRate() {
  return 1.40; // Fallback only
}
```

### Option 3: Remove Route from Template
Comment out the route in `template.yaml`:
```yaml
# GetExchangeRate:
#   Type: HttpApi
#   Properties:
#     ApiId: !Ref QuestradeApi
#     Path: /api/portfolio/exchange-rate
#     Method: GET
```

Then redeploy: `sam build && sam deploy`

---

## Summary

✅ **Backend Changes:**
- New handler file: `exchangeRate.js`
- Updated main handler: `handler.js`
- Updated template: `template.yaml`

✅ **Frontend Changes:**
- Update `api.js` to use new endpoint (instead of hardcoded 1.40)

✅ **Deployment:**
```bash
# Backend
cd AWS-Backend
sam build && sam deploy

# Frontend
cd aws-frontend
npm run build
aws s3 sync dist/ s3://questrade-portfolio-frontend --delete
```

✅ **Testing:**
- Endpoint URL: `/api/portfolio/exchange-rate`
- Response: `{ success: true, data: { rate: 1.3654, ... } }`

**Estimated Time:** 10 minutes (build + deploy + test)

---

**Ready to deploy? Run the commands above!** 🚀
