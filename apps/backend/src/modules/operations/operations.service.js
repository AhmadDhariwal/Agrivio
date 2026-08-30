const { forbidden, notFound, validationFailed } = require('../../platform/errors/app-error');
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
    failureVisible: record.status === 'failed',
    failureMessage: record.failureMessage ?? null,
    providerRef: record.providerRef ?? null,
    policyRef: record.policyRef ?? null,
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

  async function listBackups() {
    const items = await store.listBackups();
    return { items: items.map(toBackupDto) };
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
      failureMessage: status === 'failed' ? requireString(input.failureMessage, 'failureMessage') : null,
      providerRef: typeof input.providerRef === 'string' ? input.providerRef : null,
      policyRef: typeof input.policyRef === 'string' ? input.policyRef : null,
    });
    return toBackupDto(recorded);
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

  async function getRestore(id) {
    const record = await store.findRestoreById(id);
    if (record === null) {
      throw notFound('Restore operation not found');
    }
    return toRestoreDto(record);
  }

  return {
    listBackups,
    verifyBackupPolicy,
    recordBackupOutcome,
    initiateRestoreCoordination,
    getRestore,
  };
}

module.exports = {
  createOperationsService,
};
