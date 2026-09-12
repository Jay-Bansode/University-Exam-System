import { AppRouter } from '@/routes/AppRouter';
import { configError } from '@/config/env';

/**
 * Application root.
 *
 * The configuration check runs before routing. A missing API URL would otherwise
 * manifest as every request failing for no visible reason, which is a miserable thing to
 * debug on a fresh deploy.
 */
export default function App() {
  if (configError) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4">
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-5">
          <h1 className="font-semibold text-rose-900">Configuration problem</h1>
          <p className="mt-2 text-sm text-rose-800">{configError}</p>
        </div>
      </main>
    );
  }

  return <AppRouter />;
}
