import { Router } from 'express';
import { Role } from '@ues/shared';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import {
  collegeStatusSchema,
  createCollegeAdminSchema,
  createCollegeSchema,
  objectIdParamSchema,
  updateCollegeSchema,
} from '../validators/college.validators.js';
import {
  createCollegeAdminHandler,
  createCollegeHandler,
  deleteCollegeHandler,
  getCollegeHandler,
  listCollegesHandler,
  setCollegeStatusHandler,
  updateCollegeHandler,
} from '../controllers/college.controller.js';

const router = Router();

/**
 * College management — university admin only.
 *
 * `tenantScope` is deliberately absent from every route here. A college *is* the tenant,
 * so scoping these reads to a tenant would be circular; the guard that matters is
 * `requireRole(UniversityAdmin)`, which is applied to all of them at once below.
 */
const universityAdminOnly = [requireAuth, requireRole(Role.UniversityAdmin)];

router.get('/colleges', ...universityAdminOnly, listCollegesHandler);

router.post(
  '/colleges',
  ...universityAdminOnly,
  validateBody(createCollegeSchema),
  createCollegeHandler,
);

router.get(
  '/colleges/:id',
  ...universityAdminOnly,
  validateParams(objectIdParamSchema),
  getCollegeHandler,
);

router.patch(
  '/colleges/:id',
  ...universityAdminOnly,
  validateParams(objectIdParamSchema),
  validateBody(updateCollegeSchema),
  updateCollegeHandler,
);

/**
 * Status lives on its own route rather than as a field on PATCH /colleges/:id.
 * Deactivating a college signs out every one of its users, which is too consequential to
 * happen as a side effect of an edit form submitting an untouched checkbox.
 */
router.patch(
  '/colleges/:id/status',
  ...universityAdminOnly,
  validateParams(objectIdParamSchema),
  validateBody(collegeStatusSchema),
  setCollegeStatusHandler,
);

router.delete(
  '/colleges/:id',
  ...universityAdminOnly,
  validateParams(objectIdParamSchema),
  deleteCollegeHandler,
);

router.post(
  '/colleges/:id/admins',
  ...universityAdminOnly,
  validateParams(objectIdParamSchema),
  validateBody(createCollegeAdminSchema),
  createCollegeAdminHandler,
);

export default router;
