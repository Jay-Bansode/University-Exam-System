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
import {
  TEST_PASSWORD,
  bearer,
  loginAs,
  seedTestWorld,
  type TestWorld,
} from './helpers/fixtures.js';
import { UserModel } from '../src/models/user.model.js';
import { CorrectionRequestModel } from '../src/models/correction-request.model.js';

let app: Express;
let world: TestWorld;
let studentToken: string;
let clerkToken: string;
let betaClerkToken: string;

beforeAll(async () => {
  await connectTestDatabase();
  app = createApp();
});

afterAll(disconnectTestDatabase);

beforeEach(async () => {
  await clearTestDatabase();
  world = await seedTestWorld();

  studentToken = await loginAs(app, 'student@alpha.test');
  clerkToken = await loginAs(app, 'clerk@alpha.test');
  betaClerkToken = await loginAs(app, 'clerk@beta.test');
});

function raise(token: string, body: Record<string, unknown>) {
  return request(app)
    .post('/api/correction-requests')
    .set(...bearer(token))
    .send(body);
}

describe('raising a ticket', () => {
  it('allots a ticket number and records what is changing', async () => {
    const response = await raise(studentToken, { lastName: 'Kulkarni' }).expect(201);

    const { request: ticket } = response.body.data;

    expect(ticket.ticketNumber).toMatch(/^ALPHA\/COR\/\d{6}$/);
    expect(ticket.status).toBe('pending');
    expect(ticket.requested.lastName).toBe('Kulkarni');
    // The previous value is snapshotted, so the ticket still reads correctly later.
    expect(ticket.current.lastName).toBe('student');
  });

  /**
   * The documents follow from what is being changed, so every student asking for the
   * same correction is told the same thing and the office is not asked for paperwork
   * that proves nothing.
   */
  it('lists the documents a name change requires', async () => {
    const response = await raise(studentToken, { firstName: 'Aarav' }).expect(201);

    const documents: string[] = response.body.data.request.requiredDocuments;
    expect(documents.join(' ')).toMatch(/school leaving certificate/i);
    expect(documents.join(' ')).toMatch(/aadhaar/i);
  });

  it('asks for a birth certificate when the date of birth changes', async () => {
    const response = await raise(studentToken, { dateOfBirth: '2003-06-15' }).expect(201);

    const documents: string[] = response.body.data.request.requiredDocuments;
    expect(documents.join(' ')).toMatch(/birth certificate/i);
  });

  /** Submitting the form untouched should not create work for the office. */
  it('refuses a request that changes nothing', async () => {
    const response = await raise(studentToken, { firstName: 'Test' }).expect(400);
    expect(response.body.error.message).toMatch(/nothing has changed/i);
  });

  it('ignores unchanged fields and keeps only what differs', async () => {
    const response = await raise(studentToken, {
      firstName: 'Test',
      lastName: 'Deshmukh',
    }).expect(201);

    const { requested } = response.body.data.request;
    expect(requested.lastName).toBe('Deshmukh');
    expect(requested.firstName).toBeUndefined();
  });

  it('requires at least one field', async () => {
    await raise(studentToken, {}).expect(422);
  });

  /**
   * Two open tickets could ask for conflicting changes, and the office would have no way
   * to know which the student meant.
   */
  it('allows only one open ticket at a time', async () => {
    await raise(studentToken, { lastName: 'First' }).expect(201);

    const response = await raise(studentToken, { lastName: 'Second' }).expect(409);
    expect(response.body.error.message).toMatch(/already have an open request/i);
  });

  it('allows a new ticket once the previous one is resolved', async () => {
    const first = await raise(studentToken, { lastName: 'First' }).expect(201);

    await request(app)
      .patch(`/api/correction-requests/${first.body.data.request.id}/decline`)
      .set(...bearer(clerkToken))
      .send({ reason: 'The certificate you brought did not show that surname.' })
      .expect(200);

    await raise(studentToken, { lastName: 'Second' }).expect(201);
  });

  it('forbids a clerk from raising one', async () => {
    await raise(clerkToken, { lastName: 'Nope' }).expect(403);
  });
});

describe('photograph URLs', () => {
  /**
   * The browser uploads directly to Cloudinary and then reports where the file landed,
   * so the URL is user-supplied. Without pinning it to our own account, a student could
   * submit any address on the internet and have it stored and displayed.
   */
  it('refuses a photo URL that is not our own Cloudinary account', async () => {
    const response = await raise(studentToken, {
      photoUrl: 'https://evil.example.com/not-a-photo.png',
    }).expect(400);

    expect(response.body.error.details.photoUrl).toBeDefined();
  });

  it('refuses a Cloudinary URL belonging to a different cloud', async () => {
    await raise(studentToken, {
      photoUrl: 'https://res.cloudinary.com/somebody-else/image/upload/x.jpg',
    }).expect(400);
  });

  it('reports uploads as unavailable when Cloudinary is not configured', async () => {
    const response = await request(app)
      .get('/api/uploads/photo-signature')
      .set(...bearer(studentToken))
      .expect(200);

    // Reported as data, not an error: "are uploads available?" has a valid answer of no.
    expect(response.body.data.configured).toBe(false);
    expect(response.body.data.signature).toBeNull();
  });
});

describe('the clerk queue', () => {
  it('lists pending tickets for this college only', async () => {
    await raise(studentToken, { lastName: 'Kulkarni' }).expect(201);

    const mine = await request(app)
      .get('/api/correction-requests?status=pending')
      .set(...bearer(clerkToken))
      .expect(200);

    const theirs = await request(app)
      .get('/api/correction-requests?status=pending')
      .set(...bearer(betaClerkToken))
      .expect(200);

    expect(mine.body.data.requests).toHaveLength(1);
    expect(theirs.body.data.requests).toHaveLength(0);
  });

  it('shows the clerk both the current and requested values', async () => {
    await raise(studentToken, { lastName: 'Kulkarni' }).expect(201);

    const response = await request(app)
      .get('/api/correction-requests')
      .set(...bearer(clerkToken))
      .expect(200);

    const [ticket] = response.body.data.requests;
    expect(ticket.current.lastName).toBe('student');
    expect(ticket.requested.lastName).toBe('Kulkarni');
    expect(ticket.studentName).toBe('Test student');
  });

  it('forbids a student from reading the queue', async () => {
    await request(app)
      .get('/api/correction-requests')
      .set(...bearer(studentToken))
      .expect(403);
  });

  it('lets a student read their own tickets', async () => {
    await raise(studentToken, { lastName: 'Kulkarni' }).expect(201);

    const response = await request(app)
      .get('/api/correction-requests/me')
      .set(...bearer(studentToken))
      .expect(200);

    expect(response.body.data.requests).toHaveLength(1);
  });
});

describe('approving', () => {
  /** Approval is the only path by which these fields change. */
  it('applies the change to the student record', async () => {
    const ticket = await raise(studentToken, {
      firstName: 'Aarav',
      lastName: 'Kulkarni',
    }).expect(201);

    await request(app)
      .patch(`/api/correction-requests/${ticket.body.data.request.id}/approve`)
      .set(...bearer(clerkToken))
      .expect(200);

    const updated = await UserModel.findById(world.alphaStudent._id);
    expect(updated!.firstName).toBe('Aarav');
    expect(updated!.lastName).toBe('Kulkarni');
  });

  it('applies a date of birth change to the student profile', async () => {
    const ticket = await raise(studentToken, { dateOfBirth: '2003-06-15' }).expect(201);

    await request(app)
      .patch(`/api/correction-requests/${ticket.body.data.request.id}/approve`)
      .set(...bearer(clerkToken))
      .expect(200);

    const updated = await UserModel.findById(world.alphaStudent._id);
    expect(updated!.studentProfile!.dateOfBirth!.toISOString().slice(0, 10)).toBe(
      '2003-06-15',
    );
  });

  /** Removing a middle name is a real correction, not an accidental blank. */
  it('can clear a middle name', async () => {
    world.alphaStudent.middleName = 'Sanjay';
    await world.alphaStudent.save();

    const ticket = await raise(studentToken, { middleName: '' }).expect(201);

    await request(app)
      .patch(`/api/correction-requests/${ticket.body.data.request.id}/approve`)
      .set(...bearer(clerkToken))
      .expect(200);

    const updated = await UserModel.findById(world.alphaStudent._id);
    expect(updated!.middleName).toBeNull();
  });

  it('leaves the ticket showing what it changed, after the profile has moved on', async () => {
    const ticket = await raise(studentToken, { lastName: 'Kulkarni' }).expect(201);

    await request(app)
      .patch(`/api/correction-requests/${ticket.body.data.request.id}/approve`)
      .set(...bearer(clerkToken))
      .expect(200);

    const response = await request(app)
      .get('/api/correction-requests/me')
      .set(...bearer(studentToken))
      .expect(200);

    const [stored] = response.body.data.requests;
    // The snapshot still reads 'student' even though the profile now says 'Kulkarni'.
    expect(stored.current.lastName).toBe('student');
    expect(stored.requested.lastName).toBe('Kulkarni');
    expect(stored.status).toBe('approved');
  });

  it('refuses to approve twice', async () => {
    const ticket = await raise(studentToken, { lastName: 'Kulkarni' }).expect(201);
    const url = `/api/correction-requests/${ticket.body.data.request.id}/approve`;

    await request(app)
      .patch(url)
      .set(...bearer(clerkToken))
      .expect(200);
    await request(app)
      .patch(url)
      .set(...bearer(clerkToken))
      .expect(409);
  });

  it('returns 404 to a clerk at another college', async () => {
    const ticket = await raise(studentToken, { lastName: 'Kulkarni' }).expect(201);

    await request(app)
      .patch(`/api/correction-requests/${ticket.body.data.request.id}/approve`)
      .set(...bearer(betaClerkToken))
      .expect(404);
  });

  it('forbids a student from approving their own ticket', async () => {
    const ticket = await raise(studentToken, { lastName: 'Kulkarni' }).expect(201);

    await request(app)
      .patch(`/api/correction-requests/${ticket.body.data.request.id}/approve`)
      .set(...bearer(studentToken))
      .expect(403);
  });
});

describe('declining', () => {
  it('requires a reason', async () => {
    const ticket = await raise(studentToken, { lastName: 'Kulkarni' }).expect(201);

    const response = await request(app)
      .patch(`/api/correction-requests/${ticket.body.data.request.id}/decline`)
      .set(...bearer(clerkToken))
      .send({})
      .expect(422);

    expect(response.body.error.details.reason).toBeDefined();
  });

  it('rejects a reason too short to be useful', async () => {
    const ticket = await raise(studentToken, { lastName: 'Kulkarni' }).expect(201);

    await request(app)
      .patch(`/api/correction-requests/${ticket.body.data.request.id}/decline`)
      .set(...bearer(clerkToken))
      .send({ reason: 'no' })
      .expect(422);
  });

  it('records the reason and leaves the profile untouched', async () => {
    const ticket = await raise(studentToken, { lastName: 'Kulkarni' }).expect(201);

    await request(app)
      .patch(`/api/correction-requests/${ticket.body.data.request.id}/decline`)
      .set(...bearer(clerkToken))
      .send({ reason: 'The certificate you brought showed a different surname.' })
      .expect(200);

    const mine = await request(app)
      .get('/api/correction-requests/me')
      .set(...bearer(studentToken))
      .expect(200);

    expect(mine.body.data.requests[0].status).toBe('rejected');
    expect(mine.body.data.requests[0].reason).toMatch(/different surname/);

    const unchanged = await UserModel.findById(world.alphaStudent._id);
    expect(unchanged!.lastName).toBe('student');
  });
});

describe('ticket numbering', () => {
  it('gives concurrent tickets distinct numbers', async () => {
    const { hashPassword } = await import('../src/services/auth.service.js');
    const passwordHash = await hashPassword(TEST_PASSWORD);

    const emails = Array.from({ length: 8 }, (_, index) => `rush${index}@alpha.test`);

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
          programType: ProgramType.BE,
          entryType: EntryType.Regular,
          currentSemester: 5,
        },
      })),
    );

    const tokens = await Promise.all(emails.map((email) => loginAs(app, email)));

    const responses = await Promise.all(
      tokens.map((token) => raise(token, { lastName: 'Changed' })),
    );

    const numbers = responses.map(
      (response) => response.body.data.request.ticketNumber as string,
    );

    expect(responses.every((response) => response.status === 201)).toBe(true);
    expect(new Set(numbers).size).toBe(8);
  });

  it('scopes ticket numbers to the college', async () => {
    await raise(studentToken, { lastName: 'Kulkarni' }).expect(201);

    const betaStudentToken = await loginAs(app, 'student@beta.test');
    const betaTicket = await raise(betaStudentToken, { lastName: 'Patil' }).expect(201);

    expect(betaTicket.body.data.request.ticketNumber).toMatch(/^BETA\/COR\//);

    // Each college has its own sequence, so both start at 1.
    const stored = await CorrectionRequestModel.find({}).sort({ createdAt: 1 });
    expect(stored[0]!.ticketNumber).toBe('ALPHA/COR/000001');
    expect(stored[1]!.ticketNumber).toBe('BETA/COR/000001');
  });
});
