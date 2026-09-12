import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Role } from '@ues/shared';
import { env } from '../config/env.js';
import { ACCESS_TOKEN_TTL_SECONDS } from '../config/auth.js';
import { AppError } from './app-error.js';

/**
 * Token creation and verification.
 *
 * Two different mechanisms on purpose:
 *
 *   Access token  — a signed JWT. Stateless, so authorising a request needs no database
 *                   round trip. The cost of statelessness is that it cannot be revoked,
 *                   which is why it lives only 15 minutes.
 *   Refresh token — opaque random bytes, stored hashed. Not a JWT, because its whole
 *                   purpose is to be revocable, and a JWT cannot be.
 */

export type AccessTokenPayload = {
  /** User id. `sub` is the registered JWT claim for the subject. */
  sub: string;
  role: Role;
  /** Null for a university admin, who is not confined to one tenant. */
  collegeId: string | null;
};

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    issuer: 'ues-api',
    audience: 'ues-client',
  });
}

/**
 * Verifies an access token and returns its claims.
 *
 * `issuer` and `audience` are checked, not just the signature. Without that, a token
 * signed by this key for some other purpose would be accepted here.
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: 'ues-api',
      audience: 'ues-client',
      algorithms: ['HS256'],
    });

    if (typeof decoded === 'string' || !decoded.sub) {
      throw AppError.unauthenticated('Malformed access token.');
    }

    return {
      sub: String(decoded.sub),
      role: (decoded as jwt.JwtPayload & { role: Role }).role,
      collegeId:
        (decoded as jwt.JwtPayload & { collegeId: string | null }).collegeId ?? null,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;

    // Distinguished from a bad signature so the client knows a silent refresh is worth
    // attempting, rather than sending the user back to the login page.
    if (error instanceof jwt.TokenExpiredError) {
      throw AppError.tokenExpired();
    }

    throw AppError.unauthenticated('Invalid access token.');
  }
}

/**
 * A new refresh token: 256 bits from the OS CSPRNG, base64url encoded.
 *
 * `randomBytes`, never `Math.random`. `Math.random` is seeded predictably and is not a
 * cryptographic source — a token from it can be guessed.
 */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Hashes a refresh token for storage and lookup.
 *
 * SHA-256 rather than bcrypt: the input is already 256 bits of randomness, so there is
 * no weak password to slow an attacker down, and refresh is a hot path. It is also
 * deterministic, which bcrypt is not, so the hash can be looked up directly by index.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
