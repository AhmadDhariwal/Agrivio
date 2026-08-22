/* eslint-disable @nx/enforce-module-boundaries */
import { describe, expect, it } from 'vitest';
import { createOperationsModule } from '../../src/modules/operations/operations.module.js';
import { permissionsForMembershipRole, permissionsForPlatformAccess } from '../../src/modules/identity/role-permissions.js';
import {
  assertAllowedRehearsalDatabase,
  isAllowedRehearsalDatabaseName,
  isForbiddenDatabaseName,
  rehearsalDatabaseNames,
} from '../../../../scripts/ops/rehearsal-db-policy.cjs';

describe('R1-F09-005 backup restore and import rehearsals', () => {
  it('refuses Agrivio and non-rehearsal databases for dump/restore/drop', () => {
    expect(isForbiddenDatabaseName('Agrivio')).toBe(true);
    expect(isForbiddenDatabaseName('agrivio_dev')).toBe(true);
    expect(isAllowedRehearsalDatabaseName('Agrivio')).toBe(false);
    expect(() => assertAllowedRehearsalDatabase('Agrivio', 'restore')).toThrow(/Refusing restore/);
    expect(() => assertAllowedRehearsalDatabase('agrivio_test_f05p2_1', 'drop')).toThrow(/Refusing drop/);
    const names = rehearsalDatabaseNames('abc123');
    expect(names.source).toBe('agrivio_rehearsal_source_abc123');
    expect(isAllowedRehearsalDatabaseName(names.restored, 'restored')).toBe(true);
    expect(assertAllowedRehearsalDatabase(names.importDb, 'connect', 'import')).toBe(
      'agrivio_rehearsal_import_abc123',
    );
  });

  it('keeps restore coordination separate from technical database restore and denies org users', async () => {
    const operations = createOperationsModule();
    await operations.operationsService.recordBackupOutcome({
      status: 'success',
      policyRef: 'local-technical-mongodump',
      providerRef: 'host-mongodump',
    });
    const verified = await operations.operationsService.verifyBackupPolicy({
      maxAgeMs: 60 * 60 * 1000,
    });
    expect(verified.status).toBe('success');

    const restoreActor = {
      actorId: 'ops-1',
      permissions: [...permissionsForPlatformAccess('super_admin'), 'operations.restore.execute'],
    };
    const restore = await operations.operationsService.initiateRestoreCoordination(
      { reason: 'F09 restore rehearsal IR-REH-1', targetRef: 'agrivio_rehearsal_restored_abc' },
      restoreActor,
    );
    expect(restore.productionRestoreExecuted).toBe(false);
    expect(restore.coordinationOnly).toBe(true);
    expect(restore.verificationStatus).toBe('pending');

    await expect(
      operations.operationsService.initiateRestoreCoordination(
        { reason: 'nope' },
        {
          actorId: 'owner-1',
          permissions: permissionsForMembershipRole('Owner'),
        },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
