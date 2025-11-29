# Quick Deployment Guide - 30 Minutes ⚡

## Prerequisites
- ✅ AWS Backend deployed: `https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev`
- ✅ AWS CLI configured
- ✅ Node.js installed

---

## Deployment Steps

### 1. Copy Frontend Code (2 minutes)
```bash
cd D:\Project\3\aws-frontend
xcopy /E /I /Y ..\Frontend-v2\portfolio-manager-v2\* .
```

### 2. Create Environment File (1 minute)
Create `.env.production`:
```env
VITE_API_GATEWAY_URL=https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev
```

### 3. Install Dependencies (2 minutes)
```bash
npm install
```

### 4. Create Auth Services (5 minutes)
Copy the code from `FRONTEND_MIGRATION_GUIDE.md`:
- Create `src/services/authToken.js`
- Create `src/services/questradeTokenCache.js`

### 5. Update API Service (3 minutes)
Replace `src/services/api.js` with the version from `FRONTEND_MIGRATION_GUIDE.md`

### 6. Update Login Page (2 minutes)
Replace `src/pages/Login.jsx` with the version from `FRONTEND_MIGRATION_GUIDE.md`

### 7. Update ProtectedRoute (1 minute)
Replace `src/components/ProtectedRoute.jsx` with the version from `FRONTEND_MIGRATION_GUIDE.md`

### 8. Update App.jsx (1 minute)
Add auto-refresh code from `FRONTEND_MIGRATION_GUIDE.md`

### 9. Test Locally (3 minutes)
```bash
npm run dev
# Open http://localhost:3000
# Login with: victor / Admin@2025
```

### 10. Build for Production (1 minute)
```bash
npm run build
dir dist\
```

### 11. Create S3 Bucket (2 minutes)
```bash
aws s3 mb s3://questrade-portfolio-frontend
aws s3 website s3://questrade-portfolio-frontend --index-document index.html --error-document index.html
```

### 12. Set Bucket Policy (1 minute)
```bash
# Create bucket-policy.json:
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadGetObject",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::questrade-portfolio-frontend/*"
  }]
}

# Apply policy:
aws s3api put-bucket-policy --bucket questrade-portfolio-frontend --policy file://bucket-policy.json
```

### 13. Upload to S3 (2 minutes)
```bash
aws s3 sync dist/ s3://questrade-portfolio-frontend --delete
```

### 14. Get Website URL (1 minute)
```bash
# Your site is now live at:
http://questrade-portfolio-frontend.s3-website-us-east-1.amazonaws.com
```

### 15. Update Backend CORS (3 minutes)
Edit `D:\Project\3\aws\AWS-Backend\template.yaml`:
```yaml
Globals:
  Api:
    Cors:
      AllowOrigins:
        - "'http://questrade-portfolio-frontend.s3-website-us-east-1.amazonaws.com'"
```

Redeploy backend:
```bash
cd D:\Project\3\aws\AWS-Backend
sam build && sam deploy
```

### 16. Test Production (2 minutes)
Open: `http://questrade-portfolio-frontend.s3-website-us-east-1.amazonaws.com`
- Login should work
- Holdings should load
- WebSocket should connect

---

## Optional: CloudFront (HTTPS + CDN)

### 17. Create CloudFront Distribution (20 minutes setup time)
```bash
aws cloudfront create-distribution \
  --origin-domain-name questrade-portfolio-frontend.s3-website-us-east-1.amazonaws.com \
  --default-root-object index.html

# Wait 15-20 minutes for deployment
# You'll get a URL like: https://d1234567890.cloudfront.net
```

### 18. Update CORS for CloudFront
Add CloudFront URL to backend CORS:
```yaml
AllowOrigins:
  - "'http://questrade-portfolio-frontend.s3-website-us-east-1.amazonaws.com'"
  - "'https://d1234567890.cloudfront.net'"
```

---

## Quick Deploy Script

Create `deploy.bat`:
```batch
@echo off
echo Building...
call npm run build

echo Uploading to S3...
aws s3 sync dist/ s3://questrade-portfolio-frontend --delete

echo Done!
echo URL: http://questrade-portfolio-frontend.s3-website-us-east-1.amazonaws.com
pause
```

Run: `deploy.bat`

---

## Troubleshooting

### Issue: CORS Error
**Solution:** Make sure backend CORS includes frontend domain

### Issue: 401 Unauthorized
**Solution:** Check JWT token is being sent in Authorization header

### Issue: WebSocket Won't Connect
**Solution:** Check Questrade tokens are valid in backend

### Issue: Login Fails
**Solution:** Verify credentials (victor / Admin@2025)

---

## Costs

**Monthly Cost:** ~$0.20-0.50
- S3 Storage: $0.03
- S3 Requests: $0.01
- Data Transfer: $0.10
- CloudFront (optional): +$0.20

**First Year (Free Tier):** $0

---

## Next Steps

1. **Monitor CloudWatch** for errors
2. **Add Custom Domain** (optional)
3. **Enable CloudFront** for HTTPS
4. **Setup CI/CD** with GitHub Actions

---

## Success Criteria ✅

- [ ] Frontend loads in browser
- [ ] Login works
- [ ] Holdings page shows data
- [ ] WebSocket connects
- [ ] Token auto-refresh works
- [ ] No CORS errors
- [ ] No console errors

**You're done!** 🎉
