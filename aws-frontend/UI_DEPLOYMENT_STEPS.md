# UI Deployment to AWS - Step by Step

## Important: NO SAM NEEDED!

**UI Deployment:** Static files → S3 (no Lambda, no SAM)
**Backend Deployment:** Lambda functions → SAM ✅ (you already did this)

---

## Quick Deploy (10 minutes)

### Step 1: Build the UI (2 minutes)

```bash
cd D:\Project\3\aws-frontend
npm run build
```

**Expected Output:**
```
✓ built in 5.23s
dist/index.html                   3.45 kB
dist/assets/index-abc123.js     234.56 kB
dist/assets/index-xyz789.css     12.34 kB
```

**Verify build:**
```bash
dir dist\
# Should see: index.html and assets\ folder
```

---

### Step 2: Create S3 Bucket (1 minute)

```bash
aws s3 mb s3://questrade-portfolio-frontend
```

**Expected Output:**
```
make_bucket: questrade-portfolio-frontend
```

---

### Step 3: Enable Static Website Hosting (1 minute)

```bash
aws s3 website s3://questrade-portfolio-frontend --index-document index.html --error-document index.html
```

**Expected Output:**
```
(no output = success)
```

---

### Step 4: Set Bucket Policy for Public Access (2 minutes)

**Create file:** `bucket-policy.json`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::questrade-portfolio-frontend/*"
    }
  ]
}
```

**Apply policy:**
```bash
aws s3api put-bucket-policy --bucket questrade-portfolio-frontend --policy file://bucket-policy.json
```

**Expected Output:**
```
(no output = success)
```

---

### Step 5: Upload Files to S3 (2 minutes)

```bash
aws s3 sync dist/ s3://questrade-portfolio-frontend --delete
```

**Expected Output:**
```
upload: dist\index.html to s3://questrade-portfolio-frontend/index.html
upload: dist\assets\index-abc123.js to s3://questrade-portfolio-frontend/assets/index-abc123.js
upload: dist\assets\index-xyz789.css to s3://questrade-portfolio-frontend/assets/index-xyz789.css
```

---

### Step 6: Get Your Website URL (1 minute)

Your website is now live at:

```
http://questrade-portfolio-frontend.s3-website-us-east-1.amazonaws.com
```

**Test it:**
```bash
curl http://questrade-portfolio-frontend.s3-website-us-east-1.amazonaws.com
# Should see HTML output
```

**Or open in browser:**
```
http://questrade-portfolio-frontend.s3-website-us-east-1.amazonaws.com
```

---

### Step 7: Update Backend CORS (2 minutes)

**Edit:** `D:\Project\3\AWS-Backend\template.yaml`

Find the CORS section and add your S3 URL:

```yaml
Globals:
  Api:
    Cors:
      AllowMethods: "'GET,POST,PUT,DELETE,OPTIONS'"
      AllowHeaders: "'Content-Type,Authorization'"
      AllowOrigins:
        - "'http://questrade-portfolio-frontend.s3-website-us-east-1.amazonaws.com'"
        - "'*'"  # Can remove this in production for better security
```

**Redeploy backend:**
```bash
cd D:\Project\3\AWS-Backend
sam build
sam deploy
```

---

### Step 8: Test Your Deployment (1 minute)

1. Open: `http://questrade-portfolio-frontend.s3-website-us-east-1.amazonaws.com`
2. You should see the login page
3. Login with: `victor` / `Admin@2025`
4. Holdings page should load
5. Check browser console for errors

**If you see CORS errors:** Wait 1-2 minutes for backend CORS update to propagate

---

## Deploy Script (For Future Updates)

**Create:** `deploy.bat`

```batch
@echo off
echo ========================================
echo Deploying Portfolio Manager UI to AWS
echo ========================================

echo.
echo [1/3] Building production bundle...
call npm run build

echo.
echo [2/3] Uploading to S3...
aws s3 sync dist/ s3://questrade-portfolio-frontend --delete

echo.
echo [3/3] Deployment complete!
echo.
echo Your site is live at:
echo http://questrade-portfolio-frontend.s3-website-us-east-1.amazonaws.com
echo.
pause
```

**Make it executable and run:**
```bash
deploy.bat
```

**For future updates, just run:** `deploy.bat`

---

## Optional: Add HTTPS with CloudFront (15 minutes setup)

If you want HTTPS (https:// instead of http://):

### Step 1: Create CloudFront Distribution

```bash
aws cloudfront create-distribution --origin-domain-name questrade-portfolio-frontend.s3-website-us-east-1.amazonaws.com --default-root-object index.html
```

**This takes 15-20 minutes to deploy!**

### Step 2: Get CloudFront URL

```bash
aws cloudfront list-distributions --query "DistributionList.Items[0].DomainName" --output text
```

**Output:** `d1234567890abc.cloudfront.net`

**Your HTTPS URL:** `https://d1234567890abc.cloudfront.net`

### Step 3: Update Backend CORS with CloudFront URL

Edit `template.yaml`:
```yaml
AllowOrigins:
  - "'http://questrade-portfolio-frontend.s3-website-us-east-1.amazonaws.com'"
  - "'https://d1234567890abc.cloudfront.net'"  # Add CloudFront URL
```

Redeploy:
```bash
cd D:\Project\3\AWS-Backend
sam build && sam deploy
```

### Step 4: Update Frontend .env.production

If you want to use CloudFront for production:

**Edit:** `.env.production`
```env
VITE_API_GATEWAY_URL=https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev
VITE_FRONTEND_URL=https://d1234567890abc.cloudfront.net
```

Rebuild and redeploy:
```bash
npm run build
aws s3 sync dist/ s3://questrade-portfolio-frontend --delete
```

**Important:** Wait 15-20 minutes for CloudFront to finish deploying!

---

## Key Differences: SAM vs S3

| Aspect | Backend (SAM) | Frontend (S3) |
|--------|---------------|---------------|
| **What is it?** | Lambda functions | Static HTML/JS/CSS |
| **Tool** | `sam build && sam deploy` | `aws s3 sync` |
| **Template** | `template.yaml` | No template needed |
| **Build** | Node.js code bundled | Vite builds assets |
| **Deploy** | CloudFormation stack | Direct S3 upload |
| **URL** | API Gateway URL | S3 website URL |
| **Cost** | Lambda + API Gateway | S3 storage + requests |

**Simple rule:**
- **Backend = SAM** ✅
- **Frontend = S3** ✅

---

## Troubleshooting

### Issue 1: Bucket name already exists
**Error:** `BucketAlreadyExists`

**Solution:** Use a unique bucket name:
```bash
aws s3 mb s3://questrade-portfolio-frontend-12345
# Replace 12345 with random numbers
```

Then update all commands to use your new bucket name.

---

### Issue 2: CORS error in browser
**Error:** `CORS policy blocked`

**Solution:**
1. Make sure backend CORS includes your S3 URL
2. Redeploy backend: `sam build && sam deploy`
3. Wait 1-2 minutes for changes to propagate
4. Clear browser cache and refresh

---

### Issue 3: 404 on page refresh
**Error:** Refreshing `/holdings` gives 404

**Solution:** Already handled by `--error-document index.html` in Step 3. If still broken:
```bash
aws s3 website s3://questrade-portfolio-frontend --index-document index.html --error-document index.html
```

---

### Issue 4: Login fails (401)
**Error:** `401 Unauthorized`

**Solution:**
1. Check backend API is accessible
2. Check JWT token format in browser console
3. Verify backend is deployed: `curl https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev/api/auth/health`

---

## Commands Summary

```bash
# Build UI
cd D:\Project\3\aws-frontend
npm run build

# Create bucket (one-time)
aws s3 mb s3://questrade-portfolio-frontend

# Enable website hosting (one-time)
aws s3 website s3://questrade-portfolio-frontend --index-document index.html --error-document index.html

# Set public access (one-time)
aws s3api put-bucket-policy --bucket questrade-portfolio-frontend --policy file://bucket-policy.json

# Upload files (every deploy)
aws s3 sync dist/ s3://questrade-portfolio-frontend --delete

# Get URL
echo "http://questrade-portfolio-frontend.s3-website-us-east-1.amazonaws.com"
```

---

## Cost

**S3 Static Website Hosting:**
- Storage (1GB): $0.023/month
- Requests (10,000 GET): $0.004/month
- Data transfer (1GB): $0.09/month
- **Total: ~$0.12/month**

**With CloudFront (optional):**
- CloudFront data transfer: +$0.085/GB
- CloudFront requests: +$0.01/10,000
- **Total with CloudFront: ~$0.20-0.30/month**

---

## What You're Deploying

```
dist/                           ← This goes to S3
├── index.html                  ← Entry point
├── assets/
│   ├── index-abc123.js        ← Your React/Solid code
│   └── index-xyz789.css       ← Styles
└── favicon.ico                ← Icon
```

**NOT deploying:**
- `src/` folder (source code)
- `node_modules/` (dependencies)
- `package.json` (config)
- Only the `dist/` folder goes to S3!

---

## Success Criteria

Your deployment is successful when:

1. ✅ `npm run build` creates `dist/` folder
2. ✅ S3 bucket created
3. ✅ Files uploaded to S3
4. ✅ S3 website URL loads in browser
5. ✅ Login page appears
6. ✅ Can login successfully
7. ✅ Holdings page loads data
8. ✅ No CORS errors in console

---

## Next Deploy (After Changes)

After making code changes:

```bash
# 1. Build
npm run build

# 2. Upload
aws s3 sync dist/ s3://questrade-portfolio-frontend --delete

# 3. Test
# Open: http://questrade-portfolio-frontend.s3-website-us-east-1.amazonaws.com

# 4. If using CloudFront, invalidate cache
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

Or just run: `deploy.bat`

---

**Ready to deploy? Run the commands in "Quick Deploy" section above!** 🚀

**No SAM needed - just S3!** ✅
