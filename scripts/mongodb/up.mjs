import { dockerCompose } from './lib/docker.mjs';
import { MONGO_IMAGE } from './lib/constants.mjs';

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
