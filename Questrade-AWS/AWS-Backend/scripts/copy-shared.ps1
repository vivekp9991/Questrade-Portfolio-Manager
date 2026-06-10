# PowerShell script to copy shared utilities to each Lambda function
Write-Host "Copying shared utilities to each Lambda function..." -ForegroundColor Cyan

$functions = @(
    "lambda-functions\jwt-authorizer",
    "lambda-functions\auth-service",
    "lambda-functions\sync-operations",
    "lambda-functions\data-read-service",
    "lambda-functions\portfolio-analytics",
    "lambda-functions\market-data-service",
    "lambda-functions\watchlist-service",
    "lambda-functions\token-refresh-scheduler"
)

foreach ($func in $functions) {
    Write-Host "  - Copying to $func\shared" -ForegroundColor Gray

    # Remove existing shared folder
    $targetPath = Join-Path $func "shared"
    if (Test-Path $targetPath) {
        Remove-Item -Recurse -Force $targetPath
    }

    # Copy shared folder
    Copy-Item -Recurse -Force "shared" $targetPath
}

Write-Host "`n✅ Shared utilities copied successfully!" -ForegroundColor Green
