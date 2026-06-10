# Check AWS Deployment Status
# This script checks if the CloudFormation stack is deployed and gets outputs

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Checking Deployment Status" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

$stackName = "questrade-portfolio-backend"
$region = "us-east-1"

# Check if stack exists
Write-Host "Checking stack: $stackName in region: $region..." -ForegroundColor Yellow
Write-Host ""

try {
    $awsCli = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
    $stack = & $awsCli cloudformation describe-stacks --stack-name $stackName --region $region 2>&1 | ConvertFrom-Json

    if ($stack.Stacks) {
        $status = $stack.Stacks[0].StackStatus
        Write-Host "Stack Status: $status" -ForegroundColor Green
        Write-Host ""

        if ($status -eq "CREATE_COMPLETE" -or $status -eq "UPDATE_COMPLETE") {
            Write-Host "=========================================" -ForegroundColor Green
            Write-Host "Deployment Successful!" -ForegroundColor Green
            Write-Host "=========================================" -ForegroundColor Green
            Write-Host ""

            # Get outputs
            Write-Host "Stack Outputs:" -ForegroundColor Cyan
            Write-Host "-----------------------------------" -ForegroundColor Cyan

            foreach ($output in $stack.Stacks[0].Outputs) {
                Write-Host "$($output.OutputKey): $($output.OutputValue)" -ForegroundColor White
            }

            Write-Host ""
            Write-Host "API Endpoint is ready for testing!" -ForegroundColor Green

        } elseif ($status -like "*IN_PROGRESS*") {
            Write-Host "Deployment is still in progress..." -ForegroundColor Yellow
            Write-Host "Please wait and run this script again in a few moments." -ForegroundColor Yellow

        } elseif ($status -like "*FAILED*" -or $status -like "*ROLLBACK*") {
            Write-Host "Deployment failed or rolled back!" -ForegroundColor Red
            Write-Host "Check CloudFormation console for details." -ForegroundColor Red

        } else {
            Write-Host "Stack status: $status" -ForegroundColor Yellow
        }
    }

} catch {
    Write-Host "Error checking stack status:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "The stack might not exist yet or AWS CLI might not be configured." -ForegroundColor Yellow
}
