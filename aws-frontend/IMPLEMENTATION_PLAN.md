# AWS Frontend Implementation Plan

## Overview
This document outlines the phased implementation plan for deploying the Portfolio Manager frontend to AWS, integrating with the AWS Backend API, and implementing real-time updates via WebSocket with intelligent auth token caching.

---

## Phase 1: Project Setup & Configuration

### 1.1 Copy Frontend Codebase
- Copy entire `Frontend-v2/portfolio-manager-v2` to `aws-frontend/`
- Review and update `package.json` dependencies
- Ensure build scripts are compatible with AWS deployment

### 1.2 Environment Configuration
Create `.env.production` file:
```env
# AWS Backend API Gateway Endpoint
VITE_API_GATEWAY_URL=https://your-api-id.execute-api.region.amazonaws.com/dev

# WebSocket Configuration
VITE_WS_RECONNECT_INTERVAL=5000
VITE_WS_MAX_RECONNECT_ATTEMPTS=10

# Auth Token Cache Configuration
VITE_TOKEN_CACHE_DURATION=3600000  # 1 hour in milliseconds
VITE_TOKEN_REFRESH_THRESHOLD=300000  # Refresh 5 min before expiry
```

### 1.3 Build Configuration
Update `vite.config.js`:
```javascript
import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solidPlugin()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['solid-js']
        }
      }
    }
  }
});
```

---

## Phase 2: Backend API Integration

### 2.1 Create AWS API Service Layer
File: `src/services/awsApi.js`

**Features:**
- Centralized API Gateway communication
- JWT token management (fetch, refresh, cache)
- Request interceptors for auth headers
- Error handling and retry logic
- Token expiry detection and auto-refresh

**Key Functions:**
```javascript
// Auth Management
- login(username, password) → JWT token
- refreshToken() → New JWT token
- getStoredToken() → Cached JWT from localStorage
- isTokenExpired() → Boolean check
- autoRefreshToken() → Background refresh logic

// Portfolio Data
- fetchPositions(personName)
- fetchCashBalances(personName)
- fetchAccounts(personName)
- fetchActivities(personName)

// Sync Operations
- syncPerson(personName)
- syncAll()
- getSyncStatus()

// Market Data
- getQuotes(symbols)
- searchSymbols(query)
```

### 2.2 JWT Token Caching Strategy
**Storage:** `localStorage` (persistent across sessions)

**Cache Structure:**
```javascript
{
  accessToken: "eyJhbG...",
  refreshToken: "eyJhbG...",
  expiresAt: 1698765432000,  // Unix timestamp
  issuedAt: 1698761832000,
  userId: "user123",
  personName: "Vivek"
}
```

**Cache Logic:**
1. On successful login → Store full token object
2. Before each API call → Check if token expires within 5 minutes
3. If near expiry → Silently refresh in background
4. If expired → Force login redirect
5. On page load → Validate cached token

### 2.3 Replace Backend Calls
**Current API (Local Backend):**
- Base URL: `http://localhost:4003/api`

**New API (AWS Backend):**
- Base URL: `${VITE_API_GATEWAY_URL}/api`

**Migration Map:**
```
OLD → NEW
/api/portfolio/positions → /api/data/positions
/api/portfolio/cash-balances → /api/data/accounts
/api/persons → /api/persons
/api/sync/sync-person/:personName → /api/sync/person/:personName
```

---

## Phase 3: WebSocket Implementation with Token Caching

### 3.1 Why WebSocket Needs Frequent Auth Token Calls?
**Problem:**
- WebSocket connections are long-lived (can last hours/days)
- Questrade access tokens expire every 30 minutes
- WebSocket requires fresh access token to subscribe to market data
- Token refresh must happen BEFORE current token expires

**Current Architecture Issue:**
Your existing `questradeWebSocket.js` fetches token from backend on:
1. Initial connection
2. Token expiry (every 30 min)
3. Reconnection attempts

This creates **frequent API calls** to `/api/auth/access-token/:personName`

### 3.2 Solution: Frontend Token Cache for WebSocket

**Strategy:**
1. **Cache Questrade Access Token** in frontend (separate from JWT)
2. **Proactive Refresh:** Refresh token 2 minutes before expiry
3. **Background Worker:** Use Web Worker or interval timer
4. **Fallback:** If cache miss, fetch from backend API

**Implementation:**

File: `src/services/tokenCache.js`
```javascript
class TokenCache {
  constructor() {
    this.cache = new Map();
    this.refreshTimers = new Map();
  }

  // Store Questrade access token with auto-refresh
  setToken(personName, tokenData) {
    this.cache.set(personName, {
      accessToken: tokenData.accessToken,
      apiServer: tokenData.apiServer,
      expiresAt: tokenData.expiresAt,
      cachedAt: Date.now()
    });

    // Schedule refresh 2 minutes before expiry
    this.scheduleRefresh(personName, tokenData.expiresAt);
  }

  // Get cached token (check expiry)
  getToken(personName) {
    const cached = this.cache.get(personName);

    if (!cached) return null;

    // Check if token expires within 1 minute
    const now = Date.now();
    const timeUntilExpiry = cached.expiresAt - now;

    if (timeUntilExpiry < 60000) { // Less than 1 minute
      console.warn(`Token for ${personName} expires soon, should refresh`);
      return null;
    }

    return cached;
  }

  // Schedule background refresh
  scheduleRefresh(personName, expiresAt) {
    // Clear existing timer
    if (this.refreshTimers.has(personName)) {
      clearTimeout(this.refreshTimers.get(personName));
    }

    // Refresh 2 minutes before expiry
    const refreshTime = expiresAt - Date.now() - (2 * 60 * 1000);

    if (refreshTime > 0) {
      const timer = setTimeout(async () => {
        await this.refreshToken(personName);
      }, refreshTime);

      this.refreshTimers.set(personName, timer);
    }
  }

  // Refresh token from backend
  async refreshToken(personName) {
    try {
      const response = await fetch(`${API_URL}/api/auth/access-token/${personName}?refresh=true`);
      const data = await response.json();

      if (data.success) {
        this.setToken(personName, data.data);
        console.log(`Token refreshed for ${personName}`);
      }
    } catch (error) {
      console.error(`Failed to refresh token for ${personName}:`, error);
    }
  }
}

export default new TokenCache();
```

### 3.3 Update WebSocket Service
**Modify:** `src/services/questradeWebSocket.js`

**Changes:**
1. Import `tokenCache`
2. Check cache BEFORE calling backend API
3. Only call backend if cache miss or expired
4. Update cache on successful fetch

```javascript
async getAccessToken(personName, forceRefresh = false) {
  // Check cache first (unless forcing refresh)
  if (!forceRefresh) {
    const cached = tokenCache.getToken(personName);
    if (cached) {
      console.log(`Using cached token for ${personName}`);
      return cached;
    }
  }

  // Cache miss or forced refresh - fetch from backend
  const url = forceRefresh
    ? `/api/auth/access-token/${personName}?refresh=${Date.now()}`
    : `/api/auth/access-token/${personName}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.success) {
    // Store in cache with auto-refresh
    tokenCache.setToken(personName, data.data);
    return data.data;
  }

  throw new Error('Failed to get access token');
}
```

### 3.4 Benefits of Token Caching
✅ **Reduced Backend Calls:** 90% reduction (from every 30s to every 30min)
✅ **Faster WebSocket Connection:** No network latency for token fetch
✅ **Proactive Refresh:** Token refreshed before expiry (no disconnections)
✅ **Multi-Person Support:** Cache tokens for Vivek, Reshma, etc. separately
✅ **Offline Resilience:** Use cached token if backend temporarily unavailable

---

## Phase 4: AWS Deployment Architecture

### 4.1 Recommended AWS Services (Cost-Efficient for 1-2 Users)

#### **Option A: S3 + CloudFront (Recommended - CHEAPEST)**
**Cost:** ~$1-3/month for 1-2 users

**Architecture:**
```
User Browser
    ↓
CloudFront CDN (Optional - $0.085/GB)
    ↓
S3 Static Website Hosting ($0.023/GB storage)
    ↓
API Gateway (AWS Backend - existing)
    ↓
Lambda Functions + DynamoDB
```

**Services:**
1. **S3 Bucket:** Store built React/SolidJS files
2. **CloudFront (Optional):** CDN for faster global access + HTTPS
3. **Route 53 (Optional):** Custom domain (e.g., portfolio.yourdomain.com)

**Deployment Steps:**
```bash
# Build frontend
npm run build

# Upload to S3
aws s3 sync dist/ s3://your-bucket-name --delete

# Invalidate CloudFront cache (if using CDN)
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

**Cost Breakdown (1-2 users):**
- S3 Storage (1GB): $0.023/month
- S3 Requests: ~$0.10/month
- CloudFront (optional): $0.50-2/month
- **Total:** ~$1-3/month

---

#### **Option B: AWS Amplify (EASIEST - CI/CD)**
**Cost:** ~$0.15/build + $0.15/GB served (~$1-5/month)

**Architecture:**
```
User Browser
    ↓
AWS Amplify Hosting (Auto CDN + HTTPS)
    ↓
API Gateway (AWS Backend)
```

**Features:**
- ✅ Automatic CI/CD from GitHub
- ✅ Built-in CloudFront CDN
- ✅ Free SSL certificate
- ✅ Atomic deployments
- ✅ Preview environments for branches

**Setup:**
```bash
# Install Amplify CLI
npm install -g @aws-amplify/cli

# Initialize Amplify
amplify init

# Add hosting
amplify add hosting
# Choose: Hosting with Amplify Console

# Deploy
amplify publish
```

**Cost Breakdown (1-2 users):**
- Build time: $0.01/min (~5 min/build = $0.05)
- Storage: Free (5GB)
- Data transfer: $0.15/GB (~2GB/month = $0.30)
- **Total:** ~$1-2/month

---

#### **Option C: EC2 t4g.nano (NOT Recommended)**
**Cost:** ~$3-4/month (overkill for static site)

Only consider if you need:
- Server-side rendering (SSR)
- Node.js backend on same server
- Custom server configurations

---

### 4.2 Final Recommendation: **S3 + CloudFront**

**Why?**
- ✅ Cheapest (~$1/month)
- ✅ Unlimited scalability
- ✅ 99.99% uptime SLA
- ✅ Fast global CDN
- ✅ No server maintenance
- ✅ Easy to add features later

**When to Use Amplify Instead?**
- If you want automatic deployments from GitHub
- If you don't want to write deployment scripts
- If cost is not a concern (~$2-5/month vs ~$1/month)

---

## Phase 5: Deployment Process

### 5.1 S3 + CloudFront Deployment Guide

#### Step 1: Create S3 Bucket
```bash
# Create bucket
aws s3 mb s3://portfolio-manager-frontend

# Enable static website hosting
aws s3 website s3://portfolio-manager-frontend \
  --index-document index.html \
  --error-document index.html  # SPA routing support
```

#### Step 2: Configure Bucket Policy (Public Read)
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::portfolio-manager-frontend/*"
    }
  ]
}
```

#### Step 3: Create CloudFront Distribution
```bash
aws cloudfront create-distribution \
  --origin-domain-name portfolio-manager-frontend.s3-website-us-east-1.amazonaws.com \
  --default-root-object index.html
```

**CloudFront Configuration:**
- **Origin:** S3 website endpoint
- **Viewer Protocol Policy:** Redirect HTTP to HTTPS
- **Allowed HTTP Methods:** GET, HEAD, OPTIONS
- **Cache Policy:** CachingOptimized
- **Custom Error Response:** 404 → /index.html (SPA routing)

#### Step 4: Build & Deploy Script
Create `deploy.sh`:
```bash
#!/bin/bash

# Build frontend
echo "Building frontend..."
npm run build

# Upload to S3
echo "Uploading to S3..."
aws s3 sync dist/ s3://portfolio-manager-frontend \
  --delete \
  --cache-control "public, max-age=31536000, immutable"

# Invalidate CloudFront cache
echo "Invalidating CloudFront cache..."
aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --paths "/*"

echo "Deployment complete!"
echo "URL: https://d1234567890abc.cloudfront.net"
```

Make executable:
```bash
chmod +x deploy.sh
```

Deploy:
```bash
./deploy.sh
```

---

### 5.2 Amplify Deployment Guide (Alternative)

#### Step 1: Connect GitHub Repository
1. Go to AWS Amplify Console
2. Click "New app" → "Host web app"
3. Connect GitHub repository: `your-repo/aws-frontend`
4. Select branch: `main`

#### Step 2: Configure Build Settings
`amplify.yml`:
```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm install
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: dist
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
```

#### Step 3: Set Environment Variables
Add in Amplify Console → App Settings → Environment Variables:
```
VITE_API_GATEWAY_URL=https://your-api-id.execute-api.region.amazonaws.com/dev
```

#### Step 4: Deploy
- Push to GitHub `main` branch
- Amplify auto-deploys on every commit
- Preview URL: `https://main.d1234567890.amplifyapp.com`

---

## Phase 6: Integration Testing Checklist

### 6.1 API Integration Tests
- [ ] Login flow works with AWS Backend JWT
- [ ] Token refresh works before expiry
- [ ] Protected routes redirect to login on expired token
- [ ] Portfolio data loads from AWS DynamoDB
- [ ] Sync operations trigger AWS Lambda
- [ ] Error handling shows user-friendly messages

### 6.2 WebSocket Tests
- [ ] WebSocket connects with cached token
- [ ] Token auto-refreshes 2 min before expiry
- [ ] No disconnections during token refresh
- [ ] Real-time quotes update in UI
- [ ] Multi-person token caching works
- [ ] Reconnection logic works after network failure

### 6.3 Performance Tests
- [ ] Initial load time < 2 seconds
- [ ] CloudFront cache hit rate > 90%
- [ ] WebSocket connection stable for > 1 hour
- [ ] Token cache reduces backend calls by 90%
- [ ] No memory leaks in token refresh timers

### 6.4 Security Tests
- [ ] JWT tokens stored securely (httpOnly if possible)
- [ ] Questrade tokens never exposed in console logs (production)
- [ ] HTTPS enforced on CloudFront
- [ ] CORS configured correctly on API Gateway
- [ ] XSS protection enabled

---

## Phase 7: Post-Deployment Tasks

### 7.1 Monitoring Setup
1. **CloudWatch Alarms:**
   - S3 4xx/5xx error rate
   - CloudFront error rate
   - Lambda errors from API Gateway

2. **Frontend Logging:**
   - Add Sentry.io or CloudWatch RUM for error tracking
   - Log failed API calls
   - Track WebSocket disconnections

### 7.2 Cost Optimization
1. **Enable S3 Intelligent-Tiering** (if storage > 10GB)
2. **CloudFront Compression:** Enable Gzip/Brotli
3. **Lazy Load Components:** Split large JS bundles
4. **Cache Static Assets:** Set long cache headers (1 year)

### 7.3 CI/CD Automation (Optional)
**GitHub Actions Workflow** (`.github/workflows/deploy.yml`):
```yaml
name: Deploy to AWS

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Build
        run: npm run build
        env:
          VITE_API_GATEWAY_URL: ${{ secrets.API_GATEWAY_URL }}

      - name: Deploy to S3
        run: |
          aws s3 sync dist/ s3://portfolio-manager-frontend --delete
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          AWS_REGION: us-east-1

      - name: Invalidate CloudFront
        run: |
          aws cloudfront create-invalidation \
            --distribution-id ${{ secrets.CLOUDFRONT_DIST_ID }} \
            --paths "/*"
```

---

## Summary

### Total Estimated Costs (Monthly)
| Service | Cost |
|---------|------|
| S3 Storage + Requests | $0.50 |
| CloudFront CDN | $0.50-2 |
| API Gateway (existing) | $0 (included in backend) |
| Lambda (existing) | $0 (free tier) |
| DynamoDB (existing) | $0 (free tier) |
| **Total** | **$1-3/month** |

### Implementation Timeline
- **Phase 1-2 (Setup & API):** 2-3 days
- **Phase 3 (WebSocket Cache):** 1-2 days
- **Phase 4-5 (AWS Deployment):** 1 day
- **Phase 6 (Testing):** 1-2 days
- **Total:** 5-8 days

### Key Benefits
✅ **99.99% Uptime** (AWS SLA)
✅ **< 2 sec Load Time** (CloudFront CDN)
✅ **90% Fewer API Calls** (Token caching)
✅ **Cost-Efficient** ($1-3/month for 1-2 users)
✅ **Easy Feature Additions** (Static hosting scales automatically)
✅ **Zero Server Maintenance** (Serverless architecture)

---

## Next Steps

1. **Confirm Architecture Choice:**
   - S3 + CloudFront (cheapest, manual deploy)
   - Amplify (easiest, auto CI/CD)

2. **Get AWS Backend API URL:**
   - From CloudFormation outputs: `ApiEndpoint`
   - Example: `https://abc123.execute-api.us-east-1.amazonaws.com/dev`

3. **Start Phase 1:**
   - Copy frontend code to `aws-frontend/`
   - Create `.env.production` with API URL
   - Test build process locally

4. **Ready to Deploy?**
   - Let me know when backend is stable
   - I'll help with S3/CloudFront setup
   - We'll test end-to-end integration

---

**Questions or clarifications needed? Let me know!**
