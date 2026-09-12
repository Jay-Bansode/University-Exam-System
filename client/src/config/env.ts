/**
 * Client configuration, read from Vite's compile-time environment.
 *
 * Vite replaces `import.meta.env.VITE_*` with literal strings at build time, so these
 * values are baked into the bundle and visible to anyone who opens devtools. That is
 * why only non-secret values live here.
 *
 * A missing variable is reported rather than thrown. Throwing at module scope happens
 * before React mounts, so the user gets a blank page and the reason is buried in the
 * console — the worst possible outcome for a misconfigured deploy.
 */

const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;

export const IS_DEV = import.meta.env.DEV;

/** Non-null when configuration is unusable, so the UI can explain what to fix. */
export const configError: string | null = rawApiBaseUrl
  ? null
  : 'VITE_API_BASE_URL is not set. Locally, copy client/.env.example to client/.env.local. ' +
    'On Vercel, add it under Settings → Environment Variables and redeploy.';

/** Trailing slashes are stripped so URL joining never produces a double slash. */
export const API_BASE_URL = (rawApiBaseUrl ?? 'http://localhost:5000').replace(
  /\/+$/,
  '',
);
