import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { ApiErrorCode } from '@ues/shared';
import {
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
} from '../controllers/auth.controller.js';
import { demoAccountsHandler } from '../controllers/demo.controller.js';
import { validateBody } from '../middleware/validate.js';
import { loginSchema } from '../validators/auth.validators.js';
import { requireAuth } from '../middleware/auth.js';
import { isTest } from '../config/env.js';

const router = Router();

/**
 * Rate limiting on the credential endpoint.
 *
 * Without it, the login route is an open door for credential stuffing: bcrypt slows a
 * single guess but does nothing about volume. Ten attempts per fifteen minutes per IP
 * is loose enough for a student mistyping a password and tight enough to make automated
 * guessing pointless.
 *
 * Disabled under test so the suite is not throttled by its own login calls.
 */
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => isTest,
  // Counts only failures, so a legitimate user signing in repeatedly is unaffected.
  skipSuccessfulRequests: true,
  message: {
    success: false,
    error: {
      code: ApiErrorCode.RateLimited,
      message: 'Too many sign-in attempts. Please try again in a few minutes.',
    },
  },
});

router.post('/auth/login', loginRateLimit, validateBody(loginSchema), loginHandler);

// No `requireAuth`: the access token has usually expired by the time this is called.
// The httpOnly refresh cookie is the credential, and the service verifies it.
router.post('/auth/refresh', refreshHandler);

router.post('/auth/logout', logoutHandler);

router.get('/auth/me', requireAuth, meHandler);

router.get('/auth/demo-accounts', demoAccountsHandler);

export default router;
