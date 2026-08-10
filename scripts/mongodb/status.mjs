import { resolveDockerBinaryOrNull } from './lib/docker.mjs';
import { readReplicaSetSummary } from './lib/replica-set.mjs';
import {
  DEV_DATABASE_NAME,
  LOCAL_MONGODB_HOST,
  LOCAL_MONGODB_PORT,
  LOCAL_MONGODB_URI,
  MONGO_IMAGE,
  MONGO_IMAGE_TAG,
  REPLICA_SET_NAME,
} from './lib/constants.mjs';
import {
  formatNativeWindowsReplicaSetInstructions,
  pingConfiguredDatabase,
  pingMongo,
  readNativeTopology,
} from './lib/native-client.mjs';
import { spawnSync } from 'node:child_process';

function verifyRunningImageTag() {
  const docker = resolveDockerBinaryOrNull();
  if (!docker) {
    return null;
  }

  const inspect = spawnSync(
    docker,
    ['inspect', '--format', '{{.Config.Image}}', 'agrivio-mongodb-rs0'],
    { encoding: 'utf8' },
  );

  if (inspect.status !== 0) {
    return null;
  }

  const imageRef = inspect.stdout.trim();
  if (imageRef && !imageRef.includes(MONGO_IMAGE_TAG)) {
    throw new Error(
      `Expected MongoDB image tag ${MONGO_IMAGE_TAG} (${MONGO_IMAGE}), found '${imageRef}'.`,
    );
  }

  return imageRef || null;
}

try {
  const imageRef = verifyRunningImageTag();
  const topology = imageRef ? await readReplicaSetSummary() : await readNativeTopology();

  console.log(`[agrivio] Mode: ${imageRef ? `docker (${imageRef})` : 'native/local mongod'}`);
  console.log(`[agrivio] Host: ${LOCAL_MONGODB_HOST}:${LOCAL_MONGODB_PORT}`);
  console.log(`[agrivio] Connection URI: ${LOCAL_MONGODB_URI}`);
  console.log(`[agrivio] Logical database: ${DEV_DATABASE_NAME}`);
  console.log(`[agrivio] Replica set: ${REPLICA_SET_NAME}`);

  if (!topology.reachable && topology.reachable !== undefined) {
    console.error(`[agrivio] Ping: failed (${topology.error ?? 'unreachable'})`);
    process.exit(1);
  }

  try {
    await pingMongo();
    console.log('[agrivio] Ping: ok');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[agrivio] Ping: failed (${message})`);
    process.exit(1);
  }

  console.log(
    `[agrivio] Replica-set status: initiated=${topology.initiated ? 'yes' : 'no'}; PRIMARY=${
      topology.primaryElected ? 'yes' : 'no'
    }${topology.state ? ` (${topology.state})` : ''}${
      topology.setName ? `; setName=${topology.setName}` : ''
    }`,
  );

  if (!topology.initiated) {
    console.error('[agrivio] MongoDB is reachable but not a replica set.');
    console.error(formatNativeWindowsReplicaSetInstructions());
    process.exit(1);
  }

  if (topology.setName && topology.setName !== REPLICA_SET_NAME) {
    console.error(
      `[agrivio] Wrong replica-set name: found '${topology.setName}', expected '${REPLICA_SET_NAME}'.`,
    );
    process.exit(1);
  }

  if (!topology.primaryElected) {
    console.error('[agrivio] Replica set is not PRIMARY-ready. Run `npm run db:init`.');
    process.exit(1);
  }

  try {
    await pingConfiguredDatabase(DEV_DATABASE_NAME);
    console.log(`[agrivio] Database connectivity (${DEV_DATABASE_NAME}): ok`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[agrivio] Database connectivity (${DEV_DATABASE_NAME}): failed (${message})`);
    process.exit(1);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[agrivio] db:status failed: ${message}`);
  process.exit(1);
}
