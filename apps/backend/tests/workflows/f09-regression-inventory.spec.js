import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = join(here, '../../../..');

describe('R1-F09-001 regression suite consolidation', () => {
  it('keeps prior isolation, E2E, architecture, and F09 hardening surfaces in the release job set', () => {
    const required = [
      'apps/backend/src/modules/identity/tenant-isolation.security.spec.js',
      'apps/backend/src/modules/identity/role-permissions.spec.js',
      'apps/backend/tests/architecture/boundaries.architecture.spec.js',
      'apps/backend/tests/workflows/f09-security-attack.spec.js',
      'apps/backend/tests/workflows/f09-permission-matrix.spec.js',
      'apps/backend/tests/workflows/f09-performance.spec.js',
      'apps/backend/tests/workflows/f09-rehearsal.spec.js',
      'apps/backend/tests/workflows/f09-pilot-uat.spec.js',
      'apps/frontend/tests/e2e/f09-accessibility.e2e.spec.ts',
      'scripts/run-regression.mjs',
    ];
    const missing = required.filter((relative) => !existsSync(join(repoRoot, relative)));
    expect(missing).toEqual([]);
  });
});
