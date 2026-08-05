import { dockerCompose } from './lib/docker.mjs';

const down = dockerCompose(['down'], { stdio: 'inherit' });
process.exit(down.status ?? 0);
