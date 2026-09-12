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
let clerkToken: string;
let betaClerkToken: string;
let studentToken: string;
let subjectIds: string[];

const YEAR = '2026-27';
const SEMESTER = 5;
const day = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  await connectTestDatabase();
  app = createApp();
});

afterAll(disconnectTestDatabase);

beforeEach(async () => {
  await clearTestDatabase();
  world = await seedTestWorld();

  const stream = await StreamModel.create({
    name: 'Computer Engineering',
    code: 'CE',
    programType: ProgramType.BE,
  });

  const subjects = await SubjectModel.insertMany([
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
  ]);
  subjectIds = subjects.map((subject) => String(subject._id));

  await CollegeStreamModel.create({ collegeId: world.alpha._id, streamId: stream._id });

  await SemesterOfferingModel.create({
    collegeId: world.alpha._id,
    streamId: stream._id,
    academicYear: YEAR,
    semester: SEMESTER,
    subjectIds,
  });

  await ExamWindowModel.create({
    academicYear: YEAR,
    semester: SEMESTER,
    openAt: new Date(Date.now() - day),
    closeAt: new Date(Date.now() + 20 * day),
    isPublished: true,
  });

  world.alphaStudent.studentProfile!.streamId = stream._id;
  world.alphaStudent.studentProfile!.currentSemester = SEMESTER;
  await world.alphaStudent.save();

  clerkToken = await loginAs(app, 'clerk@alpha.test');
  betaClerkToken = await loginAs(app, 'clerk@beta.test');
  studentToken = await loginAs(app, 'student@alpha.test');
});

/** Submits the fixture student's form and returns its id. */
async function submitForm(token = studentToken): Promise<string> {
  const response = await request(app)
    .post('/api/exam-forms/me/submit')
    .set(...bearer(token))
    .send({ subjectIds })
    .expect(200);

  return response.body.data.form.id as string;
}

describe('who may verify', () => {
  it('lets a clerk verify', async () => {
    const id = await submitForm();

    await request(app)
      .patch(`/api/exam-forms/${id}/verify`)
      .set(...bearer(clerkToken))
      .expect(200);
  });

  it('lets a college admin verify, since a small college may have no clerk on duty', async () => {
    const { hashPassword } = await import('../src/services/auth.service.js');
    await UserModel.create({
      email: 'admin@alpha.test',
      passwordHash: await hashPassword(TEST_PASSWORD),
      firstName: 'College',
      lastName: 'Admin',
      role: Role.CollegeAdmin,
      collegeId: world.alpha._id,
    });

    const id = await submitForm();
    const adminToken = await loginAs(app, 'admin@alpha.test');

    await request(app)
      .patch(`/api/exam-forms/${id}/verify`)
      .set(...bearer(adminToken))
      .expect(200);
  });

  /** Faculty decide what is taught, not whether a registration is in order. */
  it('forbids faculty from verifying', async () => {
    const { hashPassword } = await import('../src/services/auth.service.js');
    await UserModel.create({
      email: 'faculty@alpha.test',
      passwordHash: await hashPassword(TEST_PASSWORD),
      firstName: 'Faculty',
      lastName: 'Member',
      role: Role.Faculty,
      collegeId: world.alpha._id,
    });

    const id = await submitForm();
    const facultyToken = await loginAs(app, 'faculty@alpha.test');

    await request(app)
      .patch(`/api/exam-forms/${id}/verify`)
      .set(...bearer(facultyToken))
      .expect(403);
  });

  it('forbids a student from verifying their own form', async () => {
    const id = await submitForm();

    await request(app)
      .patch(`/api/exam-forms/${id}/verify`)
      .set(...bearer(studentToken))
      .expect(403);
  });

  it('returns 404 to a clerk at another college', async () => {
    const id = await submitForm();

    await request(app)
      .patch(`/api/exam-forms/${id}/verify`)
      .set(...bearer(betaClerkToken))
      .expect(404);
  });
});

describe('the verification queue', () => {
  it('lists submitted forms with counts per status', async () => {
    await submitForm();

    const response = await request(app)
      .get('/api/exam-forms')
      .set(...bearer(clerkToken))
      .expect(200);

    expect(response.body.data.forms).toHaveLength(1);
    expect(response.body.data.counts.submitted).toBe(1);
    expect(response.body.data.counts.verified).toBe(0);

    const [form] = response.body.data.forms;
    expect(form.studentName).toBe('Test student');
    expect(form.rollNumber).toBe('A001');
    expect(form.subjectCount).toBe(2);
    expect(form.totalCredits).toBe(6);
  });

  it('filters by status', async () => {
    const id = await submitForm();

    await request(app)
      .patch(`/api/exam-forms/${id}/verify`)
      .set(...bearer(clerkToken))
      .expect(200);

    const submitted = await request(app)
      .get('/api/exam-forms?status=submitted')
      .set(...bearer(clerkToken))
      .expect(200);

    const verified = await request(app)
      .get('/api/exam-forms?status=verified')
      .set(...bearer(clerkToken))
      .expect(200);

    expect(submitted.body.data.forms).toHaveLength(0);
    expect(verified.body.data.forms).toHaveLength(1);
    // Counts ignore the filter, so the tabs stay meaningful while one is being viewed.
    expect(verified.body.data.counts.verified).toBe(1);
  });

  it('searches by student name', async () => {
    await submitForm();

    const hit = await request(app)
      .get('/api/exam-forms?search=Test')
      .set(...bearer(clerkToken))
      .expect(200);

    const miss = await request(app)
      .get('/api/exam-forms?search=Nobody')
      .set(...bearer(clerkToken))
      .expect(200);

    expect(hit.body.data.forms).toHaveLength(1);
    expect(miss.body.data.forms).toHaveLength(0);
  });

  it('searches by roll number', async () => {
    await submitForm();

    const response = await request(app)
      .get('/api/exam-forms?search=A001')
      .set(...bearer(clerkToken))
      .expect(200);

    expect(response.body.data.forms).toHaveLength(1);
  });

  it('shows a clerk nothing from another college', async () => {
    await submitForm();

    const response = await request(app)
      .get('/api/exam-forms')
      .set(...bearer(betaClerkToken))
      .expect(200);

    expect(response.body.data.forms).toHaveLength(0);
    expect(response.body.data.counts.submitted).toBe(0);
  });
});

describe('rejecting', () => {
  /**
   * The reason is the whole point of the action. A student is the only person who can
   * fix the form, and "rejected" alone tells them nothing to act on.
   */
  it('requires a reason', async () => {
    const id = await submitForm();

    const response = await request(app)
      .patch(`/api/exam-forms/${id}/reject`)
      .set(...bearer(clerkToken))
      .send({})
      .expect(422);

    expect(response.body.error.details.reason).toBeDefined();
  });

  it('rejects a reason too short to be useful', async () => {
    const id = await submitForm();

    const response = await request(app)
      .patch(`/api/exam-forms/${id}/reject`)
      .set(...bearer(clerkToken))
      .send({ reason: 'no' })
      .expect(422);

    expect(response.body.error.details.reason).toBeDefined();
  });

  it('sends the form back and records the reason', async () => {
    const id = await submitForm();

    const response = await request(app)
      .patch(`/api/exam-forms/${id}/reject`)
      .set(...bearer(clerkToken))
      .send({ reason: 'Your birth certificate does not match the recorded date.' })
      .expect(200);

    expect(response.body.data.form.status).toBe('rejected');
    expect(response.body.data.form.rejectionReason).toMatch(/birth certificate/);
  });

  it('shows the student the reason on their own form', async () => {
    const id = await submitForm();

    await request(app)
      .patch(`/api/exam-forms/${id}/reject`)
      .set(...bearer(clerkToken))
      .send({ reason: 'The elective you chose is not the one on your application.' })
      .expect(200);

    const mine = await request(app)
      .get('/api/exam-forms/me')
      .set(...bearer(studentToken))
      .expect(200);

    expect(mine.body.data.form.status).toBe('rejected');
    expect(mine.body.data.form.rejectionReason).toMatch(/elective/);
    // A rejected form is editable again, so the student can actually correct it.
    expect(mine.body.data.canEdit).toBe(true);
  });
});

describe('the correction cycle', () => {
  /** The full loop: submit, sent back, corrected, resubmitted, verified. */
  it('lets a student correct and resubmit, keeping the form number', async () => {
    const id = await submitForm();

    const beforeReject = await request(app)
      .get('/api/exam-forms/me')
      .set(...bearer(studentToken));
    const originalNumber = beforeReject.body.data.form.formNumber as string;

    await request(app)
      .patch(`/api/exam-forms/${id}/reject`)
      .set(...bearer(clerkToken))
      .send({ reason: 'Please remove the elective you are not enrolled for.' })
      .expect(200);

    const resubmitted = await request(app)
      .post('/api/exam-forms/me/submit')
      .set(...bearer(studentToken))
      .send({ subjectIds: [subjectIds[0]!] })
      .expect(200);

    expect(resubmitted.body.data.form.formNumber).toBe(originalNumber);
    expect(resubmitted.body.data.form.status).toBe('submitted');
    // The stale reason must not survive a correction the student has already made.
    expect(resubmitted.body.data.form.rejectionReason).toBeNull();

    await request(app)
      .patch(`/api/exam-forms/${id}/verify`)
      .set(...bearer(clerkToken))
      .expect(200);

    const final = await request(app)
      .get('/api/exam-forms/me')
      .set(...bearer(studentToken))
      .expect(200);

    expect(final.body.data.form.status).toBe('verified');
    expect(final.body.data.form.subjects).toHaveLength(1);
  });
});

describe('acting on a form twice', () => {
  it('refuses to verify an already-verified form', async () => {
    const id = await submitForm();

    await request(app)
      .patch(`/api/exam-forms/${id}/verify`)
      .set(...bearer(clerkToken))
      .expect(200);

    const response = await request(app)
      .patch(`/api/exam-forms/${id}/verify`)
      .set(...bearer(clerkToken))
      .expect(409);

    expect(response.body.error.message).toMatch(/already been verified/i);
  });

  /**
   * Verification is terminal. Reversing it would silently overwrite a decision another
   * clerk recorded; a problem found afterwards is a correction request, not an edit.
   */
  it('refuses to reject a verified form', async () => {
    const id = await submitForm();

    await request(app)
      .patch(`/api/exam-forms/${id}/verify`)
      .set(...bearer(clerkToken))
      .expect(200);

    await request(app)
      .patch(`/api/exam-forms/${id}/reject`)
      .set(...bearer(clerkToken))
      .send({ reason: 'Changed my mind about this registration.' })
      .expect(409);
  });

  it('refuses to verify a form that was never submitted', async () => {
    const draft = await request(app)
      .put('/api/exam-forms/me/draft')
      .set(...bearer(studentToken))
      .send({ subjectIds })
      .expect(200);

    const response = await request(app)
      .patch(`/api/exam-forms/${draft.body.data.form.id}/verify`)
      .set(...bearer(clerkToken))
      .expect(409);

    expect(response.body.error.message).toMatch(/not been submitted/i);
  });
});

describe('student search for staff', () => {
  it('finds a student by name within the college', async () => {
    const response = await request(app)
      .get('/api/users?role=student&search=Test')
      .set(...bearer(clerkToken))
      .expect(200);

    expect(response.body.data.users.length).toBeGreaterThan(0);
    expect(
      response.body.data.users.every((user: { email: string }) =>
        user.email.endsWith('@alpha.test'),
      ),
    ).toBe(true);
  });

  it("never returns another college's students", async () => {
    const response = await request(app)
      .get('/api/users?role=student&search=Test')
      .set(...bearer(betaClerkToken))
      .expect(200);

    expect(
      response.body.data.users.every((user: { email: string }) =>
        user.email.endsWith('@beta.test'),
      ),
    ).toBe(true);
  });
});

describe('a student cannot skip the queue', () => {
  it('has no route to verify anything', async () => {
    const { hashPassword } = await import('../src/services/auth.service.js');
    await UserModel.create({
      email: 'other@alpha.test',
      passwordHash: await hashPassword(TEST_PASSWORD),
      firstName: 'Other',
      lastName: 'Student',
      role: Role.Student,
      collegeId: world.alpha._id,
      studentProfile: {
        rollNumber: 'A009',
        programType: ProgramType.BE,
        entryType: EntryType.Regular,
        currentSemester: SEMESTER,
        streamId: world.alphaStudent.studentProfile!.streamId,
      },
    });

    const id = await submitForm();
    const otherToken = await loginAs(app, 'other@alpha.test');

    await request(app)
      .patch(`/api/exam-forms/${id}/reject`)
      .set(...bearer(otherToken))
      .send({ reason: 'Trying to interfere with a classmate.' })
      .expect(403);
  });
});
