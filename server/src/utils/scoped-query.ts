// `QueryFilter` is Mongoose 9's name for what was `FilterQuery` in Mongoose 8 and
// earlier. The old name no longer exists, so importing it fails to compile.
import type { QueryFilter, Types } from 'mongoose';
import { AppError } from './app-error.js';

/**
 * Layer two of tenant isolation: every filter against a college-owned collection is
 * built through here.
 *
 * Why a helper rather than a Mongoose `pre` hook? A hook looks tidier but silently
 * misses `aggregate`, `bulkWrite`, and `distinct`, so a single aggregation pipeline
 * would quietly read across every tenant. An explicit call is greppable — `scopeFilter`
 * either appears in a service or it does not, and its absence is visible in review.
 *
 * The scope is expressed as a type, so a caller cannot pass a raw string by accident.
 */
export type TenantScope = Types.ObjectId | null;

/**
 * Distinguishes "unscoped on purpose" from "middleware never ran".
 *
 * `null` is a university admin reading across colleges. `undefined` means `tenantScope`
 * was not mounted on the route, which is a wiring bug — and treating it as unscoped
 * would turn that bug into a data breach. It throws instead.
 */
export function requireScope(collegeId: TenantScope | undefined): TenantScope {
  if (collegeId === undefined) {
    throw new Error(
      'Tenant scope is missing. Mount `tenantScope` on this route before the handler.',
    );
  }
  return collegeId;
}

/**
 * Adds the tenant filter to a query.
 *
 * A university admin (`null`) gets the filter back unchanged, which is the one
 * deliberate bypass in the system.
 */
export function scopeFilter<T>(
  filter: QueryFilter<T>,
  collegeId: TenantScope | undefined,
): QueryFilter<T> {
  const scope = requireScope(collegeId);
  if (scope === null) return filter;
  return { ...filter, collegeId: scope } as QueryFilter<T>;
}

/**
 * Stamps the tenant onto a document being created, so a new record cannot be written
 * into the wrong college even if the caller supplied a `collegeId` in the body.
 *
 * A university admin must name the target college explicitly, since there is no tenant
 * on the request to infer one from.
 */
export function scopeCreate<T extends Record<string, unknown>>(
  data: T,
  collegeId: TenantScope | undefined,
): T & { collegeId: Types.ObjectId } {
  const scope = requireScope(collegeId);

  if (scope === null) {
    const supplied = data.collegeId;
    if (!supplied) {
      throw AppError.badRequest('A collegeId is required when acting across colleges.');
    }
    return data as T & { collegeId: Types.ObjectId };
  }

  // The request's own scope wins over anything in the body, always.
  return { ...data, collegeId: scope };
}
