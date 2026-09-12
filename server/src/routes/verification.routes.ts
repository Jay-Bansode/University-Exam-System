import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { ExamFormStatus, Role } from '@ues/shared';
import { requireAuth, requireRole, tenantScope } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import * as verification from '../services/verification.service.js';
import { sendSuccess } from '../utils/respond.js';
import { AppError } from '../utils/app-error.js';

const router = Router();

const idParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id'),
});

const queueQuerySchema = z.object({
  status: z
    .enum([
      ExamFormStatus.Draft,
      ExamFormStatus.Submitted,
      ExamFormStatus.Verified,
      ExamFormStatus.Rejected,
    ])
    .optional(),
  search: z.string().trim().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/**
 * A rejection reason is required by the schema, not merely encouraged.
 *
 * The minimum length is deliberate: "no" or "wrong" would pass a presence check while
 * telling the student nothing they can act on, and they are the only person who can fix
 * the form.
 */
const rejectSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, 'Explain what the student needs to correct, in at least 10 characters')
    .max(500),
});

/**
 * Verification is the clerk's job; the college admin can also act, since a small college
 * may have no clerk on a given day. Faculty are deliberately excluded: they decide what
 * is taught, not whether a registration is in order.
 */
const verifiers = [requireAuth, requireRole(Role.Clerk, Role.CollegeAdmin), tenantScope];

/** Reading the queue is open to any staff role, including the university tier. */
const queueReaders = [
  requireAuth,
  requireRole(Role.UniversityAdmin, Role.CollegeAdmin, Role.Faculty, Role.Clerk),
  tenantScope,
];

function idOf(req: Request): string {
  return (req.params as unknown as { id: string }).id;
}

router.get(
  '/exam-forms',
  ...queueReaders,
  validateQuery(queueQuerySchema),
  async (req: Request, res: Response) => {
    const { status, search, limit } = req.query as {
      status?: string;
      search?: string;
      limit?: number;
    };

    const result = await verification.listFormsForVerification(req.collegeId, {
      status,
      search,
      limit,
    });

    sendSuccess(res, result);
  },
);

router.patch(
  '/exam-forms/:id/verify',
  ...verifiers,
  validateParams(idParamSchema),
  async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated();

    const form = await verification.verifyForm(idOf(req), req.collegeId, req.auth.userId);

    sendSuccess(res, { form });
  },
);

router.patch(
  '/exam-forms/:id/reject',
  ...verifiers,
  validateParams(idParamSchema),
  validateBody(rejectSchema),
  async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated();

    const { reason } = req.body as { reason: string };
    const form = await verification.rejectForm(
      idOf(req),
      reason,
      req.collegeId,
      req.auth.userId,
    );

    sendSuccess(res, { form });
  },
);

export default router;
