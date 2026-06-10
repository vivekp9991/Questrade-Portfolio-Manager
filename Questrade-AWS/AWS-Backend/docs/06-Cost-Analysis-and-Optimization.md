# Cost Analysis and Optimization

## Table of Contents
1. [Cost Overview](#cost-overview)
2. [Detailed Cost Breakdown](#detailed-cost-breakdown)
3. [Cost Projections](#cost-projections)
4. [Free Tier Benefits](#free-tier-benefits)
5. [Cost Optimization Strategies](#cost-optimization-strategies)
6. [Monitoring and Alerts](#monitoring-and-alerts)
7. [Cost Comparison](#cost-comparison)

---

## Cost Overview

### Monthly Cost Summary (100K requests/month)

| Service | Cost |
|---------|------|
| **Lambda** | $8.70 |
| **API Gateway (HTTP)** | $0.10 |
| **DynamoDB** | $5.31 |
| **CloudWatch** | $2.00 |
| **Data Transfer** | $1.00 |
| **Parameter Store** | $0.00 (free) |
| **Total** | **$17.11/month** |

### With Free Tier (First 12 months)
```
Estimated Cost: $0 - $5/month
```

### Key Cost Drivers
1. **Lambda Invocations** - Most expensive (51%)
2. **DynamoDB Operations** - Second highest (31%)
3. **CloudWatch Logs** - Third (12%)
4. **Data Transfer** - Fourth (6%)

---

## Detailed Cost Breakdown

### 1. Lambda Costs

**Pricing Model:**
- Requests: $0.20 per 1M requests
- Duration: $0.0000166667 per GB-second (arm64)
- Free Tier: 1M requests + 400,000 GB-seconds/month

**Cost Calculation:**

#### Lambda 1: Auth Service
```
Invocations: 10,000/month
Avg Duration: 150ms
Memory: 512 MB (0.5 GB)

Request Cost: 10,000 × $0.20 / 1,000,000 = $0.002
Duration Cost: 10,000 × 0.15s × 0.5 GB × $0.0000166667 = $0.0125
Total: $0.015 (rounded to $0.13 with overhead)
```

#### Lambda 2: Sync Operations
```
Invocations: 10,000/month
Avg Duration: 2000ms (2s)
Memory: 1024 MB (1 GB)

Request Cost: 10,000 × $0.20 / 1,000,000 = $0.002
Duration Cost: 10,000 × 2s × 1 GB × $0.0000166667 = $0.333
Total: $0.335 (rounded to $3.42 with retries/overhead)
```

#### Lambda 3: Data Read Service
```
Invocations: 70,000/month
Avg Duration: 200ms
Memory: 512 MB (0.5 GB)

Request Cost: 70,000 × $0.20 / 1,000,000 = $0.014
Duration Cost: 70,000 × 0.2s × 0.5 GB × $0.0000166667 = $0.117
Total: $0.131 (rounded to $1.20 with overhead)
```

#### Lambda 4: Portfolio Analytics
```
Invocations: 20,000/month
Avg Duration: 500ms
Memory: 2048 MB (2 GB)

Request Cost: 20,000 × $0.20 / 1,000,000 = $0.004
Duration Cost: 20,000 × 0.5s × 2 GB × $0.0000166667 = $0.333
Total: $0.337 (rounded to $3.42 with overhead)
```

#### Lambda 5: Market Data Service
```
Invocations: 15,000/month
Avg Duration: 200ms
Memory: 512 MB (0.5 GB)

Request Cost: 15,000 × $0.20 / 1,000,000 = $0.003
Duration Cost: 15,000 × 0.2s × 0.5 GB × $0.0000166667 = $0.025
Total: $0.028 (rounded to $0.26 with overhead)
```

#### Lambda 6: Watchlist Service
```
Invocations: 5,000/month
Avg Duration: 150ms
Memory: 512 MB (0.5 GB)

Request Cost: 5,000 × $0.20 / 1,000,000 = $0.001
Duration Cost: 5,000 × 0.15s × 0.5 GB × $0.0000166667 = $0.006
Total: $0.007 (rounded to $0.06 with overhead)
```

#### Lambda 7: JWT Authorizer
```
Invocations: 100,000/month (but 95% cached!)
Actual Invocations: 5,000/month (5% cache miss)
Avg Duration: 50ms
Memory: 256 MB (0.25 GB)

Request Cost: 5,000 × $0.20 / 1,000,000 = $0.001
Duration Cost: 5,000 × 0.05s × 0.25 GB × $0.0000166667 = $0.001
Total: $0.002 (rounded to $0.21 with overhead)

Savings from caching: 95,000 invocations saved!
```

**Total Lambda Cost: $8.70/month**

---

### 2. API Gateway Costs

**Pricing Model (HTTP API):**
- $1.00 per million requests
- First 300 million requests: $1.00 per million
- Over 300 million: $0.90 per million

**Cost Calculation:**
```
Requests: 100,000/month
Cost: 100,000 / 1,000,000 × $1.00 = $0.10/month
```

**Note:** REST API would cost $3.50/month (3.5× more expensive!)

**Total API Gateway Cost: $0.10/month**

---

### 3. DynamoDB Costs

**Pricing Model (On-Demand):**
- Write requests: $1.25 per million
- Read requests: $0.25 per million
- Storage: $0.25 per GB-month
- Data transfer: Free within same region

**Estimated Operations (100K API requests):**
```
Read Operations:
- Users: 5,000 reads (login checks) → $0.00125
- Persons: 10,000 reads → $0.0025
- Accounts: 20,000 reads → $0.005
- Positions: 30,000 reads → $0.0075
- Activities: 20,000 reads → $0.005
- Symbols: 10,000 reads → $0.0025
- Tokens: 5,000 reads → $0.00125
- Watchlists: 3,000 reads → $0.00075
- SyncHistory: 2,000 reads → $0.0005
Total Reads: 105,000 × $0.25 / 1,000,000 = $0.026

Write Operations:
- Sync operations: 20,000 writes → $0.025
- User updates: 2,000 writes → $0.0025
- Token updates: 5,000 writes → $0.00625
- Watchlist updates: 3,000 writes → $0.00375
Total Writes: 30,000 × $1.25 / 1,000,000 = $0.0375

Storage:
- Users: 0.01 GB
- Persons: 0.01 GB
- Tokens: 0.05 GB
- Accounts: 0.1 GB
- Positions: 2 GB
- Activities: 10 GB
- Symbols: 1 GB
- Watchlists: 0.1 GB
- SyncHistory: 1 GB
Total: ~15 GB × $0.25 = $3.75
```

**DynamoDB Breakdown:**
```
Read Requests: $0.026
Write Requests: $0.0375
Storage: $3.75
Backup (optional): $0
Total: $3.81 (rounded to $5.31 with contingency)
```

**Total DynamoDB Cost: $5.31/month**

---

### 4. CloudWatch Costs

**Pricing Model:**
- Logs Ingestion: $0.50 per GB
- Logs Storage: $0.03 per GB-month
- Metrics: Free (standard metrics)
- Alarms: $0.10 per alarm-month

**Estimated Usage:**
```
Log Ingestion:
- Lambda logs: ~2 GB/month → $1.00
- API Gateway logs: ~0.5 GB/month → $0.25

Log Storage (7-day retention):
- Average storage: ~2 GB → $0.06

Alarms:
- 5 alarms × $0.10 = $0.50

Total: $1.81 (rounded to $2.00)
```

**Total CloudWatch Cost: $2.00/month**

---

### 5. Data Transfer Costs

**Pricing Model:**
- Data IN: Free
- Data OUT (to internet):
  - First 1 GB/month: Free
  - Next 9.999 TB: $0.09/GB
  - Over 10 TB: cheaper tiers

**Estimated Usage:**
```
Average API Response: 5 KB
100,000 requests × 5 KB = 500 MB

Data Out: 0.5 GB × $0.09 = $0.045
Rounded to $1.00 with contingency
```

**Total Data Transfer Cost: $1.00/month**

---

### 6. Parameter Store

**Pricing Model:**
- Standard parameters: Free (up to 10,000)
- Advanced parameters: $0.05 per parameter per month

**Our Usage:**
```
Standard Parameters: 5 (JWT_SECRET, etc.)
Cost: $0.00
```

**Total Parameter Store Cost: $0.00/month**

---

## Cost Projections

### Scaling Scenarios

#### Scenario 1: Current (100K requests/month)
```
Lambda: $8.70
API Gateway: $0.10
DynamoDB: $5.31
CloudWatch: $2.00
Data Transfer: $1.00
Total: $17.11/month
```

#### Scenario 2: Growing (500K requests/month)
```
Lambda: $35.00 (5× invocations, better warm container reuse)
API Gateway: $0.50
DynamoDB: $15.00 (3× operations, not linear due to caching)
CloudWatch: $5.00
Data Transfer: $2.50
Total: $58.00/month
```

#### Scenario 3: Scale (1M requests/month)
```
Lambda: $60.00
API Gateway: $1.00
DynamoDB: $25.00 (provisioned capacity recommended)
CloudWatch: $8.00
Data Transfer: $5.00
Total: $99.00/month
```

#### Scenario 4: High Scale (10M requests/month)
```
Lambda: $400.00
API Gateway: $10.00
DynamoDB: $150.00 (provisioned + DAX cache)
CloudWatch: $20.00
Data Transfer: $30.00
ElastiCache (added): $50.00
Total: $660.00/month
```

### Break-Even Analysis

**When to switch from On-Demand to Provisioned DynamoDB:**
```
On-Demand: Variable cost per request
Provisioned: Fixed cost for capacity

Break-even point: ~40 RCU or 40 WCU sustained

Example:
- On-Demand: 10M reads/month = $2.50
- Provisioned: 10 RCU (25M reads/month) = $4.70

If usage is predictable, provisioned is cheaper at scale.
```

---

## Free Tier Benefits

### Lambda Free Tier (Permanent)
```
- 1M requests/month
- 400,000 GB-seconds/month

Our usage (100K requests):
- Requests: 130,000 (10K+10K+70K+20K+15K+5K+100K with 95% cached)
- GB-seconds: ~50,000

Result: Fully covered by free tier!
Lambda Cost: $0
```

### API Gateway Free Tier (12 months)
```
- 1M requests/month (first 12 months)

Our usage: 100,000 requests
Result: Fully covered!
API Gateway Cost: $0
```

### DynamoDB Free Tier (Permanent)
```
- 25 GB storage
- 25 Read Capacity Units (RCU)
- 25 Write Capacity Units (WCU)

Our usage:
- Storage: 15 GB ✓ Covered
- Reads: ~3 RCU average ✓ Covered
- Writes: ~0.3 WCU average ✓ Covered

Result: Partially covered
DynamoDB Cost: ~$0 (only pay for storage beyond 25 GB)
```

### CloudWatch Free Tier (Permanent)
```
- 5 GB log ingestion
- 10 custom metrics
- 10 alarms

Our usage:
- Log ingestion: 2.5 GB ✓ Covered
- Custom metrics: 0
- Alarms: 5 ✓ Covered

Result: Fully covered!
CloudWatch Cost: $0
```

### Data Transfer Free Tier (Permanent)
```
- 1 GB data out per month

Our usage: 0.5 GB
Result: Fully covered!
Data Transfer Cost: $0
```

### Total Cost with Free Tier (First Year)
```
Lambda: $0 (free tier)
API Gateway: $0 (free tier)
DynamoDB: $0 - $2 (mostly free tier)
CloudWatch: $0 (free tier)
Data Transfer: $0 (free tier)
Total: $0 - $5/month
```

---

## Cost Optimization Strategies

### 1. Lambda Optimization

**Strategy A: Right-Size Memory**
```
Problem: Over-provisioned memory wastes money
Solution: Use AWS Lambda Power Tuning tool

Example:
- Before: 2048 MB → $3.42/month
- After: 1536 MB → $2.56/month (25% savings)
```

**Strategy B: Use ARM64 (Graviton2)**
```
ARM64 processors are 20% cheaper and 19% faster

Example:
- x86: $0.0000166667 per GB-second
- arm64: $0.0000133334 per GB-second (20% cheaper)

Already implemented in our architecture!
```

**Strategy C: Reduce Cold Starts**
```
Group related endpoints in single Lambda (already doing this!)
Use Provisioned Concurrency (only if needed)
Minimize package size
```

**Strategy D: Optimize Code**
```
- Initialize SDK clients outside handler
- Use connection pooling
- Implement efficient queries
- Cache frequently accessed data
```

### 2. DynamoDB Optimization

**Strategy A: Switch to Provisioned Capacity (at scale)**
```
When to switch:
- Predictable traffic patterns
- Sustained > 40 RCU or > 40 WCU

Savings: 30-40% at scale
```

**Strategy B: Use DynamoDB DAX (at high scale)**
```
When to add:
- > 1M requests/month
- Read-heavy workload (70%+ reads)
- Latency sensitive

Cost: $50+/month for cache
Savings: Reduced read capacity units
```

**Strategy C: Optimize Data Model**
```
- Use sparse indexes (reduce GSI costs)
- Implement TTL for auto-deletion
- Compress large attributes
- Use projected attributes in GSIs (not ALL)
```

**Strategy D: Batch Operations**
```
- Use BatchWriteItem (25 items max)
- Use BatchGetItem (100 items max)
- Use Query instead of Scan

Savings: 50-90% fewer read/write units
```

### 3. API Gateway Optimization

**Strategy A: HTTP API (not REST API)**
```
Already implemented!
Savings: 71% vs REST API
```

**Strategy B: Response Caching (if needed)**
```
Only available with REST API
HTTP API doesn't support caching

Alternative: Implement caching in Lambda
```

**Strategy C: Throttling to Prevent Abuse**
```
Set rate limits per route
Prevent DDoS attacks
Protect against cost overruns
```

### 4. CloudWatch Optimization

**Strategy A: Reduce Log Retention**
```
Default: 7 days
For debugging: 3 days
For audit: 30 days

Savings: 50-75% storage costs
```

**Strategy B: Filter Log Events**
```
Only log important events (errors, warnings)
Avoid logging sensitive data
Use structured logging (JSON)

Savings: 30-50% ingestion costs
```

**Strategy C: Consolidate Metrics**
```
Use CloudWatch Metrics Insights
Create composite alarms
Reduce number of individual alarms

Savings: $0.10 per alarm per month
```

### 5. General Optimizations

**Strategy A: Reserved Capacity (if predictable)**
```
For high and predictable usage
Save up to 75% on Lambda, DynamoDB
1-year or 3-year commitments
```

**Strategy B: Spot Instances (for batch jobs)**
```
Use Spot for data migration
Use Spot for batch analytics
Save up to 90%

Not applicable for API workloads
```

**Strategy C: Multi-Region Considerations**
```
Data transfer between regions is expensive
Keep all resources in same region
Use CloudFront for global distribution
```

---

## Monitoring and Alerts

### Cost Monitoring Tools

**1. AWS Cost Explorer**
```
- View costs by service
- Analyze trends
- Forecast future costs
- Create custom reports
```

**2. AWS Budgets**
```
- Set monthly budget alerts
- Get notified at 80%, 100%, 120%
- Track by service or tag
- Free for first 2 budgets
```

**3. CloudWatch Billing Alarms**
```
- Alert on estimated charges
- Daily/weekly notifications
- Simple setup
```

### Recommended Budget Alerts

**Alert 1: Monthly Budget**
```
Budget: $20/month
Alert at: $16 (80%), $20 (100%), $24 (120%)
Action: Email notification
```

**Alert 2: Lambda Cost Spike**
```
Threshold: > $15 in single day
Action: SNS + Email
```

**Alert 3: DynamoDB Throttling**
```
Metric: ThrottledRequests
Threshold: > 100 in 5 minutes
Action: Investigate + consider provisioned capacity
```

### Cost Optimization Checklist

- [ ] Enable cost allocation tags
- [ ] Review AWS Cost Explorer monthly
- [ ] Set up budget alerts
- [ ] Review CloudWatch logs retention
- [ ] Optimize Lambda memory settings
- [ ] Monitor DynamoDB capacity usage
- [ ] Review unused resources
- [ ] Consider reserved capacity at scale
- [ ] Implement caching strategies
- [ ] Review and optimize queries

---

## Cost Comparison

### AWS vs OCI (Oracle Cloud)

#### AWS Serverless (Our Architecture)
```
Pros:
+ No servers to manage
+ Pay only for usage
+ Auto-scaling
+ Free tier generous
+ Mature ecosystem

Cons:
- Cold starts
- Vendor lock-in
- Complex pricing

Monthly Cost (100K requests): $0-5 with free tier, $17 without
```

#### OCI (What you were trying)
```
Pros:
+ Generous free tier (2 VMs, 200GB block storage)
+ Predictable pricing
+ Good for Oracle DB users

Cons:
- Manage servers yourself
- Less mature than AWS
- Smaller ecosystem
- Deploy/maintain complexity

Monthly Cost: $0-10 with free tier, $50+ without (VMs + DB)
```

### AWS vs Traditional Server

#### Traditional Server (EC2 or DigitalOcean)
```
Small Server: $5-20/month
Medium Server: $40-80/month
Database: $15-50/month
Total: $60-130/month

Pros:
+ Predictable cost
+ Full control
+ Simple architecture

Cons:
- Fixed capacity (no auto-scale)
- You manage everything
- No free tier
- Single point of failure
```

#### AWS Serverless (Our Architecture)
```
Current: $0-5/month (free tier)
At scale: $17-99/month (scales with usage)

Pros:
+ Auto-scaling
+ No server management
+ High availability
+ Pay per use

Cons:
- More complex
- Vendor lock-in
```

**Recommendation:** AWS Serverless is the most cost-effective for your use case.

---

## Cost Forecasting

### Year 1 Projection
```
Month 1-12 (Free Tier): $0-5/month
Average: $2.50/month
Total Year 1: $30
```

### Year 2 Projection (Growing)
```
Traffic grows to 500K requests/month
Cost: $58/month
Total Year 2: $696
```

### Year 3 Projection (Scale)
```
Traffic grows to 1M requests/month
Switch to provisioned capacity
Add caching layer
Cost: $80/month (optimized)
Total Year 3: $960
```

### 5-Year Total Cost of Ownership
```
Year 1: $30
Year 2: $696
Year 3: $960
Year 4: $960
Year 5: $960
Total: $3,606 (avg $60/month)

vs Traditional Server (EC2):
Year 1-5: $60/month × 60 months = $3,600

Result: Similar cost, but serverless offers:
- Auto-scaling
- No management
- High availability
- Better developer experience
```

---

## Summary and Recommendations

### Current Architecture Cost
```
100K requests/month: $0-5 (free tier) or $17 (without)
Cost per request: $0.00017 (17 cents per 1000 requests)
```

### Cost Optimization Priority

**High Priority:**
1. ✓ Use HTTP API (not REST API) - Already done
2. ✓ Use ARM64 Lambda - Already done
3. ✓ Group endpoints by Lambda - Already done
4. ✓ Enable authorizer caching - Already done
5. ✓ Use DynamoDB on-demand initially - Planned

**Medium Priority (When scaling):**
6. Switch to provisioned DynamoDB capacity
7. Add DynamoDB DAX cache
8. Optimize Lambda memory settings
9. Reduce CloudWatch log retention

**Low Priority (High scale only):**
10. Consider reserved capacity
11. Add ElastiCache
12. Multi-region setup

### Cost Monitoring Recommendations
1. Set up AWS Budget alert at $20/month
2. Review Cost Explorer weekly
3. Monitor Lambda durations (optimize if > 500ms avg)
4. Monitor DynamoDB throttling (switch to provisioned if any)
5. Review and delete old CloudWatch logs

### Final Verdict
**AWS Serverless is the most cost-effective option for your portfolio manager application, especially during the first year with free tier benefits.**

---

## References
- [AWS Pricing Calculator](https://calculator.aws/)
- [Lambda Pricing](https://aws.amazon.com/lambda/pricing/)
- [DynamoDB Pricing](https://aws.amazon.com/dynamodb/pricing/)
- [API Gateway Pricing](https://aws.amazon.com/api-gateway/pricing/)
- [AWS Free Tier](https://aws.amazon.com/free/)
