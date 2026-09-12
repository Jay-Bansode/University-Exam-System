import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { CorrectionStatus, Role } from '@ues/shared';
import { requireAuth, requireRole, tenantScope } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import * as corrections from '../services/correction.service.js';
import { createUploadSignature, isCloudinaryConfigured } from '../config/cloudinary.js';
import { sendSuccess } from '../utils/respond.js';
import { AppError } from '../utils/app-error.js';

const router = Router();

const idParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id'),
});

const name = z.string().trim().max(60);

/**
 * Every field is optional, but at least one must be present.
 *
 * `middleName` may legitimately be an empty string — removing a middle name is a real
 * correction — so it is not required to be non-empty like the other two.
 */
const createSchema = z
  .object({
    firstName: name.min(1, 'First name cannot be empty').optional(),
    middleName: name.optional(),
    lastName: name.min(1, 'Last name cannot be empty').optional(),
    dateOfBirth: z.iso.date().optional(),
    photoUrl: z.url().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Change at least one detail',
  });

const declineSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, 'Explain what was missing, in at least 10 characters')
    .max(500),
});

const listQuerySchema = z.object({
  status: z
    .enum([
      CorrectionStatus.Pending,
      CorrectionStatus.Approved,
      CorrectionStatus.Rejected,
    ])
    .optional(),
});

const studentOnly = [requireAuth, requireRole(Role.Student), tenantScope];

/** Reviewing tickets sits with the same roles that verify exam forms. */
const reviewers = [requireAuth, requireRole(Role.Clerk, Role.CollegeAdmin), tenantScope];

function idOf(req: Request): string {
  return (req.params as unknown as { id: string }).id;
}

/**
 * Signed parameters for a direct browser upload.
 *
 * The file goes straight from the browser to Cloudinary and never passes through this
 * API — Render's free tier has no persistent disk, and streaming an image through Node
 * would cost memory and request time for nothing. The API secret stays on the server.
 */
router.get('/uploads/photo-signature', ...studentOnly, (_req, res: Response) => {
  if (!isCloudinaryConfigured()) {
    // Reported as data rather than as an error: the caller asked whether uploads are
    // available, and "no" is a valid answer to that question.
    sendSuccess(res, { configured: false, signature: null });
    return;
  }

  sendSuccess(res, { configured: true, signature: createUploadSignature() });
});

router.post(
  '/correction-requests',
  ...studentOnly,
  validateBody(createSchema),
  async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated();

    const request = await corrections.createCorrectionRequest(req.auth.userId, req.body);

    sendSuccess(res, { request }, 201);
  },
);

router.get(
  '/correction-requests/me',
  ...studentOnly,
  async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated();

    const requests = await corrections.listMyCorrectionRequests(req.auth.userId);
    sendSuccess(res, { requests });
  },
);

router.get(
  '/correction-requests',
  ...reviewers,
  validateQuery(listQuerySchema),
  async (req: Request, res: Response) => {
    const { status } = req.query as { status?: string };

    const requests = await corrections.listCorrectionRequests(req.collegeId, {
      status,
    });

    sendSuccess(res, { requests });
  },
);

router.patch(
  '/correction-requests/:id/approve',
  ...reviewers,
  validateParams(idParamSchema),
  async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated();

    const request = await corrections.approveCorrectionRequest(
      idOf(req),
      req.collegeId,
      req.auth.userId,
    );

    sendSuccess(res, { request });
  },
);

router.patch(
  '/correction-requests/:id/decline',
  ...reviewers,
  validateParams(idParamSchema),
  validateBody(declineSchema),
  async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated();

    const { reason } = req.body as { reason: string };
    const request = await corrections.declineCorrectionRequest(
      idOf(req),
      reason,
      req.collegeId,
      req.auth.userId,
    );

    sendSuccess(res, { request });
  },
);

export default router;
