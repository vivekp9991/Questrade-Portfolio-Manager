# AWS Backend Documentation

Complete documentation for migrating Questrade Portfolio Manager from MongoDB + OCI to AWS Serverless Architecture.

---

## Table of Contents

### 01. [Architecture Overview](./01-Architecture-Overview.md)
**What's inside:**
- High-level architecture design
- Service components (API Gateway, Lambda, DynamoDB)
- Technology stack
- Design principles and scalability strategy
- Security considerations
- Disaster recovery plan

**Read this first to understand the overall system design.**

---

### 02. [DynamoDB Schema Design](./02-DynamoDB-Schema-Design.md)
**What's inside:**
- Complete table designs (10 tables)
- Primary keys and sort keys
- Global Secondary Indexes (GSIs)
- Access patterns and query optimization
- Data migration mapping from MongoDB
- Capacity planning and best practices

**Critical for understanding data model and migration strategy.**

---

### 03. [Lambda Functions Specification](./03-Lambda-Functions-Specification.md)
**What's inside:**
- All 7 Lambda functions detailed specs
- Runtime configuration (memory, timeout, architecture)
- Environment variables
- Dependencies and packages
- IAM permissions
- Shared components and utilities
- Monitoring and testing strategies

**Essential for implementation and deployment.**

---

### 04. [API Gateway Configuration](./04-API-Gateway-Configuration.md)
**What's inside:**
- HTTP API setup (why not REST API)
- Complete route configuration (120 routes)
- Lambda authorizer setup (JWT-based)
- CORS configuration
- Throttling and rate limiting
- Custom domain setup
- Testing and troubleshooting

**Required for connecting frontend to backend.**

---

### 05. [Migration Guide](./05-Migration-Guide.md)
**What's inside:**
- Step-by-step migration process
- Data export from MongoDB
- Data transformation scripts
- DynamoDB import procedures
- Code migration examples
- Testing strategy
- Cutover plan and rollback procedures

**Follow this guide for actual migration execution.**

---

### 06. [Cost Analysis and Optimization](./06-Cost-Analysis-and-Optimization.md)
**What's inside:**
- Detailed cost breakdown by service
- Cost projections at different scales
- Free tier benefits (first year: $0-5/month!)
- Cost optimization strategies
- Monitoring and budget alerts
- AWS vs OCI vs Traditional Server comparison

**Read this to understand and optimize your AWS spending.**

---

## Quick Start Guide

### For Planning
1. Read [Architecture Overview](./01-Architecture-Overview.md)
2. Review [Cost Analysis](./06-Cost-Analysis-and-Optimization.md)
3. Understand [DynamoDB Schema](./02-DynamoDB-Schema-Design.md)

### For Implementation
1. Follow [Lambda Functions Spec](./03-Lambda-Functions-Specification.md)
2. Setup [API Gateway](./04-API-Gateway-Configuration.md)
3. Deploy infrastructure

### For Migration
1. Follow [Migration Guide](./05-Migration-Guide.md) step-by-step
2. Test thoroughly
3. Execute cutover

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (SolidJS)                      │
│                   https://yourdomain.com                    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ HTTPS
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              API Gateway (HTTP API)                         │
│         https://api-id.execute-api.region.com/prod          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ Authorization
                         ▼
                ┌────────────────────┐
                │  JWT Authorizer    │
                │  (Lambda)          │
                └────────┬───────────┘
                         │
         ┌───────────────┴───────────────┐
         │         Allow/Deny            │
         └───────────────┬───────────────┘
                         │
    ┌────────────────────┴────────────────────┐
    │         Lambda Functions (6)            │
    ├─────────────────────────────────────────┤
    │ 1. Auth Service (login, users, tokens)  │
    │ 2. Sync Operations (Questrade sync)     │
    │ 3. Data Read (accounts, positions, etc) │
    │ 4. Portfolio Analytics (complex calcs)  │
    │ 5. Market Data (quotes, symbols)        │
    │ 6. Watchlist Service (user watchlists)  │
    └────────────────────┬────────────────────┘
                         │
                         ▼
         ┌───────────────────────────┐
         │   DynamoDB (10 Tables)    │
         ├───────────────────────────┤
         │ • Users                   │
         │ • Persons                 │
         │ • Tokens                  │
         │ • Accounts                │
         │ • Positions               │
         │ • Activities              │
         │ • Symbols                 │
         │ • Watchlists              │
         │ • WatchlistSymbols        │
         │ • SyncHistory             │
         └───────────────────────────┘
```

---

## Key Metrics

### Infrastructure
- **Lambda Functions:** 7 (6 business + 1 authorizer)
- **API Endpoints:** 120
- **DynamoDB Tables:** 10
- **Global Secondary Indexes:** 14

### Performance
- **API Latency:** < 200ms (p95)
- **Lambda Cold Start:** < 1 second
- **DynamoDB Latency:** < 10ms (p99)

### Cost (100K requests/month)
- **With Free Tier (Year 1):** $0-5/month
- **Without Free Tier:** $17/month
- **At Scale (1M requests):** $99/month

### Scalability
- **Lambda Concurrency:** 1,000 (default, can increase)
- **API Gateway:** 10,000 req/sec burst
- **DynamoDB:** Auto-scales with on-demand

---

## Technology Stack

### Frontend
- **Framework:** SolidJS
- **Build:** Vite
- **Auth:** JWT tokens (localStorage)

### Backend
- **Compute:** AWS Lambda (Node.js 18.x, arm64)
- **API:** API Gateway HTTP API
- **Database:** DynamoDB (on-demand)
- **Auth:** Lambda Authorizer (JWT)

### DevOps
- **IaC:** AWS SAM or CDK (TBD)
- **Monitoring:** CloudWatch
- **Secrets:** Parameter Store
- **Logging:** CloudWatch Logs

### External
- **Questrade API:** OAuth + REST API

---

## Project Structure

```
AWS-Backend/
├── docs/
│   ├── 00-README.md (this file)
│   ├── 01-Architecture-Overview.md
│   ├── 02-DynamoDB-Schema-Design.md
│   ├── 03-Lambda-Functions-Specification.md
│   ├── 04-API-Gateway-Configuration.md
│   ├── 05-Migration-Guide.md
│   └── 06-Cost-Analysis-and-Optimization.md
│
├── lambda-functions/ (to be created)
│   ├── auth-service/
│   ├── sync-operations/
│   ├── data-read-service/
│   ├── portfolio-analytics/
│   ├── market-data-service/
│   ├── watchlist-service/
│   └── jwt-authorizer/
│
├── infrastructure/ (to be created)
│   ├── sam-template.yaml
│   └── or cloudformation/cdk files
│
├── scripts/ (to be created)
│   ├── export-mongodb.js
│   ├── transform-data.js
│   ├── import-dynamodb.js
│   └── validate-data.js
│
└── tests/ (to be created)
    ├── unit/
    ├── integration/
    └── load/
```

---

## Migration Timeline

### Week 1: Infrastructure Setup
- [ ] Create AWS account and setup IAM
- [ ] Create DynamoDB tables (10 tables)
- [ ] Deploy Lambda functions (skeleton)
- [ ] Configure API Gateway
- [ ] Setup monitoring and alarms

### Week 2: Data Migration
- [ ] Export MongoDB collections
- [ ] Transform data format
- [ ] Import to DynamoDB
- [ ] Validate data integrity
- [ ] Test queries

### Week 3: Implementation & Testing
- [ ] Implement Lambda functions
- [ ] Test all endpoints
- [ ] Performance testing
- [ ] Security testing
- [ ] Load testing

### Week 4: Cutover & Go-Live
- [ ] Final data sync
- [ ] Update frontend API URLs
- [ ] Deploy to production
- [ ] Monitor for 48 hours
- [ ] Decommission MongoDB

---

## Prerequisites

### AWS Account
- AWS account with billing enabled
- IAM user with admin permissions
- AWS CLI installed and configured

### Development Tools
- Node.js 18.x
- AWS SAM CLI (optional)
- Git
- Postman (for testing)

### Knowledge Requirements
- Basic AWS knowledge
- Node.js/JavaScript
- REST API concepts
- DynamoDB concepts
- CI/CD basics

---

## Decision Log

### Why AWS Serverless?
- No server management
- Auto-scaling
- Pay per use (cost-effective for low traffic)
- High availability built-in
- Mature ecosystem

### Why HTTP API (not REST API)?
- 71% cheaper
- Lower latency
- Supports JWT authorizer
- Sufficient features for our needs

### Why DynamoDB (not RDS)?
- Serverless (no server management)
- Auto-scaling
- Single-digit millisecond latency
- Better fit for key-value access patterns
- Cheaper at low volume

### Why Multiple Tables (not single-table)?
- Easier to understand
- Simpler queries
- Better for team collaboration
- Can always migrate to single-table later

### Why 7 Lambdas (not 1 or 120)?
- Balance between granularity and management
- Grouped by domain (auth, sync, read, analytics, etc.)
- Optimized memory per workload
- Easier debugging and monitoring
- Cost-effective

---

## Important Notes

### Security
- All API routes (except /login and /health) require JWT token
- Tokens expire after 24 hours
- User accounts lock after 5 failed login attempts
- DynamoDB encryption at rest enabled
- HTTPS only

### Performance
- Lambda warm container reuse (group related endpoints)
- Authorizer caching (5 minutes)
- DynamoDB on-demand (auto-scales)
- Strategic GSIs for efficient queries

### Cost
- Free tier covers most usage for first year
- Monitor AWS Cost Explorer monthly
- Set budget alerts at $20/month
- Optimize Lambda memory settings after deployment

### Monitoring
- CloudWatch Logs for debugging
- CloudWatch Metrics for performance
- CloudWatch Alarms for alerts
- Cost Explorer for billing

---

## Support and Resources

### AWS Documentation
- [Lambda Developer Guide](https://docs.aws.amazon.com/lambda/latest/dg/)
- [DynamoDB Developer Guide](https://docs.aws.amazon.com/dynamodb/latest/developerguide/)
- [API Gateway Developer Guide](https://docs.aws.amazon.com/apigateway/latest/developerguide/)

### Community
- [AWS Serverless Forum](https://forums.aws.amazon.com/forum.jspa?forumID=186)
- [Stack Overflow - AWS](https://stackoverflow.com/questions/tagged/amazon-web-services)
- [Reddit - r/aws](https://www.reddit.com/r/aws/)

### Learning Resources
- [AWS Serverless Workshop](https://serverlessland.com/)
- [DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)
- [Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)

---

## Troubleshooting

### Common Issues

**Issue:** Lambda timeout
- **Solution:** Increase timeout, optimize code, check external API calls

**Issue:** DynamoDB throttling
- **Solution:** Switch to provisioned capacity or increase on-demand capacity

**Issue:** CORS errors
- **Solution:** Check API Gateway CORS configuration

**Issue:** 401 Unauthorized
- **Solution:** Check JWT token validity, verify authorizer configuration

**Issue:** High costs
- **Solution:** Review Cost Explorer, optimize Lambda memory, check logs retention

---

## Next Steps

1. **Review all documentation** in order (01 → 06)
2. **Discuss with team** architecture decisions
3. **Set up AWS account** and development environment
4. **Create infrastructure** (DynamoDB tables, Lambda functions)
5. **Migrate data** from MongoDB to DynamoDB
6. **Test thoroughly** before cutover
7. **Execute cutover** during low-traffic window
8. **Monitor closely** for 48 hours post-launch

---

## Questions?

If you have questions about any part of this documentation:

1. Review the specific document (01-06)
2. Check AWS documentation
3. Search Stack Overflow
4. Ask in AWS forums
5. Consult with team

---

## Document Version

- **Version:** 1.0
- **Last Updated:** October 27, 2025
- **Author:** Claude (AI Assistant)
- **Status:** Ready for Implementation

---

**Good luck with your AWS migration! 🚀**
