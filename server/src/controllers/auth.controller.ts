import type { Request, Response } from 'express';
import type { LoginResponse, RefreshResponse } from '@ues/shared';
import * as authService from '../services/auth.service.js';
import { sendSuccess } from '../utils/respond.js';
import { AppError } from '../utils/app-error.js';
import {
  REFRESH_COOKIE_NAME,
  clearRefreshCookieOptions,
  refreshCookieOptions,
} from '../config/auth.js';
import type { IssuedSession } from '../services/auth.service.js';

/**
 * HTTP handling for authentication.
 *
 * Controllers translate between HTTP and the service layer and hold no logic of their
 * own. Notice what stays here: reading cookies and headers, and setting the refresh
 * cookie. Those are HTTP concerns, so the service never sees them and stays testable
 * without a request object.
 *
 * No try/catch anywhere: Express 5 forwards a rejected promise to the error handler.
 */

function setRefreshCookie(res: Response, session: IssuedSession): void {
  res.cookie(REFRESH_COOKIE_NAME, session.refreshToken, refreshCookieOptions());
}

function userAgentOf(req: Request): string | null {
  return req.headers['user-agent'] ?? null;
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email: string; password: string };

  const session = await authService.login(email, password, userAgentOf(req));
  setRefreshCookie(res, session);

  // The refresh token is deliberately not in the body — it exists only as an httpOnly
  // cookie, so page JavaScript can never read it.
  const payload: LoginResponse = {
    user: session.user,
    accessToken: session.accessToken,
    expiresIn: session.expiresIn,
  };

  sendSuccess(res, payload);
}

export async function refreshHandler(req: Request, res: Response): Promise<void> {
  const rawToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;

  const session = await authService.refreshSession(rawToken, userAgentOf(req));
  setRefreshCookie(res, session);

  const payload: RefreshResponse = {
    accessToken: session.accessToken,
    expiresIn: session.expiresIn,
  };

  sendSuccess(res, payload);
}

export async function logoutHandler(req: Request, res: Response): Promise<void> {
  const rawToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;

  await authService.logout(rawToken);
  res.clearCookie(REFRESH_COOKIE_NAME, clearRefreshCookieOptions());

  sendSuccess(res, { loggedOut: true });
}

export async function meHandler(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw AppError.unauthenticated();

  const user = await authService.getCurrentUser(req.auth.userId);
  sendSuccess(res, { user });
}
