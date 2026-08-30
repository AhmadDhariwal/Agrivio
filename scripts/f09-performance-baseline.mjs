#!/usr/bin/env node
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const harnessPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../apps/backend/tests/workflows/f09-performance-baseline.harness.js',
);

async function main() {
  const { runF09PerformanceBaseline } = require(harnessPath);
  const report = await runF09PerformanceBaseline();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status === 'mongo_unavailable') {
    process.exit(2);
  }
  if (report.status !== 'measured') {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
