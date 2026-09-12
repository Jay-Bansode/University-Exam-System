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

let app: Express;
let world: TestWorld;
let uniToken: string;
let clerkToken: string;

beforeAll(async () => {
  await connectTestDatabase();
  app = createApp();
});

afterAll(disconnectTestDatabase);

beforeEach(async () => {
  await clearTestDatabase();
  world = await seedTestWorld();
  uniToken = await loginAs(app, 'uni@test.local');
  clerkToken = await loginAs(app, 'clerk@alpha.test');
});

async function createStream(
  overrides: Partial<{ name: string; code: string; programType: ProgramType }> = {},
) {
  const response = await request(app)
    .post('/api/streams')
    .set(...bearer(uniToken))
    .send({
      name: 'Computer Engineering',
      code: 'CE',
      programType: ProgramType.BE,
      ...overrides,
    })
    .expect(201);

  return response.body.data.stream as { id: string; totalSemesters: number };
}

/**
 * Deliberately not `async`: it returns supertest's chainable Test so callers can write
 * `.expect(201)` directly. An `async` wrapper would return a plain Promise and break the
 * chain.
 */
function createSubject(streamId: string, overrides: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/subjects')
    .set(...bearer(uniToken))
    .send({
      streamId,
      semester: 5,
      name: 'Theoretical Computer Science',
      code: 'CSC501',
      credits: 3,
      subjectType: SubjectType.Theory,
      ...overrides,
    });
}

describe('who may change the syllabus', () => {
  /**
   * The defining rule of an affiliated university: the syllabus is published centrally.
   * A college can read it but never write to it, so faculty pick from a catalogue they
   * cannot extend.
   */
  it('lets any signed-in user read streams', async () => {
    await createStream();

    await request(app)
      .get('/api/streams')
      .set(...bearer(clerkToken))
      .expect(200);
  });

  it('forbids a clerk from creating a stream', async () => {
    const response = await request(app)
      .post('/api/streams')
      .set(...bearer(clerkToken))
      .send({ name: 'Rogue Branch', code: 'RB', programType: ProgramType.BE })
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('forbids a college admin from creating a subject', async () => {
    const stream = await createStream();
    const adminToken = await loginAs(app, 'clerk@alpha.test');

    await request(app)
      .post('/api/subjects')
      .set(...bearer(adminToken))
      .send({
        streamId: stream.id,
        semester: 5,
        name: 'Invented Subject',
        code: 'FAKE1',
        credits: 3,
        subjectType: SubjectType.Theory,
      })
      .expect(403);
  });

  it('rejects unauthenticated reads', async () => {
    await request(app).get('/api/subjects').expect(401);
  });
});

describe('streams', () => {
  it('derives the semester count from the programme type', async () => {
    const be = await createStream({ code: 'CE1' });
    const diploma = await createStream({
      code: 'CE2',
      programType: ProgramType.Diploma,
    });

    expect(be.totalSemesters).toBe(8);
    expect(diploma.totalSemesters).toBe(6);
  });

  it('allows the same code across different programmes', async () => {
    await createStream({ code: 'CE', programType: ProgramType.BE });

    // A Diploma in Computer Engineering is a genuinely different programme, so `CE`
    // being reused is correct rather than a clash.
    await request(app)
      .post('/api/streams')
      .set(...bearer(uniToken))
      .send({
        name: 'Computer Engineering',
        code: 'CE',
        programType: ProgramType.Diploma,
      })
      .expect(201);
  });

  it('rejects a duplicate code within one programme', async () => {
    await createStream();

    const response = await request(app)
      .post('/api/streams')
      .set(...bearer(uniToken))
      .send({ name: 'Another CE', code: 'CE', programType: ProgramType.BE })
      .expect(409);

    expect(response.body.error.details.code).toBeDefined();
  });

  it('reports how many subjects each stream has', async () => {
    const stream = await createStream();
    await createSubject(stream.id).expect(201);
    await createSubject(stream.id, {
      code: 'CSC502',
      name: 'Software Engineering',
    }).expect(201);

    const response = await request(app)
      .get('/api/streams')
      .set(...bearer(uniToken))
      .expect(200);

    expect(response.body.data.streams[0].subjectCount).toBe(2);
  });

  /**
   * A BE has eight semesters and a Diploma six. Switching a stream that already
   * publishes semester 7 or 8 subjects would strand them in a semester that no longer
   * exists.
   */
  it('refuses a programme change that would strand existing subjects', async () => {
    const stream = await createStream();
    await createSubject(stream.id, { semester: 8, code: 'CSC801' }).expect(201);

    const response = await request(app)
      .patch(`/api/streams/${stream.id}`)
      .set(...bearer(uniToken))
      .send({ programType: ProgramType.Diploma })
      .expect(409);

    expect(response.body.error.message).toMatch(/beyond 6/);
  });

  it('allows a programme change when nothing is stranded', async () => {
    const stream = await createStream();
    await createSubject(stream.id, { semester: 3, code: 'CSC301' }).expect(201);

    await request(app)
      .patch(`/api/streams/${stream.id}`)
      .set(...bearer(uniToken))
      .send({ programType: ProgramType.Diploma })
      .expect(200);
  });

  it('refuses to delete a stream that still has subjects', async () => {
    const stream = await createStream();
    await createSubject(stream.id).expect(201);

    const response = await request(app)
      .delete(`/api/streams/${stream.id}`)
      .set(...bearer(uniToken))
      .expect(409);

    expect(response.body.error.message).toMatch(/deactivate/i);
  });

  it('refuses to delete a stream that students are enrolled in', async () => {
    const stream = await createStream();

    world.alphaStudent.studentProfile!.streamId = stream.id as never;
    await world.alphaStudent.save();

    const response = await request(app)
      .delete(`/api/streams/${stream.id}`)
      .set(...bearer(uniToken))
      .expect(409);

    expect(response.body.error.message).toMatch(/enrolled student/i);
  });

  it('deletes a stream nothing depends on', async () => {
    const stream = await createStream();

    await request(app)
      .delete(`/api/streams/${stream.id}`)
      .set(...bearer(uniToken))
      .expect(200);
  });
});

describe('subjects', () => {
  it('creates a subject and reports its stream', async () => {
    const stream = await createStream();
    const response = await createSubject(stream.id).expect(201);

    expect(response.body.data.subject.code).toBe('CSC501');
    expect(response.body.data.subject.streamName).toBe('Computer Engineering');
  });

  it('uppercases the code', async () => {
    const stream = await createStream();
    const response = await createSubject(stream.id, { code: 'csc501' }).expect(201);

    expect(response.body.data.subject.code).toBe('CSC501');
  });

  /**
   * Semester 7 exists in a BE but not in a Diploma. The schema alone cannot catch this —
   * the limit depends on the stream being written to, not on the request.
   */
  it('rejects a semester beyond the stream’s programme', async () => {
    const diploma = await createStream({
      code: 'DCE',
      programType: ProgramType.Diploma,
    });

    const response = await createSubject(diploma.id, { semester: 7 }).expect(400);

    expect(response.body.error.details.semester).toBeDefined();
    expect(response.body.error.message).toMatch(/6 semesters/);
  });

  it('accepts semester 8 for a BE', async () => {
    const be = await createStream();
    await createSubject(be.id, { semester: 8, code: 'CSC801' }).expect(201);
  });

  it('rejects a duplicate code within the same stream', async () => {
    const stream = await createStream();
    await createSubject(stream.id).expect(201);

    const response = await createSubject(stream.id).expect(409);
    expect(response.body.error.details.code).toBeDefined();
  });

  it('allows the same code in a different stream', async () => {
    const first = await createStream({ code: 'CE' });
    const second = await createStream({ code: 'IT', name: 'Information Technology' });

    await createSubject(first.id).expect(201);
    await createSubject(second.id).expect(201);
  });

  it('filters by stream and semester', async () => {
    const stream = await createStream();
    await createSubject(stream.id, { semester: 3, code: 'CSC301' }).expect(201);
    await createSubject(stream.id, { semester: 5, code: 'CSC501' }).expect(201);

    const response = await request(app)
      .get(`/api/subjects?streamId=${stream.id}&semester=3`)
      .set(...bearer(uniToken))
      .expect(200);

    expect(response.body.data.subjects).toHaveLength(1);
    expect(response.body.data.subjects[0].code).toBe('CSC301');
  });

  /**
   * The guard that stops the syllabus being pulled out from under a college that is
   * already teaching a subject.
   */
  it('refuses to delete a subject a college is running', async () => {
    const stream = await createStream();
    const created = await createSubject(stream.id).expect(201);
    const subjectId = created.body.data.subject.id as string;

    const { SemesterOfferingModel } =
      await import('../src/models/semester-offering.model.js');

    await SemesterOfferingModel.create({
      collegeId: world.alpha._id,
      streamId: stream.id,
      academicYear: '2026-27',
      semester: 5,
      subjectIds: [subjectId],
    });

    const response = await request(app)
      .delete(`/api/subjects/${subjectId}`)
      .set(...bearer(uniToken))
      .expect(409);

    expect(response.body.error.message).toMatch(/in use by 1 college offering/);
  });

  it('deletes a subject no college is running', async () => {
    const stream = await createStream();
    const created = await createSubject(stream.id).expect(201);

    await request(app)
      .delete(`/api/subjects/${created.body.data.subject.id}`)
      .set(...bearer(uniToken))
      .expect(200);
  });
});

describe('exam windows', () => {
  const day = 24 * 60 * 60 * 1000;
  const iso = (offsetDays: number) =>
    new Date(Date.now() + offsetDays * day).toISOString();

  // Not `async`, for the same reason as `createSubject` above.
  function createWindow(overrides: Record<string, unknown> = {}) {
    return request(app)
      .post('/api/exam-windows')
      .set(...bearer(uniToken))
      .send({
        academicYear: '2026-27',
        semester: 5,
        openAt: iso(-1),
        closeAt: iso(20),
        isPublished: true,
        ...overrides,
      });
  }

  it('reports a published window spanning now as open', async () => {
    const response = await createWindow().expect(201);

    expect(response.body.data.window.isOpenNow).toBe(true);
    expect(response.body.data.window.status).toBe('open');
  });

  /**
   * Publication is separate from the dates precisely so a window can be drafted in
   * advance. An unpublished window is never open, whatever its dates say.
   */
  it('treats an unpublished window as a draft even when its dates span now', async () => {
    const response = await createWindow({ isPublished: false }).expect(201);

    expect(response.body.data.window.isOpenNow).toBe(false);
    expect(response.body.data.window.status).toBe('draft');
  });

  it('reports a future window as upcoming and a past one as closed', async () => {
    const upcoming = await createWindow({
      semester: 3,
      openAt: iso(7),
      closeAt: iso(21),
    }).expect(201);

    const past = await createWindow({
      semester: 1,
      openAt: iso(-30),
      closeAt: iso(-10),
    }).expect(201);

    expect(upcoming.body.data.window.status).toBe('upcoming');
    expect(past.body.data.window.status).toBe('closed');
  });

  it('rejects a closing date that is not after the opening date', async () => {
    const response = await createWindow({ openAt: iso(10), closeAt: iso(5) }).expect(422);
    expect(response.body.error.details.closeAt).toBeDefined();
  });

  it('rejects a malformed academic year', async () => {
    const response = await createWindow({ academicYear: '2026-2027' }).expect(422);
    expect(response.body.error.details.academicYear).toBeDefined();
  });

  it('allows only one window per semester per year', async () => {
    await createWindow().expect(201);

    const response = await createWindow().expect(409);
    expect(response.body.error.message).toMatch(/already exists/);
  });

  it('allows the same semester in a different academic year', async () => {
    await createWindow({ academicYear: '2025-26' }).expect(201);
    await createWindow({ academicYear: '2026-27' }).expect(201);
  });

  it('refuses to delete a window that is currently open', async () => {
    const created = await createWindow().expect(201);

    const response = await request(app)
      .delete(`/api/exam-windows/${created.body.data.window.id}`)
      .set(...bearer(uniToken))
      .expect(409);

    expect(response.body.error.message).toMatch(/unpublish/i);
  });

  it('allows deletion once the window is unpublished', async () => {
    const created = await createWindow().expect(201);
    const id = created.body.data.window.id as string;

    await request(app)
      .patch(`/api/exam-windows/${id}`)
      .set(...bearer(uniToken))
      .send({ isPublished: false })
      .expect(200);

    await request(app)
      .delete(`/api/exam-windows/${id}`)
      .set(...bearer(uniToken))
      .expect(200);
  });

  it('lets a student read the window but not change it', async () => {
    await createWindow().expect(201);
    const studentToken = await loginAs(app, 'student@alpha.test');

    await request(app)
      .get('/api/exam-windows')
      .set(...bearer(studentToken))
      .expect(200);

    await request(app)
      .post('/api/exam-windows')
      .set(...bearer(studentToken))
      .send({
        academicYear: '2027-28',
        semester: 5,
        openAt: iso(0),
        closeAt: iso(30),
      })
      .expect(403);
  });
});
