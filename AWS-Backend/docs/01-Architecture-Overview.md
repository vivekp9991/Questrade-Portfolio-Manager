# AWS Serverless Architecture Overview

## Table of Contents
1. [Architecture Summary](#architecture-summary)
2. [Service Components](#service-components)
3. [Technology Stack](#technology-stack)
4. [Design Principles](#design-principles)
5. [Scalability Strategy](#scalability-strategy)

---

## Architecture Summary

### High-Level Architecture
```
Frontend (SolidJS)
        ↓
API Gateway (HTTP API)
        ↓
Lambda Authorizer (JWT Validation)
        ↓
7 Lambda Functions
        ↓
DynamoDB (10 Tables)
```

### Core Services
- **API Gateway:** Single HTTP API endpoint for all services
- **Lambda Functions:** 7 specialized functions (4 business + 1 sync + 1 market + 1 authorizer)
- **DynamoDB:** 10 tables for data persistence
- **CloudWatch:** Logging and monitoring
- **Systems Manager:** Parameter Store for secrets

---

## Service Components

### 1. API Gateway Layer
- **Type:** HTTP API (not REST API)
- **Protocol:** HTTPS
- **Authentication:** Lambda Authorizer (JWT-based)
- **CORS:** Enabled for frontend domain
- **Throttling:** 10,000 requests/second burst

### 2. Lambda Functions (7 Total)

#### Business Lambdas:
1. **Auth Service** - Login, users, persons, tokens management
2. **Data Read Service** - Accounts, positions, activities (read-only)
3. **Portfolio Analytics** - Complex calculations, reports, performance
4. **Market Data Service** - Quotes, symbols, market data
5. **Watchlist Service** - User watchlists and alerts

#### Operational Lambdas:
6. **Sync Operations** - Questrade API synchronization
7. **JWT Authorizer** - Token validation and authorization

### 3. Database Layer
- **Primary Database:** DynamoDB
- **Number of Tables:** 10
- **Billing Mode:** On-Demand (pay per request)
- **Backup Strategy:** Point-in-time recovery enabled
- **Encryption:** Server-side encryption (SSE) with AWS managed keys

---

## Technology Stack

### Frontend
- **Framework:** SolidJS
- **Build Tool:** Vite
- **Hosting:** (TBD - S3 + CloudFront or Amplify)
- **Auth:** JWT tokens stored in localStorage

### Backend
- **Compute:** AWS Lambda (Node.js 18.x)
- **API Gateway:** HTTP API
- **Database:** DynamoDB
- **Authentication:** Custom JWT + Lambda Authorizer
- **External API:** Questrade OAuth API

### DevOps
- **IaC:** AWS SAM or AWS CDK (to be decided)
- **CI/CD:** (TBD - GitHub Actions or AWS CodePipeline)
- **Monitoring:** CloudWatch Logs + Metrics
- **Secrets:** AWS Systems Manager Parameter Store

---

## Design Principles

### 1. Serverless-First
- No servers to manage
- Auto-scaling built-in
- Pay only for what you use
- High availability by default

### 2. Microservices Architecture
- Each Lambda handles specific domain
- Independent deployment and scaling
- Clear separation of concerns
- Fault isolation

### 3. Security Best Practices
- JWT token authentication
- Authorizer caching (5 minutes)
- Encrypted data at rest
- HTTPS only
- Rate limiting enabled
- Input validation on all endpoints

### 4. Cost Optimization
- Right-sized Lambda memory allocation
- DynamoDB on-demand pricing (scales with usage)
- Authorizer caching reduces Lambda invocations
- HTTP API (71% cheaper than REST API)
- Efficient DynamoDB query patterns

### 5. Performance Optimization
- Lambda warm container reuse
- DynamoDB single-digit millisecond latency
- Strategic GSI (Global Secondary Index) placement
- Minimal cold starts (grouped related endpoints)
- Response caching where appropriate

---

## Scalability Strategy

### Automatic Scaling
- **Lambda:** Auto-scales to 1,000 concurrent executions (can increase)
- **API Gateway:** Handles 10,000 req/sec burst, scales automatically
- **DynamoDB:** On-demand scales automatically with traffic

### Traffic Patterns
- **Read-Heavy:** 70% of traffic → Optimized with 512MB Lambda
- **Analytics:** 20% of traffic → Higher memory (2048MB) for complex calculations
- **Sync/Write:** 10% of traffic → Longer timeout (60s) for external API calls

### Growth Strategy
1. **Phase 1 (Current):** On-demand pricing, monitor usage
2. **Phase 2 (Predictable traffic):** Switch to provisioned capacity
3. **Phase 3 (High traffic):** Add ElastiCache for frequent queries
4. **Phase 4 (Scale):** Consider Aurora Serverless for complex queries

---

## Data Flow Examples

### Login Flow
```
User → Frontend → API Gateway → JWT Authorizer (skip for /login)
→ Auth Lambda → DynamoDB (Users table)
→ Generate JWT → Return to Frontend
```

### Portfolio Data Fetch
```
User → Frontend (with JWT) → API Gateway → JWT Authorizer (validate)
→ Portfolio Analytics Lambda → DynamoDB (Positions + Accounts)
→ Calculate metrics → Return JSON
```

### Sync from Questrade
```
User triggers sync → API Gateway → JWT Authorizer
→ Sync Operations Lambda → Questrade API (external)
→ Process data → DynamoDB (Accounts, Positions, Activities)
→ Return sync status
```

---

## Cost Projections

### Monthly Estimates (100K requests/month)
- **Lambda:** $8.70
- **API Gateway:** $0.10
- **DynamoDB:** $5.31
- **CloudWatch:** $2.00
- **Data Transfer:** $1.00
- **Total:** ~$17.11/month

### Free Tier Benefits (First 12 months)
- Lambda: 1M requests/month free
- API Gateway: 1M requests/month free
- DynamoDB: 25GB storage + 25 WCU/RCU free forever
- **Estimated Cost with Free Tier:** $0-5/month

### Scaling Costs (1M requests/month)
- **Lambda:** ~$30
- **API Gateway:** ~$1
- **DynamoDB:** ~$25
- **Total:** ~$60/month

---

## Migration Strategy

### Phase 1: Infrastructure Setup
1. Create DynamoDB tables
2. Deploy Lambda functions
3. Configure API Gateway
4. Setup Lambda Authorizer

### Phase 2: Data Migration
1. Export MongoDB collections
2. Transform data to DynamoDB format
3. Import to DynamoDB
4. Validate data integrity

### Phase 3: Frontend Updates
1. Update API base URLs
2. Test all endpoints
3. Update authentication flow
4. Deploy to production

### Phase 4: Cutover
1. Run parallel (MongoDB + DynamoDB) for 1 week
2. Monitor for issues
3. Complete cutover
4. Decommission MongoDB

---

## Monitoring & Observability

### CloudWatch Metrics
- Lambda invocation count
- Lambda duration
- Lambda errors
- API Gateway 4xx/5xx errors
- DynamoDB throttled requests

### Alarms
- Lambda error rate > 5%
- API Gateway latency > 2 seconds
- DynamoDB throttling events
- Lambda concurrent executions > 800

### Logs
- Structured JSON logging
- Request/response logging
- Error stack traces
- Performance metrics

---

## Security Considerations

### Authentication & Authorization
- JWT tokens with 24-hour expiration
- Token refresh mechanism
- User role-based access (admin/user)
- Account lockout after 5 failed attempts

### Data Protection
- DynamoDB encryption at rest
- HTTPS/TLS 1.2+ for data in transit
- Secrets in Parameter Store (encrypted)
- No sensitive data in logs

### API Security
- Rate limiting (500 req/15min per IP)
- Input validation and sanitization
- CORS configured for frontend only
- API Gateway throttling

### Compliance
- GDPR considerations (data deletion)
- Audit logging for sensitive operations
- User consent for data collection
- Data retention policies

---

## Disaster Recovery

### Backup Strategy
- DynamoDB point-in-time recovery (35 days)
- Lambda code in version control (Git)
- Infrastructure as Code (SAM/CDK)
- Environment configuration in Parameter Store

### Recovery Objectives
- **RTO (Recovery Time Objective):** 1 hour
- **RPO (Recovery Point Objective):** 5 minutes

### High Availability
- Multi-AZ deployment (automatic with Lambda + DynamoDB)
- No single point of failure
- Automatic failover
- 99.9% SLA target

---

## Future Enhancements

### Short Term (3-6 months)
- Add CloudFront CDN for API caching
- Implement X-Ray tracing
- Add comprehensive API tests
- Setup CI/CD pipeline

### Medium Term (6-12 months)
- Add ElastiCache for frequent queries
- Implement GraphQL API (AppSync)
- Add real-time updates (WebSockets via API Gateway)
- Multi-region deployment

### Long Term (12+ months)
- Machine learning for portfolio recommendations
- Advanced analytics with Athena
- Mobile app support
- Third-party integrations

---

## References
- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)
- [API Gateway HTTP API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api.html)
- [Serverless Architecture Patterns](https://serverlessland.com/patterns)
