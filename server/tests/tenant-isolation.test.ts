import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import {
  clearTestDatabase,
  connectTestDatabase,
  disconnectTestDatabase,
} from './helpers/db.js';
import { bearer, loginAs, seedTestWorld, type TestWorld } from './helpers/fixtures.js';

/**
 * The security proof of the whole system.
 *
 * Claiming tenant isolation is easy; these tests are what make it true. Each one
 * authenticates as a real user of one college and attempts to reach another college's
 * data through the API, exactly as an attacker with a valid account would.
 *
 * Every new college-scoped endpoint should gain a case here.
 */

let app: Express;
let world: TestWorld;

beforeAll(async () => {
  await connectTestDatabase();
  app = createApp();
});

afterAll(disconnectTestDatabase);

beforeEach(async () => {
  await clearTestDatabase();
  world = await seedTestWorld();
});

describe('reading another college by id', () => {
  it("returns 404 when a clerk requests another college's student", async () => {
    const alphaToken = await loginAs(app, 'clerk@alpha.test');

    const response = await request(app)
      .get(`/api/users/${world.betaStudent._id}`)
      .set(...bearer(alphaToken))
      .expect(404);

    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  /**
   * 404, never 403. A 403 would confirm the record exists, which lets an attacker probe
   * ids to map another college's data even without reading it.
   */
  it('is indistinguishable from a record that does not exist at all', async () => {
    const alphaToken = await loginAs(app, 'clerk@alpha.test');
    const nonexistentId = '0'.repeat(24);

    const otherCollege = await request(app)
      .get(`/api/users/${world.betaStudent._id}`)
      .set(...bearer(alphaToken));

    const missing = await request(app)
      .get(`/api/users/${nonexistentId}`)
      .set(...bearer(alphaToken));

    expect(otherCollege.status).toBe(missing.status);
    expect(otherCollege.body).toEqual(missing.body);
  });

  it('allows a clerk to read a student of their own college', async () => {
    const alphaToken = await loginAs(app, 'clerk@alpha.test');

    const response = await request(app)
      .get(`/api/users/${world.alphaStudent._id}`)
      .set(...bearer(alphaToken))
      .expect(200);

    expect(response.body.data.user.email).toBe('student@alpha.test');
  });
});

describe('listing users', () => {
  it('shows a clerk only their own college', async () => {
    const alphaToken = await loginAs(app, 'clerk@alpha.test');

    const response = await request(app)
      .get('/api/users')
      .set(...bearer(alphaToken))
      .expect(200);

    const emails: string[] = response.body.data.users.map(
      (user: { email: string }) => user.email,
    );

    expect(emails).toContain('clerk@alpha.test');
    expect(emails).toContain('student@alpha.test');
    expect(emails).not.toContain('clerk@beta.test');
    expect(emails).not.toContain('student@beta.test');
  });

  it('shows the university admin every college', async () => {
    const uniToken = await loginAs(app, 'uni@test.local');

    const response = await request(app)
      .get('/api/users')
      .set(...bearer(uniToken))
      .expect(200);

    const emails: string[] = response.body.data.users.map(
      (user: { email: string }) => user.email,
    );

    expect(emails).toContain('student@alpha.test');
    expect(emails).toContain('student@beta.test');
  });

  it("does not leak another college's students through the name search", async () => {
    const alphaToken = await loginAs(app, 'clerk@alpha.test');

    // Every fixture user shares the first name 'Test', so an unscoped search would
    // return both colleges.
    const response = await request(app)
      .get('/api/users?search=Test')
      .set(...bearer(alphaToken))
      .expect(200);

    const emails: string[] = response.body.data.users.map(
      (user: { email: string }) => user.email,
    );

    expect(emails.length).toBeGreaterThan(0);
    expect(emails.every((email) => email.endsWith('@alpha.test'))).toBe(true);
  });
});

describe('the tenant cannot be chosen by the client', () => {
  /**
   * The scope comes from the signed token and nothing else. These are the obvious
   * places someone would try to override it.
   */
  it('ignores a collegeId supplied in the query string', async () => {
    const alphaToken = await loginAs(app, 'clerk@alpha.test');

    const response = await request(app)
      .get(`/api/users?collegeId=${world.beta._id}`)
      .set(...bearer(alphaToken))
      .expect(200);

    const emails: string[] = response.body.data.users.map(
      (user: { email: string }) => user.email,
    );

    expect(emails.every((email) => email.endsWith('@alpha.test'))).toBe(true);
  });

  it('ignores a collegeId supplied in a header', async () => {
    const alphaToken = await loginAs(app, 'clerk@alpha.test');

    const response = await request(app)
      .get('/api/users')
      .set(...bearer(alphaToken))
      .set('X-College-Id', String(world.beta._id))
      .expect(200);

    const emails: string[] = response.body.data.users.map(
      (user: { email: string }) => user.email,
    );

    expect(emails.every((email) => email.endsWith('@alpha.test'))).toBe(true);
  });
});

describe('role enforcement', () => {
  it('forbids a student from listing users', async () => {
    const studentToken = await loginAs(app, 'student@alpha.test');

    const response = await request(app)
      .get('/api/users')
      .set(...bearer(studentToken))
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('forbids a student from reading another user by id', async () => {
    const studentToken = await loginAs(app, 'student@alpha.test');

    await request(app)
      .get(`/api/users/${world.alphaClerk._id}`)
      .set(...bearer(studentToken))
      .expect(403);
  });
});

describe('the schema refuses to store a broken tenant relationship', () => {
  it('rejects a college-scoped user with no college', async () => {
    const { UserModel } = await import('../src/models/user.model.js');

    await expect(
      UserModel.create({
        email: 'orphan@test.local',
        passwordHash: 'x',
        firstName: 'No',
        lastName: 'College',
        role: 'clerk',
        collegeId: null,
      }),
    ).rejects.toThrow(/requires a collegeId/);
  });

  it('rejects a university admin that belongs to a college', async () => {
    const { UserModel } = await import('../src/models/user.model.js');

    await expect(
      UserModel.create({
        email: 'confused@test.local',
        passwordHash: 'x',
        firstName: 'Scoped',
        lastName: 'Admin',
        role: 'universityAdmin',
        collegeId: world.alpha._id,
      }),
    ).rejects.toThrow(/must not belong to a college/);
  });
});
