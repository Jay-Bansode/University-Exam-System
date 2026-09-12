import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import collegeRoutes from './college.routes.js';
import syllabusRoutes from './syllabus.routes.js';
import enrolmentRoutes from './enrolment.routes.js';
import offeringRoutes from './offering.routes.js';
import examFormRoutes from './exam-form.routes.js';
import verificationRoutes from './verification.routes.js';
import correctionRoutes from './correction.routes.js';
import statisticsRoutes from './statistics.routes.js';

/**
 * The API's route table. Every feature router is mounted here and nowhere else, so
 * this file is the one place that answers "what endpoints exist?".
 */
const router = Router();

router.use(healthRoutes);
router.use(authRoutes);
router.use(userRoutes);
router.use(collegeRoutes);
router.use(syllabusRoutes);
router.use(enrolmentRoutes);
router.use(offeringRoutes);
// Registered after the exam-form router, whose `/exam-forms/me` routes must be matched
// before that router's own `/exam-forms/:id`. Express matches in registration order.
router.use(examFormRoutes);
router.use(verificationRoutes);
router.use(correctionRoutes);
router.use(statisticsRoutes);

export default router;
