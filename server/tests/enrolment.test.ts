import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { EntryType, ProgramType, Role } from '@ues/shared';
import { createApp } from '../src/app.js';
import {
  clearTestDatabase,
  connectTestDatabase,
  disconnectTestDatabase,
} from './helpers/db.js';
import { bearer, loginAs, seedTestWorld, type TestWorld } from './helpers/fixtures.js';
import { StreamModel } from '../src/models/stream.model.js';
import { CollegeStreamModel } from '../src/models/college-stream.model.js';
import { UserModel } from '../src/models/user.model.js';

let app: Express;
let world: TestWorld;
let alphaAdminToken: string;
let betaAdminToken: string;
let beComputerId: string;
let diplomaId: string;

beforeAll(async () => {
  await connectTestDatabase();
  app = createApp();
});

afterAll(disconnectTestDatabase);

/**
 * The fixture has no college admins, so this phase adds one per college. Two are needed
 * because the point of most of these tests is that one cannot touch the other's college.
 */
async function createCollegeAdmin(collegeId: unknown, email: string) {
  const { hashPassword } = await import('../src/services/auth.service.js');

  await UserModel.create({
    email,
    passwordHash: await hashPassword('TestPass123'),
    firstName: 'College',
    lastName: 'Admin',
    role: Role.CollegeAdmin,
    collegeId,
  });

  return loginAs(app, email);
}

beforeEach(async () => {
  await clearTestDatabase();
  world = await seedTestWorld();

  const [beComputer, diploma] = await StreamModel.create([
    { name: 'Computer Engineering', code: 'CE', programType: ProgramType.BE },
    { name: 'Computer Engineering', code: 'CE', programType: ProgramType.Diploma },
  ]);

  beComputerId = String(beComputer!._id);
  diplomaId = String(diploma!._id);

  // Alpha offers the BE stream; Beta offers nothing, so "not offered here" is testable.
  await CollegeStreamModel.create({
    collegeId: world.alpha._id,
    streamId: beComputer!._id,
  });

  alphaAdminToken = await createCollegeAdmin(world.alpha._id, 'admin@alpha.test');
  betaAdminToken = await createCollegeAdmin(world.beta._id, 'admin@beta.test');
});

/**
 * Builds a valid student payload with the given fields replaced.
 *
 * `student` is pulled out of the overrides before the top-level spread — otherwise the
 * spread would replace the whole merged sub-object with the partial one, dropping the
 * required fields and turning every override into a validation failure.
 */
function newStudent(
  overrides: Record<string, unknown> & { student?: Record<string, unknown> } = {},
) {
  const { student: studentOverrides, ...topLevel } = overrides;

  return {
    role: Role.Student,
    email: 'new.student@alpha.test',
    firstName: 'Aarav',
    lastName: 'Kulkarni',
    ...topLevel,
    student: {
      rollNumber: 'CE23001',
      streamId: beComputerId,
      entryType: EntryType.Regular,
      currentSemester: 5,
      ...(studentOverrides ?? {}),
    },
  };
}

describe('who may manage a college roster', () => {
  it('forbids a clerk from creating a user', async () => {
    const clerkToken = await loginAs(app, 'clerk@alpha.test');

    const response = await request(app)
      .post('/api/users')
      .set(...bearer(clerkToken))
      .send({
        role: Role.Faculty,
        email: 'sneak@alpha.test',
        firstName: 'S',
        lastName: 'Neak',
      })
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('forbids a student from creating a user', async () => {
    const studentToken = await loginAs(app, 'student@alpha.test');

    await request(app)
      .post('/api/users')
      .set(...bearer(studentToken))
      .send({
        role: Role.Faculty,
        email: 'sneak2@alpha.test',
        firstName: 'S',
        lastName: 'Neak',
      })
      .expect(403);
  });

  /**
   * A tenant must not be able to expand its own administration. Only the university
   * creates college admins, so these roles are absent from the request schema entirely
   * and are rejected before any handler runs.
   */
  it.each([Role.CollegeAdmin, Role.UniversityAdmin])(
    'refuses to let a college admin create a %s',
    async (role) => {
      const response = await request(app)
        .post('/api/users')
        .set(...bearer(alphaAdminToken))
        .send({
          role,
          email: 'escalate@alpha.test',
          firstName: 'Priv',
          lastName: 'Escalation',
        })
        .expect(422);

      expect(response.body.error.details.role).toBeDefined();
    },
  );

  it('lets faculty read the roster but not change it', async () => {
    const facultyToken = await loginAs(app, 'clerk@alpha.test');

    await request(app)
      .get('/api/college-streams')
      .set(...bearer(facultyToken))
      .expect(200);

    await request(app)
      .post('/api/college-streams')
      .set(...bearer(facultyToken))
      .send({ streamId: diplomaId })
      .expect(403);
  });
});

describe('college streams', () => {
  it('lists only the streams this college offers', async () => {
    const alpha = await request(app)
      .get('/api/college-streams')
      .set(...bearer(alphaAdminToken))
      .expect(200);

    const beta = await request(app)
      .get('/api/college-streams')
      .set(...bearer(betaAdminToken))
      .expect(200);

    expect(alpha.body.data.streams).toHaveLength(1);
    expect(alpha.body.data.streams[0].streamName).toBe('Computer Engineering');
    expect(beta.body.data.streams).toHaveLength(0);
  });

  it('adds a stream to the caller’s own college only', async () => {
    await request(app)
      .post('/api/college-streams')
      .set(...bearer(betaAdminToken))
      .send({ streamId: diplomaId })
      .expect(201);

    // Beta gained it; Alpha is untouched.
    const alpha = await request(app)
      .get('/api/college-streams')
      .set(...bearer(alphaAdminToken))
      .expect(200);

    expect(alpha.body.data.streams).toHaveLength(1);
  });

  it('rejects adding the same stream twice', async () => {
    await request(app)
      .post('/api/college-streams')
      .set(...bearer(alphaAdminToken))
      .send({ streamId: beComputerId })
      .expect(409);
  });

  it("returns 404 when removing another college's offering", async () => {
    const alphaOffering = await CollegeStreamModel.findOne({
      collegeId: world.alpha._id,
    });

    const response = await request(app)
      .delete(`/api/college-streams/${alphaOffering!._id}`)
      .set(...bearer(betaAdminToken))
      .expect(404);

    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('refuses to remove a stream that students are enrolled in', async () => {
    await request(app)
      .post('/api/users')
      .set(...bearer(alphaAdminToken))
      .send(newStudent())
      .expect(201);

    const offering = await CollegeStreamModel.findOne({ collegeId: world.alpha._id });

    const response = await request(app)
      .delete(`/api/college-streams/${offering!._id}`)
      .set(...bearer(alphaAdminToken))
      .expect(409);

    expect(response.body.error.message).toMatch(/enrolled in this stream/);
  });

  it('reports how many students are in each stream', async () => {
    await request(app)
      .post('/api/users')
      .set(...bearer(alphaAdminToken))
      .send(newStudent())
      .expect(201);

    const response = await request(app)
      .get('/api/college-streams')
      .set(...bearer(alphaAdminToken))
      .expect(200);

    expect(response.body.data.streams[0].studentCount).toBe(1);
  });
});

describe('creating people', () => {
  it('creates faculty with a working generated password', async () => {
    const created = await request(app)
      .post('/api/users')
      .set(...bearer(alphaAdminToken))
      .send({
        role: Role.Faculty,
        email: 'new.faculty@alpha.test',
        firstName: 'Ramesh',
        lastName: 'Kulkarni',
      })
      .expect(201);

    const { temporaryPassword } = created.body.data;

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'new.faculty@alpha.test', password: temporaryPassword })
      .expect(200);

    expect(login.body.data.user.role).toBe('faculty');
    expect(login.body.data.user.college.code).toBe('ALPHA');
  });

  /**
   * The tenant comes from the token and nothing else. Sending another college's id in
   * the body must not place the new user there.
   */
  it('ignores a collegeId supplied in the request body', async () => {
    const created = await request(app)
      .post('/api/users')
      .set(...bearer(alphaAdminToken))
      .send({
        role: Role.Faculty,
        email: 'planted@alpha.test',
        firstName: 'Planted',
        lastName: 'User',
        collegeId: String(world.beta._id),
      })
      .expect(201);

    const stored = await UserModel.findById(created.body.data.user.id);
    expect(String(stored!.collegeId)).toBe(String(world.alpha._id));
  });

  it('creates a student and derives the programme from the stream', async () => {
    const response = await request(app)
      .post('/api/users')
      .set(...bearer(alphaAdminToken))
      .send(newStudent())
      .expect(201);

    expect(response.body.data.user.student.programType).toBe(ProgramType.BE);
    expect(response.body.data.user.student.streamName).toBe('Computer Engineering');
    expect(response.body.data.user.student.rollNumber).toBe('CE23001');
  });

  it('refuses a stream the college does not offer', async () => {
    const response = await request(app)
      .post('/api/users')
      .set(...bearer(alphaAdminToken))
      .send(newStudent({ student: { streamId: diplomaId } }))
      .expect(400);

    expect(response.body.error.details['student.streamId']).toBeDefined();
  });

  /**
   * Direct Second Year students skip semesters 1 and 2 entirely, so semester 2 is not a
   * valid state for one — a rule that needs both the entry type and the programme.
   */
  it('rejects semester 2 for a lateral-entry student', async () => {
    const response = await request(app)
      .post('/api/users')
      .set(...bearer(alphaAdminToken))
      .send(
        newStudent({
          student: { entryType: EntryType.Lateral, currentSemester: 2 },
        }),
      )
      .expect(400);

    expect(response.body.error.message).toMatch(/begin at semester 3/i);
    expect(response.body.error.details['student.currentSemester']).toBeDefined();
  });

  it('accepts semester 3 for a lateral-entry student', async () => {
    await request(app)
      .post('/api/users')
      .set(...bearer(alphaAdminToken))
      .send(
        newStudent({
          student: { entryType: EntryType.Lateral, currentSemester: 3 },
        }),
      )
      .expect(201);
  });

  it('accepts semester 1 for a regular student', async () => {
    await request(app)
      .post('/api/users')
      .set(...bearer(alphaAdminToken))
      .send(newStudent({ student: { currentSemester: 1 } }))
      .expect(201);
  });

  it('rejects a duplicate email across the whole university', async () => {
    const response = await request(app)
      .post('/api/users')
      .set(...bearer(alphaAdminToken))
      .send({
        role: Role.Faculty,
        // Belongs to the *other* college, which the caller cannot even see.
        email: 'clerk@beta.test',
        firstName: 'Dup',
        lastName: 'Licate',
      })
      .expect(409);

    expect(response.body.error.details.email).toBeDefined();
  });

  /** Roll numbers repeat across colleges, so uniqueness is per tenant. */
  it('allows the same roll number at a different college', async () => {
    await request(app)
      .post('/api/users')
      .set(...bearer(alphaAdminToken))
      .send(newStudent())
      .expect(201);

    await request(app)
      .post('/api/college-streams')
      .set(...bearer(betaAdminToken))
      .send({ streamId: beComputerId })
      .expect(201);

    await request(app)
      .post('/api/users')
      .set(...bearer(betaAdminToken))
      .send(newStudent({ email: 'same.roll@beta.test' }))
      .expect(201);
  });

  it('rejects a duplicate roll number within one college', async () => {
    await request(app)
      .post('/api/users')
      .set(...bearer(alphaAdminToken))
      .send(newStudent())
      .expect(201);

    const response = await request(app)
      .post('/api/users')
      .set(...bearer(alphaAdminToken))
      .send(newStudent({ email: 'second@alpha.test' }))
      .expect(409);

    expect(response.body.error.details['student.rollNumber']).toBeDefined();
  });

  it('requires enrolment details for a student', async () => {
    const response = await request(app)
      .post('/api/users')
      .set(...bearer(alphaAdminToken))
      .send({
        role: Role.Student,
        email: 'no.details@alpha.test',
        firstName: 'No',
        lastName: 'Details',
      })
      .expect(422);

    expect(response.body.error.details.student).toBeDefined();
  });

  it('rejects enrolment details on a non-student', async () => {
    await request(app)
      .post('/api/users')
      .set(...bearer(alphaAdminToken))
      .send({
        role: Role.Faculty,
        email: 'confused@alpha.test',
        firstName: 'C',
        lastName: 'Onfused',
        student: {
          rollNumber: 'X1',
          streamId: beComputerId,
          entryType: EntryType.Regular,
          currentSemester: 1,
        },
      })
      .expect(422);
  });
});

describe('editing people', () => {
  async function makeStudent() {
    const response = await request(app)
      .post('/api/users')
      .set(...bearer(alphaAdminToken))
      .send(newStudent())
      .expect(201);

    return response.body.data.user.id as string;
  }

  it('updates a name', async () => {
    const id = await makeStudent();

    const response = await request(app)
      .patch(`/api/users/${id}`)
      .set(...bearer(alphaAdminToken))
      .send({ firstName: 'Aaravi' })
      .expect(200);

    expect(response.body.data.user.firstName).toBe('Aaravi');
  });

  it('re-validates the semester when the entry type changes', async () => {
    const id = await makeStudent();

    // Currently a regular student in semester 5; switching to lateral entry is fine,
    // but dropping to semester 1 as a lateral student is not.
    await request(app)
      .patch(`/api/users/${id}`)
      .set(...bearer(alphaAdminToken))
      .send({ student: { entryType: EntryType.Lateral, currentSemester: 1 } })
      .expect(400);
  });

  it("returns 404 when editing another college's user", async () => {
    const id = await makeStudent();

    await request(app)
      .patch(`/api/users/${id}`)
      .set(...bearer(betaAdminToken))
      .send({ firstName: 'Hijacked' })
      .expect(404);
  });
});

describe('deactivating and resetting', () => {
  it('signs the person out immediately when deactivated', async () => {
    const created = await request(app)
      .post('/api/users')
      .set(...bearer(alphaAdminToken))
      .send({
        role: Role.Clerk,
        email: 'temp.clerk@alpha.test',
        firstName: 'Temp',
        lastName: 'Clerk',
      })
      .expect(201);

    const login = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'temp.clerk@alpha.test',
        password: created.body.data.temporaryPassword,
      })
      .expect(200);

    const cookie = (login.headers['set-cookie'] as unknown as string[])
      .find((entry) => entry.startsWith('ues_rt='))!
      .split(';')[0]!;

    await request(app)
      .patch(`/api/users/${created.body.data.user.id}/status`)
      .set(...bearer(alphaAdminToken))
      .send({ isActive: false })
      .expect(200);

    await request(app).post('/api/auth/refresh').set('Cookie', cookie).expect(401);
  });

  it('refuses to let an admin deactivate themselves', async () => {
    const me = await request(app)
      .get('/api/auth/me')
      .set(...bearer(alphaAdminToken))
      .expect(200);

    const response = await request(app)
      .patch(`/api/users/${me.body.data.user.id}/status`)
      .set(...bearer(alphaAdminToken))
      .send({ isActive: false })
      .expect(400);

    expect(response.body.error.message).toMatch(/your own account/i);
  });

  it('issues a new password and ends existing sessions', async () => {
    const created = await request(app)
      .post('/api/users')
      .set(...bearer(alphaAdminToken))
      .send({
        role: Role.Clerk,
        email: 'reset.me@alpha.test',
        firstName: 'Reset',
        lastName: 'Me',
      })
      .expect(201);

    const first = created.body.data.temporaryPassword as string;

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'reset.me@alpha.test', password: first })
      .expect(200);

    const cookie = (login.headers['set-cookie'] as unknown as string[])
      .find((entry) => entry.startsWith('ues_rt='))!
      .split(';')[0]!;

    const reset = await request(app)
      .post(`/api/users/${created.body.data.user.id}/reset-password`)
      .set(...bearer(alphaAdminToken))
      .expect(200);

    const second = reset.body.data.temporaryPassword as string;
    expect(second).not.toBe(first);

    // The old password no longer works, and the old session is gone.
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'reset.me@alpha.test', password: first })
      .expect(401);

    await request(app).post('/api/auth/refresh').set('Cookie', cookie).expect(401);

    await request(app)
      .post('/api/auth/login')
      .send({ email: 'reset.me@alpha.test', password: second })
      .expect(200);
  });

  it("returns 404 when resetting another college's user", async () => {
    const created = await request(app)
      .post('/api/users')
      .set(...bearer(alphaAdminToken))
      .send(newStudent())
      .expect(201);

    await request(app)
      .post(`/api/users/${created.body.data.user.id}/reset-password`)
      .set(...bearer(betaAdminToken))
      .expect(404);
  });
});
