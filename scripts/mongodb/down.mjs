import { dockerCompose, resolveDockerBinaryOrNull } from './lib/docker.mjs';

const docker = resolveDockerBinaryOrNull();
if (!docker) {
  console.log(
    '[agrivio] Docker is unavailable. db:down only stops the Compose stack; leave the local MongoDB Windows/service install managed outside this command.',
  );
  process.exit(0);
}

const down = dockerCompose(['down'], { stdio: 'inherit' });
process.exit(down.status ?? 0);
