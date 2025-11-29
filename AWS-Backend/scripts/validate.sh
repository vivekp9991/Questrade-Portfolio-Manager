#!/bin/bash
# SAM Validate Script for Git Bash

echo "==================================="
echo "SAM Template Validation"
echo "==================================="

# Change to AWS-Backend directory
cd /d/Project/3/AWS-Backend

# Run SAM validate using cmd.exe (avoids PowerShell profile issues)
cmd.exe /c "sam validate"

# Check exit code
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Validation successful!"
else
    echo ""
    echo "❌ Validation failed. Check errors above."
fi
