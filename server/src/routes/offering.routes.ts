import { Router, type Request, type Response } from 'express';
import { Role } from '@ues/shared';
import { requireAuth, requireRole, tenantScope } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import {
  listOfferingsQuerySchema,
  objectIdParamSchema,
  offerableSubjectsQuerySchema,
  saveOfferingSchema,
} from '../validators/offering.validators.js';
import * as offerings from '../services/offering.service.js';
import { sendSuccess } from '../utils/respond.js';
import { AppError } from '../utils/app-error.js';

const router = Router();

/**
 * Semester offerings.
 *
 * Faculty and the college admin compose them; clerks and students read them, because a
 * student needs to know which subjects their exam form will offer. Everything is
 * tenant-scoped, so an offering belongs to exactly one college.
 *
 * Note what is missing: there is no route here that creates a `Subject`. Faculty select
 * from the university's catalogue and can do nothing else with it, which makes "faculty
 * cannot invent a subject" a property of the routing table rather than a check.
 */
const collegeMembers = [
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

const facultyOrCollegeAdmin = [
  requireAuth,
  requireRole(Role.CollegeAdmin, Role.Faculty),
  tenantScope,
];

router.get(
  '/offerings',
  ...collegeMembers,
  validateQuery(listOfferingsQuerySchema),
  async (req: Request, res: Response) => {
    const { streamId, semester, academicYear } = req.query as {
      streamId?: string;
      semester?: number;
      academicYear?: string;
    };

    const result = await offerings.listOfferings(req.collegeId, {
      streamId,
      semester,
      academicYear,
    });

    sendSuccess(res, { offerings: result });
  },
);

/**
 * The subjects available to put in an offering, for a given stream and semester.
 *
 * Separate from `GET /subjects` because this one is tenant-checked: it refuses a stream
 * the college does not actually offer, so the picker cannot show subjects for a branch
 * this college does not teach.
 */
router.get(
  '/offerings/available-subjects',
  ...facultyOrCollegeAdmin,
  validateQuery(offerableSubjectsQuerySchema),
  async (req: Request, res: Response) => {
    const { streamId, semester } = req.query as unknown as {
      streamId: string;
      semester: number;
    };

    const subjects = await offerings.listOfferableSubjects(
      streamId,
      semester,
      req.collegeId,
    );

    sendSuccess(res, { subjects });
  },
);

/**
 * Upsert. One offering exists per college, stream, semester and academic year, so
 * "save what we teach for semester 5" is a single intention rather than a choice between
 * create and update that the caller has to work out.
 */
router.put(
  '/offerings',
  ...facultyOrCollegeAdmin,
  validateBody(saveOfferingSchema),
  async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated();

    const offering = await offerings.saveOffering(
      req.body,
      req.collegeId,
      req.auth.userId,
    );

    sendSuccess(res, { offering });
  },
);

router.delete(
  '/offerings/:id',
  ...facultyOrCollegeAdmin,
  validateParams(objectIdParamSchema),
  async (req: Request, res: Response) => {
    const { id } = req.params as unknown as { id: string };
    await offerings.deleteOffering(id, req.collegeId);
    sendSuccess(res, { deleted: true });
  },
);

export default router;
