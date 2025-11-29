#!/bin/bash
# SAM Deploy Script for Git Bash

echo "==================================="
echo "SAM Deploy (Guided)"
echo "==================================="

# Change to AWS-Backend directory
cd /d/Project/3/AWS-Backend

echo ""
echo "Starting SAM deploy in guided mode..."
echo "You'll be prompted for configuration."
echo ""

# Run SAM deploy using cmd.exe
cmd.exe /c "sam deploy --guided"

# Check exit code
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Deployment successful!"
else
    echo ""
    echo "❌ Deployment failed. Check errors above."
fi
