import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { FullPageSpinner } from '@/components/FullPageSpinner';
import { HOME_FOR_ROLE, paths } from './paths';

/**
 * Sends a signed-in user to whichever dashboard belongs to their role.
 *
 * Having `/` resolve per role keeps the destination in one place, so bookmarking the
 * bare domain works for everyone regardless of who they are.
 */
export function RoleHome() {
  const { user, isInitialising } = useAuth();

  if (isInitialising) return <FullPageSpinner />;
  if (!user) return <Navigate to={paths.login} replace />;

  return <Navigate to={HOME_FOR_ROLE[user.role]} replace />;
}
