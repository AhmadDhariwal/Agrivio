import { MongoClient, type MongoClientOptions } from 'mongodb';
import { resolveMongoTestUri } from './test-database.js';

export const DEFAULT_MONGO_CLIENT_OPTIONS: MongoClientOptions = {
  serverSelectionTimeoutMS: 5_000,
  connectTimeoutMS: 5_000,
};

/**
 * Connects a MongoDB client to the configured local replica set.
 */
export async function connectMongoClient(
  uri?: string,
  options: MongoClientOptions = DEFAULT_MONGO_CLIENT_OPTIONS,
): Promise<MongoClient> {
  const client = new MongoClient(uri ?? resolveMongoTestUri(), options);
  await client.connect();
  return client;
}

export async function disconnectMongoClient(client: MongoClient): Promise<void> {
  await client.close();
}

/**
 * Runs a callback with a connected client and always closes the connection.
 */
export async function withMongoClient<T>(
  callback: (client: MongoClient) => Promise<T>,
  uri?: string,
): Promise<T> {
  const client = await connectMongoClient(uri);
  try {
    return await callback(client);
  } finally {
    await disconnectMongoClient(client);
  }
}
