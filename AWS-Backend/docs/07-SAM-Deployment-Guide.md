# AWS SAM Deployment Guide

## Table of Contents
1. [What is AWS SAM?](#what-is-aws-sam)
2. [Installation](#installation)
3. [Initial Setup](#initial-setup)
4. [Project Structure](#project-structure)
5. [Deployment Steps](#deployment-steps)
6. [Local Testing](#local-testing)
7. [CI/CD Pipeline](#cicd-pipeline)
8. [Common Commands](#common-commands)
9. [Troubleshooting](#troubleshooting)

---

## What is AWS SAM?

**AWS SAM (Serverless Application Model)** is a framework for building serverless applications on AWS.

### Key Components:
- **SAM CLI** - Command-line tool for local development and deployment
- **SAM Template** - YAML file defining your infrastructure (template.yaml)
- **CloudFormation** - SAM converts to CloudFormation under the hood

### What SAM Does:
```
Your Code + template.yaml
         ↓
    SAM Build (packages everything)
         ↓
    SAM Deploy (creates CloudFormation stack)
         ↓
    AWS Resources Created (Lambda, API Gateway, DynamoDB, etc.)
```

---

## Installation

### Step 1: Install AWS CLI

#### Windows
```powershell
# Download and run installer
# https://awscli.amazonaws.com/AWSCLIV2.msi

# Verify installation
aws --version
# Should show: aws-cli/2.x.x
```

#### Mac
```bash
brew install awscli

# Or download from:
# https://awscli.amazonaws.com/AWSCLIV2.pkg

# Verify
aws --version
```

#### Linux
```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Verify
aws --version
```

---

### Step 2: Install SAM CLI

#### Windows
```powershell
# Download SAM CLI installer
# https://github.com/aws/aws-sam-cli/releases/latest/download/AWS_SAM_CLI_64_PY3.msi

# Run installer (double-click the .msi file)

# Verify installation
sam --version
# Should show: SAM CLI, version 1.x.x
```

#### Mac
```bash
# Using Homebrew (recommended)
brew tap aws/tap
brew install aws-sam-cli

# Or download installer
# https://github.com/aws/aws-sam-cli/releases/latest/download/aws-sam-cli-macos-x86_64.pkg

# Verify
sam --version
```

#### Linux
```bash
# Download installer
wget https://github.com/aws/aws-sam-cli/releases/latest/download/aws-sam-cli-linux-x86_64.zip

# Unzip
unzip aws-sam-cli-linux-x86_64.zip -d sam-installation

# Install
sudo ./sam-installation/install

# Verify
sam --version
```

---

### Step 3: Configure AWS Credentials

```bash
# Run AWS configure
aws configure

# Enter your credentials:
AWS Access Key ID [None]: AKIAIOSFODNN7EXAMPLE
AWS Secret Access Key [None]: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
Default region name [None]: us-east-1
Default output format [None]: json
```

**Credentials Location:**
- Windows: `C:\Users\USERNAME\.aws\credentials`
- Mac/Linux: `~/.aws/credentials`

**How to Get AWS Credentials:**
1. Log in to AWS Console
2. Go to IAM → Users → Your User
3. Security Credentials tab
4. Create Access Key
5. Download and save (you can only see secret key once!)

---

## Initial Setup

### Step 1: Verify Prerequisites

```bash
# Check AWS CLI
aws --version
# Should show: aws-cli/2.x.x

# Check SAM CLI
sam --version
# Should show: SAM CLI, version 1.x.x

# Check Node.js (for Lambda functions)
node --version
# Should show: v18.x.x or higher

# Check npm
npm --version
# Should show: 9.x.x or higher

# Test AWS credentials
aws sts get-caller-identity
# Should show your AWS account info
```

---

### Step 2: Initialize SAM Project (Optional)

**Option A: Start from Scratch**
```bash
# Create new SAM project (interactive)
sam init

# Follow prompts:
# 1. Choose template: AWS Quick Start Templates
# 2. Choose runtime: nodejs18.x
# 3. Choose template: Hello World Example
# 4. Project name: questrade-portfolio-backend
```

**Option B: Use Existing Project (Recommended for You)**
```bash
# You already have AWS-Backend folder
# We'll create template.yaml manually
# Skip sam init
```

---

## Project Structure

### Complete SAM Project Structure

```
AWS-Backend/
├── template.yaml              # ⭐ Main SAM template (infrastructure)
├── samconfig.toml            # Deployment configuration
├── package.json              # Root package.json (optional)
│
├── lambda-functions/
│   ├── auth-service/
│   │   ├── src/
│   │   │   ├── handler.js    # Lambda entry point
│   │   │   ├── app.js        # Express app
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   └── utils/
│   │   ├── package.json      # Dependencies
│   │   └── package-lock.json
│   │
│   ├── sync-operations/
│   │   ├── src/
│   │   └── package.json
│   │
│   ├── data-read-service/
│   ├── portfolio-analytics/
│   ├── market-data-service/
│   ├── watchlist-service/
│   └── jwt-authorizer/
│
├── docs/
│   └── (your existing documentation)
│
├── scripts/
│   ├── build.sh              # Build script
│   ├── deploy.sh             # Deployment script
│   └── local-test.sh         # Local testing script
│
└── .gitignore
```

---

## Deployment Steps

### Step-by-Step Deployment

#### Step 1: Navigate to Project Directory

```bash
cd d:/Project/3/AWS-Backend
```

---

#### Step 2: Build Lambda Functions

**What this does:**
- Installs dependencies (npm install)
- Packages Lambda functions
- Prepares for deployment

```bash
sam build

# Or build specific function:
sam build AuthServiceFunction
```

**Output:**
```
Building codeuri: lambda-functions/auth-service runtime: nodejs18.x
Running NodejsNpmBuilder:NpmPack
Running NodejsNpmBuilder:CopyNpmrc
Running NodejsNpmBuilder:CopySource
Running NodejsNpmBuilder:NpmInstall
Running NodejsNpmBuilder:CleanUpNpmrc

Build Succeeded

Built Artifacts  : .aws-sam/build
Built Template   : .aws-sam/build/template.yaml
```

**What gets created:**
```
.aws-sam/
└── build/
    ├── template.yaml            # Processed template
    ├── AuthServiceFunction/     # Built Lambda
    │   ├── src/
    │   ├── node_modules/
    │   └── package.json
    ├── SyncOperationsFunction/
    └── ... (other functions)
```

---

#### Step 3: Deploy to AWS (First Time)

**First deployment is interactive:**

```bash
sam deploy --guided
```

**You'll be asked:**

```
Configuring SAM deploy
======================

Looking for config file [samconfig.toml] :  Not found

Setting default arguments for 'sam deploy'
=========================================

Stack Name [sam-app]: questrade-portfolio-backend
AWS Region [us-east-1]: us-east-1
#Shows you resources changes to be deployed and require a 'Y' to initiate deploy
Confirm changes before deploy [y/N]: y
#SAM needs permission to be able to create roles to connect to the resources in your template
Allow SAM CLI IAM role creation [Y/n]: Y
#Preserves the state of previously provisioned resources when an operation fails
Disable rollback [y/N]: N
AuthServiceFunction may not have authorization defined, Is this okay? [y/N]: y
SyncOperationsFunction may not have authorization defined, Is this okay? [y/N]: y
... (repeat for each function)
Save arguments to configuration file [Y/n]: Y
SAM configuration file [samconfig.toml]: samconfig.toml
SAM configuration environment [default]: default

Looking for resources needed for deployment:
Creating the required resources...
...
Successfully created!
```

**What happens:**
1. SAM creates S3 bucket for deployment artifacts
2. Uploads Lambda code to S3
3. Creates CloudFormation stack
4. Deploys all resources (Lambda, API Gateway, DynamoDB, etc.)

**Deployment Progress:**
```
Deploying with following values
===============================
Stack name                   : questrade-portfolio-backend
Region                       : us-east-1
Confirm changeset           : True
Disable rollback            : False
Deployment s3 bucket        : aws-sam-cli-managed-default-samclisourcebucket-xxxxx
Capabilities                : ["CAPABILITY_IAM"]
Parameter overrides         : {}
Signing Profiles            : {}

Initiating deployment
=====================

Waiting for changeset to be created..

CloudFormation stack changeset
-----------------------------------------------------------------------------------------------------
Operation                     LogicalResourceId             ResourceType                  Replacement
-----------------------------------------------------------------------------------------------------
+ Add                         AuthServiceFunction           AWS::Lambda::Function         N/A
+ Add                         UsersTable                    AWS::DynamoDB::Table          N/A
+ Add                         QuestradeApi                  AWS::ApiGatewayV2::Api        N/A
... (all resources)
-----------------------------------------------------------------------------------------------------

Changeset created successfully. arn:aws:cloudformation:...

Previewing CloudFormation changeset before deployment
======================================================
Deploy this changeset? [y/N]: y

2025-10-27 12:00:00 - Waiting for stack create/update to complete

CloudFormation events from stack operations
-----------------------------------------------------------------------------------------------------
ResourceStatus                ResourceType                  LogicalResourceId             ResourceStatusReason
-----------------------------------------------------------------------------------------------------
CREATE_IN_PROGRESS           AWS::CloudFormation::Stack    questrade-portfolio-backend   User Initiated
CREATE_IN_PROGRESS           AWS::DynamoDB::Table          UsersTable                    -
CREATE_IN_PROGRESS           AWS::Lambda::Function         AuthServiceFunction           -
CREATE_COMPLETE              AWS::DynamoDB::Table          UsersTable                    -
CREATE_COMPLETE              AWS::Lambda::Function         AuthServiceFunction           -
... (all resources)
CREATE_COMPLETE              AWS::CloudFormation::Stack    questrade-portfolio-backend   -
-----------------------------------------------------------------------------------------------------

Successfully created/updated stack - questrade-portfolio-backend in us-east-1
```

**Success!** 🎉

**Outputs:**
```
-----------------------------------------------------------------------------------------------------
Outputs
-----------------------------------------------------------------------------------------------------
Key                 ApiEndpoint
Description         API Gateway endpoint URL
Value               https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod

Key                 UsersTableName
Description         Users DynamoDB table name
Value               questrade-users
-----------------------------------------------------------------------------------------------------
```

---

#### Step 4: Subsequent Deployments (After First Time)

**Simple deployment (no prompts):**

```bash
sam build && sam deploy
```

**What happens:**
- Builds Lambda functions
- Uses saved configuration from `samconfig.toml`
- Shows changeset (what will change)
- Asks for confirmation
- Deploys updates

**Example output:**
```
Deploying with following values
===============================
Stack name                   : questrade-portfolio-backend
Region                       : us-east-1

Changeset created successfully. arn:aws:cloudformation:...

Previewing CloudFormation changeset before deployment
======================================================
Deploy this changeset? [y/N]: y

... (deployment progress)

Successfully created/updated stack - questrade-portfolio-backend in us-east-1
```

---

#### Step 5: Deploy Without Confirmation (CI/CD)

```bash
sam build && sam deploy --no-confirm-changeset
```

**Use this for:**
- Automated deployments
- CI/CD pipelines
- When you're confident in changes

---

### samconfig.toml (Created After First Deployment)

**Location:** `AWS-Backend/samconfig.toml`

**Contents:**
```toml
version = 0.1

[default]
[default.deploy]
[default.deploy.parameters]
stack_name = "questrade-portfolio-backend"
s3_bucket = "aws-sam-cli-managed-default-samclisourcebucket-xxxxx"
s3_prefix = "questrade-portfolio-backend"
region = "us-east-1"
confirm_changeset = true
capabilities = "CAPABILITY_IAM"
disable_rollback = false
image_repositories = []
```

**What this does:**
- Saves your deployment settings
- No need to answer prompts again
- Can create multiple environments (dev, prod)

---

### Multiple Environments (Dev, Staging, Prod)

**Update samconfig.toml:**
```toml
version = 0.1

[dev]
[dev.deploy.parameters]
stack_name = "questrade-portfolio-backend-dev"
region = "us-east-1"
parameter_overrides = "Environment=dev"

[staging]
[staging.deploy.parameters]
stack_name = "questrade-portfolio-backend-staging"
region = "us-east-1"
parameter_overrides = "Environment=staging"

[prod]
[prod.deploy.parameters]
stack_name = "questrade-portfolio-backend-prod"
region = "us-east-1"
parameter_overrides = "Environment=prod"
```

**Deploy to different environments:**
```bash
# Deploy to dev
sam build && sam deploy --config-env dev

# Deploy to staging
sam build && sam deploy --config-env staging

# Deploy to production
sam build && sam deploy --config-env prod
```

---

## Local Testing

### Test API Locally (Before Deploying)

**Start local API server:**
```bash
sam local start-api
```

**Output:**
```
Mounting AuthServiceFunction at http://127.0.0.1:3000/api/login [POST]
Mounting AuthServiceFunction at http://127.0.0.1:3000/api/persons [GET]
Mounting DataReadServiceFunction at http://127.0.0.1:3000/api/accounts [GET]
...

You can now browse to the above endpoints to invoke your functions.
You do not need to restart/reload SAM CLI while working on your functions,
changes will be reflected instantly/automatically.
```

**Test endpoints:**
```bash
# Test login
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"johndoe","password":"secret123"}'

# Test get accounts
curl http://localhost:3000/api/accounts/john_questrade
```

**Note:** Local DynamoDB not available by default. Use:
- Real DynamoDB tables
- DynamoDB Local (docker)
- Mock responses in code

---

### Test Single Lambda Function

**Invoke specific function:**
```bash
sam local invoke AuthServiceFunction --event events/login.json
```

**Create test event (events/login.json):**
```json
{
  "httpMethod": "POST",
  "path": "/api/login",
  "headers": {
    "Content-Type": "application/json"
  },
  "body": "{\"username\":\"johndoe\",\"password\":\"secret123\"}"
}
```

**Output:**
```
Invoking src/handler.handler (nodejs18.x)
...
START RequestId: xxx Version: $LATEST
... (your console.log outputs)
END RequestId: xxx
REPORT RequestId: xxx Duration: 1234 ms Billed Duration: 1300 ms Memory Size: 512 MB Max Memory Used: 89 MB

{"statusCode":200,"body":"{\"success\":true,\"token\":\"...\"}"}
```

---

### Generate Sample Events

```bash
# Generate API Gateway event
sam local generate-event apigateway http-api-proxy > events/api-event.json

# Generate DynamoDB event
sam local generate-event dynamodb update > events/dynamodb-event.json
```

---

## CI/CD Pipeline

### GitHub Actions (Recommended)

**Create: .github/workflows/deploy.yml**

```yaml
name: Deploy to AWS

on:
  push:
    branches:
      - main
      - develop

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Setup SAM CLI
        uses: aws-actions/setup-sam@v2

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: SAM Build
        run: sam build

      - name: SAM Deploy (Dev)
        if: github.ref == 'refs/heads/develop'
        run: sam deploy --config-env dev --no-confirm-changeset

      - name: SAM Deploy (Prod)
        if: github.ref == 'refs/heads/main'
        run: sam deploy --config-env prod --no-confirm-changeset
```

**Setup GitHub Secrets:**
1. Go to GitHub repository → Settings → Secrets and variables → Actions
2. Add secrets:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`

**Workflow:**
```
Push to develop → Deploy to dev environment
Push to main → Deploy to prod environment
```

---

### Manual Deployment Script

**Create: scripts/deploy.sh**

```bash
#!/bin/bash

# Deployment script for SAM

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting SAM deployment...${NC}"

# Check if environment is specified
ENV=${1:-dev}
echo -e "${YELLOW}Environment: $ENV${NC}"

# Validate environment
if [[ ! "$ENV" =~ ^(dev|staging|prod)$ ]]; then
    echo -e "${RED}Invalid environment. Use: dev, staging, or prod${NC}"
    exit 1
fi

# Build
echo -e "${GREEN}Building SAM application...${NC}"
sam build

if [ $? -ne 0 ]; then
    echo -e "${RED}Build failed!${NC}"
    exit 1
fi

# Deploy
echo -e "${GREEN}Deploying to $ENV...${NC}"
sam deploy --config-env $ENV

if [ $? -ne 0 ]; then
    echo -e "${RED}Deployment failed!${NC}"
    exit 1
fi

echo -e "${GREEN}Deployment successful!${NC}"

# Get API endpoint
API_ENDPOINT=$(aws cloudformation describe-stacks \
    --stack-name questrade-portfolio-backend-$ENV \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
    --output text)

echo -e "${GREEN}API Endpoint: $API_ENDPOINT${NC}"
```

**Make executable:**
```bash
chmod +x scripts/deploy.sh
```

**Usage:**
```bash
# Deploy to dev
./scripts/deploy.sh dev

# Deploy to production
./scripts/deploy.sh prod
```

---

## Common Commands

### Build Commands

```bash
# Build all functions
sam build

# Build specific function
sam build AuthServiceFunction

# Build in parallel (faster)
sam build --parallel

# Build with Docker (ensures correct environment)
sam build --use-container
```

---

### Deploy Commands

```bash
# Guided deploy (first time)
sam deploy --guided

# Regular deploy (uses samconfig.toml)
sam deploy

# Deploy without confirmation
sam deploy --no-confirm-changeset

# Deploy to specific environment
sam deploy --config-env prod

# Deploy with parameters
sam deploy --parameter-overrides "Environment=prod JWTSecret=mysecret"
```

---

### Local Testing Commands

```bash
# Start local API
sam local start-api

# Start local API on custom port
sam local start-api --port 8080

# Invoke specific function
sam local invoke AuthServiceFunction

# Invoke with event
sam local invoke AuthServiceFunction --event events/login.json

# Generate sample event
sam local generate-event apigateway http-api-proxy
```

---

### Validation & Linting

```bash
# Validate template
sam validate

# Validate with lint
sam validate --lint
```

---

### Logs & Monitoring

```bash
# Tail logs for function
sam logs --name AuthServiceFunction --tail

# View recent logs
sam logs --name AuthServiceFunction --start-time '10min ago'

# Filter logs
sam logs --name AuthServiceFunction --filter "ERROR"
```

---

### Cleanup / Delete

```bash
# Delete stack (removes all resources)
sam delete

# Delete specific stack
sam delete --stack-name questrade-portfolio-backend-dev

# Delete without confirmation
sam delete --no-prompts
```

---

## Troubleshooting

### Issue 1: "sam: command not found"

**Problem:** SAM CLI not installed or not in PATH

**Solution:**
```bash
# Check if installed
which sam

# If not found, reinstall SAM CLI
# Windows: Download and run installer
# Mac: brew install aws-sam-cli
# Linux: Follow installation steps above

# Add to PATH if needed (Mac/Linux)
export PATH=$PATH:/usr/local/bin
```

---

### Issue 2: "Unable to upload artifact ... Access Denied"

**Problem:** No S3 bucket permissions

**Solution:**
```bash
# Check AWS credentials
aws sts get-caller-identity

# Ensure IAM user has these permissions:
# - s3:CreateBucket
# - s3:PutObject
# - cloudformation:*
# - lambda:*
# - apigateway:*
# - dynamodb:*
# - iam:CreateRole
# - iam:AttachRolePolicy
```

---

### Issue 3: "Error: Failed to create managed resources: Unable to create S3 bucket"

**Problem:** Bucket name conflict

**Solution:**
```bash
# Use custom bucket
sam deploy --s3-bucket my-custom-sam-bucket-unique-name

# Or let SAM create a new bucket with different name
sam deploy --guided  # Re-run guided setup
```

---

### Issue 4: Build fails with "npm install" errors

**Problem:** Missing dependencies or Node.js version mismatch

**Solution:**
```bash
# Ensure Node.js 18+ installed
node --version

# Install dependencies manually first
cd lambda-functions/auth-service
npm install
cd ../..

# Build with Docker (ensures correct environment)
sam build --use-container
```

---

### Issue 5: "Template format error: Unrecognized resource types"

**Problem:** Template syntax error

**Solution:**
```bash
# Validate template
sam validate

# Check for:
# - Correct indentation (YAML is space-sensitive)
# - Valid resource types
# - Proper references (!Ref, !GetAtt)
```

---

### Issue 6: Local API not connecting to DynamoDB

**Problem:** Local Lambda can't access AWS DynamoDB

**Solution:**
```bash
# Option 1: Use real DynamoDB tables (requires AWS credentials)
aws configure

# Option 2: Use DynamoDB Local (Docker)
docker run -p 8000:8000 amazon/dynamodb-local

# Update Lambda environment variables
AWS_SAM_LOCAL=true
DYNAMODB_ENDPOINT=http://localhost:8000
```

---

### Issue 7: Deployment hangs or times out

**Problem:** CloudFormation stuck on resource creation

**Solution:**
```bash
# Check CloudFormation console for details
# AWS Console → CloudFormation → Stacks → questrade-portfolio-backend

# Cancel deployment
# AWS Console → CloudFormation → Select stack → Delete stack

# Or via CLI
aws cloudformation delete-stack --stack-name questrade-portfolio-backend

# Re-deploy
sam deploy --guided
```

---

### Issue 8: "CREATE_FAILED" during deployment

**Problem:** Resource creation failed (check error message)

**Common causes:**
- Table already exists
- IAM permissions missing
- Invalid configuration

**Solution:**
```bash
# Check specific error in CloudFormation events
aws cloudformation describe-stack-events \
    --stack-name questrade-portfolio-backend \
    --query 'StackEvents[?ResourceStatus==`CREATE_FAILED`]'

# Fix the issue in template.yaml
# Delete failed stack
sam delete

# Re-deploy
sam deploy --guided
```

---

## Quick Reference

### Complete Deployment Workflow

```bash
# 1. Make changes to code or template.yaml

# 2. Validate template
sam validate

# 3. Build
sam build

# 4. Test locally (optional)
sam local start-api

# 5. Deploy to dev
sam deploy --config-env dev

# 6. Test in AWS
curl https://your-api.execute-api.us-east-1.amazonaws.com/api/health

# 7. If all good, deploy to prod
sam deploy --config-env prod
```

---

### First-Time Deployment Checklist

- [ ] AWS CLI installed (`aws --version`)
- [ ] SAM CLI installed (`sam --version`)
- [ ] AWS credentials configured (`aws configure`)
- [ ] Node.js 18+ installed (`node --version`)
- [ ] template.yaml created
- [ ] Lambda function code written
- [ ] Run `sam validate`
- [ ] Run `sam build`
- [ ] Run `sam deploy --guided`
- [ ] Save samconfig.toml
- [ ] Test API endpoint
- [ ] Update frontend with new API URL

---

## Next Steps

**Ready to deploy?**

1. I can create the complete `template.yaml` for your project
2. I can create deployment scripts (`deploy.sh`, `build.sh`)
3. I can create GitHub Actions CI/CD pipeline
4. I can create all Lambda function code

**Just let me know what you need!** 🚀

---

## Additional Resources

- [SAM Official Documentation](https://docs.aws.amazon.com/serverless-application-model/)
- [SAM CLI Command Reference](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-command-reference.html)
- [SAM Template Specification](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-specification.html)
- [SAM GitHub Examples](https://github.com/aws/aws-sam-cli-app-templates)
