/**
 * Test environment defaults.
 *
 * `config/env.ts` validates the environment the moment it is imported and throws when a
 * required variable is missing. Setting these here — before any test file is loaded —
 * means tests never need a real `.env`, and a missing variable in CI is still caught
 * where it matters.
 *
 * `MONGODB_URI` is only present to satisfy that validation. Tests that need a database
 * start their own in-memory replica set and connect to that instead; this value is never
 * dialled.
 */
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/university-exam-system-test';
process.env.CORS_ORIGINS ??= 'http://localhost:5173';

// A fixed, obviously-fake signing key. Tests must never depend on a real secret, and a
// literal here makes it clear this value has no meaning outside the suite.
process.env.JWT_ACCESS_SECRET ??= 'test-only-signing-key-not-for-any-real-environment';
process.env.ACCESS_TOKEN_MINUTES ??= '15';
process.env.REFRESH_TOKEN_DAYS ??= '7';
