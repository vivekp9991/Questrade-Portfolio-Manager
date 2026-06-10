#!/bin/bash
# Copy shared utilities to each Lambda function directory

echo "Copying shared utilities to each Lambda function..."

# List of Lambda function directories
FUNCTIONS=(
  "lambda-functions/jwt-authorizer"
  "lambda-functions/auth-service"
  "lambda-functions/sync-operations"
  "lambda-functions/data-read-service"
  "lambda-functions/portfolio-analytics"
  "lambda-functions/market-data-service"
  "lambda-functions/watchlist-service"
  "lambda-functions/token-refresh-scheduler"
)

# Copy shared folder to each function
for func in "${FUNCTIONS[@]}"; do
  echo "  - Copying to $func/shared"
  rm -rf "$func/shared"
  cp -r "shared" "$func/shared"
done

echo "✅ Shared utilities copied successfully!"
