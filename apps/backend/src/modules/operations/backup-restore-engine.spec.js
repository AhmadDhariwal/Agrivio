import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import backupEngineModule from './backup-engine.js';
import restoreEngineModule from './restore-engine.js';
import engineUtilsModule from './engine-utils.js';

const { computeFileSha256, resolveBackupDir, enforceRetentionPolicy } = backupEngineModule;
const { runRestore, computeFileSha256: restoreComputeSha256, findManifest } = restoreEngineModule;
const { which } = engineUtilsModule;

describe('backup-engine: computeFileSha256', () => {
  let tmpDir;
  let tmpFile;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agrivio-backup-spec-'));
    tmpFile = path.join(tmpDir, 'test.bin');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns a deterministic hex SHA-256 for a known file', async () => {
    const content = Buffer.from('agrivio-backup-test-data');
    fs.writeFileSync(tmpFile, content);
    const digest = await computeFileSha256(tmpFile);
    expect(typeof digest).toBe('string');
    expect(digest).toHaveLength(64);
    expect(digest).toMatch(/^[0-9a-f]+$/);
    // Same file → same digest
    const digest2 = await computeFileSha256(tmpFile);
    expect(digest2).toBe(digest);
  });

  it('returns different SHA-256 for different content', async () => {
    const fileA = path.join(tmpDir, 'a.bin');
    const fileB = path.join(tmpDir, 'b.bin');
    fs.writeFileSync(fileA, Buffer.from('content-a'));
    fs.writeFileSync(fileB, Buffer.from('content-b'));
    const digestA = await computeFileSha256(fileA);
    const digestB = await computeFileSha256(fileB);
    expect(digestA).not.toBe(digestB);
  });
});

describe('backup-engine: resolveBackupDir', () => {
  let tmpDir;
  const savedBackupDir = process.env['AGRIVIO_BACKUP_DIR'];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agrivio-bkdir-spec-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (savedBackupDir === undefined) {
      delete process.env['AGRIVIO_BACKUP_DIR'];
    } else {
      process.env['AGRIVIO_BACKUP_DIR'] = savedBackupDir;
    }
  });

  it('throws when AGRIVIO_BACKUP_DIR is not set', () => {
    delete process.env['AGRIVIO_BACKUP_DIR'];
    expect(() => resolveBackupDir()).toThrow(/AGRIVIO_BACKUP_DIR/);
  });

  it('creates the directory if it does not exist', () => {
    const newDir = path.join(tmpDir, 'new-backup-dir');
    process.env['AGRIVIO_BACKUP_DIR'] = newDir;
    const resolved = resolveBackupDir();
    expect(fs.existsSync(resolved)).toBe(true);
  });

  it('returns an absolute path', () => {
    process.env['AGRIVIO_BACKUP_DIR'] = tmpDir;
    const resolved = resolveBackupDir();
    expect(path.isAbsolute(resolved)).toBe(true);
  });
});

describe('backup-engine: enforceRetentionPolicy', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agrivio-retention-spec-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('does not delete archives when retentionDays is 0', async () => {
    const archiveName = 'agrivio-20200101-120000-abc123.archive.gz';
    const archivePath = path.join(tmpDir, archiveName);
    const manifestPath = archivePath + '.manifest.json';
    fs.writeFileSync(archivePath, 'data');
    fs.writeFileSync(manifestPath, JSON.stringify({
      filename: archiveName,
      recordedAt: new Date(0).toISOString(),
      sha256: 'abc',
    }));
    await enforceRetentionPolicy(tmpDir, 0);
    expect(fs.existsSync(archivePath)).toBe(true);
    expect(fs.existsSync(manifestPath)).toBe(true);
  });

  it('removes old archives beyond retention window', async () => {
    const archiveName = 'agrivio-20200101-120000-old123.archive.gz';
    const archivePath = path.join(tmpDir, archiveName);
    const manifestPath = archivePath + '.manifest.json';
    fs.writeFileSync(archivePath, 'data');
    fs.writeFileSync(manifestPath, JSON.stringify({
      filename: archiveName,
      recordedAt: new Date(0).toISOString(), // epoch = definitely old
      sha256: 'abc',
    }));
    await enforceRetentionPolicy(tmpDir, 30);
    expect(fs.existsSync(archivePath)).toBe(false);
    expect(fs.existsSync(manifestPath)).toBe(false);
  });

  it('keeps recent archives within retention window', async () => {
    const archiveName = 'agrivio-20200101-120000-new456.archive.gz';
    const archivePath = path.join(tmpDir, archiveName);
    const manifestPath = archivePath + '.manifest.json';
    fs.writeFileSync(archivePath, 'data');
    fs.writeFileSync(manifestPath, JSON.stringify({
      filename: archiveName,
      recordedAt: new Date().toISOString(), // now = recent
      sha256: 'abc',
    }));
    await enforceRetentionPolicy(tmpDir, 30);
    expect(fs.existsSync(archivePath)).toBe(true);
    expect(fs.existsSync(manifestPath)).toBe(true);
  });

  it('ignores files that do not match the agrivio archive manifest pattern', async () => {
    const nonAgrivioFile = path.join(tmpDir, 'other-file.archive.gz.manifest.json');
    fs.writeFileSync(nonAgrivioFile, JSON.stringify({
      filename: 'other-file.archive.gz',
      recordedAt: new Date(0).toISOString(),
      sha256: 'xyz',
    }));
    await enforceRetentionPolicy(tmpDir, 1);
    expect(fs.existsSync(nonAgrivioFile)).toBe(true);
  });
});

describe('restore-engine: permission check', () => {
  it('rejects when actor lacks operations.restore.execute', async () => {
    await expect(runRestore({
      archiveName: 'some.archive.gz',
      confirmDatabase: 'agrivio_rehearsal_restored_abc',
      actor: { actorId: 'user-1', permissions: [] },
    })).rejects.toThrow(/Missing permission operations.restore.execute/);
  });

  it('rejects when actor has no permissions property', async () => {
    await expect(runRestore({
      archiveName: 'some.archive.gz',
      confirmDatabase: 'agrivio_rehearsal_restored_abc',
      actor: { actorId: 'user-1' },
    })).rejects.toThrow(/Missing permission operations.restore.execute/);
  });
});

describe('restore-engine: argument validation', () => {
  const actor = { actorId: 'op', permissions: ['operations.restore.execute'] };

  it('rejects missing archiveName', async () => {
    await expect(runRestore({
      confirmDatabase: 'agrivio_rehearsal_restored_abc',
      actor,
    })).rejects.toThrow(/archiveName is required/);
  });

  it('rejects empty archiveName', async () => {
    await expect(runRestore({
      archiveName: '   ',
      confirmDatabase: 'agrivio_rehearsal_restored_abc',
      actor,
    })).rejects.toThrow(/archiveName is required/);
  });

  it('rejects missing confirmDatabase', async () => {
    await expect(runRestore({
      archiveName: 'some.archive.gz',
      actor,
    })).rejects.toThrow(/confirmDatabase is required/);
  });
});

describe('restore-engine: checksum verification', () => {
  let tmpDir;
  const saved = {};

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agrivio-restore-spec-'));
    saved.backupDir = process.env['AGRIVIO_BACKUP_DIR'];
    saved.mongoUri = process.env['MONGODB_URI'];
    process.env['AGRIVIO_BACKUP_DIR'] = tmpDir;
    process.env['MONGODB_URI'] = 'mongodb://127.0.0.1:27017/?replicaSet=rs0';
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (saved.backupDir === undefined) delete process.env['AGRIVIO_BACKUP_DIR'];
    else process.env['AGRIVIO_BACKUP_DIR'] = saved.backupDir;
    if (saved.mongoUri === undefined) delete process.env['MONGODB_URI'];
    else process.env['MONGODB_URI'] = saved.mongoUri;
  });

  it('rejects restore when manifest is missing', async () => {
    const archiveName = 'agrivio-20250101-120000-abc.archive.gz';
    fs.writeFileSync(path.join(tmpDir, archiveName), 'fake-data');
    // No manifest file written
    await expect(runRestore({
      archiveName,
      confirmDatabase: 'agrivio_rehearsal_restored_abc',
      actor: { actorId: 'op', permissions: ['operations.restore.execute'] },
    })).rejects.toThrow(/Manifest not found/);
  });

  it('rejects restore when SHA-256 checksum mismatches', async () => {
    const archiveName = 'agrivio-20250101-120000-def.archive.gz';
    const archivePath = path.join(tmpDir, archiveName);
    fs.writeFileSync(archivePath, 'real-archive-data');
    const manifestPath = archivePath + '.manifest.json';
    fs.writeFileSync(manifestPath, JSON.stringify({
      filename: archiveName,
      mongodbDbName: 'agrivio_rehearsal_source_def',
      sha256: 'a'.repeat(64), // intentionally wrong checksum
      fileSizeBytes: 17,
    }));
    await expect(runRestore({
      archiveName,
      confirmDatabase: 'agrivio_rehearsal_restored_def',
      actor: { actorId: 'op', permissions: ['operations.restore.execute'] },
    })).rejects.toThrow(/SHA-256 checksum mismatch/);
  });
});

describe('engine-utils: which', () => {
  it('returns null for a clearly non-existent command', () => {
    const result = which('agrivio-definitely-does-not-exist-xyz-123');
    expect(result).toBeNull();
  });
});
