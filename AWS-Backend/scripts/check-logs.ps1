# Check CloudWatch Logs for Lambda Functions
param(
    [string]$FunctionName = "AuthServiceFunction",
    [int]$Minutes = 5
)

$awsCli = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
$stackName = "questrade-portfolio-backend"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "CloudWatch Logs Viewer" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Get the full function name from the stack
$logGroupName = "/aws/lambda/$stackName-$FunctionName"

Write-Host "Fetching logs from: $logGroupName" -ForegroundColor Yellow
Write-Host "Time range: Last $Minutes minutes" -ForegroundColor Yellow
Write-Host ""
Write-Host "-----------------------------------" -ForegroundColor Cyan

try {
    # Tail the logs
    & $awsCli logs tail $logGroupName --since "${Minutes}m" --format short --region us-east-1
} catch {
    Write-Host "Error fetching logs:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}
