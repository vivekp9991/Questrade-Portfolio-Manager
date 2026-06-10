# AWS Migration Master Checklist

**Project:** Questrade Portfolio Manager - AWS Migration
**Timeline:** 4 weeks
**Status:** Planning Complete

---

## **Overview**

This master checklist tracks the complete migration from MongoDB + OCI to AWS Serverless Architecture.

### **Total Phases:** 6
### **Estimated Duration:** 4 weeks
### **Target:** Fully operational AWS deployment with complete testing

---

## **Phase Progress**

| Phase | Name | Duration | Status |
|-------|------|----------|--------|
| 1 | [AWS Setup & Prerequisites](#phase-1-aws-setup--prerequisites) | 1-2 days | ⏳ Pending |
| 2 | [SAM Template Creation](#phase-2-sam-template-creation) | 2-3 days | ⏳ Pending |
| 3 | [Initial SAM Deployment](#phase-3-initial-sam-deployment) | 1 day | ⏳ Pending |
| 4 | [Data Migration](#phase-4-data-migration) | 2-3 days | ⏳ Pending |
| 5 | [API Testing (Postman)](#phase-5-api-testing-postman) | 2-3 days | ⏳ Pending |
| 6 | [Frontend Integration](#phase-6-frontend-integration) | 2-3 days | ⏳ Pending |

**Legend:**
- ⏳ Pending
- 🟡 In Progress
- ✅ Complete
- ❌ Blocked

---

## **Phase 1: AWS Setup & Prerequisites**

**Duration:** 1-2 days
**Status:** ⏳ Pending
**Dependencies:** None

### **High-Level Tasks:**
- [ ] Create AWS account
- [ ] Set up IAM user
- [ ] Install AWS CLI
- [ ] Install SAM CLI
- [ ] Configure credentials
- [ ] Set up billing alerts
- [ ] Install development tools (Node.js, Git, Postman)

**Detailed Checklist:** → [Phase-1-AWS-Setup-and-Prerequisites.md](Phase-1-AWS-Setup-and-Prerequisites.md)

**Completion Criteria:**
- ✅ All tools installed and verified
- ✅ AWS credentials configured
- ✅ Budget alerts active

**Estimated Time:** 1-2 hours

---

## **Phase 2: SAM Template Creation**

**Duration:** 2-3 days
**Status:** ⏳ Pending
**Dependencies:** Phase 1 complete

### **High-Level Tasks:**
- [ ] Create project structure
- [ ] Create template.yaml (all infrastructure)
- [ ] Create 7 Lambda functions with code
- [ ] Define 10 DynamoDB tables
- [ ] Create deployment scripts
- [ ] Validate SAM template

**Detailed Checklist:** → [Phase-2-SAM-Template-Creation.md](Phase-2-SAM-Template-Creation.md)

**Completion Criteria:**
- ✅ template.yaml created and validated
- ✅ All Lambda function code written
- ✅ `sam validate` passes

**Estimated Time:** 2-3 days (including coding)

---

## **Phase 3: Initial SAM Deployment**

**Duration:** 1 day
**Status:** ⏳ Pending
**Dependencies:** Phase 2 complete

### **High-Level Tasks:**
- [ ] Run sam build
- [ ] Run sam deploy --guided
- [ ] Verify all resources created in AWS
- [ ] Test basic connectivity
- [ ] Configure Parameter Store secrets
- [ ] Document deployment

**Detailed Checklist:** → [Phase-3-Initial-SAM-Deployment.md](Phase-3-Initial-SAM-Deployment.md)

**Completion Criteria:**
- ✅ All resources deployed to AWS
- ✅ API Gateway endpoint obtained
- ✅ samconfig.toml created

**Estimated Time:** 2-4 hours

---

## **Phase 4: Data Migration**

**Duration:** 2-3 days
**Status:** ⏳ Pending
**Dependencies:** Phase 3 complete, MongoDB access

### **High-Level Tasks:**
- [ ] Export data from MongoDB
- [ ] Transform data for DynamoDB
- [ ] Import data to DynamoDB
- [ ] Validate data integrity
- [ ] Create test user/data
- [ ] Document migration

**Detailed Checklist:** → [Phase-4-Data-Migration.md](Phase-4-Data-Migration.md)

**Completion Criteria:**
- ✅ All data migrated successfully
- ✅ Record counts match
- ✅ Data integrity verified

**Estimated Time:** 4-8 hours (depending on data volume)

---

## **Phase 5: API Testing (Postman)**

**Duration:** 2-3 days
**Status:** ⏳ Pending
**Dependencies:** Phase 4 complete

### **High-Level Tasks:**
- [ ] Set up Postman workspace
- [ ] Create complete API collection (120+ endpoints)
- [ ] Test authentication endpoints
- [ ] Test all CRUD operations
- [ ] Test all read endpoints
- [ ] Create test scripts
- [ ] Run complete collection
- [ ] Create test report

**Detailed Checklist:** → [Phase-5-API-Testing-Postman.md](Phase-5-API-Testing-Postman.md)

**Completion Criteria:**
- ✅ All endpoints tested
- ✅ 95%+ pass rate
- ✅ Test collection exported

**Estimated Time:** 8-12 hours

---

## **Phase 6: Frontend Integration**

**Duration:** 2-3 days
**Status:** ⏳ Pending
**Dependencies:** Phase 5 complete

### **High-Level Tasks:**
- [ ] Update frontend API configuration
- [ ] Update authentication service
- [ ] Update all API service files
- [ ] Handle CORS issues
- [ ] Test all frontend features
- [ ] Build for production
- [ ] Deploy frontend (optional)
- [ ] End-to-end testing

**Detailed Checklist:** → [Phase-6-Frontend-Integration.md](Phase-6-Frontend-Integration.md)

**Completion Criteria:**
- ✅ Frontend using AWS API
- ✅ All features working
- ✅ Production build successful

**Estimated Time:** 8-12 hours

---

## **Critical Path**

The following tasks are on the critical path (must be completed sequentially):

1. **AWS Account Setup** (Phase 1) - Cannot proceed without this
2. **SAM Template Creation** (Phase 2) - Blocks deployment
3. **Initial Deployment** (Phase 3) - Blocks testing
4. **Data Migration** (Phase 4) - Blocks meaningful testing
5. **API Testing** (Phase 5) - Validates backend
6. **Frontend Integration** (Phase 6) - Final step

**Total Critical Path Duration:** ~15-20 days

---

## **Parallel Tasks**

These tasks can be done in parallel to save time:

**While coding Lambda functions (Phase 2):**
- Document API endpoints
- Prepare MongoDB export scripts
- Set up Postman workspace

**While data is migrating (Phase 4):**
- Create Postman collection structure
- Write frontend integration code
- Review and optimize code

---

## **Dependencies**

### **External Dependencies:**
- [ ] AWS account approval (usually instant)
- [ ] MongoDB access (for data export)
- [ ] Questrade API credentials (for sync features - optional)

### **Internal Dependencies:**
- [ ] All phases must complete in order
- [ ] Each phase builds on previous

---

## **Resources Required**

### **People:**
- 1 Developer (full-time for 4 weeks)

### **Tools:**
- AWS account (free tier eligible)
- Node.js 18+
- AWS CLI
- SAM CLI
- Git
- Postman
- Code editor (VS Code, etc.)

### **Budget:**
- AWS costs: $0-5/month (with free tier)
- Domain (optional): $10-15/year
- Total: ~$5-20/month

---

## **Risk Assessment**

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| AWS account creation issues | Low | High | Apply early, have backup payment method |
| Data migration errors | Medium | High | Create MongoDB backup, test with small dataset first |
| CORS issues | Medium | Medium | Test early, have CORS config ready |
| Lambda cold starts | Medium | Low | Use provisioned concurrency if needed |
| Cost overrun | Low | Medium | Set up billing alerts, monitor daily |
| Questrade API integration issues | High | Low | Start without Questrade, add later |

---

## **Success Metrics**

### **Technical:**
- [ ] All 7 Lambda functions deployed
- [ ] All 10 DynamoDB tables created
- [ ] 120 API endpoints functional
- [ ] 95%+ test pass rate
- [ ] < 2 second average response time
- [ ] Frontend fully integrated

### **Business:**
- [ ] No data loss during migration
- [ ] Zero downtime for users
- [ ] Monthly costs < $20
- [ ] Can handle 100K requests/month

### **Quality:**
- [ ] All endpoints documented
- [ ] Complete test coverage
- [ ] Error handling implemented
- [ ] Security best practices followed

---

## **Weekly Milestones**

### **Week 1: Setup & Development**
- ✅ AWS account and tools set up
- ✅ SAM template and Lambda functions created
- ✅ Initial deployment successful

### **Week 2: Data & Testing**
- ✅ Data migrated from MongoDB
- ✅ All APIs tested with Postman
- ✅ 95%+ tests passing

### **Week 3: Integration**
- ✅ Frontend integrated with AWS API
- ✅ End-to-end testing complete
- ✅ Production build ready

### **Week 4: Buffer & Optimization**
- ✅ Performance optimization
- ✅ Documentation complete
- ✅ Production deployment
- ✅ MongoDB decommissioned

---

## **Daily Tracking**

Use this section to track daily progress:

### **Week 1**

**Day 1 (Mon):**
- [ ] Phase 1: AWS Setup
- [ ] Start Phase 2: Create project structure

**Day 2 (Tue):**
- [ ] Phase 2: Create SAM template
- [ ] Phase 2: Create JWT Authorizer

**Day 3 (Wed):**
- [ ] Phase 2: Create Auth Service Lambda
- [ ] Phase 2: Create Sync Operations Lambda

**Day 4 (Thu):**
- [ ] Phase 2: Create remaining Lambdas
- [ ] Phase 2: Validate template

**Day 5 (Fri):**
- [ ] Phase 3: Initial deployment
- [ ] Phase 3: Verify all resources

### **Week 2**

**Day 1 (Mon):**
- [ ] Phase 4: Export MongoDB data
- [ ] Phase 4: Transform data

**Day 2 (Tue):**
- [ ] Phase 4: Import to DynamoDB
- [ ] Phase 4: Validate migration

**Day 3 (Wed):**
- [ ] Phase 5: Set up Postman
- [ ] Phase 5: Test auth endpoints

**Day 4 (Thu):**
- [ ] Phase 5: Test all CRUD endpoints

**Day 5 (Fri):**
- [ ] Phase 5: Test all read endpoints
- [ ] Phase 5: Create test report

### **Week 3**

**Day 1 (Mon):**
- [ ] Phase 6: Update frontend config
- [ ] Phase 6: Update auth service

**Day 2 (Tue):**
- [ ] Phase 6: Update all API services

**Day 3 (Wed):**
- [ ] Phase 6: Test all features

**Day 4 (Thu):**
- [ ] Phase 6: Production build
- [ ] Phase 6: Deploy frontend

**Day 5 (Fri):**
- [ ] Phase 6: End-to-end testing
- [ ] Week 3 review

### **Week 4 (Buffer)**

**Day 1-3:**
- [ ] Performance optimization
- [ ] Fix any outstanding issues
- [ ] Complete documentation

**Day 4-5:**
- [ ] Final testing
- [ ] Production cutover
- [ ] Celebrate! 🎉

---

## **Communication Plan**

### **Daily:**
- Update this checklist
- Log any issues
- Track time spent

### **Weekly:**
- Review progress vs. plan
- Adjust timeline if needed
- Document lessons learned

### **End of Project:**
- Create final report
- Document architecture
- Hand over to operations

---

## **Rollback Plan**

If something goes wrong:

1. **During Development (Phases 1-3):**
   - Delete CloudFormation stack
   - Start over from last good point
   - No data loss risk

2. **During Data Migration (Phase 4):**
   - Stop import
   - Restore from MongoDB backup
   - Fix issues and retry

3. **During Testing (Phase 5-6):**
   - Continue using MongoDB
   - Fix AWS issues
   - Retry when ready

4. **Post-Launch:**
   - Revert frontend to old API
   - Keep MongoDB running
   - Fix AWS issues
   - Retry cutover

**Maximum Rollback Time:** 10 minutes

---

## **Documentation**

### **Created:**
- ✅ [Architecture Overview](../docs/01-Architecture-Overview.md)
- ✅ [DynamoDB Schema Design](../docs/02-DynamoDB-Schema-Design.md)
- ✅ [Lambda Functions Specification](../docs/03-Lambda-Functions-Specification.md)
- ✅ [API Gateway Configuration](../docs/04-API-Gateway-Configuration.md)
- ✅ [Migration Guide](../docs/05-Migration-Guide.md)
- ✅ [Cost Analysis](../docs/06-Cost-Analysis-and-Optimization.md)
- ✅ [SAM Deployment Guide](../docs/07-SAM-Deployment-Guide.md)

### **To Be Created:**
- [ ] Test Report (Phase 5)
- [ ] Migration Report (Phase 4)
- [ ] Frontend Integration Guide (Phase 6)
- [ ] Runbook for operations
- [ ] Incident response plan

---

## **Sign-Off**

### **Phase Completion Sign-Off:**

**Phase 1:**
- Completed By: ____________
- Date: ____________
- Sign-Off: ____________

**Phase 2:**
- Completed By: ____________
- Date: ____________
- Sign-Off: ____________

**Phase 3:**
- Completed By: ____________
- Date: ____________
- Sign-Off: ____________

**Phase 4:**
- Completed By: ____________
- Date: ____________
- Sign-Off: ____________

**Phase 5:**
- Completed By: ____________
- Date: ____________
- Sign-Off: ____________

**Phase 6:**
- Completed By: ____________
- Date: ____________
- Sign-Off: ____________

### **Project Completion:**
- All Phases Complete: ____________
- Production Deployment: ____________
- MongoDB Decommissioned: ____________
- Project Closed: ____________

---

## **Quick Links**

### **Phase Checklists:**
- [Phase 1: AWS Setup](Phase-1-AWS-Setup-and-Prerequisites.md)
- [Phase 2: SAM Template](Phase-2-SAM-Template-Creation.md)
- [Phase 3: Initial Deployment](Phase-3-Initial-SAM-Deployment.md)
- [Phase 4: Data Migration](Phase-4-Data-Migration.md)
- [Phase 5: API Testing](Phase-5-API-Testing-Postman.md)
- [Phase 6: Frontend Integration](Phase-6-Frontend-Integration.md)

### **Documentation:**
- [Architecture Overview](../docs/01-Architecture-Overview.md)
- [DynamoDB Schema](../docs/02-DynamoDB-Schema-Design.md)
- [Lambda Functions](../docs/03-Lambda-Functions-Specification.md)
- [API Gateway](../docs/04-API-Gateway-Configuration.md)
- [Migration Guide](../docs/05-Migration-Guide.md)
- [Cost Analysis](../docs/06-Cost-Analysis-and-Optimization.md)
- [SAM Deployment](../docs/07-SAM-Deployment-Guide.md)

### **AWS Resources:**
- [AWS Console](https://console.aws.amazon.com)
- [CloudFormation Stacks](https://console.aws.amazon.com/cloudformation)
- [Lambda Functions](https://console.aws.amazon.com/lambda)
- [DynamoDB Tables](https://console.aws.amazon.com/dynamodb)
- [API Gateway](https://console.aws.amazon.com/apigateway)
- [Cost Explorer](https://console.aws.amazon.com/cost-management/home#/cost-explorer)

---

## **Notes**

Use this section for general notes, issues, or observations:

```
Date: ____________
Note:





```

---

**Last Updated:** 2025-10-27
**Version:** 1.0
**Status:** Ready to Start
