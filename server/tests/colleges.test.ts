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
let uniToken: string;

beforeAll(async () => {
  await connectTestDatabase();
  app = createApp();
});

afterAll(disconnectTestDatabase);

beforeEach(async () => {
  await clearTestDatabase();
  world = await seedTestWorld();
  uniToken = await loginAs(app, 'uni@test.local');
});

describe('who may manage colleges', () => {
  /**
   * College management is the university tier's alone. Every other role — including a
   * college admin acting on their *own* college — must be refused, or the tenant
   * boundary becomes self-administered.
   */
  it.each([
    ['clerk', 'clerk@alpha.test'],
    ['student', 'student@alpha.test'],
  ])('forbids a %s from listing colleges', async (_role, email) => {
    const token = await loginAs(app, email);

    const response = await request(app)
      .get('/api/colleges')
      .set(...bearer(token))
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('forbids a clerk from creating a college', async () => {
    const token = await loginAs(app, 'clerk@alpha.test');

    await request(app)
      .post('/api/colleges')
      .set(...bearer(token))
      .send({ name: 'Sneaky College', code: 'SNEAK' })
      .expect(403);
  });

  it('rejects an unauthenticated request', async () => {
    await request(app).get('/api/colleges').expect(401);
  });
});

describe('GET /api/colleges', () => {
  it('lists every college with a headcount by role', async () => {
    const response = await request(app)
      .get('/api/colleges')
      .set(...bearer(uniToken))
      .expect(200);

    const colleges = response.body.data.colleges as {
      code: string;
      stats: { total: number; clerks: number; students: number };
    }[];

    expect(colleges).toHaveLength(2);

    const alpha = colleges.find((college) => college.code === 'ALPHA')!;
    expect(alpha.stats.clerks).toBe(1);
    expect(alpha.stats.students).toBe(1);
    expect(alpha.stats.total).toBe(2);
  });

  it('reports zero counts for a college with no users', async () => {
    await request(app)
      .post('/api/colleges')
      .set(...bearer(uniToken))
      .send({ name: 'Empty College of Engineering', code: 'EMPTY' })
      .expect(201);

    const response = await request(app)
      .get('/api/colleges')
      .set(...bearer(uniToken))
      .expect(200);

    const empty = response.body.data.colleges.find(
      (college: { code: string }) => college.code === 'EMPTY',
    );

    expect(empty.stats.total).toBe(0);
  });
});

describe('POST /api/colleges', () => {
  it('creates a college and returns 201', async () => {
    const response = await request(app)
      .post('/api/colleges')
      .set(...bearer(uniToken))
      .send({
        name: 'Sardar Patel Institute of Technology',
        code: 'spit',
        city: 'Mumbai',
        affiliationYear: 1995,
      })
      .expect(201);

    // Codes are uppercased on the way in, so 'spit' and 'SPIT' cannot both exist.
    expect(response.body.data.college.code).toBe('SPIT');
    expect(response.body.data.college.isActive).toBe(true);
  });

  it('rejects a duplicate code, whatever its casing', async () => {
    const response = await request(app)
      .post('/api/colleges')
      .set(...bearer(uniToken))
      .send({ name: 'Another Alpha', code: 'alpha' })
      .expect(409);

    expect(response.body.error.code).toBe('CONFLICT');
    expect(response.body.error.details.code).toBeDefined();
  });

  it('rejects an invalid code with field-level detail', async () => {
    const response = await request(app)
      .post('/api/colleges')
      .set(...bearer(uniToken))
      .send({ name: 'Bad Code College', code: 'way-too-long-code' })
      .expect(422);

    expect(response.body.error.details.code).toBeDefined();
  });

  it('rejects an affiliation year in the future', async () => {
    await request(app)
      .post('/api/colleges')
      .set(...bearer(uniToken))
      .send({ name: 'Time Travel College', code: 'TTC', affiliationYear: 3000 })
      .expect(422);
  });
});

describe('PATCH /api/colleges/:id', () => {
  it('updates the fields provided and leaves the rest alone', async () => {
    const response = await request(app)
      .patch(`/api/colleges/${world.alpha._id}`)
      .set(...bearer(uniToken))
      .send({ city: 'Navi Mumbai' })
      .expect(200);

    expect(response.body.data.college.city).toBe('Navi Mumbai');
    expect(response.body.data.college.name).toBe('Alpha College of Engineering');
  });

  it('rejects an empty body rather than silently doing nothing', async () => {
    await request(app)
      .patch(`/api/colleges/${world.alpha._id}`)
      .set(...bearer(uniToken))
      .send({})
      .expect(422);
  });

  it("refuses to take another college's code", async () => {
    await request(app)
      .patch(`/api/colleges/${world.alpha._id}`)
      .set(...bearer(uniToken))
      .send({ code: 'BETA' })
      .expect(409);
  });

  it('returns 404 for an unknown id', async () => {
    await request(app)
      .patch(`/api/colleges/${'0'.repeat(24)}`)
      .set(...bearer(uniToken))
      .send({ city: 'Nowhere' })
      .expect(404);
  });
});

describe('deactivating a college', () => {
  it('locks its users out and kills their live sessions', async () => {
    // Establish a session first, so there is something to revoke.
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'clerk@alpha.test', password: TEST_PASSWORD })
      .expect(200);

    const cookie = (login.headers['set-cookie'] as unknown as string[])
      .find((entry) => entry.startsWith('ues_rt='))!
      .split(';')[0]!;

    await request(app)
      .patch(`/api/colleges/${world.alpha._id}/status`)
      .set(...bearer(uniToken))
      .send({ isActive: false })
      .expect(200);

    // Cannot sign in again.
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'clerk@alpha.test', password: TEST_PASSWORD })
      .expect(403);

    // And the session they already held cannot be renewed.
    await request(app).post('/api/auth/refresh').set('Cookie', cookie).expect(401);
  });

  it('leaves the other college untouched', async () => {
    await request(app)
      .patch(`/api/colleges/${world.alpha._id}/status`)
      .set(...bearer(uniToken))
      .send({ isActive: false })
      .expect(200);

    await request(app)
      .post('/api/auth/login')
      .send({ email: 'clerk@beta.test', password: TEST_PASSWORD })
      .expect(200);
  });

  it('can be reversed', async () => {
    const url = `/api/colleges/${world.alpha._id}/status`;

    await request(app)
      .patch(url)
      .set(...bearer(uniToken))
      .send({ isActive: false })
      .expect(200);
    await request(app)
      .patch(url)
      .set(...bearer(uniToken))
      .send({ isActive: true })
      .expect(200);

    await request(app)
      .post('/api/auth/login')
      .send({ email: 'clerk@alpha.test', password: TEST_PASSWORD })
      .expect(200);
  });
});

describe('DELETE /api/colleges/:id', () => {
  /**
   * Deletion is refused once a college has users, because deleting it would take their
   * exam history with it. Deactivation is the intended path.
   */
  it('refuses to delete a college that has users', async () => {
    const response = await request(app)
      .delete(`/api/colleges/${world.alpha._id}`)
      .set(...bearer(uniToken))
      .expect(409);

    expect(response.body.error.message).toMatch(/deactivate it instead/i);
  });

  it('deletes a college that has none', async () => {
    const created = await request(app)
      .post('/api/colleges')
      .set(...bearer(uniToken))
      .send({ name: 'Disposable College', code: 'DISP' })
      .expect(201);

    await request(app)
      .delete(`/api/colleges/${created.body.data.college.id}`)
      .set(...bearer(uniToken))
      .expect(200);

    await request(app)
      .get(`/api/colleges/${created.body.data.college.id}`)
      .set(...bearer(uniToken))
      .expect(404);
  });
});

describe('POST /api/colleges/:id/admins', () => {
  it('creates an admin who can sign in with the generated password', async () => {
    const created = await request(app)
      .post('/api/colleges')
      .set(...bearer(uniToken))
      .send({ name: 'Gamma College of Engineering', code: 'GAMMA' })
      .expect(201);

    const collegeId = created.body.data.college.id as string;

    const response = await request(app)
      .post(`/api/colleges/${collegeId}/admins`)
      .set(...bearer(uniToken))
      .send({
        email: 'admin@gamma.test',
        firstName: 'Meera',
        lastName: 'Rao',
      })
      .expect(201);

    const { temporaryPassword } = response.body.data;
    expect(typeof temporaryPassword).toBe('string');
    expect(temporaryPassword.length).toBeGreaterThanOrEqual(12);

    // The generated password genuinely works.
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@gamma.test', password: temporaryPassword })
      .expect(200);

    expect(login.body.data.user.role).toBe('collegeAdmin');
    expect(login.body.data.user.college.code).toBe('GAMMA');
  });

  it('scopes the new admin to their own college only', async () => {
    const response = await request(app)
      .post(`/api/colleges/${world.beta._id}/admins`)
      .set(...bearer(uniToken))
      .send({ email: 'admin@beta.test', firstName: 'Neha', lastName: 'Patil' })
      .expect(201);

    const token = await (async () => {
      const login = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@beta.test',
          password: response.body.data.temporaryPassword,
        })
        .expect(200);
      return login.body.data.accessToken as string;
    })();

    const users = await request(app)
      .get('/api/users')
      .set(...bearer(token))
      .expect(200);

    const emails: string[] = users.body.data.users.map((u: { email: string }) => u.email);
    expect(emails.every((email) => email.endsWith('@beta.test'))).toBe(true);
    expect(emails).not.toContain('clerk@alpha.test');
  });

  it('rejects an email that is already registered', async () => {
    const response = await request(app)
      .post(`/api/colleges/${world.beta._id}/admins`)
      .set(...bearer(uniToken))
      .send({ email: 'clerk@alpha.test', firstName: 'Dup', lastName: 'Licate' })
      .expect(409);

    expect(response.body.error.details.email).toBeDefined();
  });

  it('refuses to add an admin to a deactivated college', async () => {
    await request(app)
      .patch(`/api/colleges/${world.beta._id}/status`)
      .set(...bearer(uniToken))
      .send({ isActive: false })
      .expect(200);

    await request(app)
      .post(`/api/colleges/${world.beta._id}/admins`)
      .set(...bearer(uniToken))
      .send({ email: 'admin@beta.test', firstName: 'Too', lastName: 'Late' })
      .expect(400);
  });

  it('generates a different password each time', async () => {
    const make = async (email: string) => {
      const response = await request(app)
        .post(`/api/colleges/${world.beta._id}/admins`)
        .set(...bearer(uniToken))
        .send({ email, firstName: 'A', lastName: 'B' })
        .expect(201);
      return response.body.data.temporaryPassword as string;
    };

    expect(await make('one@beta.test')).not.toBe(await make('two@beta.test'));
  });
});
