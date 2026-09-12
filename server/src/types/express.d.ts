import type { Role } from '@ues/shared';
import type { Types } from 'mongoose';

/**
 * Adds the authenticated context to Express's `Request`.
 *
 * Declaration merging into Express's own interface means `req.auth` is typed in every
 * handler with no casting, and referring to it on a route that never ran `requireAuth`
 * is still a compile-time possibility — hence the deliberate `undefined` in the union,
 * which forces each handler to acknowledge the unauthenticated case.
 */
declare global {
  namespace Express {
    interface AuthContext {
      userId: Types.ObjectId;
      role: Role;
      /** Null only for a university admin. */
      collegeId: Types.ObjectId | null;
    }

    interface Request {
      auth?: AuthContext;
      /**
       * The tenant every college-scoped query must be filtered by. Set by
       * `tenantScope` from the verified token — never from the body, query, or a
       * header. Null means the caller is a university admin reading across tenants.
       */
      collegeId?: Types.ObjectId | null;
    }
  }
}

export {};
