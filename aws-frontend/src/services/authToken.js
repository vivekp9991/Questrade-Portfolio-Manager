// JWT Token Management Service
const API_BASE_URL = import.meta.env.VITE_API_GATEWAY_URL;

class AuthTokenManager {
  constructor() {
    this.tokenKey = 'authToken';
    this.refreshThreshold = 300000; // 5 minutes
  }

  /**
   * Store JWT token after login
   */
  storeToken(tokenData) {
    const data = {
      accessToken: tokenData.token || tokenData.accessToken,
      userId: tokenData.userId,
      username: tokenData.username,
      expiresAt: tokenData.expiresAt || (Date.now() + 21600000), // 6 hours default
      issuedAt: Date.now()
    };

    localStorage.setItem(this.tokenKey, JSON.stringify(data));
    console.log('[Auth] Token stored, expires at:', new Date(data.expiresAt).toLocaleTimeString());
  }

  /**
   * Get current token
   */
  getToken() {
    const stored = localStorage.getItem(this.tokenKey);
    if (!stored) return null;

    try {
      return JSON.parse(stored);
    } catch (error) {
      console.error('[Auth] Failed to parse token:', error);
      return null;
    }
  }

  /**
   * Check if token is valid
   */
  isTokenValid() {
    const token = this.getToken();
    if (!token) {
      console.warn('[Auth] No token found');
      return false;
    }

    // Check if expired
    if (Date.now() >= token.expiresAt) {
      console.warn('[Auth] Token expired');
      return false;
    }

    return true;
  }

  /**
   * Check if token needs refresh (less than 5 minutes remaining)
   */
  needsRefresh() {
    const token = this.getToken();
    if (!token) return false;

    const timeRemaining = token.expiresAt - Date.now();
    return timeRemaining < this.refreshThreshold;
  }

  /**
   * Refresh JWT token
   * Returns: { success: boolean, token?: object, error?: string }
   */
  async refreshToken() {
    const currentToken = this.getToken();
    if (!currentToken) {
      console.error('[Auth] Cannot refresh - no token found');
      return { success: false, error: 'No token found' };
    }

    try {
      console.log('[Auth] 🔄 Refreshing token...');

      const response = await fetch(`${API_BASE_URL}/api/login/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken.accessToken}`
        },
        body: JSON.stringify({
          username: currentToken.username
        })
      });

      if (!response.ok) {
        throw new Error(`Refresh failed: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.data) {
        this.storeToken(data.data);
        console.log('[Auth] ✅ Token refreshed successfully');
        return { success: true, token: data.data };
      } else {
        throw new Error(data.error || 'Token refresh failed');
      }

    } catch (error) {
      console.error('[Auth] ❌ Token refresh failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Clear token (logout)
   */
  clearToken() {
    localStorage.removeItem(this.tokenKey);
    console.log('[Auth] Token cleared');
  }
}

export default new AuthTokenManager();
