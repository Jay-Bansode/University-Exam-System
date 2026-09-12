import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

describe('GET /api/health', () => {
  it('reports service status in the standard envelope', async () => {
    const response = await request(app).get('/api/health').expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      status: 'ok',
      service: 'university-exam-system-api',
      environment: 'test',
    });
    expect(typeof response.body.data.uptimeSeconds).toBe('number');
  });

  it('reports a recognised database state', async () => {
    const response = await request(app).get('/api/health').expect(200);
    // This file opens no connection, so the state is 'disconnected' here. Asserted as a
    // member of the valid set rather than a literal, so the test does not break if the
    // suite is ever run in a shared-connection mode.
    expect(['connected', 'connecting', 'disconnected']).toContain(
      response.body.data.database,
    );
  });
});

describe('unmatched routes', () => {
  it('returns a 404 in the failure envelope rather than Express default HTML', async () => {
    const response = await request(app).get('/api/does-not-exist').expect(404);

    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'NOT_FOUND' },
    });
  });
});

describe('CORS allowlist', () => {
  it('allows a configured origin with credentials', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5173')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('withholds the allow-origin header for an unlisted origin', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('Origin', 'https://not-my-site.example')
      .expect(200);

    // The request still executes — CORS is enforced by the browser, not the server —
    // but without this header the browser refuses to hand the response to page script.
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
