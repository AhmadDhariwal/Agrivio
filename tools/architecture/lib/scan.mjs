import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { extractImportSpecifiers } from './extract-imports.mjs';
import { resolveImportTarget, toPosixRelative, workspaceRoot } from './paths.mjs';

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.tsx', '.jsx']);

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.git',
  '.angular',
  '.nx',
  'out-tsc',
]);

/**
 * @typedef {{
 *   file: string;
 *   specifier: string;
 *   rule: string;
 *   detail: string;
 * }} ArchitectureViolation
 */

/**
 * @param {string} rootDir
 * @param {{ includeFixtures?: boolean }} [options]
 * @returns {string[]}
 */
export function listSourceFiles(rootDir, options = {}) {
  /** @type {string[]} */
  const files = [];

  /**
   * @param {string} dir
   */
  function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.env.example') {
        continue;
      }
      if (SKIP_DIR_NAMES.has(entry.name)) {
        continue;
      }

      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!options.includeFixtures && entry.name === 'fixtures') {
          continue;
        }
        walk(absolute);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const lower = entry.name.toLowerCase();
      const ext = lower.slice(lower.lastIndexOf('.'));
      if (!SOURCE_EXTENSIONS.has(ext)) {
        continue;
      }

      // Specs are not production architecture subjects.
      if (
        lower.includes('.spec.') ||
        lower.includes('.test.') ||
        lower.includes('.architecture.') ||
        lower.includes('.integration.') ||
        lower.includes('.e2e.') ||
        lower.endsWith('.d.ts')
      ) {
        continue;
      }

      files.push(absolute);
    }
  }

  try {
    const stats = statSync(rootDir);
    if (stats.isFile()) {
      return [rootDir];
    }
  } catch {
    return [];
  }

  walk(rootDir);
  return files;
}

/**
 * @param {string} filePath
 * @returns {{ moduleName: string; remainder: string } | null}
 */
export function parseBackendModulePath(filePath) {
  const posix = toPosixRelative(filePath);
  const match = posix.match(/^apps\/backend\/src\/modules\/([^/]+)\/(.+)$/);
  if (!match) {
    return null;
  }
  return { moduleName: match[1], remainder: match[2] };
}

/**
 * @param {string} filePath
 * @returns {{ featureName: string; remainder: string } | null}
 */
export function parseFrontendFeaturePath(filePath) {
  const posix = toPosixRelative(filePath);
  const match = posix.match(/^apps\/frontend\/src\/app\/features\/([^/]+)\/(.+)$/);
  if (!match) {
    return null;
  }
  return { featureName: match[1], remainder: match[2] };
}

/**
 * @param {string} fromFile
 * @param {string} specifier
 * @returns {ArchitectureViolation | null}
 */
function checkBackendCrossModuleImport(fromFile, specifier) {
  const fromModule = parseBackendModulePath(fromFile);
  if (!fromModule) {
    return null;
  }

  const resolved = resolveImportTarget(fromFile, specifier);
  if (resolved) {
    const targetModule = parseBackendModulePath(resolved);
    if (targetModule && targetModule.moduleName !== fromModule.moduleName) {
      const isPublic = targetModule.remainder.startsWith('public/');
      if (!isPublic) {
        return {
          file: toPosixRelative(fromFile),
          specifier,
          rule: 'backend-cross-module-internal-import',
          detail: `Module "${fromModule.moduleName}" must not import internals of "${targetModule.moduleName}" (use public/ only).`,
        };
      }
    }
    return null;
  }

  // Alias-style or absolute-looking module path inside the monorepo.
  const posixSpec = specifier.replace(/\\/g, '/');
  const modulesMatch = posixSpec.match(/(?:^|\/)modules\/([^/]+)\/(.+)$/);
  if (modulesMatch && modulesMatch[1] !== fromModule.moduleName) {
    const remainder = modulesMatch[2];
    if (!remainder.startsWith('public/')) {
      return {
        file: toPosixRelative(fromFile),
        specifier,
        rule: 'backend-cross-module-internal-import',
        detail: `Module "${fromModule.moduleName}" must not import internals of "${modulesMatch[1]}".`,
      };
    }
  }

  return null;
}

/**
 * @param {string} fromFile
 * @param {string} specifier
 * @returns {ArchitectureViolation | null}
 */
function checkControllerPersistenceAccess(fromFile, specifier) {
  const posix = toPosixRelative(fromFile);
  if (!posix.includes('/controllers/')) {
    return null;
  }

  const lowered = specifier.toLowerCase();
  if (
    lowered === 'mongoose' ||
    lowered.startsWith('mongoose/') ||
    lowered.includes('/persistence/') ||
    /models?$/i.test(lowered) ||
    lowered.includes('.model.')
  ) {
    return {
      file: posix,
      specifier,
      rule: 'controller-persistence-access',
      detail: 'Controllers must not access Mongoose models or persistence layers directly.',
    };
  }

  const resolved = resolveImportTarget(fromFile, specifier);
  if (resolved) {
    const target = toPosixRelative(resolved);
    if (target.includes('/persistence/') || /\/[^/]*model[^/]*\.(js|ts|mjs|cjs)$/i.test(target)) {
      return {
        file: posix,
        specifier,
        rule: 'controller-persistence-access',
        detail: 'Controllers must not import persistence/model files.',
      };
    }
  }

  return null;
}

/**
 * @param {string} fromFile
 * @param {string} specifier
 * @returns {ArchitectureViolation | null}
 */
function checkFrontendCrossFeatureImport(fromFile, specifier) {
  const fromFeature = parseFrontendFeaturePath(fromFile);
  if (!fromFeature) {
    return null;
  }

  const resolved = resolveImportTarget(fromFile, specifier);
  if (resolved) {
    const targetFeature = parseFrontendFeaturePath(resolved);
    if (targetFeature && targetFeature.featureName !== fromFeature.featureName) {
      return {
        file: toPosixRelative(fromFile),
        specifier,
        rule: 'frontend-cross-feature-internal-import',
        detail: `Feature "${fromFeature.featureName}" must not import internals of "${targetFeature.featureName}".`,
      };
    }
    return null;
  }

  const posixSpec = specifier.replace(/\\/g, '/');
  const featureMatch = posixSpec.match(/(?:^|\/)features\/([^/]+)\/(.+)$/);
  if (featureMatch && featureMatch[1] !== fromFeature.featureName) {
    return {
      file: toPosixRelative(fromFile),
      specifier,
      rule: 'frontend-cross-feature-internal-import',
      detail: `Feature "${fromFeature.featureName}" must not import internals of "${featureMatch[1]}".`,
    };
  }

  return null;
}

/**
 * @param {string} fromFile
 * @param {string} specifier
 * @returns {ArchitectureViolation | null}
 */
function checkFrontendMustNotImportBackend(fromFile, specifier) {
  const posix = toPosixRelative(fromFile);
  if (!posix.startsWith('apps/frontend/')) {
    return null;
  }

  if (
    specifier.includes('apps/backend') ||
    specifier.startsWith('@agrivio/backend') ||
    /(?:^|[./])backend\/src\//.test(specifier)
  ) {
    return {
      file: posix,
      specifier,
      rule: 'frontend-must-not-import-backend',
      detail: 'Frontend must not import backend implementation code.',
    };
  }

  const resolved = resolveImportTarget(fromFile, specifier);
  if (resolved && toPosixRelative(resolved).startsWith('apps/backend/')) {
    return {
      file: posix,
      specifier,
      rule: 'frontend-must-not-import-backend',
      detail: 'Frontend must not import backend implementation code.',
    };
  }

  return null;
}

/**
 * @param {string} fromFile
 * @param {string} specifier
 * @returns {ArchitectureViolation | null}
 */
function checkBackendMustNotImportFrontend(fromFile, specifier) {
  const posix = toPosixRelative(fromFile);
  if (!posix.startsWith('apps/backend/')) {
    return null;
  }

  if (
    specifier.includes('apps/frontend') ||
    specifier.startsWith('@angular/') ||
    /(?:^|[./])frontend\/src\//.test(specifier)
  ) {
    return {
      file: posix,
      specifier,
      rule: 'backend-must-not-import-frontend',
      detail: 'Backend must not import frontend or Angular implementation code.',
    };
  }

  const resolved = resolveImportTarget(fromFile, specifier);
  if (resolved && toPosixRelative(resolved).startsWith('apps/frontend/')) {
    return {
      file: posix,
      specifier,
      rule: 'backend-must-not-import-frontend',
      detail: 'Backend must not import frontend implementation code.',
    };
  }

  return null;
}

/**
 * @param {string} fromFile
 * @param {string} specifier
 * @returns {ArchitectureViolation | null}
 */
function checkApiContractsBoundaries(fromFile, specifier) {
  const posix = toPosixRelative(fromFile);
  if (!posix.startsWith('packages/api-contracts/')) {
    return null;
  }

  const forbidden = [
    'express',
    'mongoose',
    'mongodb',
    '@angular/core',
    '@angular/common',
    '@agrivio/test-support',
    '@agrivio/tooling-config',
  ];

  if (forbidden.some((name) => specifier === name || specifier.startsWith(`${name}/`))) {
    return {
      file: posix,
      specifier,
      rule: 'api-contracts-forbidden-dependency',
      detail:
        'api-contracts must not import Express, Mongoose, MongoDB driver, Angular, or test/tooling packages.',
    };
  }

  if (specifier.includes('apps/backend') || specifier.includes('apps/frontend')) {
    return {
      file: posix,
      specifier,
      rule: 'api-contracts-forbidden-dependency',
      detail: 'api-contracts must not import application implementation paths.',
    };
  }

  const resolved = resolveImportTarget(fromFile, specifier);
  if (resolved) {
    const target = toPosixRelative(resolved);
    if (target.startsWith('apps/') || target.startsWith('packages/test-support/')) {
      return {
        file: posix,
        specifier,
        rule: 'api-contracts-forbidden-dependency',
        detail: 'api-contracts must remain transport-level only.',
      };
    }
  }

  return null;
}

/**
 * @param {string} fromFile
 * @param {string} specifier
 * @returns {ArchitectureViolation | null}
 */
function checkToolingConfigBoundaries(fromFile, specifier) {
  const posix = toPosixRelative(fromFile);
  if (!posix.startsWith('packages/tooling-config/')) {
    return null;
  }

  if (
    specifier.includes('apps/backend') ||
    specifier.includes('apps/frontend') ||
    specifier === 'mongoose' ||
    specifier.startsWith('mongoose/') ||
    specifier === '@agrivio/test-support' ||
    specifier.startsWith('@agrivio/test-support/')
  ) {
    return {
      file: posix,
      specifier,
      rule: 'tooling-config-forbidden-dependency',
      detail: 'tooling-config must not depend on application or domain packages.',
    };
  }

  const resolved = resolveImportTarget(fromFile, specifier);
  if (resolved) {
    const target = toPosixRelative(resolved);
    if (
      target.startsWith('apps/') ||
      target.startsWith('packages/test-support/') ||
      target.startsWith('packages/api-contracts/')
    ) {
      return {
        file: posix,
        specifier,
        rule: 'tooling-config-forbidden-dependency',
        detail: 'tooling-config must stay configuration-only.',
      };
    }
  }

  return null;
}

/**
 * @param {string} fromFile
 * @param {string} specifier
 * @returns {ArchitectureViolation | null}
 */
function checkTestSupportBoundaries(fromFile, specifier) {
  const posix = toPosixRelative(fromFile);
  if (!posix.startsWith('packages/test-support/')) {
    return null;
  }

  if (
    specifier.includes('apps/backend/src/modules') ||
    specifier.includes('apps/frontend/src/app/features') ||
    specifier === 'mongoose' ||
    specifier.startsWith('mongoose/')
  ) {
    return {
      file: posix,
      specifier,
      rule: 'test-support-forbidden-dependency',
      detail:
        'test-support must not import application modules/features or Mongoose models (driver helpers only).',
    };
  }

  const resolved = resolveImportTarget(fromFile, specifier);
  if (resolved) {
    const target = toPosixRelative(resolved);
    if (
      target.startsWith('apps/backend/src/modules/') ||
      target.startsWith('apps/frontend/src/app/features/')
    ) {
      return {
        file: posix,
        specifier,
        rule: 'test-support-forbidden-dependency',
        detail: 'test-support must not import application business modules or features.',
      };
    }
  }

  return null;
}

/**
 * @param {string} fromFile
 * @param {string} specifier
 * @returns {ArchitectureViolation[]}
 */
export function evaluateImport(fromFile, specifier) {
  /** @type {(ArchitectureViolation | null)[]} */
  const checks = [
    checkBackendCrossModuleImport(fromFile, specifier),
    checkControllerPersistenceAccess(fromFile, specifier),
    checkFrontendCrossFeatureImport(fromFile, specifier),
    checkFrontendMustNotImportBackend(fromFile, specifier),
    checkBackendMustNotImportFrontend(fromFile, specifier),
    checkApiContractsBoundaries(fromFile, specifier),
    checkToolingConfigBoundaries(fromFile, specifier),
    checkTestSupportBoundaries(fromFile, specifier),
  ];

  return checks.filter((violation) => violation !== null);
}

/**
 * @param {string[]} roots
 * @param {{ includeFixtures?: boolean }} [options]
 * @returns {ArchitectureViolation[]}
 */
export function scanArchitectureRoots(roots, options = {}) {
  /** @type {ArchitectureViolation[]} */
  const violations = [];

  for (const root of roots) {
    for (const file of listSourceFiles(root, options)) {
      const source = readFileSync(file, 'utf8');
      for (const specifier of extractImportSpecifiers(source)) {
        violations.push(...evaluateImport(file, specifier));
      }
    }
  }

  return violations;
}

/**
 * Scans fixture files as if they lived under a virtual production path prefix.
 * @param {string} fixtureFile Absolute fixture path
 * @param {string} virtualRelativePath Workspace-relative path used for rule context
 * @returns {ArchitectureViolation[]}
 */
export function scanFixtureAsVirtualPath(fixtureFile, virtualRelativePath) {
  const source = readFileSync(fixtureFile, 'utf8');
  const virtualAbsolute = join(workspaceRoot, virtualRelativePath);
  /** @type {ArchitectureViolation[]} */
  const violations = [];

  for (const specifier of extractImportSpecifiers(source)) {
    violations.push(...evaluateImport(virtualAbsolute, specifier));
  }

  // Rewrite reported file to the fixture path for clarity.
  return violations.map((violation) => ({
    ...violation,
    file: `${toPosixRelative(fixtureFile)} (virtual: ${virtualRelativePath})`,
  }));
}

/**
 * @param {ArchitectureViolation[]} violations
 * @returns {string}
 */
export function formatViolations(violations) {
  return violations
    .map((v) => `- [${v.rule}] ${v.file}\n  import "${v.specifier}"\n  ${v.detail}`)
    .join('\n');
}
