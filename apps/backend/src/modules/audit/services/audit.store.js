// @ts-check
import { AuditEventModel } from '../persistence/audit-event.model.js';
import { createAuditWriter } from '../../../platform/audit/audit-writer.js';

/**
 * @returns {import('../../../platform/audit/audit-writer.js').AuditEventStore}
 */
export function createMongoAuditEventStore() {
  return {
    async append(session, event) {
      await AuditEventModel.create(
        [event],
        session
          ? { session: /** @type {import('mongoose').ClientSession} */ (session) }
          : undefined,
      );
    },
  };
}

/**
 * Create a production-ready audit writer backed by MongoDB.
 */
export function createMongoAuditWriter() {
  return createAuditWriter(createMongoAuditEventStore());
}
