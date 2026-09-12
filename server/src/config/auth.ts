import type { CookieOptions } from 'express';
import { env, isProduction } from './env.js';

/**
 * Auth constants and the refresh-cookie policy, kept in one place so the security
 * posture can be reviewed without reading the whole auth flow.
 */

export const ACCESS_TOKEN_TTL_SECONDS = env.ACCESS_TOKEN_MINUTES * 60;
export const REFRESH_TOKEN_TTL_SECONDS = env.REFRESH_TOKEN_DAYS * 24 * 60 * 60;

export const REFRESH_COOKIE_NAME = 'ues_rt';

/** Work factor for bcrypt. 12 costs roughly 250ms, which is the point: it throttles
 *  offline guessing. Raising it further would make Render's free tier feel slow. */
export const BCRYPT_ROUNDS = 12;

/**
 * Cookie options for the refresh token.
 *
 * `httpOnly` is the important one: page JavaScript cannot read the cookie, so an XSS
 * bug cannot steal a long-lived credential. The access token is deliberately *not*
 * stored in a cookie — it lives in memory only and dies with the tab.
 *
 * In production the client is on Vercel and the API on Render, which are different
 * sites, so the cookie must be `sameSite: 'none'`. Browsers only accept that together
 * with `secure: true`, which is why the two are set as a pair. Locally both run on
 * `localhost`, where `secure` would prevent the cookie being set over plain HTTP, so
 * `lax` is used instead.
 */
export function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    // Scoped to the refresh and logout routes, so the cookie is not attached to every
    // ordinary API call and cannot leak through an unrelated handler that logs headers.
    path: '/api/auth',
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
  };
}

/** Same attributes minus `maxAge`; a cookie is only cleared if the flags match. */
export function clearRefreshCookieOptions(): CookieOptions {
  const { maxAge: _maxAge, ...rest } = refreshCookieOptions();
  return rest;
}
