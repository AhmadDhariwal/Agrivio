import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = join(here, '../../../..');
const harnessPath = join(repoRoot, 'apps/backend/tests/workflows/f09-performance-baseline.harness.js');

describe('R1-F09-004 performance baseline command', () => {
  it('keeps the baseline harness out of the unit suite', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
    expect(pkg.scripts['test:perf:baseline']).toBe('node scripts/f09-performance-baseline.mjs');
    expect(pkg.scripts['test:perf:navigation']).toBe('playwright test f09-perf-navigation');
    expect(existsSync(join(repoRoot, 'scripts/f09-performance-baseline.mjs'))).toBe(true);
    expect(existsSync(harnessPath)).toBe(true);
    expect(
      existsSync(join(repoRoot, 'apps/frontend/tests/e2e/f09-perf-navigation.e2e.spec.ts')),
    ).toBe(true);
  });

  it('encodes accepted non-SLA planning thresholds and mixed-workload size', () => {
    const source = readFileSync(harnessPath, 'utf8');
    expect(source).toContain('posProductSearchIndexed: 300');
    expect(source).toContain('tenantCustomerList: 500');
    expect(source).toContain('inventoryBalances: 500');
    expect(source).toContain('dashboardLoad: 1000');
    expect(source).toContain('salePosting: 1000');
    expect(source).toContain('purchasePosting: 1000');
    expect(source).toContain('standardReportSales: 2000');
    expect(source).toContain('importPreview: 5000');
    expect(source).toContain('importExecute: 5000');
    expect(source).toContain('MIXED_VIRTUAL_USERS = 20');
    expect(source).toContain('MIXED_SALE_POSTING_USERS = 5');
    expect(source).toContain("importPreviewRows: envInt('F09_PERF_IMPORT_PREVIEW', 500)");
    expect(source).toContain("importExecuteRows: envInt('F09_PERF_IMPORT_EXECUTE', 200)");
  });
});
