import { Router, type Request, type Response } from 'express';
import { Role } from '@ues/shared';
import { requireAuth, requireRole, tenantScope } from '../middleware/auth.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import {
  addCollegeStreamSchema,
  createUserSchema,
  objectIdParamSchema,
  updateUserSchema,
  userStatusSchema,
} from '../validators/enrolment.validators.js';
import * as enrolment from '../services/enrolment.service.js';
import { sendSuccess } from '../utils/respond.js';
import { AppError } from '../utils/app-error.js';

const router = Router();

/**
 * College-level people and programme management.
 *
 * Note that `tenantScope` is mounted on **every** route here, unlike the syllabus routes
 * where nothing is college-owned. That middleware is what fixes which college the caller
 * may act on, taken from their verified token — so a college admin cannot enrol a
 * student into somebody else's college even by sending its id.
 *
 * A faculty member or clerk can read the roster but cannot change it; only the college
 * admin writes.
 */
const collegeStaffRead = [
  requireAuth,
  requireRole(Role.UniversityAdmin, Role.CollegeAdmin, Role.Faculty, Role.Clerk),
  tenantScope,
];

const collegeAdminOnly = [requireAuth, requireRole(Role.CollegeAdmin), tenantScope];

function idOf(req: Request): string {
  return (req.params as unknown as { id: string }).id;
}

/* --------------------------------------------------------- college streams */

router.get('/college-streams', ...collegeStaffRead, async (req, res: Response) => {
  const streams = await enrolment.listCollegeStreams(req.collegeId);
  sendSuccess(res, { streams });
});

router.post(
  '/college-streams',
  ...collegeAdminOnly,
  validateBody(addCollegeStreamSchema),
  async (req: Request, res: Response) => {
    const streams = await enrolment.addCollegeStream(req.body, req.collegeId);
    sendSuccess(res, { streams }, 201);
  },
);

router.delete(
  '/college-streams/:id',
  ...collegeAdminOnly,
  validateParams(objectIdParamSchema),
  async (req: Request, res: Response) => {
    await enrolment.removeCollegeStream(idOf(req), req.collegeId);
    sendSuccess(res, { removed: true });
  },
);

/* ------------------------------------------------------------------ people */

router.post(
  '/users',
  ...collegeAdminOnly,
  validateBody(createUserSchema),
  async (req: Request, res: Response) => {
    const result = await enrolment.createUser(req.body, req.collegeId);
    sendSuccess(res, result, 201);
  },
);

router.patch(
  '/users/:id',
  ...collegeAdminOnly,
  validateParams(objectIdParamSchema),
  validateBody(updateUserSchema),
  async (req: Request, res: Response) => {
    const user = await enrolment.updateUser(idOf(req), req.body, req.collegeId);
    sendSuccess(res, { user });
  },
);

/**
 * Status is its own route rather than a field on the edit form, matching the college
 * status endpoint: deactivating someone signs them out immediately, which should be a
 * deliberate act rather than a side effect of saving a name change.
 */
router.patch(
  '/users/:id/status',
  ...collegeAdminOnly,
  validateParams(objectIdParamSchema),
  validateBody(userStatusSchema),
  async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated();

    const { isActive } = req.body as { isActive: boolean };
    const user = await enrolment.setUserStatus(
      idOf(req),
      isActive,
      req.collegeId,
      req.auth.userId,
    );

    sendSuccess(res, { user });
  },
);

router.post(
  '/users/:id/reset-password',
  ...collegeAdminOnly,
  validateParams(objectIdParamSchema),
  async (req: Request, res: Response) => {
    const temporaryPassword = await enrolment.resetUserPassword(idOf(req), req.collegeId);
    sendSuccess(res, { temporaryPassword });
  },
);

export default router;
