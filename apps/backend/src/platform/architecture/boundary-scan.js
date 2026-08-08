const { readFileSync, readdirSync, statSync } = require('node:fs');
const { join } = require('node:path');
function extractImportSpecifiers(filePath) {
  const contents = readFileSync(filePath, 'utf8');
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

function collectSourceFiles(directory) {
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

function isForbiddenPersistenceImport(specifier) {
  return specifier === 'mongoose' || specifier.startsWith('mongoose/');
}

function scanControllerPersistenceViolations(rootDirectory) {
  const files = collectSourceFiles(rootDirectory);
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

function scanApiContractsDependencyViolations(rootDirectory) {
  const files = collectSourceFiles(rootDirectory);
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

module.exports = {
  extractImportSpecifiers,
  collectSourceFiles,
  isForbiddenPersistenceImport,
  scanControllerPersistenceViolations,
  scanApiContractsDependencyViolations,
};
