import { dockerCompose } from './lib/docker.mjs';

console.warn('[agrivio] db:reset destroys local MongoDB Docker volumes and data.');

const down = dockerCompose(['down', '-v'], { stdio: 'inherit' });
if (down.status !== 0) {
  process.exit(down.status ?? 1);
}

const up = dockerCompose(['up', '-d', 'mongodb'], { stdio: 'inherit' });
if (up.status !== 0) {
  process.exit(up.status ?? 1);
}

console.log('[agrivio] Local MongoDB stack reset. Run `pnpm db:init` before integration tests.');
