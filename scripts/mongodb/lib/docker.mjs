import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { COMPOSE_FILE } from './constants.mjs';

const DOCKER_CANDIDATES = [
  'docker',
  'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe',
  'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.com',
];

/**
 * @returns {string}
 */
export function resolveDockerBinary() {
  for (const candidate of DOCKER_CANDIDATES) {
    if (candidate === 'docker') {
      const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8', shell: true });
      if (probe.status === 0) {
        return candidate;
      }
      continue;
    }
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    'Docker CLI was not found. Install Docker Compose v2 and ensure `docker` is on PATH.',
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
    shell: true,
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
