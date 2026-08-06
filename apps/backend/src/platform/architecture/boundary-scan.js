// @ts-check
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @param {string} filePath
 */
export function extractImportSpecifiers(filePath) {
  const contents = readFileSync(filePath, 'utf8');
  /** @type {string[]} */
  const specifiers = [];
  const importPattern = /\bfrom\s+['"]([^'"]+)['"]/g;
  const requirePattern = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (const pattern of [importPattern, requirePattern]) {
    let match;
    while ((match = pattern.exec(contents)) !== null) {
      const specifier = match[1];
      if (specifier !== undefined) {
        specifiers.push(specifier);
      }
    }
  }

  return specifiers;
}

/**
 * @param {string} directory
 * @returns {string[]}
 */
export function collectSourceFiles(directory) {
  /** @type {string[]} */
  const files = [];
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (
      /\.(js|mjs|cjs|ts|tsx)$/.test(entry) &&
      !entry.endsWith('.spec.ts') &&
      !entry.endsWith('.spec.js')
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * @param {string} specifier
 */
export function isForbiddenPersistenceImport(specifier) {
  return specifier === 'mongoose' || specifier.startsWith('mongoose/');
}

/**
 * @param {string} rootDirectory
 */
export function scanControllerPersistenceViolations(rootDirectory) {
  const files = collectSourceFiles(rootDirectory);
  /** @type {string[]} */
  const violations = [];

  for (const filePath of files) {
    const normalized = filePath.replaceAll('\\', '/');
    if (!normalized.includes('/controllers/')) {
      continue;
    }

    for (const specifier of extractImportSpecifiers(filePath)) {
      if (isForbiddenPersistenceImport(specifier)) {
        violations.push(`${normalized} -> ${specifier}`);
      }
    }
  }

  return violations;
}

/**
 * @param {string} rootDirectory
 */
export function scanApiContractsDependencyViolations(rootDirectory) {
  const files = collectSourceFiles(rootDirectory);
  /** @type {string[]} */
  const violations = [];

  for (const filePath of files) {
    for (const specifier of extractImportSpecifiers(filePath)) {
      if (
        specifier === 'express' ||
        specifier.startsWith('express/') ||
        isForbiddenPersistenceImport(specifier)
      ) {
        violations.push(`${filePath.replaceAll('\\', '/')} -> ${specifier}`);
      }
    }
  }

  return violations;
}
