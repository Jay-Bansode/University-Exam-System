import bcrypt from 'bcryptjs';
import { type Types } from 'mongoose';
import type { AuthUser } from '@ues/shared';
import { Role } from '@ues/shared';
import { UserModel, type UserDocument } from '../models/user.model.js';
import { RefreshTokenModel } from '../models/refresh-token.model.js';
import { CollegeModel } from '../models/college.model.js';
import { AppError } from '../utils/app-error.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
} from '../utils/tokens.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  BCRYPT_ROUNDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from '../config/auth.js';
import { toAuthUser } from './user.mapper.js';

/**
 * Authentication logic. Deliberately free of `req` and `res` so it can be tested
 * directly, and so an HTTP concern can never leak into a security decision.
 */

export type IssuedSession = {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/**
 * Issues an access token plus a fresh refresh token, and records the refresh token's
 * hash so the session can later be revoked.
 */
async function issueSession(
  user: UserDocument,
  userAgent: string | null,
): Promise<IssuedSession> {
  const refreshToken = generateRefreshToken();

  await RefreshTokenModel.create({
    userId: user._id,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    userAgent: userAgent?.slice(0, 300) ?? null,
  });

  const accessToken = signAccessToken({
    sub: String(user._id),
    role: user.role,
    collegeId: user.collegeId ? String(user.collegeId._id ?? user.collegeId) : null,
  });

  return {
    user: toAuthUser(user),
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}

/**
 * Verifies credentials and starts a session.
 *
 * Every failure path returns the same message. Saying "no such user" versus "wrong
 * password" would let anyone enumerate valid email addresses, and on a system whose
 * users are students at a named college that is a real privacy problem.
 *
 * A dummy bcrypt comparison runs when the user does not exist so that a missing account
 * takes about as long as a wrong password. Without it, response timing alone reveals
 * which addresses are registered.
 */
export async function login(
  email: string,
  password: string,
  userAgent: string | null,
): Promise<IssuedSession> {
  const genericFailure = AppError.unauthenticated('Incorrect email or password.');

  const user = (await UserModel.findOne({ email: email.toLowerCase().trim() })
    .select('+passwordHash')
    .populate('collegeId', 'name code isActive')
    .populate('studentProfile.streamId', 'name')) as UserDocument | null;

  if (!user) {
    await bcrypt.compare(
      password,
      '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinv',
    );
    throw genericFailure;
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) throw genericFailure;

  if (!user.isActive) {
    throw AppError.forbidden('This account has been deactivated.');
  }

  // A deactivated college locks out all of its staff and students at once, without
  // touching a single user record.
  const college = user.collegeId as unknown as { isActive?: boolean } | null;
  if (user.role !== Role.UniversityAdmin && college && college.isActive === false) {
    throw AppError.forbidden('This college is not currently active.');
  }

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  return issueSession(user, userAgent);
}

/**
 * Rotates a refresh token: the presented token is revoked and a new one issued.
 *
 * Rotation is what makes theft detectable. A stolen token works exactly once, and when
 * the legitimate holder next refreshes, their now-revoked token is replayed — which is
 * the signal handled below.
 */
export async function refreshSession(
  rawToken: string | undefined,
  userAgent: string | null,
): Promise<IssuedSession> {
  if (!rawToken) throw AppError.unauthenticated('No refresh token was provided.');

  const tokenHash = hashRefreshToken(rawToken);
  const stored = await RefreshTokenModel.findOne({ tokenHash });

  if (!stored) throw AppError.unauthenticated('Invalid refresh token.');

  /**
   * Replay detection. This token was already rotated, so two parties hold it and one of
   * them is an attacker. There is no way to tell which, so every session for the user
   * is dropped and both are forced to sign in again.
   */
  if (stored.revokedAt) {
    await RefreshTokenModel.updateMany(
      { userId: stored.userId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    throw AppError.unauthenticated('This session has been ended for security reasons.');
  }

  if (stored.expiresAt.getTime() <= Date.now()) {
    throw AppError.unauthenticated('Your session has expired.');
  }

  const user = (await UserModel.findById(stored.userId)
    .populate('collegeId', 'name code isActive')
    .populate('studentProfile.streamId', 'name')) as UserDocument | null;

  if (!user || !user.isActive) {
    throw AppError.unauthenticated('This account is no longer active.');
  }

  /**
   * Re-checked on every refresh, not only at login. Deactivating a college revokes its
   * users' stored refresh tokens, so this is belt and braces — but a session must never
   * be renewable for a college that is no longer affiliated, whatever route it arrived by.
   *
   * The remaining window is a live access token, valid for up to 15 minutes after
   * deactivation. That is the accepted cost of stateless access tokens: checking the
   * database on every request would remove it, and remove the point of them.
   */
  const refreshCollege = user.collegeId as unknown as { isActive?: boolean } | null;
  if (user.role !== Role.UniversityAdmin && refreshCollege?.isActive === false) {
    throw AppError.unauthenticated('This college is not currently active.');
  }

  const session = await issueSession(user, userAgent);

  stored.revokedAt = new Date();
  stored.replacedByHash = hashRefreshToken(session.refreshToken);
  await stored.save();

  return session;
}

/** Revokes one session. Silent when the token is already gone — logout is idempotent. */
export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;

  await RefreshTokenModel.updateOne(
    { tokenHash: hashRefreshToken(rawToken), revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

/** Loads the signed-in user afresh, so a role or profile change is reflected at once. */
export async function getCurrentUser(userId: Types.ObjectId): Promise<AuthUser> {
  const user = (await UserModel.findById(userId)
    .populate('collegeId', 'name code isActive')
    .populate('studentProfile.streamId', 'name')) as UserDocument | null;

  if (!user || !user.isActive) throw AppError.unauthenticated('Account not found.');

  return toAuthUser(user);
}

/** Ensures a college exists and is usable before a user is attached to it. */
export async function assertActiveCollege(collegeId: Types.ObjectId): Promise<void> {
  const college = await CollegeModel.findById(collegeId).select('isActive');
  if (!college) throw AppError.notFound('College not found.');
  if (!college.isActive) throw AppError.badRequest('That college is not active.');
}
