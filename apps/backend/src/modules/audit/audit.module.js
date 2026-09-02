const { createInMemoryAuditEventStore } = require('../../platform/audit/audit-writer');
const { createMongooseAuditEventStore } = require('./persistence/audit-event.model');
const { createAuditService } = require('./audit.service');

function createAuditModule(options = {}) {
  const persistence = options.persistence ?? 'memory';
  const store =
    options.store ??
    (persistence === 'mongoose' ? createMongooseAuditEventStore() : createInMemoryAuditEventStore());
  const auditService = createAuditService({
    store,
    resolvePlanEntitlements: options.resolvePlanEntitlements,
    resolveOrganizationTimezone: options.resolveOrganizationTimezone,
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  return { store, auditService };
}

module.exports = {
  createAuditModule,
  createAuditService,
};
