const { createInMemoryAuditEventStore } = require('../../platform/audit/audit-writer');
const {
  createInMemoryOperationsStore,
  createMongooseOperationsStore,
} = require('./operations.store');
const { createOperationsService } = require('./operations.service');

function createOperationsModule(options = {}) {
  const persistence = options.persistence ?? 'memory';
  const store =
    options.store ??
    (persistence === 'mongoose' ? createMongooseOperationsStore() : createInMemoryOperationsStore());
  const auditStore = options.auditStore ?? createInMemoryAuditEventStore();
  const operationsService = createOperationsService({
    store,
    appendAuditEvent: (session, event) => auditStore.append(session, event),
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  return { store, auditStore, operationsService };
}

module.exports = {
  createOperationsModule,
  createOperationsService,
};
