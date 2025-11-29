import { Navigate } from '@solidjs/router';
import { isAuthenticated } from '../utils/auth';

/**
 * Protected Route Component
 * Redirects to login if user is not authenticated
 */
function ProtectedRoute(props) {
  if (!isAuthenticated()) {
    // Redirect to login page
    return <Navigate href="/login" />;
  }

  // Render the protected component
  return <>{props.children}</>;
}

export default ProtectedRoute;
