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
  let seq = 1;

  return {
    async append(_session, event) {
      const id = event._id ?? `audit-${seq++}`;
      events.push({ ...event, _id: id, _immutable: true });
    },
    listForTest() {
      return events;
    },
    async query(filter) {
      return events
        .filter((event) => {
          if (
            filter.organizationId !== undefined &&
            String(event.organizationId ?? '') !== String(filter.organizationId)
          ) {
            return false;
          }
          if (filter.actorId !== undefined && String(event.actorId) !== String(filter.actorId)) {
            return false;
          }
          if (filter.action !== undefined && String(event.action) !== String(filter.action)) {
            return false;
          }
          if (
            filter.resourceType !== undefined &&
            String(event.resourceType) !== String(filter.resourceType)
          ) {
            return false;
          }
          if (
            filter.resourceId !== undefined &&
            String(event.resourceId ?? '') !== String(filter.resourceId)
          ) {
            return false;
          }
          if (filter.reason !== undefined) {
            const reason = String(event.reason ?? '');
            if (!reason.toLowerCase().includes(String(filter.reason).toLowerCase())) {
              return false;
            }
          }
          const occurredAt =
            event.occurredAt instanceof Date ? event.occurredAt : new Date(event.occurredAt);
          if (filter.from !== undefined && occurredAt.getTime() < filter.from.getTime()) {
            return false;
          }
          if (filter.to !== undefined && occurredAt.getTime() > filter.to.getTime()) {
            return false;
          }
          return true;
        })
        .slice()
        .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
        .map((event) => ({ ...event }));
    },

    async queryPage(filter, pagination = {}) {
      const items = await this.query(filter);
      const skip = pagination.skip ?? 0;
      return { items: items.slice(skip, skip + (pagination.pageSize ?? 25)), total: items.length };
    },
    async distinctValues(filter, field, options = {}) {
      const items = await this.query(filter);
      const search = String(options.search ?? '').toLowerCase();
      const values = new Set();
      for (const item of items) {
        const value = item[field];
        if (typeof value !== 'string' || value === '') {
          continue;
        }
        if (search !== '' && !value.toLowerCase().includes(search)) {
          continue;
        }
        values.add(value);
      }
      return [...values]
        .sort((left, right) => left.localeCompare(right))
        .slice(0, options.limit ?? 20);
    },
    async findById(id) {
      const event = events.find((item) => String(item._id) === String(id));
      return event === undefined ? null : { ...event };
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
