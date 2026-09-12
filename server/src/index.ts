import type { Server } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';

/**
 * Process entry point: connect, listen, and shut down cleanly.
 *
 * The database connects *before* the server listens. A server that accepts traffic
 * before its database is reachable answers the first requests with confusing 500s.
 */

let server: Server | undefined;

async function start(): Promise<void> {
  await connectDatabase();

  const app = createApp();

  server = app.listen(env.PORT, () => {
    console.log(`[server] listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
    console.log(`[server] allowed origins: ${env.CORS_ORIGINS.join(', ')}`);
  });
}

/**
 * Graceful shutdown. Render sends SIGTERM before it stops or sleeps an instance; without
 * this the process is killed mid-request and the Mongo connection is left to time out
 * on the Atlas side, wasting one of the M0 tier's limited connection slots.
 */
async function shutdown(signal: string): Promise<void> {
  console.log(`[server] ${signal} received, shutting down`);

  const forceExit = setTimeout(() => {
    console.error('[server] shutdown timed out, forcing exit');
    process.exit(1);
  }, 10_000);
  // Do not let this timer hold the event loop open if shutdown finishes first.
  forceExit.unref();

  try {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => (error ? reject(error) : resolve()));
      });
    }
    await disconnectDatabase();
    clearTimeout(forceExit);
    process.exit(0);
  } catch (error) {
    console.error('[server] error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandled promise rejection:', reason);
});

start().catch((error: unknown) => {
  console.error('[server] failed to start:', error);
  process.exit(1);
});
