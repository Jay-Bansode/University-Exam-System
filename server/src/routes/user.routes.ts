import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { Role } from '@ues/shared';
import { requireAuth, requireRole, tenantScope } from '../middleware/auth.js';
import { validateParams, validateQuery } from '../middleware/validate.js';
import * as userService from '../services/user.service.js';
import { sendSuccess } from '../utils/respond.js';

const router = Router();

const listQuerySchema = z.object({
  role: z.enum([Role.CollegeAdmin, Role.Faculty, Role.Clerk, Role.Student]).optional(),
  search: z.string().trim().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/**
 * Staff-only reads of user records.
 *
 * The middleware order is the security contract and is the same on both routes:
 *
 *   requireAuth  → establishes who is calling
 *   requireRole  → rejects roles that may not read other users at all
 *   tenantScope  → fixes which college's records are visible
 *
 * A student is absent from the allowed roles deliberately: a student reads their own
 * record through `/api/auth/me`, and has no business enumerating classmates.
 */
const staffOnly = [
  requireAuth,
  requireRole(Role.UniversityAdmin, Role.CollegeAdmin, Role.Faculty, Role.Clerk),
  tenantScope,
];

router.get(
  '/users',
  ...staffOnly,
  validateQuery(listQuerySchema),
  async (req: Request, res: Response) => {
    const { role, search, limit } = req.query as {
      role?: string;
      search?: string;
      limit?: number;
    };

    const users = await userService.listUsers(req.collegeId, { role, search, limit });
    sendSuccess(res, { users });
  },
);

/**
 * Express 5 types a route parameter as `string | string[] | undefined`, so it is parsed
 * rather than cast. That also narrows the id to a 24-character hex string before it
 * reaches Mongo, instead of relying on a CastError further down.
 */
const idParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id'),
});

router.get(
  '/users/:id',
  ...staffOnly,
  validateParams(idParamSchema),
  async (req: Request, res: Response) => {
    const { id } = req.params as unknown as { id: string };
    const user = await userService.getUserById(id, req.collegeId);
    sendSuccess(res, { user });
  },
);

export default router;
