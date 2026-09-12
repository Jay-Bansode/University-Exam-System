import type { RequestHandler } from 'express';
import { Types } from 'mongoose';
import { Role, isTenantScopedRole } from '@ues/shared';
import { AppError } from '../utils/app-error.js';
import { verifyAccessToken } from '../utils/tokens.js';

/**
 * The authorisation chain. Three separate middlewares rather than one, because they
 * answer three different questions:
 *
 *   requireAuth   — who are you?
 *   requireRole   — are you allowed to call this endpoint at all?
 *   tenantScope   — which college's data may you see?
 *
 * Collapsing them into one function is how tenant checks end up accidentally skipped on
 * a route that only remembered to check the role.
 */

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim() || null;
}

/**
 * Verifies the access token and populates `req.auth`.
 *
 * Only the token is trusted. No user lookup happens here: that would add a database
 * round trip to every single request, which is the whole point of a stateless access
 * token. The 15-minute lifetime bounds how long a revoked user stays usable, and
 * anything genuinely sensitive re-reads the user itself.
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    next(AppError.unauthenticated('No access token was provided.'));
    return;
  }

  const payload = verifyAccessToken(token);

  if (!Types.ObjectId.isValid(payload.sub)) {
    next(AppError.unauthenticated('Malformed access token.'));
    return;
  }

  req.auth = {
    userId: new Types.ObjectId(payload.sub),
    role: payload.role,
    collegeId: payload.collegeId ? new Types.ObjectId(payload.collegeId) : null,
  };

  next();
};

/**
 * Restricts a route to the given roles. Always mounted after `requireAuth`.
 *
 * Returns 403 rather than 404: the caller is known, and the endpoint's existence is not
 * a secret. That is the opposite of the cross-tenant case, where 404 is used precisely
 * because the record's existence *is* the secret.
 */
export function requireRole(...allowed: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(AppError.unauthenticated());
      return;
    }

    if (!allowed.includes(req.auth.role)) {
      next(AppError.forbidden('Your role cannot perform this action.'));
      return;
    }

    next();
  };
}

/**
 * Establishes which tenant this request may touch.
 *
 * `req.collegeId` comes from the verified token and from nowhere else. A client cannot
 * nominate its own tenant through a body field, a query parameter, or a header — that
 * is the single most important rule in the codebase, and centralising it here is what
 * makes it reviewable in one place.
 *
 * A university admin gets `null`, meaning unscoped. Every service treats null as
 * "read across all colleges", so that one bypass is explicit and greppable.
 */
export const tenantScope: RequestHandler = (req, _res, next) => {
  if (!req.auth) {
    next(AppError.unauthenticated());
    return;
  }

  if (req.auth.role === Role.UniversityAdmin) {
    req.collegeId = null;
    next();
    return;
  }

  if (isTenantScopedRole(req.auth.role) && !req.auth.collegeId) {
    // Should be unreachable: the User schema refuses to save a scoped role without a
    // college. Treated as a hard failure anyway, because degrading to an unscoped query
    // here would silently expose every tenant.
    next(AppError.forbidden('This account is not linked to a college.'));
    return;
  }

  req.collegeId = req.auth.collegeId;
  next();
};
