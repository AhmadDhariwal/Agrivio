import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { COMPOSE_FILE } from './constants.mjs';

const DOCKER_CANDIDATES = [
  'docker',
  'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe',
  'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.com',
];

/**
 * @returns {string | null}
 */
export function resolveDockerBinaryOrNull() {
  for (const candidate of DOCKER_CANDIDATES) {
    if (candidate === 'docker') {
      const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
      if (probe.status === 0) {
        return candidate;
      }
      continue;
    }
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * @returns {string}
 */
export function resolveDockerBinary() {
  const docker = resolveDockerBinaryOrNull();
  if (docker) {
    return docker;
  }

  throw new Error(
    [
      'Docker CLI was not found.',
      'Install Docker Compose v2, or use a locally installed MongoDB single-node rs0 and run `npm run db:status` / `npm run db:init` against 127.0.0.1:27017.',
    ].join(' '),
  );
}

/**
 * @param {string[]} args
 * @param {{ stdio?: 'inherit' | 'pipe' }} [options]
 * @returns {import('node:child_process').SpawnSyncReturns<string>}
 */
export function dockerCompose(args, options = {}) {
  const docker = resolveDockerBinary();
  const stdio = options.stdio ?? 'inherit';
  const result = spawnSync(docker, ['compose', '-f', COMPOSE_FILE, ...args], {
    encoding: 'utf8',
    stdio,
  });

  if (result.error) {
    throw result.error;
  }

  return result;
}

/**
 * @param {string} command
 * @param {{ stdio?: 'inherit' | 'pipe' }} [options]
 */
export function dockerComposeExec(command, options = {}) {
  const stdio = options.stdio ?? 'pipe';
  return dockerCompose(['exec', '-T', 'mongodb', 'mongosh', '--quiet', '--eval', command], {
    stdio,
  });
}
