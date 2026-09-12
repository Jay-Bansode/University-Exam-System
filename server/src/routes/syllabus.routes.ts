import { Router, type Request, type Response } from 'express';
import { Role } from '@ues/shared';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import {
  createExamWindowSchema,
  createStreamSchema,
  createSubjectSchema,
  listSubjectsQuerySchema,
  objectIdParamSchema,
  updateExamWindowSchema,
  updateStreamSchema,
  updateSubjectSchema,
} from '../validators/syllabus.validators.js';
import * as syllabus from '../services/syllabus.service.js';
import * as examWindows from '../services/exam-window.service.js';
import { sendSuccess } from '../utils/respond.js';

const router = Router();

/**
 * Syllabus and exam windows.
 *
 * The access split is the point of this phase:
 *
 *   **Reading** is open to any signed-in user. The syllabus is public information inside
 *   the university — faculty need the catalogue to build offerings, students need subject
 *   names on their forms, and everyone needs to know whether registration is open.
 *
 *   **Writing** is university-admin only. That single restriction is what makes this an
 *   affiliated university rather than a collection of colleges each inventing its own
 *   curriculum. It is enforced here, not in the UI.
 *
 * None of these routes are tenant-scoped, because none of this data belongs to a college.
 */
const anySignedInUser = [requireAuth];
const universityAdminOnly = [requireAuth, requireRole(Role.UniversityAdmin)];

function idOf(req: Request): string {
  return (req.params as unknown as { id: string }).id;
}

/* ------------------------------------------------------------------ streams */

router.get('/streams', ...anySignedInUser, async (_req, res: Response) => {
  const streams = await syllabus.listStreams();
  sendSuccess(res, { streams });
});

router.post(
  '/streams',
  ...universityAdminOnly,
  validateBody(createStreamSchema),
  async (req: Request, res: Response) => {
    const stream = await syllabus.createStream(req.body);
    sendSuccess(res, { stream }, 201);
  },
);

router.patch(
  '/streams/:id',
  ...universityAdminOnly,
  validateParams(objectIdParamSchema),
  validateBody(updateStreamSchema),
  async (req: Request, res: Response) => {
    const stream = await syllabus.updateStream(idOf(req), req.body);
    sendSuccess(res, { stream });
  },
);

router.delete(
  '/streams/:id',
  ...universityAdminOnly,
  validateParams(objectIdParamSchema),
  async (req: Request, res: Response) => {
    await syllabus.deleteStream(idOf(req));
    sendSuccess(res, { deleted: true });
  },
);

/* ----------------------------------------------------------------- subjects */

router.get(
  '/subjects',
  ...anySignedInUser,
  validateQuery(listSubjectsQuerySchema),
  async (req: Request, res: Response) => {
    const { streamId, semester } = req.query as {
      streamId?: string;
      semester?: number;
    };

    const subjects = await syllabus.listSubjects({ streamId, semester });
    sendSuccess(res, { subjects });
  },
);

router.post(
  '/subjects',
  ...universityAdminOnly,
  validateBody(createSubjectSchema),
  async (req: Request, res: Response) => {
    const subject = await syllabus.createSubject(req.body);
    sendSuccess(res, { subject }, 201);
  },
);

router.patch(
  '/subjects/:id',
  ...universityAdminOnly,
  validateParams(objectIdParamSchema),
  validateBody(updateSubjectSchema),
  async (req: Request, res: Response) => {
    const subject = await syllabus.updateSubject(idOf(req), req.body);
    sendSuccess(res, { subject });
  },
);

router.delete(
  '/subjects/:id',
  ...universityAdminOnly,
  validateParams(objectIdParamSchema),
  async (req: Request, res: Response) => {
    await syllabus.deleteSubject(idOf(req));
    sendSuccess(res, { deleted: true });
  },
);

/* ------------------------------------------------------------ exam windows */

router.get('/exam-windows', ...anySignedInUser, async (_req, res: Response) => {
  const windows = await examWindows.listExamWindows();
  sendSuccess(res, { windows });
});

router.post(
  '/exam-windows',
  ...universityAdminOnly,
  validateBody(createExamWindowSchema),
  async (req: Request, res: Response) => {
    const window = await examWindows.createExamWindow(req.body);
    sendSuccess(res, { window }, 201);
  },
);

router.patch(
  '/exam-windows/:id',
  ...universityAdminOnly,
  validateParams(objectIdParamSchema),
  validateBody(updateExamWindowSchema),
  async (req: Request, res: Response) => {
    const window = await examWindows.updateExamWindow(idOf(req), req.body);
    sendSuccess(res, { window });
  },
);

router.delete(
  '/exam-windows/:id',
  ...universityAdminOnly,
  validateParams(objectIdParamSchema),
  async (req: Request, res: Response) => {
    await examWindows.deleteExamWindow(idOf(req));
    sendSuccess(res, { deleted: true });
  },
);

export default router;
