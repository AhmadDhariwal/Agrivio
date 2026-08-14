#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

const release = process.argv.includes('--release');

const E2E_PORTS = [3100, 4300];

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function assertReleasePortsFree() {
  const blocked = [];
  for (const port of E2E_PORTS) {
    if (!(await isPortFree(port))) {
      blocked.push(port);
    }
  }
  if (blocked.length > 0) {
    console.error(
      `Canonical release regression requires Playwright-owned clean ports 3100 and 4300. Occupied: ${blocked.join(', ')}. Stop those listeners; this script does not kill other processes.`,
    );
    process.exit(1);
  }
}

function runNpm(name, args) {
  const result = spawnSync('npm', args, { stdio: 'inherit', shell: true });
  return { name, status: result.status ?? 1 };
}

function runNode(name, args) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  return { name, status: result.status ?? 1 };
}

if (release) {
  console.log(
    'Canonical RELEASE regression: lint, typecheck, unit, integration (real Mongo), architecture, production builds, Playwright E2E.',
  );
  const cacheDir = join(process.cwd(), '.angular', 'cache');
  rmSync(cacheDir, { recursive: true, force: true });
  console.log('Removed .angular/cache so frontend E2E does not reuse a stale Angular disk cache.');
  await assertReleasePortsFree();
  console.log('Ports 3100 and 4300 are free; Playwright will start (not reuse) application servers.');
} else {
  console.log(
    'Fast non-E2E regression: lint, typecheck, unit, integration, architecture, production builds. Canonical release gate is npm run test:regression:release (includes Playwright E2E).',
  );
}

const failing = [];

const contractsRequire = runNode('api-contracts-require', [
  '-e',
  "const c = require('@agrivio/api-contracts'); if (!c.API_CSRF_HEADER) process.exit(1); console.log('api-contracts require() resolved', c.API_CSRF_HEADER);",
]);
if (contractsRequire.status !== 0) {
  failing.push(contractsRequire.name);
}

const contractsImport = runNode('api-contracts-cjs-entry', [
  '--input-type=module',
  '-e',
  "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url); const c = require('@agrivio/api-contracts'); if (!c.API_HEALTH_LIVENESS_PATH) process.exit(1); console.log('api-contracts CJS exports resolve via createRequire');",
]);
if (contractsImport.status !== 0) {
  failing.push(contractsImport.name);
}

const steps = [
  ['lint', ['run', 'lint']],
  ['typecheck', ['run', 'typecheck']],
  ['unit', ['run', 'test:unit']],
  ['integration', ['run', 'test:integration']],
  ['architecture', ['run', 'test:architecture']],
  ['build', ['run', 'build']],
];

if (release) {
  steps.push(['e2e', ['run', 'e2e']]);
}

for (const [name, args] of steps) {
  const result = runNpm(name, args);
  if (result.status !== 0) {
    failing.push(name);
  }
}

if (failing.length > 0) {
  console.error(`Regression inventory failed: ${failing.join(', ')}`);
  process.exit(1);
}

if (release) {
  console.log(
    'Canonical full release regression green (lint, typecheck, unit, integration, architecture, build, e2e).',
  );
} else {
  console.log(
    'Fast non-E2E regression green (lint, typecheck, unit, integration, architecture, build). Use npm run test:regression:release for the canonical REL-G02 gate including Playwright.',
  );
}
