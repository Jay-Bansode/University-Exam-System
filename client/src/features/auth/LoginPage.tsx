import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { DemoAccount } from '@ues/shared';
import { fetchDemoAccounts } from '@/api/auth';
import { ApiError } from '@/api/client';
import { useAuth } from '@/hooks/use-auth';
import { FullPageSpinner } from '@/components/FullPageSpinner';
import { HOME_FOR_ROLE } from '@/routes/paths';

/**
 * Sign-in, plus a one-click panel of demo accounts.
 *
 * There is no public signup — admins create accounts, as a real college does — so
 * without the demo panel a visitor would face a login form and no way past it. The
 * accounts listed are flagged `isDemo` on the server, and nothing else can appear here.
 *
 * Two colleges are represented so the tenant boundary is demonstrable: sign in as one
 * college's clerk, then the other's, and the data changes completely.
 */
export function LoginPage() {
  const { login, isAuthenticated, isInitialising, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const demoQuery = useQuery({
    queryKey: ['demo-accounts'],
    queryFn: fetchDemoAccounts,
    retry: 2,
    staleTime: 5 * 60_000,
  });

  if (isInitialising) return <FullPageSpinner label="Restoring your session" />;

  if (isAuthenticated && user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? HOME_FOR_ROLE[user.role]} replace />;
  }

  const signIn = async (withEmail: string, withPassword: string) => {
    setError(null);
    setIsSubmitting(true);

    try {
      const signedIn = await login(withEmail, withPassword);
      const from = (location.state as { from?: string } | null)?.from;
      void navigate(from ?? HOME_FOR_ROLE[signedIn.role], { replace: true });
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.isConnectivityProblem
            ? 'Could not reach the server. It may be waking up — try again in a moment.'
            : caught.message
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void signIn(email, password);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-6 px-4 py-10 sm:px-6 lg:flex-row lg:items-start lg:gap-10 lg:py-16">
      <section className="lg:flex-1">
        <p className="text-sm font-semibold tracking-wide text-brand-600 uppercase">
          University of Mumbai
        </p>
        <h1 className="mt-1 text-2xl font-bold text-balance text-slate-900 sm:text-3xl">
          Examination Management System
        </h1>
        <p className="mt-3 max-w-prose text-slate-600">
          Exam registration for affiliated colleges. The university publishes the syllabus
          and controls the registration window; each college manages its own students and
          staff, and cannot see another college&rsquo;s data.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        >
          <h2 className="font-semibold text-slate-900">Sign in</h2>

          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200 ring-inset"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-5 w-full rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white transition hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </section>

      <aside className="lg:w-80 lg:shrink-0">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">Explore as…</h2>
          <p className="mt-1 text-sm text-slate-600">
            One click signs you in. Compare the two colleges to see tenant isolation.
          </p>

          {demoQuery.isPending && (
            <p className="mt-4 text-sm text-slate-500">Loading demo accounts…</p>
          )}

          {demoQuery.isError && (
            <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200 ring-inset">
              Could not load demo accounts. The server may be waking up.
            </p>
          )}

          {demoQuery.data && (
            <ul className="mt-4 space-y-2">
              {demoQuery.data.map((account: DemoAccount) => (
                <li key={account.email}>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => void signIn(account.email, account.password)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left transition hover:border-brand-400 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:opacity-60"
                  >
                    <span className="block text-sm font-medium text-slate-900">
                      {account.label}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {account.collegeName ?? 'All colleges'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </main>
  );
}
