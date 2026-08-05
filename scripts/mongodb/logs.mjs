import { dockerCompose } from './lib/docker.mjs';

const logs = dockerCompose(['logs', '-f', 'mongodb'], { stdio: 'inherit' });
process.exit(logs.status ?? 0);
