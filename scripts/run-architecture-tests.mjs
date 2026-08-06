#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const result = spawnSync(
  process.platform === 'win32' ? 'corepack.cmd' : 'corepack',
  [
    'pnpm',
    'exec',
    'vitest',
    'run',
    '--config',
    'apps/backend/vitest.config.mts',
    'apps/backend/tests/architecture',
  ],
  { stdio: 'inherit', shell: process.platform === 'win32' },
);

process.exit(result.status ?? 1);
