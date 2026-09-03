const { redactLogFields } = require('../logging/redact-log-fields');
const { getRequestContext, getRequestId } = require('../http/request-context');

const AUDIT_SCOPES = Object.freeze({
  TENANT: 'tenant',
  PLATFORM: 'platform',
});

function resolveAuditScope(input) {
  if (input.scope === AUDIT_SCOPES.TENANT || input.scope === AUDIT_SCOPES.PLATFORM) {
    return input.scope;
  }
  const requestContext = getRequestContext();
  if (
    requestContext?.auditScope === AUDIT_SCOPES.PLATFORM ||
    requestContext?.authContext?.contextType === 'platform'
  ) {
    return AUDIT_SCOPES.PLATFORM;
  }
  return input.organizationId === undefined || input.organizationId === null
    ? AUDIT_SCOPES.PLATFORM
    : AUDIT_SCOPES.TENANT;
}

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
    scope: resolveAuditScope(input),
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
          if (filter.scope === AUDIT_SCOPES.TENANT && event.scope === AUDIT_SCOPES.PLATFORM) {
            return false;
          }
          if (
            filter.scope === AUDIT_SCOPES.PLATFORM &&
            event.scope !== AUDIT_SCOPES.PLATFORM &&
            !(
              event.scope === undefined &&
              (event.organizationId === undefined ||
                event.organizationId === null ||
                event.organizationId === 'platform')
            )
          ) {
            return false;
          }
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
            Array.isArray(filter.excludeActions) &&
            filter.excludeActions.includes(String(event.action))
          ) {
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
    async getSummary(filter, { startOfToday } = {}) {
      const items = await this.query(filter);
      const totalEvents = items.length;
      const todayThreshold =
        filter.from !== undefined && startOfToday !== undefined && filter.from > startOfToday
          ? filter.from
          : startOfToday;
      const eventsToday =
        todayThreshold === undefined
          ? 0
          : items.filter((item) => {
              const occurredAt =
                item.occurredAt instanceof Date ? item.occurredAt : new Date(item.occurredAt);
              return occurredAt.getTime() >= todayThreshold.getTime();
            }).length;
      const uniqueActors = new Set(
        items.map((i) => i.actorId).filter((a) => typeof a === 'string' && a !== ''),
      ).size;
      const resourceTypes = new Set(
        items.map((i) => i.resourceType).filter((r) => typeof r === 'string' && r !== ''),
      ).size;
      return {
        totalEvents,
        eventsToday,
        uniqueActors,
        resourceTypes,
      };
    },
    async getRetentionStats(filter, cutoff) {
      const items = await this.query(filter);
      const accessible =
        cutoff === null
          ? items
          : items.filter((item) => new Date(item.occurredAt).getTime() >= cutoff.getTime());
      const expired =
        cutoff === null
          ? []
          : items.filter((item) => new Date(item.occurredAt).getTime() < cutoff.getTime());
      return {
        currentEventCount: accessible.length,
        expiredEventCount: expired.length,
        oldestAccessibleEvent:
          accessible.length === 0 ? null : new Date(accessible[accessible.length - 1].occurredAt),
        newestEvent: accessible.length === 0 ? null : new Date(accessible[0].occurredAt),
      };
    },
    async purgeBefore(filter, cutoff) {
      const expiredIds = new Set(
        (await this.query({ ...filter, to: new Date(cutoff.getTime() - 1) })).map(
          (item) => item._id,
        ),
      );
      let deletedCount = 0;
      for (let index = events.length - 1; index >= 0; index -= 1) {
        if (expiredIds.has(events[index]._id)) {
          events.splice(index, 1);
          deletedCount += 1;
        }
      }
      return deletedCount;
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
  AUDIT_SCOPES,
  sanitizeAuditEvent,
  createInMemoryAuditEventStore,
  createAuditWriter,
};
