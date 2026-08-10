import { dockerCompose, resolveDockerBinaryOrNull } from './lib/docker.mjs';

const docker = resolveDockerBinaryOrNull();
if (!docker) {
  console.error(
    [
      '[agrivio] db:reset is Docker Compose volume destruction only.',
      'Docker is unavailable, so this command refuses to run.',
      'It never resets a locally installed MongoDB service/data directory automatically.',
    ].join(' '),
  );
  process.exit(1);
}

console.warn('[agrivio] db:reset destroys local MongoDB Docker volumes and data.');

const down = dockerCompose(['down', '-v'], { stdio: 'inherit' });
if (down.status !== 0) {
  process.exit(down.status ?? 1);
}

const up = dockerCompose(['up', '-d', 'mongodb'], { stdio: 'inherit' });
if (up.status !== 0) {
  process.exit(up.status ?? 1);
}

console.log('[agrivio] Local MongoDB stack reset. Run `npm run db:init` before integration tests.');
