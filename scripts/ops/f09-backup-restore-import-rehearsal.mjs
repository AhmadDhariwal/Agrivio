#!/usr/bin/env node
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const harnessPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../apps/backend/tests/workflows/f09-backup-restore-import-rehearsal.harness.js',
);

async function main() {
  const { runF09BackupRestoreImportRehearsal } = require(harnessPath);
  const report = await runF09BackupRestoreImportRehearsal();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status === 'blocked' || report.relG08 === 'blocked' || report.relG09 === 'blocked') {
    process.exit(2);
  }
  if (report.status !== 'passed') {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
