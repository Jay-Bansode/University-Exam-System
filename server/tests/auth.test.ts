import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
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

describe('POST /api/auth/login', () => {
  it('returns the user and an access token on valid credentials', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'clerk@alpha.test', password: TEST_PASSWORD })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe('clerk@alpha.test');
    expect(response.body.data.user.role).toBe('clerk');
    expect(response.body.data.user.college.code).toBe('ALPHA');
    expect(typeof response.body.data.accessToken).toBe('string');
  });

  it('never returns the password hash or the refresh token in the body', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'clerk@alpha.test', password: TEST_PASSWORD })
      .expect(200);

    const serialised = JSON.stringify(response.body);
    expect(serialised).not.toContain('passwordHash');
    expect(serialised).not.toContain('$2b$');
    expect(response.body.data.refreshToken).toBeUndefined();
  });

  it('puts the refresh token in an httpOnly cookie scoped to /api/auth', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'clerk@alpha.test', password: TEST_PASSWORD })
      .expect(200);

    const cookies = response.headers['set-cookie'] as unknown as string[];
    const refreshCookie = cookies.find((cookie) => cookie.startsWith('ues_rt='));

    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain('HttpOnly');
    expect(refreshCookie).toContain('Path=/api/auth');
  });

  /**
   * The account-enumeration guarantee. If these two responses ever differ — in status,
   * error code, or message — an attacker can tell which email addresses are registered.
   * This test caught a real regression: a populate() failure turned the wrong-password
   * path into a 500 while the unknown-user path stayed a 401.
   */
  it('responds identically to a wrong password and an unknown account', async () => {
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: 'clerk@alpha.test', password: 'NotThePassword1' });

    const unknownUser = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@alpha.test', password: 'NotThePassword1' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownUser.body);
  });

  it('rejects a malformed request with field-level validation errors', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: '' })
      .expect(422);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.details.email).toBeDefined();
    expect(response.body.error.details.password).toBeDefined();
  });

  it('refuses a deactivated account', async () => {
    world.alphaClerk.isActive = false;
    await world.alphaClerk.save();

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'clerk@alpha.test', password: TEST_PASSWORD })
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('locks out every user of a deactivated college', async () => {
    world.alpha.isActive = false;
    await world.alpha.save();

    await request(app)
      .post('/api/auth/login')
      .send({ email: 'clerk@alpha.test', password: TEST_PASSWORD })
      .expect(403);

    // The other college is unaffected.
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'clerk@beta.test', password: TEST_PASSWORD })
      .expect(200);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the signed-in user', async () => {
    const token = await loginAs(app, 'student@alpha.test');

    const response = await request(app)
      .get('/api/auth/me')
      .set(...bearer(token))
      .expect(200);

    expect(response.body.data.user.email).toBe('student@alpha.test');
    expect(response.body.data.user.studentProfile.rollNumber).toBe('A001');
  });

  it('rejects a request with no token', async () => {
    const response = await request(app).get('/api/auth/me').expect(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a token signed with the wrong key', async () => {
    // A syntactically valid JWT whose signature does not verify.
    const forged =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWEiLCJyb2xlIjoidW5pdmVyc2l0eUFkbWluIn0.notavalidsignature';

    await request(app)
      .get('/api/auth/me')
      .set(...bearer(forged))
      .expect(401);
  });
});

describe('refresh token rotation', () => {
  async function loginAndGetCookie(email: string): Promise<string> {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email, password: TEST_PASSWORD })
      .expect(200);

    const cookies = response.headers['set-cookie'] as unknown as string[];
    return cookies.find((cookie) => cookie.startsWith('ues_rt='))!.split(';')[0]!;
  }

  it('issues a new refresh token each time, and invalidates the old one', async () => {
    const first = await loginAndGetCookie('clerk@alpha.test');

    const refreshed = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', first)
      .expect(200);

    const cookies = refreshed.headers['set-cookie'] as unknown as string[];
    const second = cookies.find((cookie) => cookie.startsWith('ues_rt='))!.split(';')[0]!;

    expect(second).not.toBe(first);
    expect(typeof refreshed.body.data.accessToken).toBe('string');
  });

  /**
   * Replay detection. Presenting an already-rotated token means two parties hold it, so
   * every session for that user is dropped rather than guessing which one is the thief.
   */
  it('revokes all sessions when a rotated token is replayed', async () => {
    const stolen = await loginAndGetCookie('clerk@alpha.test');

    const refreshed = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', stolen)
      .expect(200);

    const cookies = refreshed.headers['set-cookie'] as unknown as string[];
    const legitimate = cookies
      .find((cookie) => cookie.startsWith('ues_rt='))!
      .split(';')[0]!;

    // The attacker replays the old token.
    await request(app).post('/api/auth/refresh').set('Cookie', stolen).expect(401);

    // The legitimate holder is now locked out too, by design.
    await request(app).post('/api/auth/refresh').set('Cookie', legitimate).expect(401);
  });

  it('rejects a refresh with no cookie', async () => {
    await request(app).post('/api/auth/refresh').expect(401);
  });

  it('ends the session on logout', async () => {
    const cookie = await loginAndGetCookie('clerk@alpha.test');

    await request(app).post('/api/auth/logout').set('Cookie', cookie).expect(200);
    await request(app).post('/api/auth/refresh').set('Cookie', cookie).expect(401);
  });
});

describe('GET /api/auth/demo-accounts', () => {
  it('lists only accounts explicitly flagged as demo accounts', async () => {
    world.alphaClerk.isDemo = true;
    await world.alphaClerk.save();

    const response = await request(app).get('/api/auth/demo-accounts').expect(200);
    const emails = response.body.data.accounts.map((a: { email: string }) => a.email);

    expect(emails).toContain('clerk@alpha.test');
    // Real accounts must never appear here, even though they exist and are active.
    expect(emails).not.toContain('student@alpha.test');
    expect(emails).not.toContain('uni@test.local');
  });
});
