/**
 * Audit public contract for posting modules (R1-F04-012).
 * Business modules append audit through createAuditWriter — not Audit Mongoose models.
 */

const {
  createAuditWriter,
  createInMemoryAuditEventStore,
  sanitizeAuditEvent,
} = require('../../../platform/audit/audit-writer');

module.exports = {
  createAuditWriter,
  createInMemoryAuditEventStore,
  sanitizeAuditEvent,
};
