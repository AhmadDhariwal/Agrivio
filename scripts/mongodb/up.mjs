import { dockerCompose, resolveDockerBinaryOrNull } from './lib/docker.mjs';
import { MONGO_IMAGE } from './lib/constants.mjs';
import {
  formatNativeWindowsReplicaSetInstructions,
  readNativeTopology,
} from './lib/native-client.mjs';

const docker = resolveDockerBinaryOrNull();

if (!docker) {
  const topology = await readNativeTopology();
  if (!topology.reachable) {
    console.error(
      '[agrivio] Docker is unavailable and local mongod is not reachable on 127.0.0.1:27017.',
    );
    console.error(formatNativeWindowsReplicaSetInstructions());
    process.exit(1);
  }

  console.log('[agrivio] Docker is unavailable; using locally installed MongoDB on 127.0.0.1:27017.');
  if (!topology.initiated) {
    console.log('[agrivio] Local mongod is running in standalone mode (not yet rs0).');
    console.log(formatNativeWindowsReplicaSetInstructions());
    process.exit(0);
  }

  console.log(
    `[agrivio] Local mongod replica set detected (setName=${topology.setName ?? 'unknown'}; PRIMARY=${
      topology.primaryElected ? 'yes' : 'no'
    }).`,
  );
  console.log('[agrivio] Run `npm run db:init` if PRIMARY is not elected, then `npm run db:status`.');
  process.exit(0);
}

const pull = dockerCompose(['pull', 'mongodb'], { stdio: 'inherit' });
if (pull.status !== 0) {
  process.exit(pull.status ?? 1);
}

const up = dockerCompose(['up', '-d', 'mongodb'], { stdio: 'inherit' });
if (up.status !== 0) {
  process.exit(up.status ?? 1);
}

console.log(`[agrivio] MongoDB replica-set container started (${MONGO_IMAGE}).`);
console.log('[agrivio] Run `npm run db:init` to initialize replica set rs0 and wait for PRIMARY.');
