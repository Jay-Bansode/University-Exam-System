import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { EntryType, ProgramType, Role, SubjectType } from '@ues/shared';
import { createApp } from '../src/app.js';
import {
  clearTestDatabase,
  connectTestDatabase,
  disconnectTestDatabase,
} from './helpers/db.js';
import {
  TEST_PASSWORD,
  bearer,
  loginAs,
  seedTestWorld,
  type TestWorld,
} from './helpers/fixtures.js';
import { StreamModel } from '../src/models/stream.model.js';
import { SubjectModel } from '../src/models/subject.model.js';
import { CollegeStreamModel } from '../src/models/college-stream.model.js';
import { SemesterOfferingModel } from '../src/models/semester-offering.model.js';
import { ExamWindowModel } from '../src/models/exam-window.model.js';
import { UserModel } from '../src/models/user.model.js';

let app: Express;
let world: TestWorld;
let studentToken: string;
let streamId: string;
let subjects: { id: string; code: string }[];

const YEAR = '2026-27';
const SEMESTER = 5;
const day = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  await connectTestDatabase();
  app = createApp();
});

afterAll(disconnectTestDatabase);

/** An open window by default; individual tests override the dates. */
async function createWindow(overrides: Record<string, unknown> = {}) {
  return ExamWindowModel.create({
    academicYear: YEAR,
    semester: SEMESTER,
    openAt: new Date(Date.now() - day),
    closeAt: new Date(Date.now() + 20 * day),
    isPublished: true,
    ...overrides,
  });
}

async function createOffering(collegeId: unknown, subjectIds: string[]) {
  return SemesterOfferingModel.create({
    collegeId,
    streamId,
    academicYear: YEAR,
    semester: SEMESTER,
    subjectIds,
  });
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
      semester: SEMESTER,
      name: 'Theoretical CS',
      code: 'CSC501',
      credits: 3,
      subjectType: SubjectType.Theory,
    },
    {
      streamId: stream._id,
      semester: SEMESTER,
      name: 'Software Engineering',
      code: 'CSC502',
      credits: 3,
      subjectType: SubjectType.Theory,
    },
    {
      streamId: stream._id,
      semester: SEMESTER,
      name: 'Networks Lab',
      code: 'CSL502',
      credits: 1,
      subjectType: SubjectType.Practical,
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

  subjects = created
    .filter((subject) => subject.semester === SEMESTER)
    .map((subject) => ({ id: String(subject._id), code: subject.code }));

  await CollegeStreamModel.create({ collegeId: world.alpha._id, streamId: stream._id });

  // The fixture student is in semester 5; point them at this stream.
  world.alphaStudent.studentProfile!.streamId = stream._id;
  world.alphaStudent.studentProfile!.currentSemester = SEMESTER;
  await world.alphaStudent.save();

  studentToken = await loginAs(app, 'student@alpha.test');
});

const allSubjectIds = () => subjects.map((subject) => subject.id);

describe('GET /api/exam-forms/me', () => {
  it('reports no offering before the college publishes one', async () => {
    await createWindow();

    const response = await request(app)
      .get('/api/exam-forms/me')
      .set(...bearer(studentToken))
      .expect(200);

    expect(response.body.data.block).toBe('no-offering');
    expect(response.body.data.canSubmit).toBe(false);
    expect(response.body.data.availableSubjects).toHaveLength(0);
  });

  it('reports no window when the university has not scheduled one', async () => {
    await createOffering(world.alpha._id, allSubjectIds());

    const response = await request(app)
      .get('/api/exam-forms/me')
      .set(...bearer(studentToken))
      .expect(200);

    expect(response.body.data.block).toBe('no-window');
  });

  it('reports the window as not open when it is only a draft', async () => {
    await createWindow({ isPublished: false });
    await createOffering(world.alpha._id, allSubjectIds());

    const response = await request(app)
      .get('/api/exam-forms/me')
      .set(...bearer(studentToken))
      .expect(200);

    expect(response.body.data.block).toBe('window-not-open');
    expect(response.body.data.canSubmit).toBe(false);
  });

  it('offers only the subjects the college is running', async () => {
    await createWindow();
    // The college runs two of the three published semester-5 subjects.
    await createOffering(world.alpha._id, [subjects[0]!.id, subjects[1]!.id]);

    const response = await request(app)
      .get('/api/exam-forms/me')
      .set(...bearer(studentToken))
      .expect(200);

    const codes = response.body.data.availableSubjects.map(
      (subject: { code: string }) => subject.code,
    );

    expect(codes).toEqual(['CSC501', 'CSC502']);
    expect(response.body.data.canSubmit).toBe(true);
    expect(response.body.data.block).toBeNull();
  });

  it('refuses a non-student', async () => {
    const clerkToken = await loginAs(app, 'clerk@alpha.test');

    await request(app)
      .get('/api/exam-forms/me')
      .set(...bearer(clerkToken))
      .expect(403);
  });
});

describe('saving a draft', () => {
  beforeEach(async () => {
    await createWindow();
    await createOffering(world.alpha._id, allSubjectIds());
  });

  it('saves the selection and reports the credit total', async () => {
    const response = await request(app)
      .put('/api/exam-forms/me/draft')
      .set(...bearer(studentToken))
      .send({ subjectIds: [subjects[0]!.id, subjects[2]!.id] })
      .expect(200);

    expect(response.body.data.form.status).toBe('draft');
    expect(response.body.data.form.subjects).toHaveLength(2);
    expect(response.body.data.form.totalCredits).toBe(4);
    // A draft has no number: numbers are issued on submission.
    expect(response.body.data.form.formNumber).toBeNull();
  });

  it('replaces the previous draft rather than creating a second form', async () => {
    await request(app)
      .put('/api/exam-forms/me/draft')
      .set(...bearer(studentToken))
      .send({ subjectIds: [subjects[0]!.id] })
      .expect(200);

    await request(app)
      .put('/api/exam-forms/me/draft')
      .set(...bearer(studentToken))
      .send({ subjectIds: allSubjectIds() })
      .expect(200);

    const { ExamFormModel } = await import('../src/models/exam-form.model.js');
    const stored = await ExamFormModel.find({ studentId: world.alphaStudent._id });

    expect(stored).toHaveLength(1);
    expect(stored[0]!.subjectIds).toHaveLength(3);
  });

  /**
   * The offering is the authority, not the university's full syllabus. A student may
   * only register for what their own college is actually running.
   */
  it('rejects a subject the college is not offering', async () => {
    await SemesterOfferingModel.updateOne(
      { collegeId: world.alpha._id },
      { $set: { subjectIds: [subjects[0]!.id] } },
    );

    const response = await request(app)
      .put('/api/exam-forms/me/draft')
      .set(...bearer(studentToken))
      .send({ subjectIds: [subjects[0]!.id, subjects[1]!.id] })
      .expect(400);

    expect(response.body.error.message).toMatch(/not offered by your college/);
  });

  it('rejects a duplicated subject', async () => {
    await request(app)
      .put('/api/exam-forms/me/draft')
      .set(...bearer(studentToken))
      .send({ subjectIds: [subjects[0]!.id, subjects[0]!.id] })
      .expect(400);
  });

  /** Preparing early is reasonable; only submission is time-bound. */
  it('allows a draft before the window opens', async () => {
    await ExamWindowModel.updateOne(
      { semester: SEMESTER },
      { $set: { openAt: new Date(Date.now() + 5 * day) } },
    );

    await request(app)
      .put('/api/exam-forms/me/draft')
      .set(...bearer(studentToken))
      .send({ subjectIds: [subjects[0]!.id] })
      .expect(200);
  });
});

describe('submitting', () => {
  beforeEach(async () => {
    await createOffering(world.alpha._id, allSubjectIds());
  });

  it('assigns a form number and locks the form', async () => {
    await createWindow();

    const response = await request(app)
      .post('/api/exam-forms/me/submit')
      .set(...bearer(studentToken))
      .send({ subjectIds: allSubjectIds() })
      .expect(200);

    const { form } = response.body.data;

    expect(form.status).toBe('submitted');
    expect(form.formNumber).toMatch(/^ALPHA\/2026-27\/S5\/\d{5}$/);
    expect(form.submittedAt).not.toBeNull();
  });

  it('refuses further edits once submitted', async () => {
    await createWindow();

    await request(app)
      .post('/api/exam-forms/me/submit')
      .set(...bearer(studentToken))
      .send({ subjectIds: allSubjectIds() })
      .expect(200);

    const response = await request(app)
      .put('/api/exam-forms/me/draft')
      .set(...bearer(studentToken))
      .send({ subjectIds: [subjects[0]!.id] })
      .expect(409);

    expect(response.body.error.message).toMatch(/no longer be edited/);
  });

  it('refuses a second submission', async () => {
    await createWindow();

    await request(app)
      .post('/api/exam-forms/me/submit')
      .set(...bearer(studentToken))
      .send({ subjectIds: allSubjectIds() })
      .expect(200);

    await request(app)
      .post('/api/exam-forms/me/submit')
      .set(...bearer(studentToken))
      .send({ subjectIds: allSubjectIds() })
      .expect(409);
  });

  /**
   * The rule the whole exam-window feature exists for. Checked on the server against the
   * server's clock, because a browser clock is under the user's control.
   */
  it('refuses submission after the window has closed', async () => {
    await createWindow({
      openAt: new Date(Date.now() - 30 * day),
      closeAt: new Date(Date.now() - day),
    });

    const response = await request(app)
      .post('/api/exam-forms/me/submit')
      .set(...bearer(studentToken))
      .send({ subjectIds: allSubjectIds() })
      .expect(400);

    expect(response.body.error.message).toMatch(/closed on/);
  });

  it('refuses submission before the window opens', async () => {
    await createWindow({
      openAt: new Date(Date.now() + 5 * day),
      closeAt: new Date(Date.now() + 20 * day),
    });

    const response = await request(app)
      .post('/api/exam-forms/me/submit')
      .set(...bearer(studentToken))
      .send({ subjectIds: allSubjectIds() })
      .expect(400);

    expect(response.body.error.message).toMatch(/not open yet/);
  });

  it('refuses submission while the window is unpublished', async () => {
    await createWindow({ isPublished: false });

    await request(app)
      .post('/api/exam-forms/me/submit')
      .set(...bearer(studentToken))
      .send({ subjectIds: allSubjectIds() })
      .expect(400);
  });

  it('refuses an empty selection', async () => {
    await createWindow();

    const response = await request(app)
      .post('/api/exam-forms/me/submit')
      .set(...bearer(studentToken))
      .send({ subjectIds: [] })
      .expect(400);

    expect(response.body.error.message).toMatch(/at least one subject/);
  });

  it('promotes an existing draft rather than creating a second form', async () => {
    await createWindow();

    await request(app)
      .put('/api/exam-forms/me/draft')
      .set(...bearer(studentToken))
      .send({ subjectIds: [subjects[0]!.id] })
      .expect(200);

    await request(app)
      .post('/api/exam-forms/me/submit')
      .set(...bearer(studentToken))
      .send({ subjectIds: allSubjectIds() })
      .expect(200);

    const { ExamFormModel } = await import('../src/models/exam-form.model.js');
    const stored = await ExamFormModel.find({ studentId: world.alphaStudent._id });

    expect(stored).toHaveLength(1);
    expect(stored[0]!.status).toBe('submitted');
  });
});

describe('form numbering', () => {
  /**
   * The race this guards against. Counting existing forms and adding one would give two
   * simultaneous submitters the same number, and the failure only appears under the load
   * of a registration deadline — exactly when it must not.
   */
  it('gives concurrent submissions distinct numbers', async () => {
    await createWindow();
    await createOffering(world.alpha._id, allSubjectIds());

    const { hashPassword } = await import('../src/services/auth.service.js');
    const passwordHash = await hashPassword(TEST_PASSWORD);

    // Ten students at the same college, submitting together.
    const emails = Array.from({ length: 10 }, (_, index) => `rush${index}@alpha.test`);

    await UserModel.insertMany(
      emails.map((email, index) => ({
        email,
        passwordHash,
        firstName: 'Rush',
        lastName: `Student${index}`,
        role: Role.Student,
        collegeId: world.alpha._id,
        studentProfile: {
          rollNumber: `RUSH${index}`,
          streamId,
          programType: ProgramType.BE,
          entryType: EntryType.Regular,
          currentSemester: SEMESTER,
        },
      })),
    );

    const tokens = await Promise.all(emails.map((email) => loginAs(app, email)));

    const responses = await Promise.all(
      tokens.map((token) =>
        request(app)
          .post('/api/exam-forms/me/submit')
          .set(...bearer(token))
          .send({ subjectIds: allSubjectIds() }),
      ),
    );

    const numbers = responses.map(
      (response) => response.body.data.form.formNumber as string,
    );

    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(new Set(numbers).size).toBe(10);
  });

  it('keeps the original number when a rejected form is resubmitted', async () => {
    await createWindow();
    await createOffering(world.alpha._id, allSubjectIds());

    const first = await request(app)
      .post('/api/exam-forms/me/submit')
      .set(...bearer(studentToken))
      .send({ subjectIds: allSubjectIds() })
      .expect(200);

    const originalNumber = first.body.data.form.formNumber as string;

    // A clerk sends it back (Phase 7 builds the endpoint; the state change is what
    // matters here).
    const { ExamFormModel } = await import('../src/models/exam-form.model.js');
    await ExamFormModel.updateOne(
      { studentId: world.alphaStudent._id },
      { $set: { status: 'rejected', rejectionReason: 'Wrong elective' } },
    );

    const second = await request(app)
      .post('/api/exam-forms/me/submit')
      .set(...bearer(studentToken))
      .send({ subjectIds: [subjects[0]!.id] })
      .expect(200);

    expect(second.body.data.form.formNumber).toBe(originalNumber);
    // The stale rejection reason must not survive a corrected resubmission.
    expect(second.body.data.form.rejectionReason).toBeNull();
  });
});

describe('reading a form by id', () => {
  async function submitAndGetId() {
    await createWindow();
    await createOffering(world.alpha._id, allSubjectIds());

    const response = await request(app)
      .post('/api/exam-forms/me/submit')
      .set(...bearer(studentToken))
      .send({ subjectIds: allSubjectIds() })
      .expect(200);

    return response.body.data.form.id as string;
  }

  it('lets the owning student read it', async () => {
    const id = await submitAndGetId();

    await request(app)
      .get(`/api/exam-forms/${id}`)
      .set(...bearer(studentToken))
      .expect(200);
  });

  it('lets a clerk at the same college read it', async () => {
    const id = await submitAndGetId();
    const clerkToken = await loginAs(app, 'clerk@alpha.test');

    const response = await request(app)
      .get(`/api/exam-forms/${id}`)
      .set(...bearer(clerkToken))
      .expect(200);

    expect(response.body.data.form.student.rollNumber).toBe('A001');
  });

  it('returns 404 to a clerk at another college', async () => {
    const id = await submitAndGetId();
    const betaClerkToken = await loginAs(app, 'clerk@beta.test');

    await request(app)
      .get(`/api/exam-forms/${id}`)
      .set(...bearer(betaClerkToken))
      .expect(404);
  });

  /** A student must not be able to read a classmate's registration. */
  it('returns 404 to another student at the same college', async () => {
    const id = await submitAndGetId();

    const { hashPassword } = await import('../src/services/auth.service.js');
    await UserModel.create({
      email: 'classmate@alpha.test',
      passwordHash: await hashPassword(TEST_PASSWORD),
      firstName: 'Class',
      lastName: 'Mate',
      role: Role.Student,
      collegeId: world.alpha._id,
      studentProfile: {
        rollNumber: 'A002',
        streamId,
        programType: ProgramType.BE,
        entryType: EntryType.Regular,
        currentSemester: SEMESTER,
      },
    });

    const classmateToken = await loginAs(app, 'classmate@alpha.test');

    await request(app)
      .get(`/api/exam-forms/${id}`)
      .set(...bearer(classmateToken))
      .expect(404);
  });
});
