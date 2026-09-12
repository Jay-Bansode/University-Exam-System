import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

/**
 * An in-memory MongoDB for tests.
 *
 * A real database rather than mocked models, because the things worth testing here are
 * database behaviour: unique indexes, the tenant filter actually reaching the query, and
 * schema validation hooks. Mocking Mongoose would test the mock.
 *
 * A replica set rather than a standalone server, matching Atlas and the local
 * docker-compose setup, so transactions behave the same everywhere.
 */

let replSet: MongoMemoryReplSet | undefined;

export async function connectTestDatabase(): Promise<void> {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri(), { directConnection: true });

  // Index builds are asynchronous. Without waiting, the first test can run before a
  // unique index exists and a duplicate-key test passes for the wrong reason.
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).init()));
}

export async function disconnectTestDatabase(): Promise<void> {
  await mongoose.disconnect();
  await replSet?.stop();
}

/** Empties every collection between tests so each starts from a known state. */
export async function clearTestDatabase(): Promise<void> {
  const { collections } = mongoose.connection;
  await Promise.all(
    Object.values(collections).map((collection) => collection.deleteMany({})),
  );
}
