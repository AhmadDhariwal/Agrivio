#!/usr/bin/env node
/**
 * ops:backup – Privileged operator CLI for MongoDB backups.
 *
 * Usage:
 *   npm run ops:backup
 *   AGRIVIO_BACKUP_DIR=/var/agrivio/backups npm run ops:backup
 *
 * Required environment variables:
 *   MONGODB_URI            – MongoDB connection URI
 *   MONGODB_DB_NAME        – Database name to back up (default: Agrivio)
 *   AGRIVIO_BACKUP_DIR     – Destination directory for backup archives
 *
 * Optional:
 *   AGRIVIO_MONGODUMP_PATH     – Full path to the mongodump executable
 *   AGRIVIO_BACKUP_RETENTION_DAYS – Days to retain archives (0 = keep all)
 *
 * This script is NOT a web request handler. It is designed to be run by
 * an operator or a cron/Task Scheduler job. It connects directly to MongoDB
 * using mongodump (not through the Express application).
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

const mongoose = require('mongoose');
const { runBackup } = require('../../apps/backend/src/modules/operations/backup-engine.js');
const {
  createOperationsModule,
} = require('../../apps/backend/src/modules/operations/operations.module.js');
const {
  createMongooseAuditEventStore,
} = require('../../apps/backend/src/modules/audit/persistence/audit-event.model.js');

(async () => {
  console.log('[ops:backup] Starting MongoDB backup...');
  console.log(`[ops:backup] Database: ${process.env['MONGODB_DB_NAME'] ?? 'Agrivio'}`);
  console.log(`[ops:backup] Backup dir: ${process.env['AGRIVIO_BACKUP_DIR'] ?? '(not set)'}`);

  let manifest;
  try {
    if (!process.env['MONGODB_URI']) {
      throw new Error('MONGODB_URI is required');
    }
    await mongoose.connect(process.env['MONGODB_URI'], {
      dbName: process.env['MONGODB_DB_NAME'] ?? 'Agrivio',
    });
    const operations = createOperationsModule({
      persistence: 'mongoose',
      auditStore: createMongooseAuditEventStore(),
      backupEngine: { runBackup },
    });
    manifest = await operations.operationsService.createBackup({
      actorId: process.env['AGRIVIO_OPS_ACTOR_ID'] ?? 'cli-operator',
      privilegedCli: true,
    });
  } catch (err) {
    console.error('[ops:backup] FAILED:', err.message);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    process.exit(1);
  }

  await mongoose.disconnect();

  console.log('[ops:backup] SUCCESS');
  console.log(`[ops:backup] Archive: ${manifest.filename}`);
  console.log(`[ops:backup] Size:    ${manifest.fileSizeBytes} bytes`);
  console.log(`[ops:backup] SHA-256: ${manifest.sha256}`);
  console.log(`[ops:backup] Started:   ${manifest.startedAt}`);
  console.log(`[ops:backup] Completed: ${manifest.completedAt}`);
  process.exit(0);
})();
