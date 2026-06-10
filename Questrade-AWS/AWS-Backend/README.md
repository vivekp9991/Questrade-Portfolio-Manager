# Questrade Portfolio Manager - AWS Backend

Serverless backend for the Questrade Portfolio Management application, built with AWS Lambda, API Gateway, and DynamoDB.

## 🏗️ Architecture

- **API Gateway**: HTTP API for RESTful endpoints
- **Lambda Functions**: 6 microservices (Node.js 20.x, ARM64)
- **DynamoDB**: 10 NoSQL tables for data persistence
- **SAM**: Infrastructure as Code deployment

## 📁 Project Structure

```
AWS-Backend/
├── lambda-functions/          # Lambda function code
│   ├── auth-service/          # Authentication & user management
│   ├── sync-operations/       # Questrade API sync
│   ├── data-read-service/     # Read accounts/positions/activities
│   ├── portfolio-analytics/   # Portfolio calculations & analytics
│   ├── market-data-service/   # Market data & quotes
│   ├── watchlist-service/     # Watchlist management
│   └── jwt-authorizer/        # JWT token validation
├── shared/                    # Shared utilities
│   ├── utils/                 # Logger, DynamoDB, Response helpers
│   └── middleware/            # Shared middleware
├── scripts/                   # Deployment & utility scripts
├── events/                    # Test events for local testing
├── tests/                     # Integration tests
├── docs/                      # Documentation
├── template.yaml              # SAM template (infrastructure)
└── README.md                  # This file
```

## 🚀 Getting Started

### Prerequisites

- ✅ AWS CLI installed and configured
- ✅ SAM CLI installed
- ✅ Node.js 18+ and npm
- ✅ Git
- ✅ AWS Account with appropriate permissions

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd AWS-Backend
   ```

2. **Install dependencies for all Lambda functions**
   ```bash
   # JWT Authorizer
   cd lambda-functions/jwt-authorizer
   npm install

   # Auth Service
   cd ../auth-service
   npm install

   # Repeat for other functions as they are implemented
   ```

3. **Configure environment variables**

   Edit `template.yaml` parameters:
   - `JWTSecret`: Your JWT signing secret
   - `EncryptionKey`: 32-character encryption key
   - `Environment`: dev/staging/prod

## 📦 Lambda Functions

### 1. Auth Service
**Endpoints**: `/api/login`, `/api/persons`, `/api/auth`, `/api/tokens`

**Responsibilities**:
- User login/logout with JWT
- Person (Questrade account) management
- Questrade token management (refresh tokens, access tokens)
- Token status and health checks

**Tables**: Users, Persons, Tokens

---

### 2. Sync Operations
**Endpoints**: `/api/sync`

**Responsibilities**:
- Sync data from Questrade API
- Fetch accounts, positions, activities
- Update DynamoDB tables
- Track sync history

**Tables**: Accounts, Positions, Activities, Symbols, SyncHistory, Tokens

---

### 3. Data Read Service
**Endpoints**: `/api/accounts`, `/api/positions`, `/api/activities`, `/api/stats`

**Responsibilities**:
- Read account data
- Read position data
- Read activity/transaction data
- Provide summary statistics

**Tables**: Accounts, Positions, Activities (read-only)

---

### 4. Portfolio Analytics
**Endpoints**: `/api/portfolio`, `/api/performance`, `/api/allocation`, `/api/analytics`, `/api/reports`

**Responsibilities**:
- Calculate portfolio metrics
- Performance analysis
- Asset allocation
- Generate reports
- Comparison analysis

**Tables**: Accounts, Positions, Activities, Symbols (read-only)

---

### 5. Market Data Service
**Endpoints**: `/api/markets`, `/api/quotes`, `/api/symbols`

**Responsibilities**:
- Fetch market data
- Get real-time quotes
- Symbol search
- Market information

**Tables**: Symbols, Tokens

---

### 6. Watchlist Service
**Endpoints**: `/api/watchlists`

**Responsibilities**:
- Create/read/update/delete watchlists
- Add/remove symbols from watchlists
- Manage user watchlists

**Tables**: Watchlists, WatchlistSymbols

---

### 7. JWT Authorizer
**Type**: Lambda Authorizer

**Responsibilities**:
- Validate JWT tokens
- Generate IAM policies for API Gateway
- Pass user context to downstream functions

**Tables**: Users (read-only)

## 🗄️ DynamoDB Tables

| Table | Partition Key | Sort Key | GSI | Description |
|-------|--------------|----------|-----|-------------|
| Users | userId | - | username-index | User accounts |
| Persons | personName | - | userId-index | Questrade accounts |
| Tokens | personName | tokenType | expiresAt-index | OAuth tokens |
| Accounts | accountId | - | personName-index | Brokerage accounts |
| Positions | accountId | symbolId | personName-symbol-index, symbol-index | Portfolio positions |
| Activities | accountId | activityDateTime | personName-date-index, symbol-date-index | Transactions |
| Symbols | symbolId | - | symbol-index, sector-index | Stock symbols |
| Watchlists | watchlistId | - | personName-index | User watchlists |
| WatchlistSymbols | watchlistId | symbol | symbol-index | Watchlist items |
| SyncHistory | personName | syncTimestamp | status-date-index | Sync logs |

## 🛠️ Development

### Local Testing

1. **Validate template**
   ```bash
   sam validate --lint
   ```

2. **Build**
   ```bash
   sam build
   ```

3. **Start local API**
   ```bash
   sam local start-api --port 3000
   ```

4. **Test a specific function**
   ```bash
   sam local invoke AuthServiceFunction --event events/login.json
   ```

### Testing Endpoints

```bash
# Health check
curl http://localhost:3000/api/auth/health

# Login
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123"}'
```

## 🚢 Deployment

### First Deployment

```bash
# Build
sam build

# Deploy with guided setup
sam deploy --guided
```

You'll be prompted for:
- Stack name: `questrade-portfolio-backend`
- AWS Region: `us-east-1`
- Parameter JWTSecret: Your secret
- Parameter EncryptionKey: Your key
- Confirm changes: Y
- Allow SAM CLI IAM role creation: Y
- Save arguments to configuration file: Y

### Subsequent Deployments

```bash
# Build and deploy
sam build && sam deploy
```

### Deploy to Different Environments

```bash
# Deploy to staging
sam build && sam deploy --parameter-overrides Environment=staging

# Deploy to production
sam build && sam deploy --parameter-overrides Environment=prod
```

## 🔐 Security

### Environment Variables

Sensitive data is stored as Parameters in template.yaml:
- `JWTSecret`: JWT token signing secret
- `EncryptionKey`: Encryption key for sensitive data in DynamoDB

**For production**: Use AWS Secrets Manager or Parameter Store:
```yaml
JWTSecret:
  Type: AWS::SSM::Parameter::Value<String>
  Default: /questrade/prod/jwt-secret
```

### IAM Policies

Each Lambda has least-privilege IAM policies:
- Auth Service: CRUD on Users, Persons, Tokens tables
- Data Read Service: Read-only on Accounts, Positions, Activities
- Sync Operations: CRUD on all sync-related tables

### API Security

- CORS configured in API Gateway
- JWT-based authentication
- Lambda authorizer validates all requests
- Encrypted tokens in DynamoDB

## 📊 Monitoring

### CloudWatch Logs

All Lambda functions log to CloudWatch Logs:
- Log Group: `/aws/lambda/questrade-<function-name>-<env>`
- Structured JSON logging
- Log levels: DEBUG, INFO, WARN, ERROR

### Metrics

Monitor in CloudWatch:
- Lambda invocations, errors, duration
- DynamoDB read/write capacity
- API Gateway requests, 4xx, 5xx errors

### Alarms

Set up CloudWatch Alarms for:
- Lambda errors > threshold
- API 5xx errors
- DynamoDB throttling

## 🧪 Testing

### Unit Tests

```bash
cd lambda-functions/auth-service
npm test
```

### Integration Tests

```bash
# Start local API
sam local start-api

# Run integration tests
npm run test:integration
```

## 📖 API Documentation

### Authentication

All endpoints (except `/api/login`) require JWT authentication:

```http
Authorization: Bearer <jwt-token>
```

### Response Format

**Success:**
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "message": "Error message"
}
```

### Endpoints

See individual Lambda function README files for detailed API documentation.

## 🐛 Troubleshooting

### SAM Validate Fails

```bash
# Check YAML syntax
sam validate

# Check CloudFormation lint
sam validate --lint
```

### Lambda Function Errors

```bash
# View logs
sam logs -n AuthServiceFunction --stack-name questrade-portfolio-backend --tail

# View specific invocation
aws logs filter-log-events \
  --log-group-name /aws/lambda/questrade-auth-service-dev \
  --filter-pattern "ERROR"
```

### DynamoDB Issues

```bash
# Check table exists
aws dynamodb describe-table --table-name questrade-users-dev

# Scan table (dev only, use sparingly)
aws dynamodb scan --table-name questrade-users-dev --max-items 10
```

## 📝 Development Workflow

1. **Create feature branch**
   ```bash
   git checkout -b feature/new-endpoint
   ```

2. **Make changes** to Lambda function code

3. **Test locally**
   ```bash
   sam build && sam local start-api
   ```

4. **Validate**
   ```bash
   sam validate
   ```

5. **Deploy to dev**
   ```bash
   sam deploy --parameter-overrides Environment=dev
   ```

6. **Test in AWS**

7. **Create PR and merge**

8. **Deploy to prod**
   ```bash
   sam deploy --parameter-overrides Environment=prod
   ```

## 🤝 Contributing

1. Follow the existing code structure
2. Use shared utilities from `/shared/utils/`
3. Write unit tests for new functions
4. Update documentation
5. Follow naming conventions

## 📚 Resources

- [AWS SAM Documentation](https://docs.aws.amazon.com/serverless-application-model/)
- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)

## 📄 License

[Your License]

## 👥 Authors

[Your Name/Team]

---

**Status**: Phase 2 - Foundation Complete
**Last Updated**: 2025-10-27
