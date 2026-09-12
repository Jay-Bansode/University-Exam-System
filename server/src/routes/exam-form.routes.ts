import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { Role } from '@ues/shared';
import { requireAuth, requireRole, tenantScope } from '../middleware/auth.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import * as examForms from '../services/exam-form.service.js';
import { sendSuccess } from '../utils/respond.js';
import { AppError } from '../utils/app-error.js';

const router = Router();

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id');

const subjectSelectionSchema = z.object({
  // Bounded for the same reason as an offering: a semester runs to about nine subjects,
  // so anything near this is a mistake rather than a legitimate registration.
  subjectIds: z.array(objectId).max(20),
});

const idParamSchema = z.object({ id: objectId });

/**
 * Exam forms.
 *
 * The `/me` routes are student-only and take no id: the form is found from the token, so
 * there is no parameter a student could change to reach someone else's registration.
 * Reading a form by id is available to staff as well, tenant-scoped as usual.
 */
const studentOnly = [requireAuth, requireRole(Role.Student), tenantScope];

const studentOrStaff = [
  requireAuth,
  requireRole(
    Role.UniversityAdmin,
    Role.CollegeAdmin,
    Role.Faculty,
    Role.Clerk,
    Role.Student,
  ),
  tenantScope,
];

router.get('/exam-forms/me', ...studentOnly, async (req: Request, res: Response) => {
  if (!req.auth) throw AppError.unauthenticated();

  const result = await examForms.getMyExamForm(req.auth.userId);
  sendSuccess(res, result);
});

router.get(
  '/exam-forms/me/history',
  ...studentOnly,
  async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated();

    const forms = await examForms.listMyExamForms(req.auth.userId);
    sendSuccess(res, { forms });
  },
);

/**
 * Saving a draft is deliberately allowed before the window opens. Preparing early is
 * reasonable; only submission is time-bound.
 */
router.put(
  '/exam-forms/me/draft',
  ...studentOnly,
  validateBody(subjectSelectionSchema),
  async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated();

    const { subjectIds } = req.body as { subjectIds: string[] };
    const form = await examForms.saveDraft(req.auth.userId, subjectIds);

    sendSuccess(res, { form });
  },
);

router.post(
  '/exam-forms/me/submit',
  ...studentOnly,
  validateBody(subjectSelectionSchema),
  async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated();

    const { subjectIds } = req.body as { subjectIds: string[] };
    const form = await examForms.submitForm(req.auth.userId, subjectIds);

    sendSuccess(res, { form });
  },
);

router.get(
  '/exam-forms/:id',
  ...studentOrStaff,
  validateParams(idParamSchema),
  async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated();

    const { id } = req.params as unknown as { id: string };
    const form = await examForms.getExamFormById(
      id,
      { userId: req.auth.userId, role: req.auth.role },
      req.collegeId,
    );

    sendSuccess(res, { form });
  },
);

export default router;
