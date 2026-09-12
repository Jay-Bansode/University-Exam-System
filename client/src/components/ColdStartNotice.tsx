import { useEffect, useState } from 'react';

/**
 * Explains a slow first load.
 *
 * The API runs on a free tier that sleeps after 15 minutes of inactivity and takes about
 * a minute to wake. Without this, whoever opens the link first sees a page that appears
 * to hang, and concludes the system is broken rather than asleep.
 *
 * It appears only if start-up is still going after a few seconds, so a warm server never
 * shows it. A fixed banner rather than a full-screen message, because the app is usable
 * around it once anything has loaded.
 */
export function ColdStartNotice({ isWaiting }: { isWaiting: boolean }) {
  const [hasWaitedLongEnough, setHasWaitedLongEnough] = useState(false);

  useEffect(() => {
    if (!isWaiting) return;

    // Long enough that a warm response never triggers it, short enough to arrive before
    // the user gives up.
    const timer = setTimeout(() => setHasWaitedLongEnough(true), 3000);
    return () => clearTimeout(timer);
  }, [isWaiting]);

  /**
   * Visibility is *derived* from both values rather than stored and kept in sync.
   *
   * Resetting a `isVisible` flag in the effect body would set state synchronously during
   * render, which React 19 flags as a cascading render. Here the only `setState` happens
   * inside the timer callback, and the notice disappears simply because `isWaiting`
   * became false.
   */
  if (!isWaiting || !hasWaitedLongEnough) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="no-print fixed inset-x-0 bottom-0 z-50 border-t border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-900"
    >
      <span className="font-medium">Waking up the server.</span> This deployment sleeps
      when idle, so the first request can take up to a minute. It will be quick after
      this.
    </div>
  );
}
