import type { Express } from 'express';
import request from 'supertest';
import { EntryType, ProgramType, Role } from '@ues/shared';
import { CollegeModel } from '../../src/models/college.model.js';
import { UserModel } from '../../src/models/user.model.js';
import { hashPassword } from '../../src/services/auth.service.js';

/**
 * Builds a miniature two-college university for tests.
 *
 * Two colleges is the whole point: a single-tenant fixture cannot prove isolation,
 * because there is no second tenant's data to accidentally leak.
 */

export const TEST_PASSWORD = 'TestPass123';

export type TestWorld = Awaited<ReturnType<typeof seedTestWorld>>;

export async function seedTestWorld() {
  const passwordHash = await hashPassword(TEST_PASSWORD);

  const [alpha, beta] = await CollegeModel.create([
    { name: 'Alpha College of Engineering', code: 'ALPHA' },
    { name: 'Beta Institute of Technology', code: 'BETA' },
  ]);

  const make = async (
    email: string,
    role: Role,
    collegeId: unknown,
    extra: Record<string, unknown> = {},
  ) =>
    UserModel.create({
      email,
      passwordHash,
      firstName: 'Test',
      lastName: role,
      role,
      collegeId,
      ...extra,
    });

  const universityAdmin = await make('uni@test.local', Role.UniversityAdmin, null);

  const alphaClerk = await make('clerk@alpha.test', Role.Clerk, alpha!._id);
  const alphaStudent = await make('student@alpha.test', Role.Student, alpha!._id, {
    studentProfile: {
      rollNumber: 'A001',
      programType: ProgramType.BE,
      entryType: EntryType.Regular,
      currentSemester: 5,
    },
  });

  const betaClerk = await make('clerk@beta.test', Role.Clerk, beta!._id);
  const betaStudent = await make('student@beta.test', Role.Student, beta!._id, {
    studentProfile: {
      rollNumber: 'B001',
      programType: ProgramType.BE,
      entryType: EntryType.Lateral,
      currentSemester: 3,
    },
  });

  return {
    alpha: alpha!,
    beta: beta!,
    universityAdmin,
    alphaClerk,
    alphaStudent,
    betaClerk,
    betaStudent,
  };
}

/** Logs in and returns the access token, the way a real client would obtain one. */
export async function loginAs(app: Express, email: string): Promise<string> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: TEST_PASSWORD });

  if (response.status !== 200) {
    throw new Error(
      `Login failed for ${email}: ${response.status} ${JSON.stringify(response.body)}`,
    );
  }

  return response.body.data.accessToken as string;
}

export function bearer(token: string): [string, string] {
  return ['Authorization', `Bearer ${token}`];
}
