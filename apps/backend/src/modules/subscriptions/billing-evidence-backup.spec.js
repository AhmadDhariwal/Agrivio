import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createEvidenceBackup,
  verifyEvidenceBackup,
  recoverEvidenceFile,
} from '../../../../../scripts/ops/backup-billing-evidence.mjs';
import { createLocalBillingEvidenceStorage } from './billing-evidence-storage.js';

describe('Billing Evidence Storage Backup & Recovery Gate', () => {
  let testEvidenceDir;
  let testBackupDir;
  let testRecoveryDir;

  beforeEach(() => {
    const id = Date.now().toString();
    testEvidenceDir = join(tmpdir(), `agrivio-test-evidence-${id}`);
    testBackupDir = join(tmpdir(), `agrivio-test-evidence-backup-${id}`);
    testRecoveryDir = join(tmpdir(), `agrivio-test-evidence-recovery-${id}`);
    mkdirSync(testEvidenceDir, { recursive: true });
    mkdirSync(testBackupDir, { recursive: true });
    mkdirSync(testRecoveryDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testEvidenceDir, { recursive: true, force: true });
    rmSync(testBackupDir, { recursive: true, force: true });
    rmSync(testRecoveryDir, { recursive: true, force: true });
  });

  it('proves persistence across restarts, backup snapshot creation, and file recovery', async () => {
    // 1. Write harmless test billing evidence using local storage
    const storage1 = createLocalBillingEvidenceStorage({ rootDir: testEvidenceDir });
    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const stored = await storage1.put({
      organizationId: 'org_test_123',
      buffer: pngMagic,
      originalFileName: 'payment-receipt.png',
      contentType: 'image/png',
    });

    expect(stored.evidenceStorageRef).toBeTruthy();

    // 2. Verify file survives simulated application restart (new storage instance on same rootDir)
    const storage2 = createLocalBillingEvidenceStorage({ rootDir: testEvidenceDir });
    const retrieved = await storage2.read(stored.evidenceStorageRef);
    expect(retrieved).not.toBeNull();
    expect(retrieved.buffer.equals(pngMagic)).toBe(true);

    // 3. Create backup snapshot
    const backupResult = await createEvidenceBackup({
      evidenceDir: testEvidenceDir,
      backupDir: testBackupDir,
    });
    expect(backupResult.fileCount).toBe(2); // .bin and .json metadata
    expect(existsSync(backupResult.manifestPath)).toBe(true);
    expect(existsSync(backupResult.archivePath)).toBe(true);

    // 4. Verify backup checksum integrity
    const verification = await verifyEvidenceBackup(backupResult.archiveName, {
      backupDir: testBackupDir,
    });
    expect(verification.verified).toBe(true);

    // 5. Recover harmless test file from backup to an isolated target
    const binRelativePath = `org_test_123/${stored.evidenceStorageRef.split('/')[3]}.bin`;
    const recoveryResult = await recoverEvidenceFile(
      backupResult.archiveName,
      binRelativePath,
      testRecoveryDir,
      { backupDir: testBackupDir },
    );
    expect(recoveryResult.recovered).toBe(true);
    const recoveredBytes = readFileSync(recoveryResult.destPath);
    expect(recoveredBytes.equals(pngMagic)).toBe(true);
  });
});
