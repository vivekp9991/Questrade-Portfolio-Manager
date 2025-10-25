import { createSignal } from 'solid-js';
import '../pages/Login.css';

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
      const response = await fetch('/api/login', {
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
        // Store token and user info
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem('loginTime', Date.now().toString());

        // Call onLoginSuccess callback if provided
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
            <label for="username">Username</label>
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
            <label for="password">Password</label>
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
