@echo off
echo ========================================
echo Deploying Portfolio Manager UI to AWS
echo ========================================

echo.
echo [1/3] Building production bundle...
call npm run build

if errorlevel 1 (
    echo ERROR: Build failed!
    pause
    exit /b 1
)

echo.
echo [2/3] Uploading to S3...
aws s3 sync dist/ s3://questrade-portfolio-frontend --delete

if errorlevel 1 (
    echo ERROR: S3 upload failed!
    echo Make sure AWS CLI is configured and bucket exists.
    pause
    exit /b 1
)

echo.
echo [3/3] Deployment complete!
echo.
echo ========================================
echo Your site is live at:
echo http://questrade-portfolio-frontend.s3-website-us-east-1.amazonaws.com
echo ========================================
echo.
echo Optional: Invalidate CloudFront cache (if using CloudFront)
echo aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
echo.
pause
