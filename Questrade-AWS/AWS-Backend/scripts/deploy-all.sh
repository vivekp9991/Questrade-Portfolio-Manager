#!/bin/bash
# Complete SAM Deployment Script (Validate -> Build -> Deploy)

echo "========================================="
echo "Complete SAM Deployment Pipeline"
echo "========================================="

# Change to AWS-Backend directory
cd /d/Project/3/AWS-Backend

# Step 1: Validate
echo ""
echo "Step 1/3: Validating SAM template..."
echo "-----------------------------------"
cmd.exe /c "sam validate"

if [ $? -ne 0 ]; then
    echo "❌ Validation failed. Stopping."
    exit 1
fi
echo "✅ Validation successful!"

# Step 2: Build
echo ""
echo "Step 2/3: Building Lambda functions..."
echo "-----------------------------------"
cmd.exe /c "sam build"

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Stopping."
    exit 1
fi
echo "✅ Build successful!"

# Step 3: Deploy
echo ""
echo "Step 3/3: Deploying to AWS..."
echo "-----------------------------------"
echo "You'll be prompted for configuration:"
echo "  - Stack Name: questrade-portfolio-backend"
echo "  - Region: us-east-1"
echo "  - JWTSecret: (your choice, keep it secret!)"
echo "  - EncryptionKey: (32 characters)"
echo "  - Environment: dev"
echo ""
cmd.exe /c "sam deploy --guided"

if [ $? -ne 0 ]; then
    echo "❌ Deployment failed."
    exit 1
fi

echo ""
echo "========================================="
echo "✅ Deployment Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Check the Outputs section above for your API endpoint"
echo "2. Save the API URL for Postman testing"
echo "3. Test health endpoints first"
