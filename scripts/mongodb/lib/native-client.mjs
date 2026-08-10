import { MongoClient } from 'mongodb';
import {
  DEV_DATABASE_NAME,
  LOCAL_MONGODB_HOST,
  LOCAL_MONGODB_PORT,
  LOCAL_MONGODB_URI,
  REPLICA_SET_NAME,
} from './constants.mjs';

const PROBE_TIMEOUT_MS = 4_000;

export function buildDirectUri(
  host = LOCAL_MONGODB_HOST,
  port = LOCAL_MONGODB_PORT,
) {
  return `mongodb://${host}:${port}/?directConnection=true`;
}

async function withClient(uri, run) {
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: PROBE_TIMEOUT_MS,
  });
  try {
    await client.connect();
    return await run(client);
  } finally {
    await client.close().catch(() => undefined);
  }
}

export async function pingMongo({ uri = buildDirectUri() } = {}) {
  await withClient(uri, async (client) => {
    await client.db('admin').command({ ping: 1 });
  });
}

export async function readNativeTopology() {
  try {
    return await withClient(buildDirectUri(), async (client) => {
      const hello = await client.db('admin').command({ hello: 1 });
      const setName =
        typeof hello.setName === 'string' && hello.setName.trim() !== ''
          ? hello.setName
          : null;
      return {
        reachable: true,
        initiated: setName !== null,
        setName,
        primaryElected: setName !== null && hello.isWritablePrimary === true,
        state: !setName
          ? 'STANDALONE'
          : hello.isWritablePrimary
            ? 'PRIMARY'
            : 'NON_PRIMARY',
        me: typeof hello.me === 'string' ? hello.me : undefined,
      };
    });
  } catch (error) {
    return {
      reachable: false,
      initiated: false,
      primaryElected: false,
      setName: null,
      state: undefined,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function pingConfiguredDatabase(
  databaseName = DEV_DATABASE_NAME,
  { uri = LOCAL_MONGODB_URI } = {},
) {
  await withClient(uri, async (client) => {
    await client.db(databaseName).command({ ping: 1 });
  });
}

/**
 * Idempotent rs.initiate for a single-node local topology.
 * Requires mongod already started with replication.replSetName configured.
 */
export async function initializeNativeReplicaSet({
  replicaSetName = REPLICA_SET_NAME,
  host = `${LOCAL_MONGODB_HOST}:${LOCAL_MONGODB_PORT}`,
} = {}) {
  const before = await readNativeTopology();
  if (!before.reachable) {
    throw new Error(
      `MongoDB is unreachable at ${LOCAL_MONGODB_HOST}:${LOCAL_MONGODB_PORT}. Start the local mongod service first.`,
    );
  }

  if (before.primaryElected && before.setName === replicaSetName) {
    return before;
  }

  if (before.initiated && before.setName && before.setName !== replicaSetName) {
    throw new Error(
      `MongoDB is already initialized as replica set '${before.setName}', expected '${replicaSetName}'.`,
    );
  }

  if (!before.initiated) {
    await withClient(buildDirectUri(), async (client) => {
      try {
        await client.db('admin').command({
          replSetInitiate: {
            _id: replicaSetName,
            members: [{ _id: 0, host }],
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/already initialized/i.test(message)) {
          if (/not running with --replSet/i.test(message) || /replSetName/i.test(message)) {
            throw new Error(
              [
                `mongod is not configured as replica set '${replicaSetName}'.`,
                'Enable replication.replSetName (or --replSet) for the local MongoDB service, restart mongod, then re-run `npm run db:init`.',
                `Driver detail: ${message}`,
              ].join('\n'),
            );
          }
          throw error;
        }
      }
    });
  }

  for (let attempt = 1; attempt <= 60; attempt += 1) {
    const current = await readNativeTopology();
    if (current.primaryElected && current.setName === replicaSetName) {
      return current;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Replica set '${replicaSetName}' did not elect a PRIMARY in time.`);
}

export function formatNativeWindowsReplicaSetInstructions() {
  return [
    'Locally installed MongoDB (Windows service) must run as single-node rs0:',
    '1. Edit mongod.cfg and set:',
    '     replication:',
    '       replSetName: rs0',
    '2. Restart the MongoDB Windows service (Administrator):',
    '     Restart-Service MongoDB',
    '3. Initialize and verify from the repo root:',
    '     npm run db:init',
    '     npm run db:status',
  ].join('\n');
}
