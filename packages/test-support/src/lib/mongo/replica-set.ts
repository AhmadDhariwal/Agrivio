import type { MongoClient } from 'mongodb';
import { ReplicaSetUnavailableError } from '../errors.js';
import { AGRIVIO_DEFAULT_REPLICA_SET } from '../../constants.js';

/**
 * Waits until the configured replica set reports a PRIMARY member.
 */
export async function waitForReplicaSetPrimary(
  client: MongoClient,
  options: { timeoutMs?: number; pollMs?: number } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const pollMs = options.pollMs ?? 500;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const admin = client.db('admin');
      const result = await admin.command({ replSetGetStatus: 1 });
      const members = Array.isArray(result['members']) ? result['members'] : [];
      const hasPrimary = members.some(
        (member) =>
          typeof member === 'object' && member !== null && member['stateStr'] === 'PRIMARY',
      );
      if (hasPrimary) {
        return;
      }
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new ReplicaSetUnavailableError(
    `Replica set '${AGRIVIO_DEFAULT_REPLICA_SET}' did not elect a PRIMARY within ${timeoutMs}ms.`,
  );
}

/**
 * Fails fast when the replica set is not PRIMARY-ready.
 */
export async function assertReplicaSetPrimary(client: MongoClient): Promise<void> {
  try {
    await waitForReplicaSetPrimary(client, { timeoutMs: 5_000, pollMs: 250 });
  } catch (error) {
    if (error instanceof ReplicaSetUnavailableError) {
      throw error;
    }
    throw new ReplicaSetUnavailableError('Replica set is unavailable.', { cause: error });
  }
}
