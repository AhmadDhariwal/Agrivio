#!/usr/bin/env node
/**
 * ops:backup-billing-evidence – Operator CLI for billing evidence storage backup & recovery.
 *
 * Protects filesystem assets in AGRIVIO_BILLING_EVIDENCE_STORAGE_DIR
 * which are not captured by MongoDB's mongodump.
 *
 * Usage:
 *   node scripts/ops/backup-billing-evidence.mjs --backup
 *   node scripts/ops/backup-billing-evidence.mjs --verify --backup=<archiveName>
 *   node scripts/ops/backup-billing-evidence.mjs --recover=<file> --backup=<archiveName> --target-dir=<dir>
 */

import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  createReadStream,
  copyFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { createGzip, createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';

try {
  const { loadEnvFile } = await import('node:process');
  if (loadEnvFile) {
    loadEnvFile('.env.local');
  }
} catch {}

function sha256OfFile(filePath) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolveHash(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function resolveEvidenceDir() {
  const dir = process.env['AGRIVIO_BILLING_EVIDENCE_STORAGE_DIR']?.trim() ||
    join(process.cwd(), 'tmp', 'agrivio-billing-evidence');
  const resolved = resolve(dir);
  if (!existsSync(resolved)) {
    mkdirSync(resolved, { recursive: true });
  }
  return resolved;
}

function resolveBackupDir() {
  const dir = process.env['AGRIVIO_BACKUP_DIR']?.trim() ||
    join(process.cwd(), 'tmp', 'backups', 'evidence');
  const resolved = resolve(dir);
  if (!existsSync(resolved)) {
    mkdirSync(resolved, { recursive: true });
  }
  return resolved;
}

function listFilesRecursive(dir, base = dir) {
  let files = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(listFilesRecursive(full, base));
    } else {
      files.push({
        fullPath: full,
        relativePath: relative(base, full).replace(/\\/g, '/'),
        sizeBytes: statSync(full).size,
      });
    }
  }
  return files;
}

export async function createEvidenceBackup(options = {}) {
  const evidenceDir = options.evidenceDir ?? resolveEvidenceDir();
  const backupDir = options.backupDir ?? resolveBackupDir();
  const runId = randomUUID().slice(0, 8);
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const archiveName = `agrivio-evidence-${timestamp}-${runId}`;
  const archiveSnapshotDir = join(backupDir, archiveName);
  mkdirSync(archiveSnapshotDir, { recursive: true });

  const files = listFilesRecursive(evidenceDir);
  const fileEntries = [];

  for (const file of files) {
    const checksum = await sha256OfFile(file.fullPath);
    const dest = join(archiveSnapshotDir, file.relativePath);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(file.fullPath, dest);
    fileEntries.push({
      relativePath: file.relativePath,
      sizeBytes: file.sizeBytes,
      sha256: checksum,
    });
  }

  const manifest = {
    schemaVersion: 1,
    runId,
    archiveName,
    sourceDir: evidenceDir,
    recordedAt: now.toISOString(),
    fileCount: fileEntries.length,
    totalSizeBytes: fileEntries.reduce((sum, f) => sum + f.sizeBytes, 0),
    files: fileEntries,
  };

  const manifestContent = JSON.stringify(manifest, null, 2);
  const manifestSha256 = createHash('sha256').update(manifestContent).digest('hex');
  const manifestPath = join(backupDir, `${archiveName}.manifest.json`);
  writeFileSync(manifestPath, manifestContent, 'utf8');

  return {
    archiveName,
    archivePath: archiveSnapshotDir,
    manifestPath,
    manifestSha256,
    fileCount: fileEntries.length,
    totalSizeBytes: manifest.totalSizeBytes,
    recordedAt: manifest.recordedAt,
  };
}

export async function verifyEvidenceBackup(archiveName, options = {}) {
  const backupDir = options.backupDir ?? resolveBackupDir();
  const manifestPath = join(backupDir, `${archiveName}.manifest.json`);
  const archivePath = join(backupDir, archiveName);

  if (!existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }
  if (!existsSync(archivePath)) {
    throw new Error(`Archive snapshot dir not found: ${archivePath}`);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const entry of manifest.files) {
    const filePath = join(archivePath, entry.relativePath);
    if (!existsSync(filePath)) {
      throw new Error(`Archived file missing: ${entry.relativePath}`);
    }
    const actualHash = await sha256OfFile(filePath);
    if (actualHash !== entry.sha256) {
      throw new Error(`Checksum mismatch for ${entry.relativePath}: expected ${entry.sha256}, got ${actualHash}`);
    }
  }

  return {
    verified: true,
    fileCount: manifest.files.length,
    archiveName,
  };
}

export async function recoverEvidenceFile(archiveName, relativePath, targetDir, options = {}) {
  const backupDir = options.backupDir ?? resolveBackupDir();
  const archivePath = join(backupDir, archiveName);
  const manifestPath = join(backupDir, `${archiveName}.manifest.json`);

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const entry = manifest.files.find(f => f.relativePath === relativePath.replace(/\\/g, '/'));
  if (!entry) {
    throw new Error(`File ${relativePath} not present in backup ${archiveName}`);
  }

  const srcPath = join(archivePath, entry.relativePath);
  const destPath = join(targetDir, entry.relativePath);
  mkdirSync(dirname(destPath), { recursive: true });
  copyFileSync(srcPath, destPath);

  const restoredHash = await sha256OfFile(destPath);
  if (restoredHash !== entry.sha256) {
    throw new Error(`Restored file checksum mismatch: expected ${entry.sha256}, got ${restoredHash}`);
  }

  return {
    recovered: true,
    destPath,
    sha256: restoredHash,
    sizeBytes: entry.sizeBytes,
  };
}

async function cli() {
  const args = process.argv.slice(2);
  const isBackup = args.includes('--backup');
  const isVerify = args.includes('--verify');
  const recoverArg = args.find(a => a.startsWith('--recover='));

  if (isBackup) {
    console.log('[ops:evidence-backup] Starting billing evidence backup...');
    const result = await createEvidenceBackup();
    console.log('[ops:evidence-backup] SUCCESS');
    console.log(`[ops:evidence-backup] Archive:   ${result.archiveName}`);
    console.log(`[ops:evidence-backup] Files:     ${result.fileCount}`);
    console.log(`[ops:evidence-backup] Total size: ${result.totalSizeBytes} bytes`);
    console.log(`[ops:evidence-backup] Manifest:  ${result.manifestPath}`);
    process.exit(0);
  }

  if (isVerify) {
    const archiveArg = args.find(a => a.startsWith('--backup='));
    if (!archiveArg) {
      console.error('Specify --backup=<archiveName>');
      process.exit(1);
    }
    const archiveName = archiveArg.slice('--backup='.length);
    const result = await verifyEvidenceBackup(archiveName);
    console.log(`[ops:evidence-backup] VERIFIED: ${result.fileCount} files in ${result.archiveName}`);
    process.exit(0);
  }

  if (recoverArg) {
    const filePath = recoverArg.slice('--recover='.length);
    const archiveArg = args.find(a => a.startsWith('--backup='));
    const targetArg = args.find(a => a.startsWith('--target-dir='));
    if (!archiveArg || !targetArg) {
      console.error('Specify --backup=<name> and --target-dir=<path>');
      process.exit(1);
    }
    const archiveName = archiveArg.slice('--backup='.length);
    const targetDir = targetArg.slice('--target-dir='.length);
    const result = await recoverEvidenceFile(archiveName, filePath, targetDir);
    console.log(`[ops:evidence-backup] RECOVERED: ${result.destPath} (SHA-256: ${result.sha256})`);
    process.exit(0);
  }

  console.log('Usage:');
  console.log('  node scripts/ops/backup-billing-evidence.mjs --backup');
  console.log('  node scripts/ops/backup-billing-evidence.mjs --verify --backup=<archiveName>');
  console.log('  node scripts/ops/backup-billing-evidence.mjs --recover=<file> --backup=<name> --target-dir=<dir>');
}

if (process.argv[1]?.endsWith('backup-billing-evidence.mjs')) {
  cli().catch(err => {
    console.error('[ops:evidence-backup] FAILED:', err.message);
    process.exit(1);
  });
}
