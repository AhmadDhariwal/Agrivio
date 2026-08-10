const fs = require('fs');
const path = require('path');

/**
 * Loads ignored local development environment before runtime validation.
 * Uses Node's built-in process.loadEnvFile (does not override existing process env).
 * Skipped for CI and NODE_ENV=test so developer .env.local cannot leak into tests.
 */
function shouldLoadLocalEnv(env = process.env) {
  if (env.CI === 'true' || env.CI === '1') {
    return false;
  }
  if (env.NODE_ENV === 'test') {
    return false;
  }
  if (
    env.AGRIVIO_SKIP_ENV_FILE === '1' ||
    env.AGRIVIO_SKIP_ENV_FILE === 'true' ||
    env.AGRIVIO_SKIP_ENV_FILE === 'yes'
  ) {
    return false;
  }
  return typeof process.loadEnvFile === 'function';
}

function readPackageName(packageJsonPath) {
  try {
    const raw = fs.readFileSync(packageJsonPath, 'utf8');
    const parsed = JSON.parse(raw);
    return typeof parsed.name === 'string' ? parsed.name : null;
  } catch {
    return null;
  }
}

/**
 * Resolve apps/backend (or dist/apps/backend) so ../../.env.local is the repo root.
 */
function findBackendRoot(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 8; i += 1) {
    const packageJsonPath = path.join(dir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const name = readPackageName(packageJsonPath);
      if (name === '@agrivio/backend') {
        return dir;
      }
      if (name === '@agrivio/source') {
        const nested = path.join(dir, 'apps', 'backend');
        if (fs.existsSync(path.join(nested, 'package.json'))) {
          return nested;
        }
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return null;
}

function resolveLocalEnvCandidates(backendRoot) {
  return [
    path.resolve(backendRoot, '../../.env.local'),
    path.resolve(backendRoot, '.env.local'),
  ];
}

function loadLocalDevelopmentEnv(options = {}) {
  const env = options.env ?? process.env;
  const loadEnvFile = options.loadEnvFile ?? process.loadEnvFile?.bind(process);
  const existsSync = options.existsSync ?? fs.existsSync;
  const backendRoot =
    options.backendRoot ??
    findBackendRoot(options.startDir ?? process.cwd()) ??
    options.startDir ??
    process.cwd();

  if (!shouldLoadLocalEnv(env)) {
    return { loaded: false, path: null, backendRoot };
  }

  for (const filePath of resolveLocalEnvCandidates(backendRoot)) {
    if (existsSync(filePath)) {
      loadEnvFile(filePath);
      return { loaded: true, path: filePath, backendRoot };
    }
  }

  return { loaded: false, path: null, backendRoot };
}

module.exports = {
  shouldLoadLocalEnv,
  findBackendRoot,
  resolveLocalEnvCandidates,
  loadLocalDevelopmentEnv,
};
