import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { HOME_FOR_ROLE, paths } from './paths';

/**
 * A real not-found page rather than a silent redirect to the start.
 *
 * Bouncing an unknown URL to the dashboard is disorienting: the user sees a page they
 * did not ask for with no explanation, and a typo looks identical to a permissions
 * problem. Saying what happened, then offering the way back, is clearer.
 */
export default function NotFoundPage() {
  const { user } = useAuth();
  const home = user ? HOME_FOR_ROLE[user.role] : paths.login;

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4">
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
        <p className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
          Page not found
        </p>
        <h1 className="mt-1 text-xl font-bold text-slate-900">
          That page does not exist
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          The link may be out of date, or the address may have been mistyped.
        </p>

        <Link
          to={home}
          className="mt-5 inline-block rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700"
        >
          {user ? 'Back to your dashboard' : 'Go to sign in'}
        </Link>
      </div>
    </main>
  );
}
