import type { Request, Response } from 'express';
import type { DemoAccount } from '@ues/shared';
import { ROLE_LABELS } from '@ues/shared';
import { UserModel } from '../models/user.model.js';
import { env } from '../config/env.js';
import { sendSuccess } from '../utils/respond.js';

/**
 * Lists the seeded demo accounts for the login page.
 *
 * There is no public signup — admins create accounts — which would otherwise leave a
 * recruiter with a login form and no way in. These accounts solve that.
 *
 * Two things keep this from being a hole:
 *   1. The query filters on `isDemo: true`, so only deliberately-public accounts appear.
 *      A real user cannot be listed here even if someone adds one to the seed by mistake.
 *   2. Every demo account shares one password from `SEED_DEMO_PASSWORD`, which is used
 *      nowhere else.
 *
 * Ordering puts the university admin first, then each college's staff, so the tenant
 * boundary is the first thing a visitor notices.
 */
const ROLE_ORDER: Record<string, number> = {
  universityAdmin: 0,
  collegeAdmin: 1,
  faculty: 2,
  clerk: 3,
  student: 4,
};

export async function demoAccountsHandler(_req: Request, res: Response): Promise<void> {
  const users = await UserModel.find({ isDemo: true, isActive: true })
    .select('email role firstName lastName collegeId')
    .populate('collegeId', 'name code')
    .lean();

  const accounts: DemoAccount[] = users
    .map((user) => {
      const college = user.collegeId as unknown as {
        name?: string;
        code?: string;
      } | null;

      return {
        email: user.email,
        password: env.SEED_DEMO_PASSWORD,
        role: user.role,
        label: ROLE_LABELS[user.role] ?? user.role,
        collegeName: college?.name ?? null,
      };
    })
    .sort((a, b) => {
      const byRole = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9);
      if (byRole !== 0) return byRole;
      return (a.collegeName ?? '').localeCompare(b.collegeName ?? '');
    });

  sendSuccess(res, { accounts });
}
