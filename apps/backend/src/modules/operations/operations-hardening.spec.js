import { describe, expect, it, vi } from 'vitest';
import { createOperationsModule } from './operations.module.js';

const actor = {
  actorId: 'super-admin',
  privilegedCli: true,
};

describe('operations backup hardening', () => {
  it('persists authoritative engine manifest metadata and exposes restore readiness', async () => {
    const runBackup = vi.fn(async () => ({
      schemaVersion: 1,
      runId: 'run-1',
      filename: 'agrivio-run-1.archive.gz',
      mongodbDbName: 'Agrivio',
      startedAt: '2026-09-03T10:00:00.000Z',
      completedAt: '2026-09-03T10:01:00.000Z',
      recordedAt: '2026-09-03T10:01:00.000Z',
      fileSizeBytes: 4096,
      sha256: 'a'.repeat(64),
      mongodumpExitCode: 0,
      retentionDays: 30,
      expiresAt: '2026-10-03T10:01:00.000Z',
      coverage: 'mongodb_application_data',
      manifestVerified: true,
      checksumVerified: true,
    }));
    const operations = createOperationsModule({ backupEngine: { runBackup } });

    const result = await operations.operationsService.createBackup(actor);

    expect(runBackup).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      status: 'success',
      databaseName: 'Agrivio',
      filename: 'agrivio-run-1.archive.gz',
      fileSizeBytes: 4096,
      manifestVerified: true,
      checksumVerified: true,
      retentionDays: 30,
      restoreReady: true,
      coverage: 'mongodb_application_data',
    });
    expect((await operations.operationsService.listBackups()).items[0]).toEqual(result);
    expect(
      operations.auditStore.listForTest().some((event) => event.action === 'backup.completed'),
    ).toBe(true);
  });

  it('rejects duplicate concurrent backup and unauthorized execution', async () => {
    const operations = createOperationsModule({ backupEngine: { runBackup: vi.fn() } });
    await operations.store.insertBackup(null, {
      status: 'running',
      recordedAt: new Date(),
    });

    await expect(operations.operationsService.createBackup(actor)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await expect(
      operations.operationsService.createBackup({ actorId: 'org-user', permissions: [] }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('records real-engine failures without inventing archive verification values', async () => {
    const operations = createOperationsModule({
      backupEngine: {
        runBackup: vi.fn(async () => {
          throw new Error('sensitive engine detail');
        }),
      },
    });

    await expect(operations.operationsService.createBackup(actor)).rejects.toThrow(
      'Backup failed: mongodump did not complete successfully',
    );
    const [failed] = (await operations.operationsService.listBackups()).items;
    expect(failed).toMatchObject({
      status: 'failed',
      failureMessage: 'Backup failed: mongodump did not complete successfully',
      manifestVerified: false,
      checksumVerified: false,
      restoreReady: false,
    });
  });
});
