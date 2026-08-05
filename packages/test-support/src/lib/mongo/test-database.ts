import { randomUUID } from 'node:crypto';
import { AGRIVIO_TEST_DATABASE_PREFIX } from '../../constants.js';

/**
 * Creates a unique isolated integration-test database name.
 */
export function createIsolatedTestDatabaseName(suffix = randomUUID().replaceAll('-', '')): string {
  return `${AGRIVIO_TEST_DATABASE_PREFIX}${suffix}`;
}

/**
 * Resolves the MongoDB URI for local replica-set integration tests.
 */
export function resolveMongoTestUri(env: NodeJS.ProcessEnv = process.env): string {
  return env['MONGODB_URI'] ?? 'mongodb://127.0.0.1:27017/?replicaSet=rs0';
}

/**
 * Drops an isolated test database created for a single suite.
 */
export async function dropIsolatedTestDatabase(
  client: import('mongodb').MongoClient,
  databaseName: string,
): Promise<void> {
  const db = client.db(databaseName);
  await db.dropDatabase();
}
