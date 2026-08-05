import { dockerCompose, resolveDockerBinary } from './lib/docker.mjs';
import { readReplicaSetSummary } from './lib/replica-set.mjs';
import {
  LOCAL_MONGODB_URI,
  MONGO_IMAGE,
  MONGO_IMAGE_TAG,
  REPLICA_SET_NAME,
} from './lib/constants.mjs';
import { spawnSync } from 'node:child_process';

function verifyRunningImageTag() {
  const docker = resolveDockerBinary();
  const inspect = spawnSync(
    docker,
    ['inspect', '--format', '{{.Config.Image}}', 'agrivio-mongodb-rs0'],
    { encoding: 'utf8', shell: true },
  );

  if (inspect.status !== 0) {
    throw new Error('MongoDB container is not running. Run `pnpm db:up` first.');
  }

  const imageRef = inspect.stdout.trim();
  if (!imageRef.includes(MONGO_IMAGE_TAG)) {
    throw new Error(
      `Expected MongoDB image tag ${MONGO_IMAGE_TAG} (${MONGO_IMAGE}), found '${imageRef}'.`,
    );
  }

  return imageRef;
}

try {
  const ps = dockerCompose(['ps', 'mongodb'], { stdio: 'pipe' });
  if (ps.status !== 0) {
    throw new Error('Unable to read Compose service status.');
  }

  const imageRef = verifyRunningImageTag();
  const summary = readReplicaSetSummary();

  console.log(`[agrivio] MongoDB image: ${imageRef}`);
  console.log(`[agrivio] Connection URI: ${LOCAL_MONGODB_URI}`);
  console.log(`[agrivio] Replica set: ${REPLICA_SET_NAME}`);
  console.log(
    `[agrivio] Initiated: ${summary.initiated ? 'yes' : 'no'}; PRIMARY elected: ${
      summary.primaryElected ? 'yes' : 'no'
    }${summary.state ? ` (${summary.state})` : ''}`,
  );

  if (!summary.primaryElected) {
    console.error('[agrivio] Replica set is not PRIMARY-ready. Run `pnpm db:init`.');
    process.exit(1);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[agrivio] db:status failed: ${message}`);
  process.exit(1);
}
