import { Router, type Response } from 'express';
import { Role } from '@ues/shared';
import { requireAuth, requireRole } from '../middleware/auth.js';
import * as statistics from '../services/statistics.service.js';
import { sendSuccess } from '../utils/respond.js';

const router = Router();

/**
 * Cross-college statistics.
 *
 * **The only unscoped read in the system**, and the one route where `tenantScope` is
 * deliberately absent rather than merely unnecessary. `requireRole(UniversityAdmin)` is
 * therefore the whole of the protection here — worth stating plainly, because a future
 * change that widened these roles would quietly defeat the isolation every other route
 * enforces.
 */
router.get(
  '/statistics',
  requireAuth,
  requireRole(Role.UniversityAdmin),
  async (_req, res: Response) => {
    const result = await statistics.getStatistics();
    sendSuccess(res, result);
  },
);

export default router;
