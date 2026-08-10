const { redactLogFields } = require('../logging/redact-log-fields');
const { getRequestId } = require('../http/request-context');

function sanitizeAuditEvent(input) {
  const requestId =
    typeof input.requestId === 'string' && input.requestId.length > 0
      ? input.requestId
      : getRequestId();
  const occurredAt =
    input.occurredAt instanceof Date
      ? input.occurredAt
      : input.occurredAt
        ? new Date(input.occurredAt)
        : new Date();

  return redactLogFields({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    reason: input.reason,
    occurredAt,
    ...(typeof requestId === 'string' && requestId.length > 0 ? { requestId } : {}),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  });
}

function createInMemoryAuditEventStore() {
  const events = [];

  return {
    async append(_session, event) {
      events.push({ ...event, _immutable: true });
    },
    listForTest() {
      return events;
    },
  };
}

function createAuditWriter(store) {
  return {
    async appendBusinessEvent(session, input) {
      const sanitized = sanitizeAuditEvent(input);
      await store.append(session, sanitized);
    },
  };
}

module.exports = {
  sanitizeAuditEvent,
  createInMemoryAuditEventStore,
  createAuditWriter,
};
