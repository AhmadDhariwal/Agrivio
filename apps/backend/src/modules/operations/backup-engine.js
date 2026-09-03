const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { which } = require('./engine-utils');

const DEFAULT_RETENTION_DAYS = 0; // 0 = disabled by default

function sanitizeId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error('Invalid backup id: must be alphanumeric with dashes or underscores only');
  }
  return value;
}

function resolveExecutable(envKey, name) {
  const fromEnv = process.env[envKey];
  if (fromEnv && fromEnv.trim().length > 0) {
    const resolved = fromEnv.trim();
    if (!fs.existsSync(resolved)) {
      throw new Error(
        `${envKey} is set to "${resolved}" but the file does not exist. Install MongoDB Database Tools or correct ${envKey}.`,
      );
    }
    return resolved;
  }
  const found = which(name);
  if (!found) {
    throw new Error(
      `"${name}" not found on PATH and ${envKey} is not set. Install MongoDB Database Tools (https://www.mongodb.com/try/download/database-tools) or set ${envKey}.`,
    );
  }
  return found;
}

function resolveBackupDir() {
  const dir = process.env['AGRIVIO_BACKUP_DIR'];
  if (!dir || dir.trim().length === 0) {
    throw new Error(
      'AGRIVIO_BACKUP_DIR is not configured. Set this environment variable to an absolute path outside the web root before running backups.',
    );
  }
  const resolved = path.resolve(dir.trim());
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
  }
  return resolved;
}

function generateArchiveFilename(runId) {
  const now = new Date();
  const ts = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const safeId = sanitizeId(runId);
  return `agrivio-${ts}-${safeId}.archive.gz`;
}

function computeFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function verifyBackupArtifacts(archivePath, manifestPath, expectedManifest) {
  const persistedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const manifestVerified =
    persistedManifest.schemaVersion === expectedManifest.schemaVersion &&
    persistedManifest.runId === expectedManifest.runId &&
    persistedManifest.filename === expectedManifest.filename &&
    persistedManifest.fileSizeBytes === expectedManifest.fileSizeBytes &&
    persistedManifest.sha256 === expectedManifest.sha256;
  const checksumVerified =
    manifestVerified && (await computeFileSha256(archivePath)) === persistedManifest.sha256;

  if (!manifestVerified || !checksumVerified) {
    throw new Error('Backup artifact verification failed');
  }

  return { manifestVerified, checksumVerified };
}

function spawnMongodump(executable, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(executable, args, { shell: false });
    const stderrLines = [];
    proc.stderr.on('data', (chunk) => {
      stderrLines.push(chunk.toString());
    });
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ exitCode: 0, stderr: stderrLines.join('') });
      } else {
        reject(
          new Error(
            `mongodump exited with code ${code}. stderr: ${stderrLines.slice(-10).join('')}`,
          ),
        );
      }
    });
    proc.on('error', (err) => reject(new Error(`Failed to launch mongodump: ${err.message}`)));
  });
}

async function enforceRetentionPolicy(backupDir, retentionDays) {
  if (!retentionDays || retentionDays <= 0) {
    return;
  }
  const manifestPattern = /^agrivio-.*\.archive\.gz\.manifest\.json$/;
  const files = fs.readdirSync(backupDir);
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  for (const file of files) {
    if (!manifestPattern.test(file)) {
      continue;
    }
    const manifestPath = path.join(backupDir, file);
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
      continue;
    }
    const recordedAt = manifest.recordedAt ? new Date(manifest.recordedAt).getTime() : NaN;
    if (!Number.isNaN(recordedAt) && recordedAt >= 0 && recordedAt < cutoff) {
      const archivePath = path.join(backupDir, manifest.filename);
      try {
        fs.rmSync(archivePath, { force: true });
        fs.rmSync(manifestPath, { force: true });
      } catch {
        // Non-fatal: log and continue
      }
    }
  }
}

async function runBackup(options = {}) {
  const mongodbUri = options.mongodbUri ?? process.env['MONGODB_URI'];
  const mongodbDbName = options.mongodbDbName ?? process.env['MONGODB_DB_NAME'] ?? 'Agrivio';

  if (!mongodbUri) {
    throw new Error('mongodbUri is required for backup');
  }
  if (!mongodbDbName) {
    throw new Error('mongodbDbName is required for backup');
  }

  const executable = resolveExecutable('AGRIVIO_MONGODUMP_PATH', 'mongodump');
  const backupDir = resolveBackupDir();

  const runId = crypto.randomBytes(6).toString('hex');
  const filename = generateArchiveFilename(runId);
  const archivePath = path.join(backupDir, filename);

  const args = [
    `--uri=${mongodbUri}`,
    `--db=${mongodbDbName}`,
    `--archive=${archivePath}`,
    '--gzip',
  ];

  const startedAt = new Date();
  let exitResult;
  try {
    exitResult = await spawnMongodump(executable, args);
  } catch (err) {
    // Clean up partial archive
    try {
      fs.rmSync(archivePath, { force: true });
    } catch {
      // Ignore cleanup errors
    }
    const safe = new Error('Backup failed: mongodump did not complete successfully');
    safe.internalDetail = err.message;
    throw safe;
  }

  const completedAt = new Date();
  const stat = fs.statSync(archivePath);
  const fileSizeBytes = stat.size;
  const sha256 = await computeFileSha256(archivePath);
  const retentionDays =
    options.retentionDays ??
    (process.env['AGRIVIO_BACKUP_RETENTION_DAYS']
      ? Number(process.env['AGRIVIO_BACKUP_RETENTION_DAYS'])
      : DEFAULT_RETENTION_DAYS);
  const expiresAt =
    retentionDays > 0
      ? new Date(completedAt.getTime() + retentionDays * 24 * 60 * 60 * 1000)
      : null;

  const manifest = {
    schemaVersion: 1,
    runId,
    filename,
    mongodbDbName,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    recordedAt: completedAt.toISOString(),
    fileSizeBytes,
    sha256,
    mongodumpExitCode: exitResult.exitCode,
    retentionDays,
    expiresAt: expiresAt?.toISOString() ?? null,
    coverage: 'mongodb_application_data',
  };

  const manifestPath = archivePath + '.manifest.json';
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  const verification = await verifyBackupArtifacts(archivePath, manifestPath, manifest);

  await enforceRetentionPolicy(backupDir, retentionDays);

  return { ...manifest, ...verification };
}

module.exports = {
  runBackup,
  resolveExecutable,
  resolveBackupDir,
  computeFileSha256,
  verifyBackupArtifacts,
  enforceRetentionPolicy,
};
