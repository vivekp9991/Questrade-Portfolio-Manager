/**
 * Authentication utility functions
 */

const TOKEN_KEY = 'authToken';
const USER_KEY = 'user';
const LOGIN_TIME_KEY = 'loginTime';
const TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

/**
 * Check if user is authenticated
 */
export function isAuthenticated() {
  const token = localStorage.getItem(TOKEN_KEY);
  const loginTime = localStorage.getItem(LOGIN_TIME_KEY);

  if (!token || !loginTime) {
    return false;
  }

  // Check if token has expired (24 hours)
  const now = Date.now();
  const elapsed = now - parseInt(loginTime);

  if (elapsed > TOKEN_EXPIRY) {
    logout(); // Clear expired session
    return false;
  }

  return true;
}

/**
 * Get authentication token
 */
export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Get current user info
 */
export function getUser() {
  const userStr = localStorage.getItem(USER_KEY);
  if (!userStr) return null;

  try {
    return JSON.parse(userStr);
  } catch (error) {
    console.error('Error parsing user data:', error);
    return null;
  }
}

/**
 * Logout user
 */
export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(LOGIN_TIME_KEY);
}

/**
 * Get time until session expires
 */
export function getTimeUntilExpiry() {
  const loginTime = localStorage.getItem(LOGIN_TIME_KEY);
  if (!loginTime) return 0;

  const now = Date.now();
  const elapsed = now - parseInt(loginTime);
  const remaining = TOKEN_EXPIRY - elapsed;

  return Math.max(0, remaining);
}

/**
 * Check if session is about to expire (within 5 minutes)
 */
export function isSessionExpiringSoon() {
  const remaining = getTimeUntilExpiry();
  return remaining > 0 && remaining < 5 * 60 * 1000; // 5 minutes
}

/**
 * Verify token with backend
 */
export async function verifyToken() {
  const token = getToken();
  if (!token) return false;

  try {
    const response = await fetch('/api/login/verify', {
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

/**
 * Refresh authentication token
 */
export async function refreshToken() {
  const token = getToken();
  if (!token) return false;

  try {
    const response = await fetch('/api/login/refresh', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (response.ok && data.success) {
      // Update token and login time
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

/**
 * Make authenticated API request
 */
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

  const response = await fetch(url, {
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
