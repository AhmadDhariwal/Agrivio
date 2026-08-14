import { spawnSync } from 'node:child_process';

const steps = [
  ['lint', ['run', 'lint']],
  ['typecheck', ['run', 'typecheck']],
  ['unit', ['run', 'test:unit']],
  ['architecture', ['run', 'test:architecture']],
  ['build', ['run', 'build']],
];

if (process.env.AGRIVIO_REGRESSION_E2E === '1') {
  steps.push(['e2e', ['run', 'e2e']]);
}

const failing = [];
for (const [name, args] of steps) {
  const result = spawnSync('npm', args, { stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    failing.push(name);
  }
}

if (failing.length > 0) {
  console.error(`Regression inventory failed: ${failing.join(', ')}`);
  process.exit(1);
}

console.log('Full automated regression green (lint, typecheck, unit, architecture, build).');
if (process.env.AGRIVIO_REGRESSION_E2E !== '1') {
  console.log('Playwright E2E is the separate npm run e2e / CI e2e-smoke job. Set AGRIVIO_REGRESSION_E2E=1 to include it.');
}
