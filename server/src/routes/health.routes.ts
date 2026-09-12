import { Router } from 'express';
import type { HealthResponse } from '@ues/shared';
import { getDatabaseState } from '../config/database.js';
import { env } from '../config/env.js';
import { sendSuccess } from '../utils/respond.js';

const router = Router();

/**
 * GET /api/health
 *
 * Reports the database state as well as the process state. A health check that only
 * proves Express is listening is close to worthless: the interesting failure is an app
 * that answers requests while its database connection is gone.
 *
 * `uptimeSeconds` is included because the API runs on Render's free tier, which sleeps
 * after 15 minutes of inactivity. A near-zero uptime tells the client it just paid for
 * a cold start, and the UI uses that to explain the delay rather than looking broken.
 */
router.get('/health', (_req, res) => {
  const payload: HealthResponse = {
    status: 'ok',
    service: 'university-exam-system-api',
    version: process.env.npm_package_version ?? '0.1.0',
    environment: env.NODE_ENV,
    database: getDatabaseState(),
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  };

  sendSuccess(res, payload);
});

export default router;
