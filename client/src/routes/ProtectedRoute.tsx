import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Role } from '@ues/shared';
import { useAuth } from '@/hooks/use-auth';
import { FullPageSpinner } from '@/components/FullPageSpinner';
import { HOME_FOR_ROLE, paths } from './paths';

/**
 * Gates a group of routes on being signed in, and optionally on holding one of a set of
 * roles.
 *
 * This is a usability guard, not a security boundary. It decides what to render; it
 * cannot decide what data exists. Every one of these checks is enforced again on the
 * server by `requireRole` and `tenantScope`, because anything in the browser is under
 * the user's control. Removing this component would make the app confusing, not
 * insecure.
 */
export function ProtectedRoute({ allow }: { allow?: Role[] }) {
  const { isAuthenticated, isInitialising, user } = useAuth();
  const location = useLocation();

  // The session restore is still in flight. Rendering the login page here would flash it
  // on every reload for an already-signed-in user.
  if (isInitialising) return <FullPageSpinner label="Restoring your session" />;

  if (!isAuthenticated || !user) {
    // `state` remembers where they were headed so sign-in can return them there.
    return <Navigate to={paths.login} replace state={{ from: location.pathname }} />;
  }

  if (allow && !allow.includes(user.role)) {
    // Sent to their own dashboard rather than shown an error: reaching another role's
    // URL is nearly always a stale link or a typed address, not an attack.
    return <Navigate to={HOME_FOR_ROLE[user.role]} replace />;
  }

  return <Outlet />;
}
