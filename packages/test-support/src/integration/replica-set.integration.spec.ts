import { describe, expect, it } from 'vitest';
import {
  assertReplicaSetPrimary,
  connectMongoClient,
  createIsolatedTestDatabaseName,
  disconnectMongoClient,
  dropIsolatedTestDatabase,
  resolveMongoTestUri,
} from '../index.js';

describe('local MongoDB replica set', () => {
  it('elects a PRIMARY on the configured replica set', async () => {
    const client = await connectMongoClient(resolveMongoTestUri());
    try {
      await assertReplicaSetPrimary(client);
      const status = await client.db('admin').command({ replSetGetStatus: 1 });
      const members = status['members'] as Array<{ stateStr?: string }>;
      expect(members.some((member) => member.stateStr === 'PRIMARY')).toBe(true);
    } finally {
      await disconnectMongoClient(client);
    }
  });

  it('cleans isolated integration test databases', async () => {
    const databaseName = createIsolatedTestDatabaseName('cleanup');
    const client = await connectMongoClient(resolveMongoTestUri());
    try {
      await assertReplicaSetPrimary(client);
      await client.db(databaseName).collection('probe').insertOne({ ok: true });
      await dropIsolatedTestDatabase(client, databaseName);
      const collections = await client.db(databaseName).listCollections().toArray();
      expect(collections).toEqual([]);
    } finally {
      await disconnectMongoClient(client);
    }
  });
});
