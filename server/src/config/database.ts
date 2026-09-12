import mongoose from 'mongoose';
import { env, isProduction } from './env.js';

/**
 * MongoDB connection management.
 *
 * Mongoose keeps one connection pool for the whole process, so this is called once at
 * boot rather than per request. That is the closest analogue to a long-lived DbContext
 * factory: the pool is shared, individual operations are not.
 */

mongoose.set('strictQuery', true);

// Surfaces slow or unexpected queries during development without a debugger attached.
if (!isProduction) {
  mongoose.set('debug', false);
}

export type DatabaseState = 'connected' | 'connecting' | 'disconnected';

const READY_STATE_MAP: Record<number, DatabaseState> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnected', // disconnecting
};

export function getDatabaseState(): DatabaseState {
  return READY_STATE_MAP[mongoose.connection.readyState] ?? 'disconnected';
}

export async function connectDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;

  mongoose.connection.on('error', (error) => {
    console.error('[database] connection error:', error);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[database] disconnected');
  });

  await mongoose.connect(env.MONGODB_URI, {
    // Fail fast rather than hanging for the 30s default when Atlas is unreachable or
    // the current IP is not on the access list — the most common first-time setup error.
    serverSelectionTimeoutMS: 10_000,
    // Atlas M0 allows 500 connections in total. A small pool leaves headroom when the
    // same cluster is shared between local development and the deployed instance.
    maxPoolSize: 10,
  });

  console.log(`[database] connected to ${mongoose.connection.name}`);
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
  console.log('[database] disconnected');
}
