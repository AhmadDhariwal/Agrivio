import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = join(here, '../../../..');

describe('R1-F09-001 regression suite consolidation', () => {
  it('wires a canonical release command that includes Playwright E2E without a hidden env var', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
    expect(pkg.scripts['test:regression:release']).toBe('node scripts/run-regression.mjs --release');
    expect(pkg.scripts['test:regression']).toBe('node scripts/run-regression.mjs');
    expect(pkg.scripts['test:regression:release']).not.toMatch(/AGRIVIO_REGRESSION_E2E/);

    const script = readFileSync(join(repoRoot, 'scripts/run-regression.mjs'), 'utf8');
    expect(script).toContain("process.argv.includes('--release')");
    expect(script).toContain("steps.push(['e2e', ['run', 'e2e']])");
    expect(script).not.toContain('AGRIVIO_REGRESSION_E2E');
    expect(script).toContain("['integration', ['run', 'test:integration']]");
  });

  it('keeps Playwright as the owner of E2E servers on isolated test Mongo', () => {
    const config = readFileSync(join(repoRoot, 'playwright.config.ts'), 'utf8');
    expect(config).toContain('reuseExistingServer: false');
    expect(config).toContain("MONGODB_DB_NAME: 'agrivio_test_e2e'");
    expect(config).toContain("NG_BUILD_CACHE: '0'");
    expect(config).toContain("PORT: '3100'");
    expect(config).toContain('--port=4300');
    expect(config).not.toMatch(/reuseExistingServer:\s*true/);
  });

  it('keeps prior isolation, architecture, E2E, and preparatory F09 surfaces without treating P2–P5 as accepted', () => {
    const required = [
      'apps/backend/src/modules/identity/tenant-isolation.security.spec.js',
      'apps/backend/src/modules/identity/role-permissions.spec.js',
      'apps/backend/tests/architecture/boundaries.architecture.spec.js',
      'apps/backend/src/modules/identity/auth.rate-limit.spec.js',
      'apps/frontend/tests/e2e/f08-p5-navigation.e2e.spec.ts',
      'scripts/run-regression.mjs',
    ];
    const preparatory = [
      'apps/backend/tests/workflows/f09-security-attack.spec.js',
      'apps/backend/tests/workflows/f09-permission-matrix.spec.js',
      'apps/backend/tests/workflows/f09-performance.spec.js',
      'apps/backend/tests/workflows/f09-rehearsal.spec.js',
      'apps/backend/tests/workflows/f09-pilot-uat.spec.js',
      'apps/frontend/tests/e2e/f09-accessibility.e2e.spec.ts',
    ];
    const missing = [...required, ...preparatory].filter(
      (relative) => !existsSync(join(repoRoot, relative)),
    );
    expect(missing).toEqual([]);
  });
});
