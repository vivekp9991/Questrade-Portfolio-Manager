# Phase 3: Initial SAM Deployment

**Duration:** 1 day
**Goal:** Deploy infrastructure to AWS for the first time

---

## **Checklist**

### **3.1 Pre-Deployment Verification**

- [ ] Verify AWS credentials are configured
  ```bash
  aws sts get-caller-identity
  ```
  - [ ] Returns account info (not an error)
  - [ ] Shows correct User: questrade-deployer

- [ ] Verify AWS region
  ```bash
  aws configure get region
  ```
  - [ ] Shows: us-east-1 (or your chosen region)

- [ ] Verify SAM template is valid
  ```bash
  sam validate --lint
  ```
  - [ ] No errors
  - [ ] No warnings (or warnings are acceptable)

- [ ] Verify all Lambda functions have dependencies installed
  ```bash
  # Check each Lambda has node_modules/
  ls lambda-functions/auth-service/node_modules/
  ls lambda-functions/sync-operations/node_modules/
  ls lambda-functions/data-read-service/node_modules/
  ls lambda-functions/portfolio-analytics/node_modules/
  ls lambda-functions/market-data-service/node_modules/
  ls lambda-functions/watchlist-service/node_modules/
  ls lambda-functions/jwt-authorizer/node_modules/
  ```

- [ ] Check available AWS services in your region
  ```bash
  # Verify Lambda is available
  aws lambda list-functions --region us-east-1

  # Verify DynamoDB is available
  aws dynamodb list-tables --region us-east-1
  ```

**Verification:**
```bash
✅ AWS credentials valid
✅ Region set correctly
✅ Template validates
✅ All dependencies installed
✅ AWS services accessible
```

---

### **3.2 Build Lambda Functions**

- [ ] Navigate to project root
  ```bash
  cd d:/Project/3/AWS-Backend
  ```

- [ ] Run SAM build
  ```bash
  sam build
  ```

- [ ] Wait for build to complete
  - [ ] See "Build Succeeded" message
  - [ ] No build errors

- [ ] Verify build artifacts created
  ```bash
  ls .aws-sam/build/
  ```
  - [ ] See AuthServiceFunction/
  - [ ] See SyncOperationsFunction/
  - [ ] See DataReadServiceFunction/
  - [ ] See PortfolioAnalyticsFunction/
  - [ ] See MarketDataServiceFunction/
  - [ ] See WatchlistServiceFunction/
  - [ ] See JWTAuthorizerFunction/
  - [ ] See template.yaml

- [ ] Check build logs for warnings
  - [ ] Note any warnings
  - [ ] Acceptable warnings: peer dependencies, optional dependencies

**Expected Output:**
```
Building codeuri: lambda-functions/auth-service runtime: nodejs18.x
Running NodejsNpmBuilder:NpmPack
...
Build Succeeded

Built Artifacts  : .aws-sam/build
Built Template   : .aws-sam/build/template.yaml
```

**Verification:**
```bash
✅ Build succeeded
✅ All 7 Lambda functions built
✅ .aws-sam/build/ directory created
✅ No critical errors
```

---

### **3.3 Deploy to AWS (Guided - First Time)**

- [ ] Run guided deployment
  ```bash
  sam deploy --guided
  ```

- [ ] Answer deployment questions:

  **Stack Name:**
  ```
  Stack Name [sam-app]: questrade-portfolio-backend-dev
  ```
  - [ ] Entered: questrade-portfolio-backend-dev

  **AWS Region:**
  ```
  AWS Region [us-east-1]: us-east-1
  ```
  - [ ] Entered: us-east-1

  **Confirm changes before deploy:**
  ```
  Confirm changes before deploy [y/N]: y
  ```
  - [ ] Entered: y

  **Allow SAM CLI IAM role creation:**
  ```
  Allow SAM CLI IAM role creation [Y/n]: Y
  ```
  - [ ] Entered: Y

  **Disable rollback:**
  ```
  Disable rollback [y/N]: N
  ```
  - [ ] Entered: N

  **Function may not have authorization defined:**
  ```
  AuthServiceFunction may not have authorization defined, Is this okay? [y/N]: y
  ```
  - [ ] Entered: y (for login routes)
  - [ ] Repeat for each function

  **Save arguments to configuration file:**
  ```
  Save arguments to configuration file [Y/n]: Y
  ```
  - [ ] Entered: Y

  **SAM configuration file:**
  ```
  SAM configuration file [samconfig.toml]: samconfig.toml
  ```
  - [ ] Entered: samconfig.toml

  **SAM configuration environment:**
  ```
  SAM configuration environment [default]: dev
  ```
  - [ ] Entered: dev

- [ ] Review deployment plan
  - [ ] See list of resources to be created
  - [ ] Verify resource names
  - [ ] Check estimated costs (should be minimal with free tier)

**Verification:**
```bash
✅ All questions answered
✅ Configuration saved to samconfig.toml
✅ Deployment plan looks correct
```

---

### **3.4 Monitor Deployment Progress**

- [ ] Confirm deployment when prompted
  ```
  Deploy this changeset? [y/N]: y
  ```
  - [ ] Entered: y

- [ ] Watch deployment progress
  - [ ] See "CREATE_IN_PROGRESS" for each resource
  - [ ] Monitor for errors
  - [ ] Be patient (first deployment takes 5-10 minutes)

- [ ] Track resource creation:
  - [ ] S3 bucket created (for deployment artifacts)
  - [ ] CloudFormation stack created
  - [ ] DynamoDB tables created (10 tables)
  - [ ] Lambda functions created (7 functions)
  - [ ] IAM roles created (7+ roles)
  - [ ] API Gateway created
  - [ ] CloudWatch log groups created

- [ ] Wait for completion message
  ```
  Successfully created/updated stack - questrade-portfolio-backend-dev in us-east-1
  ```

**Expected Timeline:**
- 0-2 min: S3 bucket creation
- 2-5 min: DynamoDB tables creation
- 5-8 min: Lambda functions and IAM roles
- 8-10 min: API Gateway and final configuration

**Verification:**
```bash
✅ Deployment completed successfully
✅ No CREATE_FAILED errors
✅ Stack status: CREATE_COMPLETE
```

---

### **3.5 Verify Deployment in AWS Console**

#### **CloudFormation:**

- [ ] Open AWS Console → CloudFormation
- [ ] Find stack: questrade-portfolio-backend-dev
- [ ] Verify status: CREATE_COMPLETE
- [ ] Check "Resources" tab
  - [ ] See all 7 Lambda functions
  - [ ] See all 10 DynamoDB tables
  - [ ] See API Gateway
  - [ ] See IAM roles

- [ ] Check "Outputs" tab
  - [ ] Note API endpoint URL
  - [ ] Note table names

#### **Lambda Functions:**

- [ ] Open AWS Console → Lambda
- [ ] Verify all 7 functions exist:
  - [ ] questrade-auth-service
  - [ ] questrade-sync-operations
  - [ ] questrade-data-read-service
  - [ ] questrade-portfolio-analytics
  - [ ] questrade-market-data-service
  - [ ] questrade-watchlist-service
  - [ ] questrade-jwt-authorizer

- [ ] Click on auth-service function
  - [ ] Verify Runtime: Node.js 18.x
  - [ ] Verify Architecture: arm64
  - [ ] Verify Memory: 512 MB
  - [ ] Verify Timeout: 10 seconds

#### **DynamoDB:**

- [ ] Open AWS Console → DynamoDB → Tables
- [ ] Verify all 10 tables exist:
  - [ ] questrade-users
  - [ ] questrade-persons
  - [ ] questrade-tokens
  - [ ] questrade-accounts
  - [ ] questrade-positions
  - [ ] questrade-activities
  - [ ] questrade-symbols
  - [ ] questrade-watchlists
  - [ ] questrade-watchlist-symbols
  - [ ] questrade-sync-history

- [ ] Click on questrade-users table
  - [ ] Verify Billing mode: On-demand
  - [ ] Check "Indexes" tab
  - [ ] Verify GSI: username-index exists

#### **API Gateway:**

- [ ] Open AWS Console → API Gateway
- [ ] Find API: questrade-portfolio-api (or QuestradeApi)
- [ ] Note API ID
- [ ] Check Routes
  - [ ] See routes for all endpoints
  - [ ] Verify methods (GET, POST, PUT, DELETE)

- [ ] Check Stages
  - [ ] Verify stage: prod
  - [ ] Note Invoke URL

**Verification:**
```bash
✅ All resources visible in AWS Console
✅ All resources have correct configuration
✅ API endpoint URL noted
```

---

### **3.6 Save Deployment Information**

- [ ] Create deployment-info.md
  ```bash
  touch deployment-info.md
  ```

- [ ] Record important information:
  ```markdown
  # Deployment Information

  ## Stack Details
  - Stack Name: questrade-portfolio-backend-dev
  - Region: us-east-1
  - Deployed: [date/time]

  ## API Endpoint
  - URL: https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod

  ## Lambda Functions
  - Auth Service ARN: arn:aws:lambda:us-east-1:123456789012:function:questrade-auth-service
  - [... list all]

  ## DynamoDB Tables
  - Users: questrade-users
  - [... list all]

  ## AWS Account
  - Account ID: 123456789012
  - IAM User: questrade-deployer
  ```

- [ ] Save API endpoint URL
  ```bash
  API_URL="https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod"
  echo $API_URL
  ```

**Verification:**
```bash
✅ Deployment info saved
✅ API URL documented
✅ All ARNs recorded
```

---

### **3.7 Test Basic Connectivity**

- [ ] Test health endpoint (if exists)
  ```bash
  curl https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod/health
  ```
  - [ ] Returns 200 OK or valid response
  - [ ] OR returns 404 (endpoint not yet implemented - that's ok)

- [ ] Check CloudWatch Logs
  - [ ] AWS Console → CloudWatch → Log groups
  - [ ] Find: /aws/lambda/questrade-auth-service
  - [ ] See any log entries

- [ ] Test Lambda directly (via Console)
  - [ ] AWS Console → Lambda → questrade-auth-service
  - [ ] Click "Test" tab
  - [ ] Create test event (simple event)
  - [ ] Click "Test"
  - [ ] Verify function executes (even if returns error due to no implementation)

**Verification:**
```bash
✅ API endpoint responds (200, 404, or other valid HTTP response)
✅ CloudWatch logs are being created
✅ Lambda functions are executable
```

---

### **3.8 Verify samconfig.toml Created**

- [ ] Check samconfig.toml exists
  ```bash
  cat samconfig.toml
  ```

- [ ] Verify contents:
  ```toml
  version = 0.1

  [dev]
  [dev.deploy]
  [dev.deploy.parameters]
  stack_name = "questrade-portfolio-backend-dev"
  s3_bucket = "aws-sam-cli-managed-default-samclisourcebucket-xxxxx"
  s3_prefix = "questrade-portfolio-backend-dev"
  region = "us-east-1"
  confirm_changeset = true
  capabilities = "CAPABILITY_IAM"
  disable_rollback = false
  ```

- [ ] Note S3 bucket name for future reference

**Verification:**
```bash
✅ samconfig.toml created
✅ Contains dev environment configuration
✅ S3 bucket noted
```

---

### **3.9 Test Subsequent Deployment**

- [ ] Make a small change to test deployment
  - [ ] Edit lambda-functions/auth-service/src/handler.js
  - [ ] Add a comment: `// Test deployment update`

- [ ] Build and deploy
  ```bash
  sam build && sam deploy --config-env dev
  ```

- [ ] Verify deployment is faster (should be ~2-3 minutes)
  - [ ] No prompts (uses saved config)
  - [ ] Shows changeset
  - [ ] Asks for confirmation only

- [ ] Confirm deployment
  ```
  Deploy this changeset? [y/N]: y
  ```

- [ ] Wait for completion
  - [ ] See UPDATE_IN_PROGRESS
  - [ ] See UPDATE_COMPLETE
  - [ ] Only changed resources updated (not everything)

**Verification:**
```bash
✅ Subsequent deployment works
✅ Faster than initial deployment
✅ Only updates changed resources
✅ No need to answer setup questions
```

---

### **3.10 Set Up Parameter Store (for Secrets)**

- [ ] Create JWT secret in Parameter Store
  ```bash
  aws ssm put-parameter \
    --name "/questrade/dev/jwt-secret" \
    --value "your-super-secret-jwt-key-change-this" \
    --type "SecureString" \
    --region us-east-1
  ```

- [ ] Verify parameter created
  ```bash
  aws ssm get-parameter \
    --name "/questrade/dev/jwt-secret" \
    --with-decryption \
    --region us-east-1
  ```

- [ ] Create other parameters (if needed)
  ```bash
  # Questrade API credentials (when you have them)
  aws ssm put-parameter \
    --name "/questrade/dev/questrade-client-id" \
    --value "your-client-id" \
    --type "SecureString"

  aws ssm put-parameter \
    --name "/questrade/dev/questrade-client-secret" \
    --value "your-client-secret" \
    --type "SecureString"
  ```

- [ ] Update Lambda environment variables to reference Parameter Store
  - [ ] (This will be done in code to fetch from Parameter Store)
  - [ ] OR update template.yaml to use dynamic references

**Verification:**
```bash
✅ JWT secret stored in Parameter Store
✅ Parameter is encrypted (SecureString)
✅ Can retrieve parameter with --with-decryption
```

---

### **3.11 Monitor Costs**

- [ ] Check AWS Cost Explorer
  - [ ] AWS Console → Billing → Cost Explorer
  - [ ] Filter: Last 7 days
  - [ ] Check costs by service

- [ ] Verify budget alert
  - [ ] AWS Console → Billing → Budgets
  - [ ] See: Questrade-Monthly-Budget
  - [ ] Current spend: $0.00 - $0.50

- [ ] Check free tier usage
  - [ ] AWS Console → Billing → Free Tier
  - [ ] Lambda: X% of 1M requests used
  - [ ] DynamoDB: X% of 25 RCU/WCU used

**Expected Costs So Far:**
- Lambda: $0.00 (free tier)
- DynamoDB: $0.00 (free tier)
- API Gateway: $0.00 (free tier)
- S3: $0.00 (minimal storage)
- CloudWatch: $0.00 (free tier)
- **Total: ~$0.00**

**Verification:**
```bash
✅ Costs are minimal or zero
✅ Free tier is being used
✅ Budget alert is active
```

---

### **3.12 Document Deployment**

- [ ] Update README.md with deployment instructions

- [ ] Create CHANGELOG.md
  ```markdown
  # Changelog

  ## [0.1.0] - 2025-10-27

  ### Added
  - Initial SAM deployment to AWS
  - 7 Lambda functions deployed
  - 10 DynamoDB tables created
  - API Gateway HTTP API created
  - CloudWatch logging enabled

  ### Infrastructure
  - Stack: questrade-portfolio-backend-dev
  - Region: us-east-1
  - API: https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod
  ```

- [ ] Commit changes to Git
  ```bash
  git add .
  git commit -m "feat: Initial SAM deployment to AWS dev environment"
  ```

**Verification:**
```bash
✅ Documentation updated
✅ CHANGELOG created
✅ Changes committed to Git
```

---

## **Completion Criteria**

**Phase 3 is complete when:**
- ✅ SAM build succeeds
- ✅ Initial deployment completes successfully
- ✅ All resources created in AWS
- ✅ samconfig.toml generated
- ✅ Subsequent deployments work
- ✅ API endpoint URL obtained
- ✅ Parameter Store secrets configured
- ✅ Costs verified (should be $0 with free tier)
- ✅ Deployment documented
- ✅ Ready for Phase 4 (Data Migration)

**Estimated Time:** 2-4 hours

---

## **Troubleshooting**

### **Issue: CREATE_FAILED - Access Denied**
**Solution:**
- Check IAM user has AdministratorAccess
- Run: `aws iam list-attached-user-policies --user-name questrade-deployer`
- Verify policy is attached

### **Issue: CREATE_FAILED - Table already exists**
**Solution:**
- Delete existing table manually in AWS Console
- Or rename table in template.yaml
- Redeploy

### **Issue: Deployment hangs**
**Solution:**
- Check CloudFormation console for specific error
- Cancel deployment if stuck > 20 minutes
- Delete stack and try again

### **Issue: Lambda function timeout during deployment**
**Solution:**
- This is normal for first deployment
- Wait patiently
- If fails, check CloudWatch logs for details

### **Issue: S3 bucket name conflict**
**Solution:**
- Let SAM create default bucket
- Or create unique bucket name manually
- Use: `sam deploy --s3-bucket my-unique-bucket-name-12345`

### **Issue: "No changes to deploy"**
**Solution:**
- Make a small change to template or code
- Or use: `sam deploy --force-upload`

---

## **Next Phase**

👉 **[Phase 4: MongoDB Data Migration](Phase-4-Data-Migration.md)**
