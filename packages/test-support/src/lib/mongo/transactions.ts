import type { ClientSession, MongoClient } from 'mongodb';

const TRANSACTION_PROBE_COLLECTION = '_agrivio_transaction_probe';

/**
 * Runs a callback inside a multi-document transaction.
 */
export async function runMultiDocumentTransaction<T>(
  client: MongoClient,
  databaseName: string,
  callback: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const session = client.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await callback(session);
    });
    if (result === undefined) {
      throw new Error('Transaction callback did not return a value.');
    }
    return result;
  } finally {
    await session.endSession();
  }
}

export async function verifyTransactionCollectionEmpty(
  client: MongoClient,
  databaseName: string,
): Promise<void> {
  const count = await client
    .db(databaseName)
    .collection(TRANSACTION_PROBE_COLLECTION)
    .countDocuments();
  if (count !== 0) {
    throw new Error(`Expected probe collection to be empty, found ${count} document(s).`);
  }
}

export { TRANSACTION_PROBE_COLLECTION };
