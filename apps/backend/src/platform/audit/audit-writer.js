const { redactLogFields } = require('../logging/redact-log-fields');

function sanitizeAuditEvent(input) {
  return redactLogFields({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    reason: input.reason,
    occurredAt: (input.occurredAt ?? new Date()).toISOString(),
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
    /**
     * Append-only business audit event inside the authoritative transaction.
     */
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
