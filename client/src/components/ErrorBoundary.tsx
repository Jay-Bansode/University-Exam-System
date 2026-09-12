import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Catches render errors so one broken component does not blank the whole page.
 *
 * Written as a class because there is still no hook equivalent: `componentDidCatch` and
 * `getDerivedStateFromError` have no function-component counterpart in React 19. This is
 * the one place in the codebase where a class component is the correct choice rather
 * than a legacy one.
 *
 * It catches errors thrown while *rendering*. It does not catch errors in event handlers
 * or in promises — those are handled where they occur, which is why every mutation in
 * this app has its own try/catch.
 */

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // The only place the component stack is available. In a production system this is
    // where an error reporter would be called.
    console.error('[ui] render error:', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;

    if (!error) return this.props.children;

    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4">
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-5">
          <h1 className="font-semibold text-rose-900">Something went wrong</h1>
          <p className="mt-2 text-sm text-rose-800">
            This page could not be displayed. Reloading usually fixes it. If it keeps
            happening, tell your college office what you were doing.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700"
            >
              Reload the page
            </button>
            {/* A full navigation rather than a router link: the router itself may be
                the thing that failed. */}
            <a
              href="/"
              className="rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-800 transition hover:bg-rose-50"
            >
              Go to the start
            </a>
          </div>

          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-rose-700">
              Technical detail
            </summary>
            <pre className="mt-2 overflow-x-auto rounded bg-white p-2 text-xs text-rose-900">
              {error.message}
            </pre>
          </details>
        </div>
      </main>
    );
  }
}
