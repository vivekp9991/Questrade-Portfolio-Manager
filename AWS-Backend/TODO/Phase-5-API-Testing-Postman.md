# Phase 5: API Testing with Postman

**Duration:** 2-3 days
**Goal:** Test all API endpoints using Postman, verify functionality, create test collection

---

## **Checklist**

### **5.1 Set Up Postman Environment**

- [ ] Open Postman

- [ ] Create new workspace
  - [ ] Click "Workspaces" → "Create Workspace"
  - [ ] Name: `Questrade Portfolio API`
  - [ ] Visibility: Personal
  - [ ] Click "Create Workspace"

- [ ] Create environment
  - [ ] Click "Environments" → "+" (Create Environment)
  - [ ] Name: `AWS Dev`
  - [ ] Add variables:
    ```
    baseUrl: https://YOUR-API-ID.execute-api.us-east-1.amazonaws.com/prod
    authToken: (leave empty for now)
    testUsername: testuser
    testPassword: password123
    personName: test_person
    ```
  - [ ] Click "Save"

- [ ] Get your actual API URL
  ```bash
  aws cloudformation describe-stacks \
    --stack-name questrade-portfolio-backend-dev \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
    --output text
  ```

- [ ] Update baseUrl in Postman environment with actual URL

- [ ] Select "AWS Dev" environment (dropdown in top right)

**Verification:**
```bash
✅ Workspace created
✅ Environment created with all variables
✅ baseUrl set to actual API Gateway URL
✅ Environment selected
```

---

### **5.2 Create Postman Collection**

- [ ] Create new collection
  - [ ] Click "Collections" → "+" (Create Collection)
  - [ ] Name: `Questrade Portfolio API - Complete`
  - [ ] Description: "Complete API test suite for Questrade Portfolio Manager"

- [ ] Create folders structure
  - [ ] Right-click collection → "Add Folder"
  - [ ] Create folders:
    - [ ] 01 - Health & Info
    - [ ] 02 - Authentication (Login)
    - [ ] 03 - Persons Management
    - [ ] 04 - Questrade OAuth
    - [ ] 05 - Tokens Management
    - [ ] 06 - Sync Operations
    - [ ] 07 - Accounts
    - [ ] 08 - Positions
    - [ ] 09 - Activities
    - [ ] 10 - Portfolio Analytics
    - [ ] 11 - Performance
    - [ ] 12 - Allocation
    - [ ] 13 - Analytics
    - [ ] 14 - Reports
    - [ ] 15 - Comparison
    - [ ] 16 - Market Data
    - [ ] 17 - Quotes
    - [ ] 18 - Symbols
    - [ ] 19 - Watchlists

**Verification:**
```bash
✅ Collection created
✅ All 19 folders created
✅ Structure matches API documentation
```

---

### **5.3 Test Authentication Endpoints**

#### **5.3.1 Health Check (if implemented)**

- [ ] Create request: GET Health Check
  - [ ] Folder: 01 - Health & Info
  - [ ] Method: GET
  - [ ] URL: `{{baseUrl}}/health`
  - [ ] Send request
  - [ ] Expected: 200 OK or 404 (if not implemented)

#### **5.3.2 Login**

- [ ] Create request: POST Login
  - [ ] Folder: 02 - Authentication (Login)
  - [ ] Method: POST
  - [ ] URL: `{{baseUrl}}/api/login`
  - [ ] Headers:
    ```
    Content-Type: application/json
    ```
  - [ ] Body (raw JSON):
    ```json
    {
      "username": "{{testUsername}}",
      "password": "{{testPassword}}"
    }
    ```
  - [ ] Send request
  - [ ] Expected: 200 OK

- [ ] Verify response
  ```json
  {
    "success": true,
    "message": "Login successful",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "usr_test123",
      "username": "testuser",
      "displayName": "Test User",
      "email": "test@example.com",
      "role": "admin"
    }
  }
  ```

- [ ] Add test script to save token
  - [ ] Click "Tests" tab
  - [ ] Add script:
    ```javascript
    // Save token to environment
    if (pm.response.code === 200) {
        const response = pm.response.json();
        pm.environment.set("authToken", response.token);
        console.log("Token saved:", response.token);
    }

    // Test assertions
    pm.test("Status code is 200", function () {
        pm.response.to.have.status(200);
    });

    pm.test("Response has token", function () {
        const jsonData = pm.response.json();
        pm.expect(jsonData).to.have.property('token');
    });

    pm.test("Response has user", function () {
        const jsonData = pm.response.json();
        pm.expect(jsonData).to.have.property('user');
    });
    ```

- [ ] Run request again
  - [ ] Check "Tests" tab shows all tests passed
  - [ ] Check Console shows "Token saved: ..."
  - [ ] Verify `authToken` variable is set in environment

#### **5.3.3 Verify Token**

- [ ] Create request: POST Verify Token
  - [ ] Folder: 02 - Authentication (Login)
  - [ ] Method: POST
  - [ ] URL: `{{baseUrl}}/api/login/verify`
  - [ ] Headers:
    ```
    Authorization: Bearer {{authToken}}
    Content-Type: application/json
    ```
  - [ ] Send request
  - [ ] Expected: 200 OK with user details

- [ ] Add test script
  ```javascript
  pm.test("Status code is 200", function () {
      pm.response.to.have.status(200);
  });

  pm.test("Token is valid", function () {
      const jsonData = pm.response.json();
      pm.expect(jsonData.success).to.be.true;
  });
  ```

#### **5.3.4 Refresh Token**

- [ ] Create request: POST Refresh Token
  - [ ] Folder: 02 - Authentication (Login)
  - [ ] Method: POST
  - [ ] URL: `{{baseUrl}}/api/login/refresh`
  - [ ] Headers:
    ```
    Authorization: Bearer {{authToken}}
    Content-Type: application/json
    ```
  - [ ] Send request
  - [ ] Expected: 200 OK with new token

- [ ] Add test script to update token
  ```javascript
  if (pm.response.code === 200) {
      const response = pm.response.json();
      pm.environment.set("authToken", response.token);
  }

  pm.test("New token received", function () {
      const jsonData = pm.response.json();
      pm.expect(jsonData).to.have.property('token');
  });
  ```

#### **5.3.5 Test Invalid Login**

- [ ] Create request: POST Login - Invalid Credentials
  - [ ] URL: `{{baseUrl}}/api/login`
  - [ ] Body:
    ```json
    {
      "username": "wronguser",
      "password": "wrongpassword"
    }
    ```
  - [ ] Send request
  - [ ] Expected: 401 Unauthorized

- [ ] Add test
  ```javascript
  pm.test("Status code is 401", function () {
      pm.response.to.have.status(401);
  });

  pm.test("Error message returned", function () {
      const jsonData = pm.response.json();
      pm.expect(jsonData.success).to.be.false;
  });
  ```

**Verification:**
```bash
✅ Login successful with valid credentials
✅ Token saved to environment
✅ Token verification works
✅ Token refresh works
✅ Invalid login returns 401
✅ All test scripts pass
```

---

### **5.4 Test Persons Management**

#### **5.4.1 Get All Persons**

- [ ] Create request: GET All Persons
  - [ ] Folder: 03 - Persons Management
  - [ ] Method: GET
  - [ ] URL: `{{baseUrl}}/api/persons`
  - [ ] Headers:
    ```
    Authorization: Bearer {{authToken}}
    ```
  - [ ] Send request
  - [ ] Expected: 200 OK with array of persons

#### **5.4.2 Get Specific Person**

- [ ] Create request: GET Person by Name
  - [ ] Method: GET
  - [ ] URL: `{{baseUrl}}/api/persons/{{personName}}`
  - [ ] Headers: Authorization
  - [ ] Send request
  - [ ] Expected: 200 OK with person details

#### **5.4.3 Create Person**

- [ ] Create request: POST Create Person
  - [ ] Method: POST
  - [ ] URL: `{{baseUrl}}/api/persons`
  - [ ] Headers: Authorization + Content-Type
  - [ ] Body:
    ```json
    {
      "personName": "new_person_test",
      "displayName": "New Person Test",
      "email": "newperson@example.com",
      "preferences": {
        "theme": "dark"
      }
    }
    ```
  - [ ] Send request
  - [ ] Expected: 201 Created

#### **5.4.4 Update Person**

- [ ] Create request: PUT Update Person
  - [ ] Method: PUT
  - [ ] URL: `{{baseUrl}}/api/persons/new_person_test`
  - [ ] Body:
    ```json
    {
      "displayName": "Updated Person Name",
      "preferences": {
        "theme": "light"
      }
    }
    ```
  - [ ] Send request
  - [ ] Expected: 200 OK

#### **5.4.5 Delete Person**

- [ ] Create request: DELETE Person
  - [ ] Method: DELETE
  - [ ] URL: `{{baseUrl}}/api/persons/new_person_test`
  - [ ] Send request
  - [ ] Expected: 200 OK or 204 No Content

**Verification:**
```bash
✅ Can list all persons
✅ Can get specific person
✅ Can create new person
✅ Can update person
✅ Can delete person
```

---

### **5.5 Test Accounts Endpoints**

- [ ] Create request: GET All Accounts
  - [ ] Folder: 07 - Accounts
  - [ ] URL: `{{baseUrl}}/api/accounts`
  - [ ] Expected: 200 OK with accounts array

- [ ] Create request: GET Accounts by Person
  - [ ] URL: `{{baseUrl}}/api/accounts/{{personName}}`
  - [ ] Expected: 200 OK

- [ ] Create request: GET Account Details
  - [ ] URL: `{{baseUrl}}/api/accounts/detail/26598145`
  - [ ] Expected: 200 OK

- [ ] Create request: GET Account Summary
  - [ ] URL: `{{baseUrl}}/api/accounts/summary/{{personName}}`
  - [ ] Expected: 200 OK

- [ ] Create request: GET Accounts Dropdown
  - [ ] URL: `{{baseUrl}}/api/accounts/dropdown-options`
  - [ ] Expected: 200 OK

- [ ] Add tests to each request
  ```javascript
  pm.test("Status code is 200", function () {
      pm.response.to.have.status(200);
  });

  pm.test("Response is array or object", function () {
      const jsonData = pm.response.json();
      pm.expect(jsonData).to.be.an('object');
  });
  ```

**Verification:**
```bash
✅ All 5 account endpoints tested
✅ All return expected data
✅ Authorization working
```

---

### **5.6 Test Positions Endpoints**

- [ ] Create 6 requests in folder "08 - Positions":
  - [ ] GET All Positions
  - [ ] GET Positions by Account
  - [ ] GET Positions by Person
  - [ ] GET Position Summary
  - [ ] GET Top Positions
  - [ ] GET P&L Summary

- [ ] Test each endpoint
- [ ] Add test scripts
- [ ] Verify data structure

**Verification:**
```bash
✅ All position endpoints tested
✅ Data structure correct
```

---

### **5.7 Test Activities Endpoints**

- [ ] Create 5 requests in folder "09 - Activities":
  - [ ] GET All Activities
  - [ ] GET Activities by Account
  - [ ] GET Activities by Person
  - [ ] GET Activity Summary
  - [ ] GET Activity Types

- [ ] Test each endpoint
- [ ] Verify timestamps are correct
- [ ] Check pagination if implemented

**Verification:**
```bash
✅ All activity endpoints tested
✅ Date/time fields correct
```

---

### **5.8 Test Sync Operations**

- [ ] Create request: POST Sync All Persons
  - [ ] Folder: 06 - Sync Operations
  - [ ] Method: POST
  - [ ] URL: `{{baseUrl}}/api/sync/all`
  - [ ] Expected: 200 OK (or 202 Accepted if async)
  - [ ] **Note:** May fail if Questrade tokens not configured

- [ ] Create request: POST Sync Specific Person
  - [ ] URL: `{{baseUrl}}/api/sync/person/{{personName}}`
  - [ ] Expected: 200 OK or error if no valid token

- [ ] Create request: GET Sync Status
  - [ ] Method: GET
  - [ ] URL: `{{baseUrl}}/api/sync/status`
  - [ ] Expected: 200 OK

- [ ] Create request: GET Sync History
  - [ ] URL: `{{baseUrl}}/api/sync/history`
  - [ ] Expected: 200 OK with history array

**Verification:**
```bash
✅ Sync endpoints accessible
✅ Proper error handling if Questrade not configured
✅ Sync status/history endpoints work
```

---

### **5.9 Test Portfolio Analytics**

- [ ] Create requests in folder "10 - Portfolio Analytics":
  - [ ] GET Portfolio Summary (all accounts)
  - [ ] GET Portfolio Positions
  - [ ] GET Portfolio Overview
  - [ ] GET Person Portfolio Summary
  - [ ] GET All Holdings
  - [ ] GET Portfolio Value
  - [ ] POST Create Snapshot

- [ ] Test each endpoint
- [ ] Verify calculations are correct
- [ ] Check for performance issues (should be < 2 seconds)

**Verification:**
```bash
✅ Portfolio endpoints tested
✅ Calculations appear correct
✅ Response time acceptable
```

---

### **5.10 Test Performance Endpoints**

- [ ] Create requests in folder "11 - Performance":
  - [ ] GET Performance Metrics
  - [ ] GET Historical Performance
  - [ ] GET Return Calculations
  - [ ] GET Daily Performance

- [ ] Verify metrics calculations
- [ ] Check date ranges work correctly

**Verification:**
```bash
✅ Performance metrics calculated
✅ Historical data returned
```

---

### **5.11 Test Allocation Endpoints**

- [ ] Create 6 requests in folder "12 - Allocation":
  - [ ] GET Asset Allocation
  - [ ] GET Sector Allocation
  - [ ] GET Geographic Allocation
  - [ ] GET Currency Allocation
  - [ ] GET Account Type Allocation
  - [ ] GET Market Cap Allocation

- [ ] Verify percentages add up to 100%
- [ ] Check data visualization compatibility

**Verification:**
```bash
✅ All allocation endpoints working
✅ Percentages correct
```

---

### **5.12 Test Market Data Endpoints**

- [ ] Create requests in folder "16 - Market Data":
  - [ ] GET Market Status
  - [ ] GET Market Summary
  - [ ] GET Market Movers
  - [ ] GET Sector Performance
  - [ ] GET Market Breadth

- [ ] Test quote endpoints
  - [ ] GET Single Quote
  - [ ] GET Multiple Quotes
  - [ ] POST Refresh Quote

- [ ] Test symbol endpoints
  - [ ] GET Symbol Search
  - [ ] GET Symbol Details
  - [ ] GET Symbol Options
  - [ ] GET Symbol Fundamentals

**Verification:**
```bash
✅ Market data accessible
✅ Quote endpoints working
✅ Symbol search functional
```

---

### **5.13 Test Watchlist Endpoints**

- [ ] Create request: GET User Watchlists
  - [ ] Folder: 19 - Watchlists
  - [ ] URL: `{{baseUrl}}/api/watchlists/{{personName}}`

- [ ] Create request: POST Create Watchlist
  - [ ] Method: POST
  - [ ] Body:
    ```json
    {
      "name": "My Tech Stocks",
      "description": "Technology sector watchlist"
    }
    ```
  - [ ] Save watchlistId from response

- [ ] Create request: POST Add Symbol to Watchlist
  - [ ] URL: `{{baseUrl}}/api/watchlists/{{watchlistId}}/symbols`
  - [ ] Body:
    ```json
    {
      "symbol": "AAPL",
      "notes": "Watch for earnings"
    }
    ```

- [ ] Create request: GET Watchlist with Quotes
  - [ ] URL: `{{baseUrl}}/api/watchlists/{{personName}}/{{watchlistId}}/quotes`

- [ ] Create request: DELETE Symbol from Watchlist
  - [ ] Method: DELETE
  - [ ] URL: `{{baseUrl}}/api/watchlists/{{watchlistId}}/symbols/AAPL`

- [ ] Create request: DELETE Watchlist
  - [ ] Method: DELETE
  - [ ] URL: `{{baseUrl}}/api/watchlists/{{watchlistId}}`

**Verification:**
```bash
✅ Can create watchlist
✅ Can add symbols
✅ Can get watchlist with quotes
✅ Can delete symbols
✅ Can delete watchlist
```

---

### **5.14 Create Collection-Level Tests**

- [ ] Edit collection settings
  - [ ] Click collection → "..." → "Edit"
  - [ ] Go to "Tests" tab
  - [ ] Add collection-level tests:
    ```javascript
    // Run after every request

    // Check response time
    pm.test("Response time is less than 5000ms", function () {
        pm.expect(pm.response.responseTime).to.be.below(5000);
    });

    // Check content type
    pm.test("Content-Type is application/json", function () {
        pm.response.to.have.header("Content-Type");
        pm.expect(pm.response.headers.get("Content-Type")).to.include("application/json");
    });

    // Log response time
    console.log("Response time:", pm.response.responseTime + "ms");
    ```

**Verification:**
```bash
✅ Collection-level tests added
✅ Tests run on every request
```

---

### **5.15 Run Complete Collection**

- [ ] Click collection → "Run"
- [ ] Select all folders
- [ ] Click "Run Questrade Portfolio API - Complete"
- [ ] Wait for all requests to execute
- [ ] Review results:
  - [ ] Total requests run
  - [ ] Passed tests
  - [ ] Failed tests
  - [ ] Average response time

- [ ] Fix any failing tests
  - [ ] Review error messages
  - [ ] Check API implementation
  - [ ] Update tests if needed

- [ ] Re-run collection until all tests pass

**Verification:**
```bash
✅ All requests executed
✅ All tests passing (or documented failures)
✅ No critical errors
```

---

### **5.16 Export and Save Postman Collection**

- [ ] Export collection
  - [ ] Click collection → "..." → "Export"
  - [ ] Select "Collection v2.1"
  - [ ] Save as: `Questrade-Portfolio-API-Complete.postman_collection.json`
  - [ ] Save to: `AWS-Backend/postman/`

- [ ] Export environment
  - [ ] Click environment → "..." → "Export"
  - [ ] Save as: `AWS-Dev.postman_environment.json`
  - [ ] Save to: `AWS-Backend/postman/`

- [ ] Create README for Postman collection
  - [ ] File: `AWS-Backend/postman/README.md`
  - [ ] Instructions for importing collection
  - [ ] How to set up environment
  - [ ] How to run tests

- [ ] Commit to Git
  ```bash
  git add postman/
  git commit -m "test: Add Postman collection for API testing"
  ```

**Verification:**
```bash
✅ Collection exported
✅ Environment exported
✅ README created
✅ Committed to Git
```

---

### **5.17 Create Test Report**

- [ ] Create test-report.md
  ```markdown
  # API Testing Report

  **Date:** 2025-10-27
  **Tester:** Your Name
  **Environment:** AWS Dev

  ## Summary
  - Total Endpoints: 120
  - Endpoints Tested: 120
  - Tests Passed: 115
  - Tests Failed: 5
  - Pass Rate: 95.8%

  ## Test Results by Category

  ### Authentication (3/3) ✅
  - Login: PASS
  - Verify Token: PASS
  - Refresh Token: PASS

  ### Persons Management (5/5) ✅
  - List Persons: PASS
  - Get Person: PASS
  - Create Person: PASS
  - Update Person: PASS
  - Delete Person: PASS

  ### Accounts (5/5) ✅
  - All endpoints passing

  ### Positions (6/6) ✅
  - All endpoints passing

  ### Activities (5/5) ✅
  - All endpoints passing

  ### Sync Operations (4/7) ⚠️
  - Sync endpoints fail due to missing Questrade tokens (expected)

  ### Portfolio Analytics (8/8) ✅
  - All endpoints passing

  ### Market Data (10/15) ⚠️
  - Some endpoints need Questrade API integration

  ### Watchlists (9/9) ✅
  - All endpoints passing

  ## Failed Tests
  1. Sync All Persons - Missing Questrade token
  2. Sync Specific Person - Missing Questrade token
  3. Get Market Movers - Questrade API not configured
  4. Get Options Chain - Questrade API not configured
  5. Get Quote Stream - WebSocket not implemented

  ## Performance
  - Average Response Time: 250ms
  - Slowest Endpoint: Portfolio Analytics (1.2s)
  - Fastest Endpoint: Health Check (45ms)

  ## Recommendations
  1. Configure Questrade API credentials for sync/market data
  2. Implement WebSocket for real-time quotes (if needed)
  3. Optimize portfolio analytics queries
  4. Add rate limiting tests

  ## Next Steps
  - Configure Questrade OAuth
  - Test with real portfolio data
  - Load testing
  - Security testing
  ```

- [ ] Save report to `AWS-Backend/docs/test-report.md`

**Verification:**
```bash
✅ Test report created
✅ All results documented
✅ Issues identified
```

---

## **Completion Criteria**

**Phase 5 is complete when:**
- ✅ Postman workspace and environment set up
- ✅ Complete collection created (19 folders, 120+ requests)
- ✅ All authentication endpoints tested
- ✅ All CRUD operations tested
- ✅ All read endpoints tested
- ✅ Test scripts added to all requests
- ✅ Collection-level tests configured
- ✅ Full collection run completed
- ✅ Collection and environment exported
- ✅ Test report created
- ✅ 95%+ pass rate (excluding Questrade-dependent endpoints)
- ✅ Ready for Phase 6 (Frontend Integration)

**Estimated Time:** 8-12 hours

---

## **Troubleshooting**

### **Issue: 401 Unauthorized on protected routes**
**Solution:**
- Verify token is saved in environment
- Check Authorization header format: `Bearer {{authToken}}`
- Re-login to get fresh token

### **Issue: Token expired**
**Solution:**
- Use Refresh Token endpoint
- Or login again
- Update token in environment

### **Issue: CORS errors in Postman**
**Solution:**
- CORS should not affect Postman
- If issues, check API Gateway CORS configuration

### **Issue: Slow response times**
**Solution:**
- Check Lambda cold starts (first request after idle)
- Monitor CloudWatch metrics
- Optimize DynamoDB queries

### **Issue: 500 Internal Server Error**
**Solution:**
- Check CloudWatch logs for Lambda function
- Verify DynamoDB table exists
- Check Lambda has proper IAM permissions

---

## **Next Phase**

👉 **[Phase 6: Frontend Integration](Phase-6-Frontend-Integration.md)**
