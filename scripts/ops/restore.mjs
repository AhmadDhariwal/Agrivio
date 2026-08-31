#!/usr/bin/env node
/**
 * ops:restore – Privileged operator CLI for MongoDB restore.
 *
 * This script restores a backup archive into an explicit target database.
 * It NEVER blindly overwrites the primary production database.
 * Production restore semantics: operator must supply --confirm-database=<name>
 * matching the intended target, which must differ from the source unless
 * explicitly rehearsed in a maintenance window.
 *
 * Usage:
 *   npm run ops:restore -- --backup=<archiveName> --confirm-database=<targetDb>
 *
 * Required flags:
 *   --backup=<archiveName>       – Exact filename of the .archive.gz file
 *   --confirm-database=<name>    – Target database name (confirmation guard)
 *
 * Required environment variables:
 *   MONGODB_URI            – MongoDB connection URI
 *   AGRIVIO_BACKUP_DIR     – Directory containing backup archives
 *
 * Optional:
 *   AGRIVIO_MONGORESTORE_PATH – Full path to the mongorestore executable
 *
 * IMPORTANT: This script uses --drop, meaning existing collections in the
 * target database are dropped before restore. Use a separate rehearsal
 * database (see docs/ops/BACKUP_RESTORE_REHEARSAL.md) before applying to
 * any database with live data.
 *
 * Destructive production restore of the primary database must only be
 * performed during a controlled maintenance window with writes stopped.
 * See DATA_RECOVERY.md for the full procedure.
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

// Load .env.local if present (local operator runs)
try {
  const { loadEnvFile } = await import('node:process');
  if (loadEnvFile) {
    loadEnvFile('.env.local');
  }
} catch {
  // Built-in loadEnvFile only available in Node >=20.12 / 21.7; ignore on older.
}

const { runRestore } = require('../../apps/backend/src/modules/operations/restore-engine.js');

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    const m = arg.match(/^--([a-zA-Z0-9-]+)=(.*)$/);
    if (m) {
      args[m[1]] = m[2];
    }
  }
  return args;
}

(async () => {
  const args = parseArgs(process.argv.slice(2));

  if (!args['backup']) {
    console.error('[ops:restore] ERROR: --backup=<archiveName> is required');
    console.error('  Example: npm run ops:restore -- --backup=agrivio-20250101-120000-abc123.archive.gz --confirm-database=agrivio_rehearsal_restored_abc');
    process.exit(1);
  }

  if (!args['confirm-database']) {
    console.error('[ops:restore] ERROR: --confirm-database=<targetDb> is required');
    console.error('  This guard prevents accidental restore to the wrong database.');
    console.error('  Example: --confirm-database=agrivio_rehearsal_restored_abc');
    process.exit(1);
  }

  const archiveName = args['backup'];
  const confirmDatabase = args['confirm-database'];

  console.log('[ops:restore] Starting MongoDB restore...');
  console.log(`[ops:restore] Archive:  ${archiveName}`);
  console.log(`[ops:restore] Target:   ${confirmDatabase}`);
  console.log(`[ops:restore] Backup dir: ${process.env['AGRIVIO_BACKUP_DIR'] ?? '(not set)'}`);
  console.log('[ops:restore] WARNING: This will DROP existing collections in the target database.');

  // Require an operator token via AGRIVIO_OPS_ACTOR_PERMISSIONS env or a fake
  // actor with the required permission for the CLI context.
  const operatorPermissions = (process.env['AGRIVIO_OPS_ACTOR_PERMISSIONS'] ?? 'operations.restore.execute')
    .split(',')
    .map((p) => p.trim());

  const actor = {
    actorId: process.env['AGRIVIO_OPS_ACTOR_ID'] ?? 'cli-operator',
    permissions: operatorPermissions,
  };

  let result;
  try {
    result = await runRestore({
      archiveName,
      confirmDatabase,
      targetDbName: confirmDatabase,
      actor,
    });
  } catch (err) {
    console.error('[ops:restore] FAILED:', err.message);
    process.exit(1);
  }

  console.log('[ops:restore] SUCCESS');
  console.log(`[ops:restore] Source DB:    ${result.sourceDbName}`);
  console.log(`[ops:restore] Target DB:    ${result.targetDbName}`);
  console.log(`[ops:restore] SHA-256 OK:   ${result.sha256Verified}`);
  console.log(`[ops:restore] Started:      ${result.startedAt}`);
  console.log(`[ops:restore] Completed:    ${result.completedAt}`);
  process.exit(0);
})();
