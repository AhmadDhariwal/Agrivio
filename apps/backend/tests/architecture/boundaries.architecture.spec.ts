import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  scanApiContractsDependencyViolations,
  scanControllerPersistenceViolations,
} from '../../src/platform/architecture/boundary-scan.js';

const testDir = dirname(fileURLToPath(import.meta.url));
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
});
