# Login System Implementation Guide

## Overview

A secure login-only authentication system has been implemented for the Questrade Portfolio Manager. Registration is disabled, and only pre-configured admin users can access the system.

## Features Implemented

### Backend (questrade-auth-api)

1. **User Model** ([Backend/questrade-portfolio-microservices/questrade-auth-api/src/models/User.js](Backend/questrade-portfolio-microservices/questrade-auth-api/src/models/User.js))
   - Secure password hashing with bcrypt
   - Account locking after 5 failed login attempts (15-minute lockout)
   - Login attempt tracking
   - Role-based access control (admin/user)
   - Active/inactive user status

2. **Login API Endpoints** ([Backend/questrade-portfolio-microservices/questrade-auth-api/src/routes/login.js](Backend/questrade-portfolio-microservices/questrade-auth-api/src/routes/login.js))
   - `POST /api/login` - User login with JWT token generation
   - `POST /api/login/verify` - Verify JWT token validity
   - `POST /api/login/refresh` - Refresh expired tokens

3. **Authentication Middleware** ([Backend/questrade-portfolio-microservices/questrade-auth-api/src/middleware/authMiddleware.js](Backend/questrade-portfolio-microservices/questrade-auth-api/src/middleware/authMiddleware.js))
   - `authenticateToken` - Protect routes requiring authentication
   - `requireAdmin` - Restrict routes to admin users only
   - `optionalAuth` - Optionally check authentication

4. **Admin User Seed Script** ([Backend/questrade-portfolio-microservices/questrade-auth-api/scripts/seed-admin.js](Backend/questrade-portfolio-microservices/questrade-auth-api/scripts/seed-admin.js))
   - Creates default admin user
   - Checks for existing users
   - Password: `Admin@123` (should be changed after first login)

### Frontend (Frontend-v2/portfolio-manager-v2)

1. **Login Page** ([Frontend-v2/portfolio-manager-v2/src/pages/Login.jsx](Frontend-v2/portfolio-manager-v2/src/pages/Login.jsx))
   - Clean, modern login form
   - Error handling and validation
   - Loading states
   - Responsive design

2. **Authentication Utilities** ([Frontend-v2/portfolio-manager-v2/src/utils/auth.js](Frontend-v2/portfolio-manager-v2/src/utils/auth.js))
   - `isAuthenticated()` - Check if user is logged in
   - `getToken()` - Get JWT token
   - `getUser()` - Get current user info
   - `logout()` - Clear session
   - `verifyToken()` - Validate token with backend
   - `refreshToken()` - Extend session
   - `authenticatedFetch()` - Make authenticated API calls

3. **App Integration** ([Frontend-v2/portfolio-manager-v2/src/App.jsx](Frontend-v2/portfolio-manager-v2/src/App.jsx))
   - Conditional rendering based on authentication
   - Automatic session validation
   - Logout functionality
   - Redirect to login when unauthenticated

4. **Logout Button** ([Frontend-v2/portfolio-manager-v2/src/components/layout/Topbar.jsx](Frontend-v2/portfolio-manager-v2/src/components/layout/Topbar.jsx))
   - Added to Topbar component
   - Styled with red theme
   - Clears session and redirects to login

## Setup Instructions

### Step 1: Set JWT Secret (IMPORTANT!)

Before running the application, set a secure JWT secret in your environment:

```bash
# Add to Backend/questrade-portfolio-microservices/questrade-auth-api/.env
JWT_SECRET=your-super-secret-key-min-32-characters-long-change-this-in-production
```

**⚠️ CRITICAL:** Never use the default JWT secret in production! Generate a strong random secret:

```bash
# Generate a secure random secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Step 2: Start the Backend

```bash
cd Backend/questrade-portfolio-microservices/questrade-auth-api
npm install
npm start
```

The backend should start on port `4003` (default).

### Step 3: Seed the Admin User

```bash
cd Backend/questrade-portfolio-microservices/questrade-auth-api
node scripts/seed-admin.js
```

Expected output:
```
✓ Admin user created successfully!

Login Credentials:
==================
Username: victor
Password: Admin@123

⚠ IMPORTANT: Change this password after first login!
```

### Step 4: Start the Frontend

```bash
cd Frontend-v2/portfolio-manager-v2
npm install
npm run dev
```

The frontend should start on `http://localhost:3000` (default Vite port).

### Step 5: Test Login

1. Navigate to `http://localhost:3000`
2. You should see the login page
3. Enter credentials:
   - **Username:** `victor`
   - **Password:** `Admin@123`
4. Click "Sign In"
5. You should be redirected to the portfolio dashboard

## Security Features

### Password Security
- Passwords hashed with bcrypt (10 salt rounds)
- Minimum security requirements enforced
- No plain-text password storage

### Account Protection
- **Failed Login Attempts:** Maximum 5 attempts
- **Account Lockout:** 15 minutes after 5 failed attempts
- **Lockout Message:** User informed of temporary lockout

### Session Security
- **JWT Tokens:** Signed with secret key
- **Session Duration:** 24 hours
- **Automatic Expiry:** Client-side validation
- **Token Refresh:** Extend session without re-login

### API Security
- Rate limiting: 500 requests per 15 minutes
- Helmet.js security headers
- CORS configuration
- Request logging

## User Management

### Adding New Users (Manual - Database Access Required)

Since registration is disabled, new users must be added manually:

**Option 1: Using MongoDB Shell**

```javascript
// Connect to MongoDB
use questrade-portfolio

// Create new user
db.users.insertOne({
  username: "newuser",
  password: "$2a$10$...", // Use bcrypt to hash password first
  displayName: "New User",
  email: "newuser@example.com",
  role: "admin",
  isActive: true,
  loginAttempts: 0,
  createdAt: new Date(),
  updatedAt: new Date()
})
```

**Option 2: Using Node.js Script**

```javascript
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('./src/models/User');

async function createUser() {
  await mongoose.connect('mongodb://localhost:27017/questrade-portfolio');

  const user = new User({
    username: 'newuser',
    password: 'temporary-password', // Will be hashed automatically
    displayName: 'New User',
    email: 'newuser@example.com',
    role: 'admin'
  });

  await user.save();
  console.log('User created successfully');
  process.exit(0);
}

createUser();
```

### Password Reset (Manual)

To reset a user's password:

```javascript
// MongoDB Shell
use questrade-portfolio

// Find user and update password
db.users.updateOne(
  { username: "victor" },
  {
    $set: {
      password: "$2a$10$...", // Hashed new password
      loginAttempts: 0,
      lockUntil: null
    }
  }
)
```

## API Endpoints

### Public Endpoints (No Authentication Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/login` | Login with username/password |
| POST | `/api/login/verify` | Verify JWT token validity |
| POST | `/api/login/refresh` | Refresh JWT token |

### Request/Response Examples

**Login Request:**
```json
POST /api/login
{
  "username": "victor",
  "password": "Admin@123"
}
```

**Login Response (Success):**
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "username": "victor",
    "displayName": "Victor",
    "email": "victor@questrade-portfolio.local",
    "role": "admin",
    "lastLogin": "2025-01-15T12:00:00.000Z"
  }
}
```

**Login Response (Failure):**
```json
{
  "success": false,
  "message": "Invalid username or password"
}
```

**Verify Token Request:**
```bash
POST /api/login/verify
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Verify Token Response:**
```json
{
  "success": true,
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "username": "victor",
    "displayName": "Victor",
    "email": "victor@questrade-portfolio.local",
    "role": "admin"
  }
}
```

## Frontend Usage

### Check Authentication Status

```javascript
import { isAuthenticated, getUser } from './utils/auth';

if (isAuthenticated()) {
  const user = getUser();
  console.log('Logged in as:', user.displayName);
} else {
  console.log('Not authenticated');
}
```

### Make Authenticated API Calls

```javascript
import { authenticatedFetch } from './utils/auth';

const response = await authenticatedFetch('/api/persons', {
  method: 'GET'
});

const data = await response.json();
```

### Manual Logout

```javascript
import { logout } from './utils/auth';

// Clear session
logout();

// Redirect to login
window.location.href = '/login';
```

## Troubleshooting

### Issue: "Invalid token" error after refresh

**Solution:** Token might have expired. Either:
1. Login again
2. Implement automatic token refresh:

```javascript
import { refreshToken } from './utils/auth';

const success = await refreshToken();
if (success) {
  // Retry the failed request
} else {
  // Redirect to login
}
```

### Issue: "Account is temporarily locked"

**Solution:** Wait 15 minutes or manually reset in database:

```javascript
db.users.updateOne(
  { username: "victor" },
  { $set: { loginAttempts: 0 }, $unset: { lockUntil: 1 } }
)
```

### Issue: Can't login after seed script

**Checklist:**
1. Backend server is running on port 4003
2. MongoDB is running
3. Seed script completed successfully
4. Using correct credentials: `victor` / `Admin@123`
5. Check browser console for errors
6. Check backend logs for authentication errors

### Issue: Frontend shows login page but doesn't redirect after login

**Checklist:**
1. Check browser console for errors
2. Verify `/api/login` endpoint is accessible
3. Check that JWT token is being stored in localStorage
4. Verify `onLoginSuccess` callback is being called

## Security Best Practices

### Production Checklist

- [ ] Change default admin password
- [ ] Set strong JWT_SECRET environment variable
- [ ] Enable HTTPS for all API calls
- [ ] Configure CORS for production domain only
- [ ] Set secure cookies (if using cookies for tokens)
- [ ] Implement rate limiting on login endpoint
- [ ] Enable request logging and monitoring
- [ ] Set up alerts for failed login attempts
- [ ] Regular security audits
- [ ] Keep dependencies updated

### Password Requirements (For Future Enhancement)

Consider implementing:
- Minimum length: 8 characters
- Must contain: uppercase, lowercase, number, special character
- Password history: prevent reuse of last 5 passwords
- Password expiry: force change every 90 days
- Two-factor authentication (2FA)

## Next Steps

### Optional Enhancements

1. **Password Reset Flow**
   - Email-based password reset
   - Security questions
   - OTP verification

2. **User Profile Management**
   - Change password
   - Update email/display name
   - Session management (view active sessions)

3. **Advanced Security**
   - Two-factor authentication (2FA)
   - IP whitelisting
   - Device fingerprinting
   - Session timeout warnings

4. **Audit Logging**
   - Login history
   - Failed login attempts
   - User actions log
   - Security events

5. **Admin Panel**
   - User management UI
   - View/create/edit/delete users
   - Reset passwords
   - View login history

## File Structure

```
Backend/questrade-portfolio-microservices/questrade-auth-api/
├── src/
│   ├── models/
│   │   └── User.js                    # User model with password hashing
│   ├── routes/
│   │   └── login.js                   # Login endpoints
│   ├── middleware/
│   │   └── authMiddleware.js          # JWT authentication middleware
│   └── server.js                      # Updated with login routes
└── scripts/
    └── seed-admin.js                  # Admin user seed script

Frontend-v2/portfolio-manager-v2/src/
├── pages/
│   ├── Login.jsx                      # Login page component
│   └── Login.css                      # Login page styles
├── utils/
│   └── auth.js                        # Authentication utilities
├── components/
│   ├── ProtectedRoute.jsx             # Route protection component
│   └── layout/
│       ├── Topbar.jsx                 # Updated with logout button
│       └── Topbar.css                 # Updated with logout button styles
└── App.jsx                            # Updated with authentication logic
```

## Support

For issues or questions:
1. Check this guide first
2. Review backend logs: Backend/questrade-portfolio-microservices/questrade-auth-api/logs/
3. Check browser console for frontend errors
4. Verify MongoDB connection and data

## Changelog

### v1.0.0 - Initial Implementation
- User model with bcrypt password hashing
- JWT-based authentication
- Login, verify, and refresh endpoints
- Frontend login page
- Session management
- Logout functionality
- Account lockout after failed attempts
- 24-hour session duration
- Admin user seed script
