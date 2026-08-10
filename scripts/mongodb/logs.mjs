import { dockerCompose, resolveDockerBinaryOrNull } from './lib/docker.mjs';

const docker = resolveDockerBinaryOrNull();
if (!docker) {
  console.log(
    '[agrivio] Docker is unavailable. db:logs is Compose-only; inspect the local mongod service log (for example MongoDB Server log under Program Files) instead.',
  );
  process.exit(0);
}

const logs = dockerCompose(['logs', '-f', 'mongodb'], { stdio: 'inherit' });
process.exit(logs.status ?? 0);
