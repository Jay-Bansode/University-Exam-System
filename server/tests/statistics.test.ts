import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { ProgramType, SubjectType } from '@ues/shared';
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
import { ExamWindowModel } from '../src/models/exam-window.model.js';

let app: Express;
let world: TestWorld;
let uniToken: string;
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

  // Both colleges teach the stream and run the same offering, so figures can be
  // compared between them.
  for (const college of [world.alpha, world.beta]) {
    await CollegeStreamModel.create({ collegeId: college._id, streamId: stream._id });
    await SemesterOfferingModel.create({
      collegeId: college._id,
      streamId: stream._id,
      academicYear: YEAR,
      semester: SEMESTER,
      subjectIds,
    });
  }

  await ExamWindowModel.create({
    academicYear: YEAR,
    semester: SEMESTER,
    openAt: new Date(Date.now() - day),
    closeAt: new Date(Date.now() + 20 * day),
    isPublished: true,
  });

  for (const student of [world.alphaStudent, world.betaStudent]) {
    student.studentProfile!.streamId = stream._id;
    student.studentProfile!.currentSemester = SEMESTER;
    await student.save();
  }

  uniToken = await loginAs(app, 'uni@test.local');
});

function statistics(token: string) {
  return request(app)
    .get('/api/statistics')
    .set(...bearer(token));
}

/**
 * This is the only unscoped read in the system, so the role guard is the entire
 * protection. Every one of these cases matters more here than on a scoped route.
 */
describe('who may read cross-college statistics', () => {
  it.each([
    ['college admin', 'clerk@alpha.test'],
    ['student', 'student@alpha.test'],
  ])('forbids a %s', async (_role, email) => {
    const token = await loginAs(app, email);

    const response = await statistics(token).expect(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('rejects an unauthenticated request', async () => {
    await request(app).get('/api/statistics').expect(401);
  });

  it('allows the university admin', async () => {
    await statistics(uniToken).expect(200);
  });
});

describe('reporting window', () => {
  it('reports nothing when no window is published', async () => {
    await ExamWindowModel.deleteMany({});

    const response = await statistics(uniToken).expect(200);

    expect(response.body.data.academicYear).toBeNull();
    expect(response.body.data.semesters).toEqual([]);
  });

  /** A draft window is not a registration period, so it should not shape the report. */
  it('ignores an unpublished window', async () => {
    await ExamWindowModel.updateMany({}, { $set: { isPublished: false } });

    const response = await statistics(uniToken).expect(200);
    expect(response.body.data.academicYear).toBeNull();
  });

  it('reports the semesters of the published window', async () => {
    const response = await statistics(uniToken).expect(200);

    expect(response.body.data.academicYear).toBe(YEAR);
    expect(response.body.data.semesters).toEqual([SEMESTER]);
  });
});

describe('counting', () => {
  it('counts every student as not started before anyone submits', async () => {
    const response = await statistics(uniToken).expect(200);

    const { totals, byCollege } = response.body.data;

    expect(totals.students).toBe(2);
    expect(totals.notStarted).toBe(2);
    expect(totals.verified).toBe(0);
    expect(byCollege).toHaveLength(2);
  });

  it('moves a student from not-started to submitted', async () => {
    const studentToken = await loginAs(app, 'student@alpha.test');

    await request(app)
      .post('/api/exam-forms/me/submit')
      .set(...bearer(studentToken))
      .send({ subjectIds })
      .expect(200);

    const response = await statistics(uniToken).expect(200);
    const alpha = response.body.data.byCollege.find(
      (row: { collegeCode: string }) => row.collegeCode === 'ALPHA',
    );

    expect(alpha.submitted).toBe(1);
    expect(alpha.notStarted).toBe(0);
    expect(response.body.data.totals.notStarted).toBe(1);
  });

  it('counts a draft separately from a submission', async () => {
    const studentToken = await loginAs(app, 'student@alpha.test');

    await request(app)
      .put('/api/exam-forms/me/draft')
      .set(...bearer(studentToken))
      .send({ subjectIds: [subjectIds[0]!] })
      .expect(200);

    const response = await statistics(uniToken).expect(200);
    const alpha = response.body.data.byCollege.find(
      (row: { collegeCode: string }) => row.collegeCode === 'ALPHA',
    );

    // A draft is someone who started, so they are no longer "not started".
    expect(alpha.draft).toBe(1);
    expect(alpha.submitted).toBe(0);
    expect(alpha.notStarted).toBe(0);
  });

  it('reports a completion rate once a form is verified', async () => {
    const studentToken = await loginAs(app, 'student@alpha.test');
    const clerkToken = await loginAs(app, 'clerk@alpha.test');

    const submitted = await request(app)
      .post('/api/exam-forms/me/submit')
      .set(...bearer(studentToken))
      .send({ subjectIds })
      .expect(200);

    await request(app)
      .patch(`/api/exam-forms/${submitted.body.data.form.id}/verify`)
      .set(...bearer(clerkToken))
      .expect(200);

    const response = await statistics(uniToken).expect(200);
    const alpha = response.body.data.byCollege.find(
      (row: { collegeCode: string }) => row.collegeCode === 'ALPHA',
    );

    expect(alpha.verified).toBe(1);
    // One of one student verified.
    expect(alpha.completionRate).toBe(100);
  });

  it("keeps each college's figures separate", async () => {
    const alphaStudent = await loginAs(app, 'student@alpha.test');

    await request(app)
      .post('/api/exam-forms/me/submit')
      .set(...bearer(alphaStudent))
      .send({ subjectIds })
      .expect(200);

    const response = await statistics(uniToken).expect(200);
    const rows = response.body.data.byCollege as {
      collegeCode: string;
      submitted: number;
      notStarted: number;
    }[];

    const alpha = rows.find((row) => row.collegeCode === 'ALPHA')!;
    const beta = rows.find((row) => row.collegeCode === 'BETA')!;

    expect(alpha.submitted).toBe(1);
    expect(beta.submitted).toBe(0);
    expect(beta.notStarted).toBe(1);
  });

  /**
   * A student in a semester nobody is registering for should not depress the figures for
   * the semester that is open.
   */
  it('ignores students in a semester outside the reporting window', async () => {
    world.betaStudent.studentProfile!.currentSemester = 3;
    await world.betaStudent.save();

    const response = await statistics(uniToken).expect(200);

    expect(response.body.data.totals.students).toBe(1);
    const beta = response.body.data.byCollege.find(
      (row: { collegeCode: string }) => row.collegeCode === 'BETA',
    );
    expect(beta.students).toBe(0);
    expect(beta.notStarted).toBe(0);
  });

  it('breaks the same forms down by semester', async () => {
    const studentToken = await loginAs(app, 'student@alpha.test');

    await request(app)
      .post('/api/exam-forms/me/submit')
      .set(...bearer(studentToken))
      .send({ subjectIds })
      .expect(200);

    const response = await statistics(uniToken).expect(200);
    const [row] = response.body.data.bySemester;

    expect(row.semester).toBe(SEMESTER);
    expect(row.submitted).toBe(1);
  });

  it('includes a deactivated college but excludes it from the active count', async () => {
    world.beta.isActive = false;
    await world.beta.save();

    const response = await statistics(uniToken).expect(200);

    expect(response.body.data.totals.colleges).toBe(2);
    expect(response.body.data.totals.activeColleges).toBe(1);
    // Still listed, so its history does not silently vanish from the report.
    expect(response.body.data.byCollege).toHaveLength(2);
  });
});
