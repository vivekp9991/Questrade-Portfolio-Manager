# Phase 2: SAM Template and Project Structure

**Duration:** 2-3 days
**Goal:** Create SAM template, set up project structure, and prepare Lambda functions

---

## **Checklist**

### **2.1 Create Project Structure**

- [ ] Navigate to project directory
  ```bash
  cd d:/Project/3/AWS-Backend
  ```

- [ ] Verify existing docs folder
  ```bash
  ls docs/
  # Should see: 00-README.md, 01-Architecture-Overview.md, etc.
  ```

- [ ] Create Lambda functions directory structure
  ```bash
  mkdir -p lambda-functions/auth-service/src
  mkdir -p lambda-functions/sync-operations/src
  mkdir -p lambda-functions/data-read-service/src
  mkdir -p lambda-functions/portfolio-analytics/src
  mkdir -p lambda-functions/market-data-service/src
  mkdir -p lambda-functions/watchlist-service/src
  mkdir -p lambda-functions/jwt-authorizer/src
  ```

- [ ] Create additional folders
  ```bash
  mkdir -p scripts
  mkdir -p events
  mkdir -p tests
  ```

- [ ] Verify structure
  ```bash
  tree -L 2 .
  # Or on Windows: tree /F
  ```

**Expected Structure:**
```
AWS-Backend/
├── docs/
├── lambda-functions/
│   ├── auth-service/
│   ├── sync-operations/
│   ├── data-read-service/
│   ├── portfolio-analytics/
│   ├── market-data-service/
│   ├── watchlist-service/
│   └── jwt-authorizer/
├── scripts/
├── events/
├── tests/
└── TODO/
```

**Verification:**
```bash
✅ All directories created
✅ Structure matches expected layout
```

---

### **2.2 Create SAM Template (template.yaml)**

- [ ] Create template.yaml in root directory
  ```bash
  # File will be created by Claude or manually
  touch template.yaml
  ```

- [ ] Add template header and globals section
  - [ ] AWSTemplateFormatVersion: '2010-09-09'
  - [ ] Transform: AWS::Serverless-2016-10-31
  - [ ] Description
  - [ ] Globals section (Function, Api)

- [ ] Define Parameters section (optional)
  - [ ] Environment parameter (dev/staging/prod)
  - [ ] JWT secret parameter

- [ ] Define API Gateway (QuestradeApi)
  - [ ] Type: AWS::Serverless::HttpApi
  - [ ] StageName: prod
  - [ ] CORS configuration
  - [ ] Auth configuration (JWT Authorizer)

- [ ] Define Lambda: JWT Authorizer
  - [ ] Function name: questrade-jwt-authorizer
  - [ ] Runtime: nodejs18.x
  - [ ] Architecture: arm64
  - [ ] Memory: 256 MB
  - [ ] Timeout: 5 seconds
  - [ ] Environment variables
  - [ ] IAM policies

- [ ] Define Lambda: Auth Service
  - [ ] Function name: questrade-auth-service
  - [ ] CodeUri: lambda-functions/auth-service/
  - [ ] Handler: src/handler.handler
  - [ ] Memory: 512 MB
  - [ ] Timeout: 10 seconds
  - [ ] Environment variables (table names)
  - [ ] IAM policies (DynamoDB access)
  - [ ] Events (API routes)

- [ ] Define Lambda: Sync Operations
  - [ ] Function name: questrade-sync-operations
  - [ ] Memory: 1024 MB
  - [ ] Timeout: 60 seconds
  - [ ] Reserved concurrency: 5
  - [ ] Environment variables
  - [ ] IAM policies
  - [ ] Events

- [ ] Define Lambda: Data Read Service
  - [ ] Function name: questrade-data-read-service
  - [ ] Memory: 512 MB
  - [ ] Timeout: 10 seconds
  - [ ] Environment variables
  - [ ] IAM policies
  - [ ] Events

- [ ] Define Lambda: Portfolio Analytics
  - [ ] Function name: questrade-portfolio-analytics
  - [ ] Memory: 2048 MB
  - [ ] Timeout: 30 seconds
  - [ ] Environment variables
  - [ ] IAM policies
  - [ ] Events

- [ ] Define Lambda: Market Data Service
  - [ ] Function name: questrade-market-data-service
  - [ ] Memory: 512 MB
  - [ ] Timeout: 10 seconds
  - [ ] Environment variables
  - [ ] IAM policies
  - [ ] Events

- [ ] Define Lambda: Watchlist Service
  - [ ] Function name: questrade-watchlist-service
  - [ ] Memory: 512 MB
  - [ ] Timeout: 10 seconds
  - [ ] Environment variables
  - [ ] IAM policies
  - [ ] Events

- [ ] Define DynamoDB: Users Table
  - [ ] Table name: questrade-users
  - [ ] BillingMode: PAY_PER_REQUEST
  - [ ] Primary key: userId (String)
  - [ ] GSI: username-index

- [ ] Define DynamoDB: Persons Table
  - [ ] Table name: questrade-persons
  - [ ] Primary key: personName
  - [ ] GSI: userId-index

- [ ] Define DynamoDB: Tokens Table
  - [ ] Table name: questrade-tokens
  - [ ] Primary key: personName, tokenType
  - [ ] TTL: expiresAt
  - [ ] GSI: expiresAt-index

- [ ] Define DynamoDB: Accounts Table
  - [ ] Table name: questrade-accounts
  - [ ] Primary key: accountId
  - [ ] GSI: personName-index

- [ ] Define DynamoDB: Positions Table
  - [ ] Table name: questrade-positions
  - [ ] Primary key: accountId, symbolId
  - [ ] GSI: personName-symbol-index
  - [ ] GSI: symbol-index

- [ ] Define DynamoDB: Activities Table
  - [ ] Table name: questrade-activities
  - [ ] Primary key: accountId, activityDateTime
  - [ ] GSI: personName-date-index
  - [ ] GSI: symbol-date-index

- [ ] Define DynamoDB: Symbols Table
  - [ ] Table name: questrade-symbols
  - [ ] Primary key: symbolId
  - [ ] GSI: symbol-index
  - [ ] GSI: sector-index

- [ ] Define DynamoDB: Watchlists Table
  - [ ] Table name: questrade-watchlists
  - [ ] Primary key: watchlistId
  - [ ] GSI: personName-index

- [ ] Define DynamoDB: WatchlistSymbols Table
  - [ ] Table name: questrade-watchlist-symbols
  - [ ] Primary key: watchlistId, symbol
  - [ ] GSI: symbol-index

- [ ] Define DynamoDB: SyncHistory Table
  - [ ] Table name: questrade-sync-history
  - [ ] Primary key: personName, syncTimestamp
  - [ ] TTL: expiresAt
  - [ ] GSI: status-date-index

- [ ] Define Outputs section
  - [ ] API endpoint URL
  - [ ] All table names
  - [ ] Lambda function ARNs

**Verification:**
```bash
# Validate template
sam validate

# Should see: template.yaml is a valid SAM Template
✅ No validation errors
✅ No syntax errors
```

---

### **2.3 Create Lambda Function: JWT Authorizer**

- [ ] Create package.json
  ```bash
  cd lambda-functions/jwt-authorizer
  npm init -y
  ```

- [ ] Update package.json
  - [ ] Set name: "questrade-jwt-authorizer"
  - [ ] Set main: "src/handler.js"
  - [ ] Set scripts.test

- [ ] Install dependencies
  ```bash
  npm install jsonwebtoken @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
  ```

- [ ] Create src/handler.js
  - [ ] Export handler function
  - [ ] Extract token from Authorization header
  - [ ] Verify JWT token
  - [ ] Query Users table to check user is active
  - [ ] Generate IAM policy (Allow/Deny)
  - [ ] Return policy with user context

- [ ] Create src/utils/logger.js
  - [ ] Implement structured logging
  - [ ] Log levels: debug, info, warn, error

- [ ] Test locally
  ```bash
  # Create test event
  cat > ../../events/authorizer-event.json
  # Add sample event JSON

  # Test
  cd ../..
  sam local invoke JWTAuthorizerFunction --event events/authorizer-event.json
  ```

**Verification:**
```bash
✅ package.json created
✅ Dependencies installed
✅ handler.js created and exports handler
✅ Local test passes
```

---

### **2.4 Create Lambda Function: Auth Service**

- [ ] Create package.json
  ```bash
  cd lambda-functions/auth-service
  npm init -y
  ```

- [ ] Install dependencies
  ```bash
  npm install express aws-serverless-express @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb bcryptjs jsonwebtoken joi axios
  ```

- [ ] Create src/handler.js
  - [ ] Import Express app
  - [ ] Use aws-serverless-express to wrap Express
  - [ ] Export handler

- [ ] Create src/app.js
  - [ ] Initialize Express app
  - [ ] Add middleware (CORS, body parser, error handler)
  - [ ] Import routes
  - [ ] Export app

- [ ] Create src/routes/login.js
  - [ ] POST /api/login
  - [ ] POST /api/login/verify
  - [ ] POST /api/login/refresh

- [ ] Create src/routes/persons.js
  - [ ] GET /api/persons
  - [ ] GET /api/persons/:personName
  - [ ] POST /api/persons
  - [ ] PUT /api/persons/:personName
  - [ ] DELETE /api/persons/:personName
  - [ ] POST /api/persons/:personName/token

- [ ] Create src/routes/auth.js
  - [ ] POST /api/auth/setup-person
  - [ ] POST /api/auth/refresh-token/:personName
  - [ ] GET /api/auth/token-status/:personName
  - [ ] GET /api/auth/access-token/:personName
  - [ ] POST /api/auth/test-connection/:personName

- [ ] Create src/routes/tokens.js
  - [ ] GET /api/tokens
  - [ ] GET /api/tokens/:personName
  - [ ] DELETE /api/tokens/expired
  - [ ] GET /api/tokens/stats/summary

- [ ] Create src/services/userService.js
  - [ ] Business logic for user operations
  - [ ] DynamoDB queries

- [ ] Create src/services/personService.js
  - [ ] Business logic for person operations

- [ ] Create src/services/tokenService.js
  - [ ] Business logic for token operations

- [ ] Create src/utils/dynamodb.js
  - [ ] DynamoDB client setup
  - [ ] Helper functions

- [ ] Create src/utils/logger.js
  - [ ] Structured logging utility

- [ ] Create src/middleware/errorHandler.js
  - [ ] Express error handler middleware

- [ ] Test locally
  ```bash
  cd ../..
  sam local start-api
  # Test endpoints with curl or Postman
  ```

**Verification:**
```bash
✅ All dependencies installed
✅ All routes created
✅ Services layer implemented
✅ Local API starts without errors
✅ Can test /health endpoint locally
```

---

### **2.5 Create Remaining Lambda Functions**

**For each Lambda (Sync, Data Read, Portfolio Analytics, Market Data, Watchlist):**

- [ ] Create package.json
- [ ] Install dependencies
- [ ] Create src/handler.js
- [ ] Create src/app.js
- [ ] Create route files
- [ ] Create service files
- [ ] Create shared utilities
- [ ] Test locally

**Sync Operations:**
- [ ] Routes: sync.js
- [ ] Services: syncService.js, questradeApiService.js
- [ ] Utils: batchWriter.js, retryLogic.js

**Data Read Service:**
- [ ] Routes: accounts.js, positions.js, activities.js, stats.js
- [ ] Services: accountService.js, positionService.js, activityService.js

**Portfolio Analytics:**
- [ ] Routes: portfolio.js, performance.js, allocation.js, analytics.js, reports.js, comparison.js
- [ ] Services: portfolioService.js, analyticsService.js, calculationService.js
- [ ] Utils: financialCalculations.js

**Market Data Service:**
- [ ] Routes: markets.js, quotes.js, symbols.js
- [ ] Services: marketService.js, quoteService.js
- [ ] Utils: cache.js

**Watchlist Service:**
- [ ] Routes: watchlists.js
- [ ] Services: watchlistService.js

**Verification:**
```bash
✅ All 7 Lambda functions have package.json
✅ All dependencies installed
✅ All handlers export handler function
✅ Express apps configured
✅ Routes defined
```

---

### **2.6 Create Shared Utilities**

- [ ] Create shared utils that can be copied to each Lambda
  - [ ] utils/dynamodb.js (DynamoDB client)
  - [ ] utils/logger.js (structured logging)
  - [ ] middleware/errorHandler.js (error handling)
  - [ ] middleware/validator.js (input validation)

- [ ] Document usage in README.md for each utility

**Verification:**
```bash
✅ Shared utilities created
✅ Documented
✅ Consistent across all Lambdas
```

---

### **2.7 Create Deployment Scripts**

- [ ] Create scripts/build.sh
  ```bash
  #!/bin/bash
  # Build all Lambda functions
  sam build --parallel
  ```

- [ ] Create scripts/deploy.sh
  ```bash
  #!/bin/bash
  # Deploy to specified environment
  ENV=${1:-dev}
  sam build && sam deploy --config-env $ENV
  ```

- [ ] Create scripts/local-test.sh
  ```bash
  #!/bin/bash
  # Start local API
  sam local start-api --port 3000
  ```

- [ ] Create scripts/validate.sh
  ```bash
  #!/bin/bash
  # Validate SAM template
  sam validate --lint
  ```

- [ ] Make scripts executable
  ```bash
  chmod +x scripts/*.sh
  ```

**Verification:**
```bash
✅ All scripts created
✅ Scripts are executable
✅ Scripts have proper shebang (#!/bin/bash)
```

---

### **2.8 Create Test Events**

- [ ] Create events/login.json
  ```json
  {
    "httpMethod": "POST",
    "path": "/api/login",
    "body": "{\"username\":\"testuser\",\"password\":\"password123\"}"
  }
  ```

- [ ] Create events/authorizer-allow.json
  - [ ] Valid JWT token
  - [ ] Expected: Allow policy

- [ ] Create events/authorizer-deny.json
  - [ ] Invalid JWT token
  - [ ] Expected: Deny policy

- [ ] Create events/get-accounts.json
  - [ ] GET /api/accounts/:personName

- [ ] Create events/sync-person.json
  - [ ] POST /api/sync/person/:personName

**Verification:**
```bash
✅ Test events created
✅ Events are valid JSON
✅ Cover major use cases
```

---

### **2.9 Create .gitignore**

- [ ] Create .gitignore in root
  ```
  # Dependencies
  node_modules/
  package-lock.json

  # SAM
  .aws-sam/
  samconfig.toml

  # Environment
  .env
  .env.local
  .env.*.local

  # Logs
  logs/
  *.log

  # OS
  .DS_Store
  Thumbs.db

  # IDE
  .vscode/
  .idea/
  *.swp

  # AWS
  .aws/

  # Build
  dist/
  build/
  ```

**Verification:**
```bash
✅ .gitignore created
✅ Covers all necessary files
```

---

### **2.10 Initialize Git Repository**

- [ ] Initialize Git
  ```bash
  cd d:/Project/3/AWS-Backend
  git init
  ```

- [ ] Add files
  ```bash
  git add .
  ```

- [ ] Create initial commit
  ```bash
  git commit -m "Initial commit: SAM template and Lambda functions structure"
  ```

- [ ] Create .git/config with remote (optional)
  ```bash
  git remote add origin https://github.com/yourusername/questrade-portfolio-backend.git
  ```

**Verification:**
```bash
✅ Git repository initialized
✅ Initial commit created
✅ Remote configured (if applicable)
```

---

### **2.11 Validate Everything**

- [ ] Validate SAM template
  ```bash
  sam validate --lint
  ```

- [ ] Check for syntax errors
  - [ ] No YAML indentation errors
  - [ ] All resource references correct
  - [ ] All environment variables defined

- [ ] Verify all Lambda functions have:
  - [ ] package.json
  - [ ] src/handler.js
  - [ ] Required dependencies

- [ ] Run npm install in all Lambda directories
  ```bash
  cd lambda-functions/auth-service && npm install && cd ../..
  cd lambda-functions/sync-operations && npm install && cd ../..
  # ... repeat for all functions
  ```

- [ ] Check for any missing files
  ```bash
  # Should see all Lambda functions with src/ and package.json
  ls -la lambda-functions/*/
  ```

**Verification:**
```bash
✅ sam validate passes
✅ No errors or warnings
✅ All dependencies installed
✅ No missing files
```

---

## **Completion Criteria**

**Phase 2 is complete when:**
- ✅ template.yaml created and validated
- ✅ All 7 Lambda functions created with code
- ✅ All 10 DynamoDB tables defined in template
- ✅ All API routes configured
- ✅ Deployment scripts created
- ✅ Test events created
- ✅ Git repository initialized
- ✅ All npm dependencies installed
- ✅ `sam validate` passes with no errors
- ✅ Ready for Phase 3 (Initial Deployment)

**Estimated Time:** 2-3 days (with coding)

---

## **Troubleshooting**

### **Issue: sam validate fails with "Unrecognized resource types"**
- **Solution:** Check resource type names (e.g., AWS::Serverless::Function)
- **Solution:** Verify Transform: AWS::Serverless-2016-10-31 is present

### **Issue: YAML indentation errors**
- **Solution:** Use 2 spaces for indentation (not tabs)
- **Solution:** Use YAML validator online

### **Issue: npm install fails**
- **Solution:** Check Node.js version (should be 18+)
- **Solution:** Delete package-lock.json and node_modules, try again

### **Issue: handler.js export not found**
- **Solution:** Verify export: `exports.handler = async (event) => { ... }`
- **Solution:** Check Handler in template matches: src/handler.handler

---

## **Next Phase**

👉 **[Phase 3: Initial SAM Deployment](Phase-3-Initial-SAM-Deployment.md)**
