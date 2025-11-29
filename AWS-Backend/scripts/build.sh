#!/bin/bash
# SAM Build Script for Git Bash

echo "==================================="
echo "SAM Build"
echo "==================================="

# Change to AWS-Backend directory
cd /d/Project/3/AWS-Backend

# Run SAM build using cmd.exe
cmd.exe /c "sam build"

# Check exit code
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Build successful!"
else
    echo ""
    echo "❌ Build failed. Check errors above."
fi
