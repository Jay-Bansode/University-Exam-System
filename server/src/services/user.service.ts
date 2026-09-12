import { Types } from 'mongoose';
import type { AuthUser, ManagedUser } from '@ues/shared';
import { UserModel, type UserDocument } from '../models/user.model.js';
import { AppError } from '../utils/app-error.js';
import { scopeFilter, type TenantScope } from '../utils/scoped-query.js';
import { toAuthUser, toManagedUser } from './user.mapper.js';

/**
 * Reads of user records, always through the tenant scope.
 *
 * Note what is *not* here: a plain `UserModel.findById(id)`. Fetching by id alone is the
 * classic multi-tenant bug — the id is valid, the record is found, and it belongs to
 * somebody else's college. Every read below goes through `scopeFilter`, so the tenant is
 * part of the query rather than an afterthought checked once the document is in hand.
 */

export async function getUserById(
  id: string,
  collegeId: TenantScope | undefined,
): Promise<AuthUser> {
  // Checked before querying: an invalid ObjectId would otherwise throw a CastError,
  // and a 400 would confirm the difference between "malformed" and "not yours".
  if (!Types.ObjectId.isValid(id)) throw AppError.notFound('User not found.');

  const user = (await UserModel.findOne(
    scopeFilter({ _id: new Types.ObjectId(id) }, collegeId),
  )
    .populate('collegeId', 'name code isActive')
    .populate('studentProfile.streamId', 'name')) as UserDocument | null;

  // 404 rather than 403 for another college's user. A 403 would confirm the record
  // exists, which is exactly what must not leak across a tenant boundary.
  if (!user) throw AppError.notFound('User not found.');

  return toAuthUser(user);
}

/**
 * Lists users in the caller's college, optionally filtered by role and a name search.
 *
 * The search is a case-insensitive prefix match on first or last name, which the
 * `{ collegeId, role, lastName, firstName }` index can serve. A leading-wildcard regex
 * would force a full collection scan instead.
 *
 * Returns the shared `ManagedUser` shape — the same type the college admin's roster
 * uses — so there is one list representation rather than a thin one here and a rich one
 * elsewhere that drift apart.
 */
export async function listUsers(
  collegeId: TenantScope | undefined,
  options: { role?: string; search?: string; limit?: number } = {},
): Promise<ManagedUser[]> {
  const filter: Record<string, unknown> = {};

  if (options.role) filter.role = options.role;

  if (options.search?.trim()) {
    // Escaped so a user typing `.*` cannot inject a pathological pattern.
    const escaped = options.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const prefix = new RegExp(`^${escaped}`, 'i');
    filter.$or = [{ firstName: prefix }, { lastName: prefix }];
  }

  const users = (await UserModel.find(scopeFilter(filter, collegeId))
    .populate('studentProfile.streamId', 'name code')
    .sort({ lastName: 1, firstName: 1 })
    .limit(Math.min(options.limit ?? 50, 100))) as UserDocument[];

  return users.map(toManagedUser);
}
