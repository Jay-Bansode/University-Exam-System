import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { ProgramType, Role, SubjectType } from '@ues/shared';
import { createApp } from '../src/app.js';
import {
  clearTestDatabase,
  connectTestDatabase,
  disconnectTestDatabase,
} from './helpers/db.js';
import { bearer, loginAs, seedTestWorld, type TestWorld } from './helpers/fixtures.js';
import { StreamModel } from '../src/models/stream.model.js';
import { SubjectModel } from '../src/models/subject.model.js';
import { CollegeStreamModel } from '../src/models/college-stream.model.js';
import { SemesterOfferingModel } from '../src/models/semester-offering.model.js';
import { ExamFormModel } from '../src/models/exam-form.model.js';
import { UserModel } from '../src/models/user.model.js';

let app: Express;
let world: TestWorld;
let facultyToken: string;
let betaFacultyToken: string;

let streamId: string;
let sem5: { id: string; code: string }[];
let sem3: { id: string; code: string }[];

const YEAR = '2026-27';

beforeAll(async () => {
  await connectTestDatabase();
  app = createApp();
});

afterAll(disconnectTestDatabase);

async function createFaculty(collegeId: unknown, email: string) {
  const { hashPassword } = await import('../src/services/auth.service.js');

  await UserModel.create({
    email,
    passwordHash: await hashPassword('TestPass123'),
    firstName: 'Faculty',
    lastName: 'Member',
    role: Role.Faculty,
    collegeId,
  });

  return loginAs(app, email);
}

beforeEach(async () => {
  await clearTestDatabase();
  world = await seedTestWorld();

  const stream = await StreamModel.create({
    name: 'Computer Engineering',
    code: 'CE',
    programType: ProgramType.BE,
  });
  streamId = String(stream._id);

  const created = await SubjectModel.insertMany([
    {
      streamId: stream._id,
      semester: 5,
      name: 'Theoretical CS',
      code: 'CSC501',
      credits: 3,
      subjectType: SubjectType.Theory,
    },
    {
      streamId: stream._id,
      semester: 5,
      name: 'Software Engineering',
      code: 'CSC502',
      credits: 3,
      subjectType: SubjectType.Theory,
    },
    {
      streamId: stream._id,
      semester: 5,
      name: 'Computer Network',
      code: 'CSC503',
      credits: 3,
      subjectType: SubjectType.Theory,
    },
    {
      streamId: stream._id,
      semester: 3,
      name: 'Data Structures',
      code: 'CSC303',
      credits: 3,
      subjectType: SubjectType.Theory,
    },
  ]);

  sem5 = created
    .filter((subject) => subject.semester === 5)
    .map((subject) => ({ id: String(subject._id), code: subject.code }));
  sem3 = created
    .filter((subject) => subject.semester === 3)
    .map((subject) => ({ id: String(subject._id), code: subject.code }));

  // Only Alpha offers the stream, so "this college does not offer that" is testable.
  await CollegeStreamModel.create({ collegeId: world.alpha._id, streamId: stream._id });

  facultyToken = await createFaculty(world.alpha._id, 'faculty@alpha.test');
  betaFacultyToken = await createFaculty(world.beta._id, 'faculty@beta.test');
});

function saveOffering(token: string, body: Record<string, unknown> = {}) {
  return request(app)
    .put('/api/offerings')
    .set(...bearer(token))
    .send({
      streamId,
      academicYear: YEAR,
      semester: 5,
      subjectIds: sem5.map((subject) => subject.id),
      ...body,
    });
}

describe('who may compose an offering', () => {
  it('lets faculty save one', async () => {
    await saveOffering(facultyToken).expect(200);
  });

  it('forbids a clerk from saving one', async () => {
    const clerkToken = await loginAs(app, 'clerk@alpha.test');
    await saveOffering(clerkToken).expect(403);
  });

  it('forbids a student from saving one', async () => {
    const studentToken = await loginAs(app, 'student@alpha.test');
    await saveOffering(studentToken).expect(403);
  });

  it('lets a student read offerings, since their exam form depends on them', async () => {
    await saveOffering(facultyToken).expect(200);
    const studentToken = await loginAs(app, 'student@alpha.test');

    const response = await request(app)
      .get('/api/offerings')
      .set(...bearer(studentToken))
      .expect(200);

    expect(response.body.data.offerings).toHaveLength(1);
  });

  /**
   * The structural guarantee of this phase: faculty compose offerings from the
   * university's catalogue and have no route through which to add to it.
   */
  it('still forbids faculty from creating a subject', async () => {
    await request(app)
      .post('/api/subjects')
      .set(...bearer(facultyToken))
      .send({
        streamId,
        semester: 5,
        name: 'Invented Subject',
        code: 'FAKE1',
        credits: 3,
        subjectType: SubjectType.Theory,
      })
      .expect(403);
  });
});

describe('composing an offering', () => {
  it('returns the chosen subjects and their total credits', async () => {
    const response = await saveOffering(facultyToken).expect(200);

    expect(response.body.data.offering.subjects).toHaveLength(3);
    expect(response.body.data.offering.totalCredits).toBe(9);
    expect(response.body.data.offering.streamName).toBe('Computer Engineering');
  });

  /**
   * The quiet failure this prevents: a semester-3 subject stored in a semester-5
   * offering looks fine in the database and only surfaces when a student registers for
   * a subject they are not taking.
   */
  it('rejects a subject from another semester', async () => {
    const response = await saveOffering(facultyToken, {
      subjectIds: [sem5[0]!.id, sem3[0]!.id],
    }).expect(400);

    expect(response.body.error.message).toMatch(/do(es)? not belong to this stream/);
    expect(response.body.error.details.subjectIds).toBeDefined();
  });

  it('rejects a subject that does not exist', async () => {
    await saveOffering(facultyToken, {
      subjectIds: [sem5[0]!.id, '0'.repeat(24)],
    }).expect(400);
  });

  it('rejects a duplicated subject', async () => {
    const response = await saveOffering(facultyToken, {
      subjectIds: [sem5[0]!.id, sem5[0]!.id],
    }).expect(400);

    expect(response.body.error.message).toMatch(/more than once/);
  });

  it('rejects an empty selection', async () => {
    await saveOffering(facultyToken, { subjectIds: [] }).expect(422);
  });

  it('rejects a subject the university has retired', async () => {
    await SubjectModel.updateOne({ _id: sem5[0]!.id }, { $set: { isActive: false } });

    const response = await saveOffering(facultyToken).expect(400);
    expect(response.body.error.message).toMatch(/retired by the university/);
  });

  it('refuses a stream this college does not offer', async () => {
    const response = await saveOffering(betaFacultyToken).expect(400);
    expect(response.body.error.details.streamId).toBeDefined();
  });

  it('refuses a semester beyond the programme', async () => {
    const diploma = await StreamModel.create({
      name: 'Computer Engineering',
      code: 'DCE',
      programType: ProgramType.Diploma,
    });
    await CollegeStreamModel.create({
      collegeId: world.alpha._id,
      streamId: diploma._id,
    });

    const response = await saveOffering(facultyToken, {
      streamId: String(diploma._id),
      semester: 7,
    }).expect(400);

    expect(response.body.error.details.semester).toBeDefined();
  });

  /** One offering per college, stream, semester and year — so saving twice replaces. */
  it('replaces the existing offering rather than creating a second', async () => {
    await saveOffering(facultyToken).expect(200);
    await saveOffering(facultyToken, {
      subjectIds: [sem5[0]!.id, sem5[1]!.id],
    }).expect(200);

    const stored = await SemesterOfferingModel.find({ collegeId: world.alpha._id });
    expect(stored).toHaveLength(1);
    expect(stored[0]!.subjectIds).toHaveLength(2);
  });
});

describe('available subjects', () => {
  it('lists only the university subjects for that stream and semester', async () => {
    const response = await request(app)
      .get(`/api/offerings/available-subjects?streamId=${streamId}&semester=5`)
      .set(...bearer(facultyToken))
      .expect(200);

    const codes = response.body.data.subjects.map((s: { code: string }) => s.code);
    expect(codes).toEqual(['CSC501', 'CSC502', 'CSC503']);
    expect(codes).not.toContain('CSC303');
  });

  it('refuses a stream the college does not offer', async () => {
    await request(app)
      .get(`/api/offerings/available-subjects?streamId=${streamId}&semester=5`)
      .set(...bearer(betaFacultyToken))
      .expect(400);
  });
});

describe('tenant isolation', () => {
  it("does not show one college the other's offerings", async () => {
    await saveOffering(facultyToken).expect(200);

    const response = await request(app)
      .get('/api/offerings')
      .set(...bearer(betaFacultyToken))
      .expect(200);

    expect(response.body.data.offerings).toHaveLength(0);
  });

  it("returns 404 when deleting another college's offering", async () => {
    const created = await saveOffering(facultyToken).expect(200);

    await request(app)
      .delete(`/api/offerings/${created.body.data.offering.id}`)
      .set(...bearer(betaFacultyToken))
      .expect(404);
  });

  it('gives each college its own offering for the same stream and semester', async () => {
    await CollegeStreamModel.create({
      collegeId: world.beta._id,
      streamId,
    });

    await saveOffering(facultyToken).expect(200);
    await saveOffering(betaFacultyToken).expect(200);

    const stored = await SemesterOfferingModel.find({});
    expect(stored).toHaveLength(2);
  });
});

describe('withdrawing a subject students have registered for', () => {
  /**
   * Adding subjects is always safe; removing one is not. A submitted exam form points at
   * subjects, and dropping one from the offering would leave a student registered for an
   * examination the college no longer runs.
   */
  async function registerStudentFor(subjectIds: string[], offeringId: string) {
    return ExamFormModel.create({
      collegeId: world.alpha._id,
      studentId: world.alphaStudent._id,
      offeringId,
      streamId,
      academicYear: YEAR,
      semester: 5,
      subjectIds,
      status: 'submitted',
    });
  }

  it('refuses to remove a registered subject and names it', async () => {
    const created = await saveOffering(facultyToken).expect(200);
    const offeringId = created.body.data.offering.id as string;

    await registerStudentFor([sem5[0]!.id, sem5[1]!.id], offeringId);

    const response = await saveOffering(facultyToken, {
      subjectIds: [sem5[1]!.id, sem5[2]!.id],
    }).expect(409);

    expect(response.body.error.message).toContain(sem5[0]!.code);
    expect(response.body.error.message).toMatch(/already registered/);
  });

  it('still allows adding a subject', async () => {
    const created = await saveOffering(facultyToken, {
      subjectIds: [sem5[0]!.id],
    }).expect(200);

    await registerStudentFor([sem5[0]!.id], created.body.data.offering.id);

    await saveOffering(facultyToken, {
      subjectIds: [sem5[0]!.id, sem5[1]!.id],
    }).expect(200);
  });

  it('allows removing a subject nobody registered for', async () => {
    const created = await saveOffering(facultyToken).expect(200);

    await registerStudentFor([sem5[0]!.id], created.body.data.offering.id);

    // CSC503 is in the offering but not on the form, so withdrawing it harms nobody.
    await saveOffering(facultyToken, {
      subjectIds: [sem5[0]!.id, sem5[1]!.id],
    }).expect(200);
  });

  it('refuses to delete an offering that exam forms reference', async () => {
    const created = await saveOffering(facultyToken).expect(200);
    const offeringId = created.body.data.offering.id as string;

    await registerStudentFor([sem5[0]!.id], offeringId);

    const response = await request(app)
      .delete(`/api/offerings/${offeringId}`)
      .set(...bearer(facultyToken))
      .expect(409);

    expect(response.body.error.message).toMatch(/reference this offering/);
  });

  it('deletes an offering nothing references', async () => {
    const created = await saveOffering(facultyToken).expect(200);

    await request(app)
      .delete(`/api/offerings/${created.body.data.offering.id}`)
      .set(...bearer(facultyToken))
      .expect(200);
  });
});
