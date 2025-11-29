# Phase 1: AWS Setup and Prerequisites

**Duration:** 1-2 days
**Goal:** Set up AWS account, install tools, and prepare for deployment

---

## **Checklist**

### **1.1 AWS Account Setup**

- [ ] Create AWS account at https://aws.amazon.com
  - [ ] Enter email address
  - [ ] Choose password
  - [ ] Enter account name: "Questrade Portfolio Manager"
  - [ ] Verify email address

- [ ] Add payment method
  - [ ] Enter credit card information
  - [ ] Verify billing address
  - [ ] Accept AWS customer agreement

- [ ] Complete phone verification
  - [ ] Enter phone number
  - [ ] Receive and enter verification code

- [ ] Choose support plan
  - [ ] Select "Basic Support - Free"

- [ ] Wait for account activation (usually instant, max 24 hours)

**Verification:**
```bash
✅ Can log in to https://console.aws.amazon.com
✅ No "Account Pending" message
```

---

### **1.2 IAM User Creation**

- [ ] Log in to AWS Console with root account

- [ ] Navigate to IAM service
  - [ ] Click "Services" in top menu
  - [ ] Find "Security, Identity, & Compliance" section
  - [ ] Click "IAM"

- [ ] Create new IAM user
  - [ ] Click "Users" in left sidebar
  - [ ] Click "Add users" button
  - [ ] User name: `questrade-deployer`
  - [ ] Select access type: ✓ "Programmatic access"
  - [ ] Click "Next: Permissions"

- [ ] Attach permissions
  - [ ] Select "Attach existing policies directly"
  - [ ] Search and check: `AdministratorAccess`
  - [ ] Click "Next: Tags"

- [ ] Add tags (optional)
  - [ ] Skip or add: Key=`Project`, Value=`Questrade Portfolio`
  - [ ] Click "Next: Review"

- [ ] Review and create
  - [ ] Verify user name: `questrade-deployer`
  - [ ] Verify access type: "Programmatic access"
  - [ ] Verify permissions: "AdministratorAccess"
  - [ ] Click "Create user"

- [ ] Download credentials **IMMEDIATELY**
  - [ ] Click "Download .csv" button
  - [ ] Save to secure location (e.g., password manager)
  - [ ] **IMPORTANT:** You can only download this once!

- [ ] Copy credentials
  ```
  Access Key ID: AKIA__________________
  Secret Access Key: ________________________________________
  ```

**Verification:**
```bash
✅ Have access key ID (starts with AKIA)
✅ Have secret access key (40 characters)
✅ Credentials saved securely
```

---

### **1.3 Install AWS CLI**

#### **Windows:**

- [ ] Download AWS CLI installer
  - [ ] Go to: https://awscli.amazonaws.com/AWSCLIV2.msi
  - [ ] Save installer to Downloads folder

- [ ] Install AWS CLI
  - [ ] Double-click `AWSCLIV2.msi`
  - [ ] Click "Next" through installation wizard
  - [ ] Accept default settings
  - [ ] Click "Install"
  - [ ] Wait for installation to complete
  - [ ] Click "Finish"

- [ ] Verify installation
  - [ ] Open Command Prompt (cmd) or PowerShell
  - [ ] Run: `aws --version`
  - [ ] Should see: `aws-cli/2.x.x Python/3.x.x Windows/...`

#### **Mac:**

- [ ] Install using Homebrew
  ```bash
  brew install awscli
  ```

- [ ] OR download installer
  - [ ] Go to: https://awscli.amazonaws.com/AWSCLIV2.pkg
  - [ ] Download and run installer
  - [ ] Follow installation prompts

- [ ] Verify installation
  ```bash
  aws --version
  # Should see: aws-cli/2.x.x Python/3.x.x Darwin/...
  ```

#### **Linux:**

- [ ] Download and install
  ```bash
  curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
  unzip awscliv2.zip
  sudo ./aws/install
  ```

- [ ] Verify installation
  ```bash
  aws --version
  # Should see: aws-cli/2.x.x Python/3.x.x Linux/...
  ```

**Verification:**
```bash
✅ Command `aws --version` works
✅ Shows version 2.x.x or higher
```

---

### **1.4 Install SAM CLI**

#### **Windows:**

- [ ] Download SAM CLI installer
  - [ ] Go to: https://github.com/aws/aws-sam-cli/releases/latest
  - [ ] Download: `AWS_SAM_CLI_64_PY3.msi`
  - [ ] Save to Downloads folder

- [ ] Install SAM CLI
  - [ ] Double-click `AWS_SAM_CLI_64_PY3.msi`
  - [ ] Click "Next" through installation wizard
  - [ ] Accept license agreement
  - [ ] Accept default installation path
  - [ ] Click "Install"
  - [ ] Click "Finish"

- [ ] Verify installation
  - [ ] Open new Command Prompt (important: new window!)
  - [ ] Run: `sam --version`
  - [ ] Should see: `SAM CLI, version 1.x.x`

#### **Mac:**

- [ ] Install using Homebrew
  ```bash
  brew tap aws/tap
  brew install aws-sam-cli
  ```

- [ ] Verify installation
  ```bash
  sam --version
  # Should see: SAM CLI, version 1.x.x
  ```

#### **Linux:**

- [ ] Download and install
  ```bash
  wget https://github.com/aws/aws-sam-cli/releases/latest/download/aws-sam-cli-linux-x86_64.zip
  unzip aws-sam-cli-linux-x86_64.zip -d sam-installation
  sudo ./sam-installation/install
  ```

- [ ] Verify installation
  ```bash
  sam --version
  # Should see: SAM CLI, version 1.x.x
  ```

**Verification:**
```bash
✅ Command `sam --version` works
✅ Shows version 1.x.x or higher
```

---

### **1.5 Configure AWS Credentials**

- [ ] Run AWS configure command
  ```bash
  aws configure
  ```

- [ ] Enter Access Key ID
  ```
  AWS Access Key ID [None]: (paste your access key ID)
  ```

- [ ] Enter Secret Access Key
  ```
  AWS Secret Access Key [None]: (paste your secret access key)
  ```

- [ ] Enter default region
  ```
  Default region name [None]: us-east-1
  ```

- [ ] Enter default output format
  ```
  Default output format [None]: json
  ```

- [ ] Verify credentials file created
  - **Windows:** `C:\Users\YOUR_USERNAME\.aws\credentials`
  - **Mac/Linux:** `~/.aws/credentials`

- [ ] Test credentials
  ```bash
  aws sts get-caller-identity
  ```
  - [ ] Should return JSON with UserId, Account, and Arn
  - [ ] Should NOT show error

**Verification:**
```bash
✅ `aws sts get-caller-identity` returns account info
✅ Shows correct Account ID
✅ Shows User: questrade-deployer
```

---

### **1.6 Set Up Billing Alerts**

- [ ] Enable billing alerts
  - [ ] AWS Console → Account (top right) → Billing Dashboard
  - [ ] Left sidebar → "Billing preferences"
  - [ ] Check ✓ "Receive Billing Alerts"
  - [ ] Click "Save preferences"

- [ ] Create budget
  - [ ] AWS Console → Billing → Budgets
  - [ ] Click "Create budget"
  - [ ] Choose "Cost budget"
  - [ ] Budget name: `Questrade-Monthly-Budget`
  - [ ] Budgeted amount: `$20.00`
  - [ ] Click "Next"

- [ ] Configure alerts
  - [ ] Alert threshold 1: 80% of budgeted amount
  - [ ] Alert threshold 2: 100% of budgeted amount
  - [ ] Alert threshold 3: 120% of budgeted amount
  - [ ] Email address: (your email)
  - [ ] Click "Next"

- [ ] Review and create
  - [ ] Verify settings
  - [ ] Click "Create budget"

**Verification:**
```bash
✅ Billing alerts enabled
✅ Budget created with $20 limit
✅ Email alerts configured
```

---

### **1.7 Install Additional Tools**

#### **Node.js (for Lambda development):**

- [ ] Check if Node.js is installed
  ```bash
  node --version
  # Should show v18.x.x or higher
  ```

- [ ] If not installed:
  - **Windows/Mac:** Download from https://nodejs.org (LTS version)
  - **Linux:**
    ```bash
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
    ```

- [ ] Verify installation
  ```bash
  node --version  # Should show v18.x.x
  npm --version   # Should show 9.x.x
  ```

#### **Git (for version control):**

- [ ] Check if Git is installed
  ```bash
  git --version
  ```

- [ ] If not installed:
  - **Windows:** Download from https://git-scm.com/download/win
  - **Mac:** `brew install git`
  - **Linux:** `sudo apt-get install git`

- [ ] Configure Git
  ```bash
  git config --global user.name "Your Name"
  git config --global user.email "your.email@example.com"
  ```

#### **Postman (for API testing):**

- [ ] Download Postman
  - [ ] Go to: https://www.postman.com/downloads/
  - [ ] Download for your OS
  - [ ] Install

- [ ] Create Postman account (optional but recommended)
  - [ ] Sign up at https://identity.getpostman.com/signup
  - [ ] Verify email

- [ ] Launch Postman
  - [ ] Create workspace: "Questrade Portfolio API"

**Verification:**
```bash
✅ Node.js v18+ installed
✅ npm v9+ installed
✅ Git installed and configured
✅ Postman installed and running
```

---

### **1.8 Verify All Prerequisites**

- [ ] Run complete verification check
  ```bash
  # AWS CLI
  aws --version

  # SAM CLI
  sam --version

  # Node.js
  node --version

  # npm
  npm --version

  # Git
  git --version

  # AWS credentials
  aws sts get-caller-identity

  # AWS region
  aws configure get region
  ```

- [ ] All commands return expected output (no errors)

- [ ] Document your setup
  ```
  AWS Account ID: ____________
  AWS Region: us-east-1
  IAM User: questrade-deployer
  ```

**Final Verification:**
```bash
✅ All tools installed
✅ AWS credentials working
✅ Billing alerts configured
✅ Ready for Phase 2!
```

---

## **Troubleshooting**

### **Issue: aws command not found**
- **Solution:** Restart terminal/command prompt after installation
- **Solution:** Add AWS CLI to PATH manually

### **Issue: sam command not found**
- **Solution:** Restart terminal after installation
- **Solution:** Check installation path is in PATH

### **Issue: AWS credentials not working**
- **Solution:** Verify access key ID and secret key are correct
- **Solution:** Check IAM user has AdministratorAccess policy
- **Solution:** Delete `~/.aws/credentials` and run `aws configure` again

### **Issue: "Unable to locate credentials"**
- **Solution:** Run `aws configure` and enter credentials
- **Solution:** Check credentials file exists and has correct format

---

## **Completion Criteria**

**Phase 1 is complete when:**
- ✅ AWS account is active
- ✅ IAM user created with credentials
- ✅ AWS CLI and SAM CLI installed
- ✅ Credentials configured and verified
- ✅ Billing alerts set up
- ✅ All verification checks pass
- ✅ Development tools installed (Node.js, Git, Postman)

**Estimated Time:** 1-2 hours (if no issues)

---

## **Next Phase**

👉 **[Phase 2: Create SAM Template and Project Structure](Phase-2-SAM-Template-Creation.md)**
