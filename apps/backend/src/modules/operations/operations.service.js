const {
  conflict,
  forbidden,
  notFound,
  validationFailed,
} = require('../../platform/errors/app-error');
const { createAuditWriter } = require('../../platform/audit/audit-writer');
const { BACKUP_STATUSES } = require('./persistence/backup-operation.model');

function requireString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw validationFailed(`${field} is required`);
  }
  return value.trim();
}

function toBackupDto(record) {
  return {
    id: String(record._id),
    status: record.status,
    recordedAt:
      record.recordedAt instanceof Date
        ? record.recordedAt.toISOString()
        : new Date(record.recordedAt).toISOString(),
    startedAt: record.startedAt ? new Date(record.startedAt).toISOString() : null,
    completedAt: record.completedAt ? new Date(record.completedAt).toISOString() : null,
    databaseName: record.databaseName ?? null,
    failureVisible: record.status === 'failed',
    failureMessage: record.failureMessage ?? null,
    providerRef: record.providerRef ?? null,
    policyRef: record.policyRef ?? null,
    filename: record.filename ?? null,
    fileSizeBytes: record.fileSizeBytes ?? null,
    sha256: record.sha256 ?? null,
    manifestVerified: record.manifestVerified === true,
    checksumVerified: record.checksumVerified === true,
    retentionDays: record.retentionDays ?? null,
    expiresAt: record.expiresAt ? new Date(record.expiresAt).toISOString() : null,
    restoreReady: record.restoreReady === true,
    coverage: 'mongodb_application_data',
  };
}

function toRestoreDto(record) {
  return {
    id: String(record._id),
    status: record.status,
    requestedAt:
      record.requestedAt instanceof Date
        ? record.requestedAt.toISOString()
        : new Date(record.requestedAt).toISOString(),
    actorId: record.actorId,
    reason: record.reason,
    targetRef: record.targetRef ?? null,
    productionRestoreExecuted: record.productionRestoreExecuted === true,
    verificationStatus: record.verificationStatus ?? 'pending',
    coordinationOnly: true,
  };
}

function createOperationsService(deps) {
  const store = deps.store;
  const now = deps.now ?? (() => new Date());
  const auditWriter = createAuditWriter({
    append: (session, event) => deps.appendAuditEvent(session, event),
  });

  // Optional: injected backup/restore engines (allows test overrides)
  const backupEngine = deps.backupEngine ?? null;
  const restoreEngine = deps.restoreEngine ?? null;

  async function listBackups() {
    const items = await store.listBackups();
    return { items: items.map(toBackupDto) };
  }

  async function getBackupById(id) {
    const record = await store.findBackupById(id);
    if (record === null) {
      throw notFound('Backup record not found');
    }
    return toBackupDto(record);
  }

  async function verifyBackupPolicy(options = {}) {
    const maxAgeMs = options.maxAgeMs ?? 24 * 60 * 60 * 1000;
    const items = await store.listBackups();
    const latestSuccess = items.find((item) => item.status === 'success');
    if (latestSuccess === undefined) {
      throw validationFailed('No successful backup recorded for policy verification');
    }
    const recordedAt =
      latestSuccess.recordedAt instanceof Date
        ? latestSuccess.recordedAt
        : new Date(latestSuccess.recordedAt);
    if (now().getTime() - recordedAt.getTime() > maxAgeMs) {
      throw validationFailed('Latest successful backup is older than the verification window');
    }
    return toBackupDto(latestSuccess);
  }

  async function recordBackupOutcome(input) {
    const status = requireString(input.status, 'status');
    if (!BACKUP_STATUSES.includes(status)) {
      throw validationFailed('status must be running, success, or failed');
    }
    const recorded = await store.insertBackup(null, {
      status,
      recordedAt: input.recordedAt ? new Date(input.recordedAt) : now(),
      failureMessage:
        status === 'failed' ? requireString(input.failureMessage, 'failureMessage') : null,
      providerRef: typeof input.providerRef === 'string' ? input.providerRef : null,
      policyRef: typeof input.policyRef === 'string' ? input.policyRef : null,
    });
    return toBackupDto(recorded);
  }

  async function createBackup(actor) {
    if (!backupEngine) {
      throw validationFailed(
        'Native backup engine is not available in this environment. Use npm run ops:backup from the operator CLI.',
      );
    }
    if (actor?.privilegedCli !== true) {
      throw forbidden('Backup execution is restricted to the privileged operator CLI');
    }

    if (await store.findRunningBackup()) {
      throw conflict('A backup is already running');
    }

    const startedAt = now();
    let runningRecord;
    try {
      runningRecord = await store.insertBackup(null, {
        status: 'running',
        recordedAt: startedAt,
        startedAt,
        completedAt: null,
        failureMessage: null,
        providerRef: null,
        policyRef: null,
        restoreReady: false,
      });
    } catch (error) {
      if (error?.code === 11000) {
        throw conflict('A backup is already running');
      }
      throw error;
    }

    await auditWriter.appendBusinessEvent(null, {
      actorId: String(actor.actorId),
      action: 'backup.started',
      resourceType: 'backup_operation',
      resourceId: String(runningRecord._id),
      occurredAt: startedAt,
    });

    let manifest;
    try {
      manifest = await backupEngine.runBackup();
    } catch {
      await store.updateBackup(null, String(runningRecord._id), {
        status: 'failed',
        completedAt: now(),
        failureMessage: 'Backup failed: mongodump did not complete successfully',
        restoreReady: false,
      });
      await auditWriter.appendBusinessEvent(null, {
        actorId: String(actor.actorId),
        action: 'backup.failed',
        resourceType: 'backup_operation',
        resourceId: String(runningRecord._id),
        occurredAt: now(),
      });
      const safe = new Error('Backup failed: mongodump did not complete successfully');
      safe.statusCode = 500;
      throw safe;
    }

    await store.updateBackup(null, String(runningRecord._id), {
      status: 'success',
      recordedAt: manifest.completedAt ? new Date(manifest.completedAt) : now(),
      startedAt: manifest.startedAt ? new Date(manifest.startedAt) : startedAt,
      completedAt: manifest.completedAt ? new Date(manifest.completedAt) : now(),
      databaseName: manifest.mongodbDbName ?? null,
      providerRef: manifest.filename ?? null,
      policyRef: manifest.runId ?? null,
      filename: manifest.filename ?? null,
      fileSizeBytes: manifest.fileSizeBytes ?? null,
      sha256: manifest.sha256 ?? null,
      manifestVerified: manifest.manifestVerified === true,
      checksumVerified: manifest.checksumVerified === true,
      retentionDays: manifest.retentionDays ?? null,
      expiresAt: manifest.expiresAt ? new Date(manifest.expiresAt) : null,
      restoreReady:
        manifest.manifestVerified === true &&
        manifest.checksumVerified === true &&
        typeof manifest.filename === 'string',
    });

    await auditWriter.appendBusinessEvent(null, {
      actorId: String(actor.actorId),
      action: 'backup.completed',
      resourceType: 'backup_operation',
      resourceId: String(runningRecord._id),
      occurredAt: now(),
      metadata: {
        filename: manifest.filename,
        fileSizeBytes: manifest.fileSizeBytes,
        sha256: manifest.sha256,
        databaseName: manifest.mongodbDbName,
        retentionDays: manifest.retentionDays,
        expiresAt: manifest.expiresAt,
        coverage: 'mongodb_application_data',
      },
    });

    return toBackupDto(await store.findBackupById(String(runningRecord._id)));
  }

  async function initiateRestoreCoordination(body, actor) {
    if (!actor?.permissions?.includes('operations.restore.execute')) {
      throw forbidden('Missing permission operations.restore.execute');
    }
    const reason = requireString(body?.reason, 'reason');
    const requestedAt = now();
    const recorded = await store.insertRestore(null, {
      status: 'coordination_initiated',
      requestedAt,
      actorId: String(actor.actorId),
      reason,
      targetRef: typeof body?.targetRef === 'string' ? body.targetRef.trim() : null,
      productionRestoreExecuted: false,
      verificationStatus: 'pending',
    });
    await auditWriter.appendBusinessEvent(null, {
      actorId: String(actor.actorId),
      action: 'restore.coordination.initiated',
      resourceType: 'restore_operation',
      resourceId: String(recorded._id),
      reason,
      occurredAt: requestedAt,
      metadata: {
        coordinationOnly: true,
        productionRestoreExecuted: false,
      },
    });
    return toRestoreDto(recorded);
  }

  async function executeRestore(body, actor) {
    if (!restoreEngine) {
      throw validationFailed(
        'Native restore engine is not available in this environment. Use npm run ops:restore from the operator CLI.',
      );
    }
    if (!actor?.permissions?.includes('operations.restore.execute')) {
      throw forbidden('Missing permission operations.restore.execute');
    }
    const archiveName = requireString(body?.archiveName, 'archiveName');
    const confirmDatabase = requireString(body?.confirmDatabase, 'confirmDatabase');

    await auditWriter.appendBusinessEvent(null, {
      actorId: String(actor.actorId),
      action: 'restore.execute.started',
      resourceType: 'restore_operation',
      occurredAt: now(),
      metadata: { archiveName, confirmDatabase },
    });

    let result;
    try {
      result = await restoreEngine.runRestore({
        archiveName,
        confirmDatabase,
        targetDbName: confirmDatabase,
        actor,
      });
    } catch (err) {
      await auditWriter.appendBusinessEvent(null, {
        actorId: String(actor.actorId),
        action: 'restore.execute.failed',
        resourceType: 'restore_operation',
        occurredAt: now(),
        metadata: { archiveName, confirmDatabase, error: err.message },
      });
      throw err;
    }

    await auditWriter.appendBusinessEvent(null, {
      actorId: String(actor.actorId),
      action: 'restore.execute.completed',
      resourceType: 'restore_operation',
      occurredAt: now(),
      metadata: {
        archiveName: result.archiveName,
        sourceDbName: result.sourceDbName,
        targetDbName: result.targetDbName,
        sha256Verified: result.sha256Verified,
      },
    });

    return result;
  }

  async function getRestore(id) {
    const record = await store.findRestoreById(id);
    if (record === null) {
      throw notFound('Restore operation not found');
    }
    return toRestoreDto(record);
  }

  return {
    listBackups,
    getBackupById,
    verifyBackupPolicy,
    recordBackupOutcome,
    createBackup,
    initiateRestoreCoordination,
    executeRestore,
    getRestore,
  };
}

module.exports = {
  createOperationsService,
};
