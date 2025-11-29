#!/bin/bash
# Fix shared imports in all Lambda function files
# From src/handler.js perspective, shared is at ../shared not ../../shared

echo "Fixing import paths in Lambda functions..."

# Find all JS files and replace ../../shared with ../shared
find lambda-functions -name "*.js" -type f -exec sed -i 's|require(.../../shared|require('"'"'../shared|g' {} \;
find lambda-functions -name "*.js" -type f -exec sed -i 's|require("../../shared|require("../shared|g' {} \;

echo "✅ Import paths fixed successfully!"
