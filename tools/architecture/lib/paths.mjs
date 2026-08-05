import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const toolsArchitectureDir = dirname(fileURLToPath(import.meta.url));

/** Absolute workspace root (Agrivio/). */
export const workspaceRoot = resolve(toolsArchitectureDir, '../../..');

export const productionRoots = {
  backend: join(workspaceRoot, 'apps/backend/src'),
  frontend: join(workspaceRoot, 'apps/frontend/src'),
  apiContracts: join(workspaceRoot, 'packages/api-contracts/src'),
  toolingConfig: join(workspaceRoot, 'packages/tooling-config'),
  testSupport: join(workspaceRoot, 'packages/test-support/src'),
};

export const fixtureRoot = join(workspaceRoot, 'tools/architecture/fixtures');

/**
 * @param {string} absolutePath
 * @returns {string}
 */
export function toPosixRelative(absolutePath) {
  return relative(workspaceRoot, absolutePath).split(sep).join('/');
}

/**
 * @param {string} fromFile
 * @param {string} specifier
 * @returns {string | null} Absolute resolved path for relative imports; null for bare/package imports.
 */
export function resolveImportTarget(fromFile, specifier) {
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
    return null;
  }
  return resolve(dirname(fromFile), specifier);
}
