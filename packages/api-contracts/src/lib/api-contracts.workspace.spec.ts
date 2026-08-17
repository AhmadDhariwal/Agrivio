import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esm from './api-contracts.js';

const require = createRequire(import.meta.url);
const cjs = require('../require-entry.cjs');
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('api-contracts workspace consumption', () => {
  it('keeps CommonJS require-entry exports aligned with the TypeScript module', () => {
    const esmKeys = Object.keys(esm).filter((key) => key !== 'default').sort();
    const cjsKeys = Object.keys(cjs).sort();
    expect(cjsKeys).toEqual(esmKeys);
  });

  it('resolves workspace source through package exports instead of stale dist output', () => {
    const packageJson = JSON.parse(
      readFileSync(join(packageRoot, 'package.json'), 'utf8'),
    ) as { exports: Record<string, { import?: string; default?: string }> };
    const rootExport = packageJson.exports['.'];
    expect(rootExport).toBeDefined();
    expect(rootExport!.import).toBe('./src/index.ts');
    expect(rootExport!.default).toBe('./src/index.ts');
    expect(rootExport!.import).not.toMatch(/dist\//);
  });

  it('keeps frontend dev serve from prebundling workspace contracts', () => {
    const frontendProject = JSON.parse(
      readFileSync(join(packageRoot, '..', '..', 'apps/frontend/project.json'), 'utf8'),
    ) as {
      targets: {
        serve: { dependsOn?: string[]; options?: { prebundle?: { exclude?: string[] } } };
        build: { dependsOn?: string[] };
      };
    };
    expect(frontendProject.targets.serve.options?.prebundle?.exclude).toContain(
      '@agrivio/api-contracts',
    );
    expect(frontendProject.targets.serve.dependsOn).toContain('api-contracts:typecheck');
    expect(frontendProject.targets.build.dependsOn).toContain('api-contracts:typecheck');
  });
});
