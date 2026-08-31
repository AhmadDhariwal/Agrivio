const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { which } = require('./engine-utils');

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
      'AGRIVIO_BACKUP_DIR is not configured. Set this environment variable before running restore.',
    );
  }
  return path.resolve(dir.trim());
}

function findManifest(backupDir, archiveName) {
  const manifestPath = path.join(backupDir, archiveName + '.manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
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

function spawnMongorestore(executable, args) {
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
            `mongorestore exited with code ${code}. stderr: ${stderrLines.slice(-10).join('')}`,
          ),
        );
      }
    });
    proc.on('error', (err) =>
      reject(new Error(`Failed to launch mongorestore: ${err.message}`)),
    );
  });
}

async function runRestore(options) {
  if (typeof options !== 'object' || options === null) {
    throw new Error('runRestore requires an options object');
  }

  const actor = options.actor;
  if (!actor?.permissions?.includes('operations.restore.execute')) {
    const err = new Error('Missing permission operations.restore.execute');
    err.statusCode = 403;
    throw err;
  }

  const archiveName = options.archiveName;
  if (typeof archiveName !== 'string' || archiveName.trim().length === 0) {
    throw new Error('archiveName is required');
  }

  const confirmDatabase = options.confirmDatabase;
  if (typeof confirmDatabase !== 'string' || confirmDatabase.trim().length === 0) {
    throw new Error(
      'confirmDatabase is required: pass the exact target database name to confirm the restore target',
    );
  }

  const targetDbName = options.targetDbName ?? confirmDatabase;
  if (targetDbName.trim() !== confirmDatabase.trim()) {
    throw new Error('confirmDatabase must match targetDbName');
  }

  const mongodbUri = options.mongodbUri ?? process.env['MONGODB_URI'];
  if (!mongodbUri) {
    throw new Error('mongodbUri is required for restore');
  }

  const backupDir = resolveBackupDir();

  const archivePath = path.join(backupDir, archiveName.trim());
  if (!fs.existsSync(archivePath)) {
    throw new Error(`Archive not found: ${archiveName}`);
  }

  const manifest = findManifest(backupDir, archiveName.trim());
  if (!manifest) {
    throw new Error(`Manifest not found for archive: ${archiveName}. Cannot restore without checksum verification.`);
  }

  const actualSha256 = await computeFileSha256(archivePath);
  if (actualSha256 !== manifest.sha256) {
    throw new Error(
      `SHA-256 checksum mismatch for "${archiveName}". Archive may be corrupted. Expected: ${manifest.sha256}, got: ${actualSha256}`,
    );
  }

  // Only resolve the executable after the archive has been verified
  const executable = resolveExecutable('AGRIVIO_MONGORESTORE_PATH', 'mongorestore');

  const sourceDbName = manifest.mongodbDbName;
  const args = [
    `--uri=${mongodbUri}`,
    `--nsFrom=${sourceDbName}.*`,
    `--nsTo=${targetDbName.trim()}.*`,
    `--archive=${archivePath}`,
    '--gzip',
    '--drop',
  ];

  const startedAt = new Date();
  let exitResult;
  try {
    exitResult = await spawnMongorestore(executable, args);
  } catch (err) {
    const safe = new Error('Restore failed: mongorestore did not complete successfully');
    safe.internalDetail = err.message;
    throw safe;
  }

  return {
    archiveName,
    sourceDbName,
    targetDbName: targetDbName.trim(),
    sha256Verified: true,
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    mongorestoreExitCode: exitResult.exitCode,
  };
}

module.exports = {
  runRestore,
  resolveExecutable,
  computeFileSha256,
  findManifest,
};
