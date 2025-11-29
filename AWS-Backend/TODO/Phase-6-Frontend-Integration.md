# Phase 6: Frontend Integration

**Duration:** 2-3 days
**Goal:** Update frontend to use new AWS API Gateway endpoints

---

## **Checklist**

### **6.1 Update Frontend API Configuration**

- [ ] Navigate to frontend directory
  ```bash
  cd d:/Project/3/Frontend-v2/portfolio-manager-v2
  ```

- [ ] Create or update environment file
  - [ ] Create `.env.development`
    ```bash
    VITE_API_BASE_URL=https://YOUR-API-ID.execute-api.us-east-1.amazonaws.com/prod
    ```

  - [ ] Create `.env.production`
    ```bash
    VITE_API_BASE_URL=https://YOUR-API-ID.execute-api.us-east-1.amazonaws.com/prod
    ```

- [ ] Get actual API URL from AWS
  ```bash
  cd d:/Project/3/AWS-Backend
  aws cloudformation describe-stacks \
    --stack-name questrade-portfolio-backend-dev \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
    --output text
  ```

- [ ] Update .env files with actual URL

- [ ] Update .gitignore to exclude .env files
  ```
  # Environment files
  .env
  .env.local
  .env.development.local
  .env.production.local
  ```

**Verification:**
```bash
✅ .env.development created
✅ .env.production created
✅ API URL configured correctly
✅ .gitignore updated
```

---

### **6.2 Review Existing API Service Files**

- [ ] Find all API service files
  ```bash
  find src -name "*Api.js" -o -name "*api.js" -o -name "*service.js"
  ```

- [ ] List existing API files:
  - [ ] src/services/api.js (or similar)
  - [ ] src/services/authApi.js
  - [ ] src/services/portfolioApi.js
  - [ ] (etc.)

- [ ] Review current API base URL configuration
  - [ ] Check how base URL is set
  - [ ] Verify it uses environment variable

**Verification:**
```bash
✅ All API service files identified
✅ Current API configuration understood
```

---

### **6.3 Update API Base URL**

- [ ] Find main API configuration file
  - [ ] Usually: `src/services/api.js` or `src/config/api.js`

- [ ] Update base URL to use environment variable
  ```javascript
  // Before:
  const API_BASE_URL = 'http://localhost:4001';

  // After:
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4001';
  ```

- [ ] Create API client instance
  ```javascript
  // Example with axios (if used):
  import axios from 'axios';

  const apiClient = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL,
    timeout: 10000,
    headers: {
      'Content-Type': 'application/json'
    }
  });

  export default apiClient;
  ```

- [ ] Or with fetch:
  ```javascript
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  export const apiFetch = (endpoint, options = {}) => {
    return fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
  };
  ```

**Verification:**
```bash
✅ Base URL uses environment variable
✅ Fallback to localhost for development
✅ API client configured
```

---

### **6.4 Update Authentication Service**

- [ ] Review current login implementation
  - [ ] File: `src/pages/Login.jsx` (line 16)
  - [ ] Current endpoint: `/api/login`

- [ ] Update login to use full URL (if needed)
  ```javascript
  // In Login.jsx
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
      const response = await fetch(`${API_BASE_URL}/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username(),
          password: password(),
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem('loginTime', Date.now().toString());

        if (props.onLoginSuccess) {
          props.onLoginSuccess();
        }
      } else {
        setError(data.message || 'Login failed. Please try again.');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Unable to connect to server. Please try again later.');
    } finally {
      setLoading(false);
    }
  };
  ```

- [ ] Update auth utility functions
  - [ ] File: `src/utils/auth.js`
  - [ ] Update verifyToken (line 94)
  - [ ] Update refreshToken (line 118)
  - [ ] Update authenticatedFetch (line 146)

  ```javascript
  // In auth.js
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  export async function verifyToken() {
    const token = getToken();
    if (!token) return false;

    try {
      const response = await fetch(`${API_BASE_URL}/api/login/verify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      return response.ok && data.success;
    } catch (error) {
      console.error('Token verification error:', error);
      return false;
    }
  }

  export async function refreshToken() {
    const token = getToken();
    if (!token) return false;

    try {
      const response = await fetch(`${API_BASE_URL}/api/login/refresh`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (response.ok && data.success) {
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem(LOGIN_TIME_KEY, Date.now().toString());
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        return true;
      }

      return false;
    } catch (error) {
      console.error('Token refresh error:', error);
      return false;
    }
  }

  export async function authenticatedFetch(url, options = {}) {
    const token = getToken();

    if (!token) {
      throw new Error('No authentication token');
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    };

    // Prepend API_BASE_URL if url doesn't start with http
    const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;

    const response = await fetch(fullUrl, {
      ...options,
      headers,
    });

    // If unauthorized, clear session and redirect to login
    if (response.status === 401) {
      logout();
      window.location.href = '/login';
    }

    return response;
  }
  ```

**Verification:**
```bash
✅ Login function updated
✅ Auth utilities updated
✅ API_BASE_URL used consistently
```

---

### **6.5 Update All API Service Files**

- [ ] Create centralized API service (if doesn't exist)
  ```javascript
  // src/services/api.js
  import { authenticatedFetch, getToken } from '../utils/auth';

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  // Helper function for GET requests
  export const apiGet = async (endpoint) => {
    return authenticatedFetch(endpoint, {
      method: 'GET'
    });
  };

  // Helper function for POST requests
  export const apiPost = async (endpoint, data) => {
    return authenticatedFetch(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  };

  // Helper function for PUT requests
  export const apiPut = async (endpoint, data) => {
    return authenticatedFetch(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  };

  // Helper function for DELETE requests
  export const apiDelete = async (endpoint) => {
    return authenticatedFetch(endpoint, {
      method: 'DELETE'
    });
  };

  export { API_BASE_URL };
  ```

- [ ] Update settings API (if exists)
  - [ ] File: `src/services/settingsApi.js` (mentioned in git status)
  - [ ] Update API_BASE constant

- [ ] Update all other API service files to use centralized helpers

**Verification:**
```bash
✅ Centralized API service created
✅ All services use API_BASE_URL
✅ No hardcoded URLs
```

---

### **6.6 Test Frontend Locally**

- [ ] Install dependencies (if not done)
  ```bash
  cd d:/Project/3/Frontend-v2/portfolio-manager-v2
  npm install
  ```

- [ ] Start development server
  ```bash
  npm run dev
  ```

- [ ] Verify environment variable is loaded
  - [ ] Open browser console
  - [ ] Check: `import.meta.env.VITE_API_BASE_URL`
  - [ ] Should show AWS API URL

- [ ] Test login
  - [ ] Navigate to login page
  - [ ] Enter test credentials (testuser / password123)
  - [ ] Click "Sign In"
  - [ ] Verify login successful
  - [ ] Check browser console for API calls
  - [ ] Verify API URL is correct

- [ ] Test authenticated routes
  - [ ] Navigate to dashboard (or main page)
  - [ ] Verify data loads
  - [ ] Check Network tab in browser DevTools
  - [ ] Verify all API calls use correct base URL

- [ ] Test logout
  - [ ] Logout
  - [ ] Verify redirected to login
  - [ ] Verify token cleared

**Verification:**
```bash
✅ Frontend starts without errors
✅ Environment variable loaded
✅ Login works
✅ API calls use correct URL
✅ Data loads correctly
```

---

### **6.7 Handle CORS Issues (if any)**

- [ ] Test API from frontend
  - [ ] If CORS errors appear in browser console
  - [ ] Note the error message

- [ ] Update API Gateway CORS (if needed)
  ```bash
  cd d:/Project/3/AWS-Backend

  # Update template.yaml CORS configuration
  # In QuestradeApi resource, update CorsConfiguration:
  CorsConfiguration:
    AllowOrigins:
      - http://localhost:5173  # Vite dev server
      - https://yourdomain.com # Production domain
    AllowMethods:
      - GET
      - POST
      - PUT
      - DELETE
      - OPTIONS
    AllowHeaders:
      - Content-Type
      - Authorization
      - X-Requested-With
    MaxAge: 86400
    AllowCredentials: true
  ```

- [ ] Redeploy API Gateway
  ```bash
  sam build && sam deploy --config-env dev
  ```

- [ ] Test again from frontend
  - [ ] No CORS errors
  - [ ] API calls successful

**Verification:**
```bash
✅ No CORS errors
✅ All API calls work from frontend
```

---

### **6.8 Update Frontend Routing (if needed)**

- [ ] Review current routes
  - [ ] Check if any routes depend on API structure
  - [ ] Verify protected routes still work

- [ ] Test all major routes
  - [ ] Login page
  - [ ] Dashboard
  - [ ] Portfolio view
  - [ ] Settings
  - [ ] Any other pages

**Verification:**
```bash
✅ All routes accessible
✅ Protected routes require authentication
✅ No broken links
```

---

### **6.9 Update Error Handling**

- [ ] Add better error handling for API calls
  ```javascript
  // Example error handler
  export const handleApiError = (error, defaultMessage = 'An error occurred') => {
    if (error.response) {
      // Server responded with error
      const message = error.response.data?.message || defaultMessage;
      console.error('API Error:', message);
      return message;
    } else if (error.request) {
      // Request made but no response
      console.error('Network Error:', error);
      return 'Unable to connect to server. Please check your connection.';
    } else {
      // Something else went wrong
      console.error('Error:', error.message);
      return defaultMessage;
    }
  };
  ```

- [ ] Use error handler in API calls
  ```javascript
  try {
    const response = await apiGet('/api/accounts');
    // Handle success
  } catch (error) {
    const errorMessage = handleApiError(error, 'Failed to load accounts');
    setError(errorMessage);
  }
  ```

**Verification:**
```bash
✅ Error handling implemented
✅ User-friendly error messages
✅ Errors logged to console
```

---

### **6.10 Test All Frontend Features**

- [ ] Create frontend testing checklist

  **Authentication:**
  - [ ] Login with valid credentials
  - [ ] Login with invalid credentials
  - [ ] Logout
  - [ ] Token refresh (wait for expiration)
  - [ ] Session timeout handling

  **Data Display:**
  - [ ] Dashboard loads
  - [ ] Accounts displayed
  - [ ] Positions shown
  - [ ] Activities listed
  - [ ] Portfolio summary

  **CRUD Operations:**
  - [ ] Create new item (if applicable)
  - [ ] Edit existing item
  - [ ] Delete item
  - [ ] Changes reflected immediately

  **Performance:**
  - [ ] Initial load time < 3 seconds
  - [ ] API calls complete < 2 seconds
  - [ ] No memory leaks
  - [ ] Smooth navigation

  **Responsive Design:**
  - [ ] Works on desktop
  - [ ] Works on tablet (if supported)
  - [ ] Works on mobile (if supported)

**Verification:**
```bash
✅ All features tested
✅ No major bugs
✅ Performance acceptable
```

---

### **6.11 Build for Production**

- [ ] Update production environment file
  - [ ] `.env.production` has correct AWS URL

- [ ] Build production bundle
  ```bash
  npm run build
  ```

- [ ] Verify build succeeds
  - [ ] No build errors
  - [ ] dist/ folder created

- [ ] Test production build locally
  ```bash
  npm run preview
  ```

- [ ] Verify production build works
  - [ ] Login works
  - [ ] Data loads
  - [ ] No console errors

**Verification:**
```bash
✅ Production build successful
✅ No errors or warnings
✅ Production build tested locally
```

---

### **6.12 Deploy Frontend (Optional)**

**Choose deployment method:**

#### **Option A: AWS S3 + CloudFront**

- [ ] Create S3 bucket for frontend
  ```bash
  aws s3 mb s3://questrade-portfolio-frontend --region us-east-1
  ```

- [ ] Configure bucket for static website hosting
  ```bash
  aws s3 website s3://questrade-portfolio-frontend \
    --index-document index.html \
    --error-document index.html
  ```

- [ ] Upload build files
  ```bash
  cd d:/Project/3/Frontend-v2/portfolio-manager-v2
  aws s3 sync dist/ s3://questrade-portfolio-frontend
  ```

- [ ] Make files public
  ```bash
  aws s3api put-bucket-policy \
    --bucket questrade-portfolio-frontend \
    --policy file://bucket-policy.json
  ```

- [ ] Access frontend
  - [ ] URL: http://questrade-portfolio-frontend.s3-website-us-east-1.amazonaws.com

#### **Option B: Vercel/Netlify**

- [ ] Sign up for Vercel or Netlify
- [ ] Connect GitHub repository
- [ ] Configure build settings
  - [ ] Build command: `npm run build`
  - [ ] Publish directory: `dist`
  - [ ] Environment variables: `VITE_API_BASE_URL`

- [ ] Deploy

**Verification:**
```bash
✅ Frontend deployed
✅ Accessible via public URL
✅ Environment variables configured
```

---

### **6.13 Update Documentation**

- [ ] Create frontend integration guide
  - [ ] File: `Frontend-v2/portfolio-manager-v2/AWS-INTEGRATION.md`
  - [ ] Document API URL configuration
  - [ ] Explain environment variables
  - [ ] List all API endpoints used

- [ ] Update main README
  - [ ] Add AWS deployment information
  - [ ] Update setup instructions
  - [ ] Add troubleshooting section

- [ ] Commit changes
  ```bash
  git add .
  git commit -m "feat: Integrate frontend with AWS API Gateway"
  ```

**Verification:**
```bash
✅ Documentation updated
✅ Changes committed
```

---

### **6.14 End-to-End Testing**

- [ ] Test complete user flow
  1. [ ] User visits login page
  2. [ ] User logs in
  3. [ ] Dashboard loads with data from AWS
  4. [ ] User navigates to different pages
  5. [ ] Data loads correctly
  6. [ ] User performs CRUD operation
  7. [ ] Changes saved to DynamoDB
  8. [ ] User logs out
  9. [ ] User can log back in

- [ ] Test error scenarios
  - [ ] Network offline
  - [ ] API returns 500 error
  - [ ] Token expired
  - [ ] Invalid data submitted

- [ ] Test on different browsers
  - [ ] Chrome
  - [ ] Firefox
  - [ ] Safari (if available)
  - [ ] Edge

**Verification:**
```bash
✅ Complete user flow works
✅ Error handling works
✅ Cross-browser compatible
```

---

## **Completion Criteria**

**Phase 6 is complete when:**
- ✅ Frontend updated to use AWS API Gateway
- ✅ Environment variables configured
- ✅ Authentication working end-to-end
- ✅ All API calls updated
- ✅ CORS issues resolved
- ✅ Error handling implemented
- ✅ All features tested
- ✅ Production build successful
- ✅ Frontend deployed (optional)
- ✅ Documentation updated
- ✅ End-to-end testing complete
- ✅ Ready for production use!

**Estimated Time:** 8-12 hours

---

## **Troubleshooting**

### **Issue: Environment variable not loading**
**Solution:**
- Restart Vite dev server
- Check file name: `.env.development` (not `.env.dev`)
- Verify variable name starts with `VITE_`

### **Issue: CORS errors**
**Solution:**
- Check API Gateway CORS configuration
- Ensure AllowOrigins includes your frontend URL
- Verify AllowHeaders includes "Authorization"

### **Issue: 401 Unauthorized**
**Solution:**
- Check token is being sent in Authorization header
- Verify token format: `Bearer ${token}`
- Check token hasn't expired

### **Issue: Data not loading**
**Solution:**
- Check browser console for errors
- Verify API URL is correct
- Check Network tab to see actual requests
- Verify DynamoDB has data

### **Issue: Build fails**
**Solution:**
- Check for TypeScript errors (if using TypeScript)
- Verify all dependencies installed
- Clear node_modules and reinstall

---

## **Next Phase**

👉 **[Phase 7: Production Deployment and Monitoring](Phase-7-Production-Deployment.md)**
