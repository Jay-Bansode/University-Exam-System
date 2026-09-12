import type { CorsOptions } from 'cors';
import { env } from './env.js';

/**
 * CORS for a credentialed cross-site API.
 *
 * The client is served from Vercel and the API from Render, so every browser call is
 * cross-origin. Once the refresh token lives in a cookie those calls are also
 * *credentialed*, and browsers apply two extra rules to credentialed requests:
 *
 *   1. `Access-Control-Allow-Origin` must name one exact origin. `*` is rejected.
 *   2. `Access-Control-Allow-Credentials: true` must be present.
 *
 * Hence an explicit allowlist rather than a permissive default. Getting this wrong is
 * the most common reason a Vercel-plus-Render deployment works locally and fails live.
 */

export function buildCorsOptions(): CorsOptions {
  const allowed = new Set(env.CORS_ORIGINS);

  return {
    origin(origin, callback) {
      // A missing Origin header means the request did not come from a browser page:
      // curl, a health probe, or a server-to-server call. Those are not subject to the
      // same-origin policy, so there is nothing for CORS to protect against.
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowed.has(origin)) {
        callback(null, true);
        return;
      }

      // Reject by refusing the header rather than throwing. Throwing produces a 500,
      // which misrepresents a policy decision as a server fault.
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86_400,
  };
}
