import { createSignal } from 'solid-js';
import authTokenManager from '../services/authToken';
import '../pages/Login.css';

const API_BASE_URL = import.meta.env.VITE_API_GATEWAY_URL;

function Login(props) {
  const [username, setUsername] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [error, setError] = createSignal('');
  const [loading, setLoading] = createSignal(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      console.log('[Login] Attempting login to:', API_BASE_URL);

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
      console.log('[Login] Response:', data);

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Login failed');
      }

      if (data.success && data.data) {
        console.log('[Login] Login successful:', data.data);

        // Store JWT token using authTokenManager
        authTokenManager.storeToken(data.data);

        console.log('[Login] Login complete, calling success callback...');

        // Call onLoginSuccess callback if provided
        if (props.onLoginSuccess) {
          props.onLoginSuccess();
        }
      } else {
        throw new Error('Invalid login response');
      }
    } catch (err) {
      console.error('[Login] Login error:', err);
      setError(err.message || 'Unable to connect to server. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="login-container">
      <div class="login-box">
        <div class="login-header">
          <h1>Questrade Portfolio Manager</h1>
          <p>Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} class="login-form">
          {error() && (
            <div class="error-message">
              <span class="error-icon">⚠</span>
              {error()}
            </div>
          )}

          <div class="form-group">
            <label for="username">USERNAME</label>
            <input
              type="text"
              id="username"
              value={username()}
              onInput={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              required
              autocomplete="username"
              disabled={loading()}
            />
          </div>

          <div class="form-group">
            <label for="password">PASSWORD</label>
            <input
              type="password"
              id="password"
              value={password()}
              onInput={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autocomplete="current-password"
              disabled={loading()}
            />
          </div>

          <button
            type="submit"
            class="login-button"
            disabled={loading()}
          >
            {loading() ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div class="login-footer">
          <p>Questrade Portfolio Manager v2.0</p>
        </div>
      </div>
    </div>
  );
}

export default Login;
