import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  scanApiContractsDependencyViolations,
  scanControllerPersistenceViolations,
  collectSourceFiles,
} from '../../src/platform/architecture/boundary-scan.js';

const testDir = fileURLToPath(new URL('.', import.meta.url));
const backendRoot = join(testDir, '../../src');
const repoRoot = join(testDir, '../../../..');
const apiContractsRoot = join(repoRoot, 'packages/api-contracts/src');
const fixturesRoot = join(testDir, 'fixtures');

describe('architecture boundaries', () => {
  it('detects forbidden controller persistence imports in fixtures', () => {
    const violations = scanControllerPersistenceViolations(fixturesRoot);
    expect(violations.length).toBeGreaterThan(0);
    expect(
      violations.some((entry) => entry.includes('forbidden-controller-persistence.fixture.js')),
    ).toBe(true);
  });

  it('passes for current backend platform sources', () => {
    const violations = scanControllerPersistenceViolations(backendRoot);
    expect(violations).toEqual([]);
  });

  it('keeps api-contracts free of Express and Mongoose imports', () => {
    const violations = scanApiContractsDependencyViolations(apiContractsRoot);
    expect(violations).toEqual([]);
  });

  it('keeps system-scope bypass tokens out of request-controlled call sites', () => {
    const violations = [];
    for (const filePath of collectSourceFiles(backendRoot)) {
      const normalized = filePath.replaceAll('\\', '/');
      if (!normalized.includes('/routes/') && !normalized.endsWith('/app.js')) {
        continue;
      }
      const contents = readFileSync(filePath, 'utf8');
      if (
        contents.includes('createSystemScope') &&
        /createSystemScope\([\s\S]{0,80}req\.(body|query|headers)/.test(contents)
      ) {
        violations.push(`${normalized} builds system scope from request input`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('forbids generic arbitrary correction routes', () => {
    const forbidden = [
      '/generic-correction',
      '/adjust-anything',
      '/corrective-transactions',
    ];
    const violations = [];
    for (const filePath of collectSourceFiles(backendRoot)) {
      const normalized = filePath.replaceAll('\\', '/');
      if (!normalized.includes('/routes/') && !normalized.endsWith('/app.js')) {
        continue;
      }
      const contents = readFileSync(filePath, 'utf8');
      for (const fragment of forbidden) {
        if (contents.includes(fragment)) {
          violations.push(`${normalized} contains ${fragment}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('requires additive Frozen permissions on purchase-return routes', () => {
    const returnsRoutes = join(backendRoot, 'modules/returns-corrections/routes/returns.routes.js');
    const source = readFileSync(returnsRoutes, 'utf8');
    expect(source).toContain("createRequirePermissionMiddleware('returns.post')");
    expect(source).toContain("createRequirePermissionMiddleware('purchases.return')");
  });
});
