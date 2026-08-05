import { describe, expect, it } from 'vitest';
import {
  assertReplicaSetPrimary,
  connectMongoClient,
  createIsolatedTestDatabaseName,
  disconnectMongoClient,
  dropIsolatedTestDatabase,
  runMultiDocumentTransaction,
  TRANSACTION_PROBE_COLLECTION,
  verifyTransactionCollectionEmpty,
} from '../index.js';

describe('MongoDB transactions', () => {
  it('commits a multi-document transaction', async () => {
    const databaseName = createIsolatedTestDatabaseName('commit');
    const client = await connectMongoClient();
    try {
      await assertReplicaSetPrimary(client);
      await runMultiDocumentTransaction(client, databaseName, async (session) => {
        const collection = client.db(databaseName).collection(TRANSACTION_PROBE_COLLECTION);
        await collection.insertOne({ step: 1 }, { session });
        await collection.insertOne({ step: 2 }, { session });
      });

      const count = await client
        .db(databaseName)
        .collection(TRANSACTION_PROBE_COLLECTION)
        .countDocuments();
      expect(count).toBe(2);
    } finally {
      await dropIsolatedTestDatabase(client, databaseName);
      await disconnectMongoClient(client);
    }
  });

  it('rolls back a multi-document transaction with no partial residue', async () => {
    const databaseName = createIsolatedTestDatabaseName('rollback');
    const client = await connectMongoClient();
    try {
      await assertReplicaSetPrimary(client);
      await expect(
        runMultiDocumentTransaction(client, databaseName, async (session) => {
          const collection = client.db(databaseName).collection(TRANSACTION_PROBE_COLLECTION);
          await collection.insertOne({ step: 1 }, { session });
          throw new Error('force rollback');
        }),
      ).rejects.toThrow(/force rollback/);

      await verifyTransactionCollectionEmpty(client, databaseName);
    } finally {
      await dropIsolatedTestDatabase(client, databaseName);
      await disconnectMongoClient(client);
    }
  });
});
