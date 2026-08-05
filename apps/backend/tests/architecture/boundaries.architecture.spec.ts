import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  formatViolations,
  scanArchitectureRoots,
  scanFixtureAsVirtualPath,
} from '../../../../tools/architecture/lib/scan.mjs';
import { fixtureRoot, productionRoots } from '../../../../tools/architecture/lib/paths.mjs';

describe('architecture boundaries — production sources', () => {
  it('reports no forbidden imports across frontend, backend, and shared packages', () => {
    const violations = scanArchitectureRoots([
      productionRoots.backend,
      productionRoots.frontend,
      productionRoots.apiContracts,
      productionRoots.toolingConfig,
      productionRoots.testSupport,
    ]);

    expect(violations, formatViolations(violations)).toEqual([]);
  });
});

describe('architecture boundaries — forbidden-import fixtures', () => {
  it('fails on cross-module backend repository import fixture', () => {
    const violations = scanFixtureAsVirtualPath(
      join(fixtureRoot, 'forbidden-cross-module-import.fixture.js'),
      'apps/backend/src/modules/inventory/services/inventory.service.js',
    );

    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.rule === 'backend-cross-module-internal-import')).toBe(true);
  });

  it('fails on frontend cross-feature import fixture', () => {
    const violations = scanFixtureAsVirtualPath(
      join(fixtureRoot, 'forbidden-frontend-feature-import.fixture.ts'),
      'apps/frontend/src/app/features/sales-pos/services/pos.service.ts',
    );

    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.rule === 'frontend-cross-feature-internal-import')).toBe(true);
  });

  it('fails on controller persistence access fixture', () => {
    const violations = scanFixtureAsVirtualPath(
      join(fixtureRoot, 'forbidden-controller-persistence.fixture.js'),
      'apps/backend/src/modules/sales/controllers/sale.controller.js',
    );

    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.rule === 'controller-persistence-access')).toBe(true);
  });

  it('fails on api-contracts forbidden dependency fixture', () => {
    const violations = scanFixtureAsVirtualPath(
      join(fixtureRoot, 'forbidden-api-contracts-dependency.fixture.ts'),
      'packages/api-contracts/src/lib/leak.ts',
    );

    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.rule === 'api-contracts-forbidden-dependency')).toBe(true);
  });

  it('fails on tooling-config forbidden dependency fixture', () => {
    const violations = scanFixtureAsVirtualPath(
      join(fixtureRoot, 'forbidden-tooling-config-dependency.fixture.ts'),
      'packages/tooling-config/src/lib/leak.ts',
    );

    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.rule === 'tooling-config-forbidden-dependency')).toBe(true);
  });

  it('fails on test-support forbidden dependency fixture', () => {
    const violations = scanFixtureAsVirtualPath(
      join(fixtureRoot, 'forbidden-test-support-dependency.fixture.ts'),
      'packages/test-support/src/lib/leak.ts',
    );

    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.rule === 'test-support-forbidden-dependency')).toBe(true);
  });
});
