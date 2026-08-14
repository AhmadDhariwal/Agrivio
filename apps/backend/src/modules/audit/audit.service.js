const { forbidden, notFound, validationFailed } = require('../../platform/errors/app-error');
const {
  evaluateFeatureEntitlement,
  parseAuditHistoryWindow,
} = require('../subscriptions/entitlement');

function optionalString(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw validationFailed('Filter values must be strings');
  }
  return value.trim();
}

function optionalDate(value, field) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw validationFailed(`${field} must be an ISO date-time`);
  }
  return parsed;
}

function toAuditDto(event) {
  return {
    id: String(event._id),
    organizationId: event.organizationId === undefined || event.organizationId === null
      ? null
      : String(event.organizationId),
    actorId: event.actorId,
    action: event.action,
    resourceType: event.resourceType,
    resourceId: event.resourceId ?? null,
    reason: event.reason ?? null,
    requestId: event.requestId ?? null,
    occurredAt:
      event.occurredAt instanceof Date
        ? event.occurredAt.toISOString()
        : new Date(event.occurredAt).toISOString(),
    metadata: event.metadata ?? null,
  };
}

function createAuditService(deps) {
  const store = deps.store;
  const now = deps.now ?? (() => new Date());

  async function resolveHistoryWindow(organizationId) {
    const entitlements =
      typeof deps.resolvePlanEntitlements === 'function'
        ? await deps.resolvePlanEntitlements(organizationId)
        : null;
    const feature = evaluateFeatureEntitlement(
      entitlements ? { entitlements } : null,
      'auditHistory',
    );
    if (feature.allowed !== true) {
      throw forbidden('Audit history is not entitled for this subscription');
    }
    const window = parseAuditHistoryWindow(feature.value, now());
    if (window.allowed !== true) {
      throw forbidden('Audit history entitlement depth is not configured');
    }
    return window;
  }

  function parseFilters(query) {
    return {
      actorId: optionalString(query.actorId),
      action: optionalString(query.action ?? query.type),
      resourceType: optionalString(query.resourceType),
      resourceId: optionalString(query.resourceId ?? query.sourceId),
      reason: optionalString(query.reason),
      from: optionalDate(query.from ?? query.occurredFrom, 'from'),
      to: optionalDate(query.to ?? query.occurredTo, 'to'),
      organizationId: optionalString(query.organizationId),
    };
  }

  async function queryOrganizationEvents(organizationId, query) {
    const window = await resolveHistoryWindow(organizationId);
    const filters = parseFilters(query ?? {});
    if (
      filters.organizationId !== undefined &&
      String(filters.organizationId) !== String(organizationId)
    ) {
      throw forbidden('Organization audit inquiry cannot target another organization');
    }
    const from = window.unlimited
      ? filters.from
      : filters.from === undefined || filters.from < window.from
        ? window.from
        : filters.from;
    const items = await store.query({
      organizationId,
      ...(filters.actorId === undefined ? {} : { actorId: filters.actorId }),
      ...(filters.action === undefined ? {} : { action: filters.action }),
      ...(filters.resourceType === undefined ? {} : { resourceType: filters.resourceType }),
      ...(filters.resourceId === undefined ? {} : { resourceId: filters.resourceId }),
      ...(filters.reason === undefined ? {} : { reason: filters.reason }),
      ...(from === undefined ? {} : { from }),
      ...(filters.to === undefined ? {} : { to: filters.to }),
    });
    return { items: items.map(toAuditDto) };
  }

  async function getOrganizationEvent(organizationId, id) {
    const window = await resolveHistoryWindow(organizationId);
    const event = await store.findById(id);
    if (event === null || String(event.organizationId ?? '') !== String(organizationId)) {
      throw notFound('Audit event not found');
    }
    const occurredAt =
      event.occurredAt instanceof Date ? event.occurredAt : new Date(event.occurredAt);
    if (!window.unlimited && occurredAt.getTime() < window.from.getTime()) {
      throw forbidden('Audit history entitlement does not include this event');
    }
    return toAuditDto(event);
  }

  async function queryPlatformEvents(query) {
    const filters = parseFilters(query ?? {});
    const items = await store.query({
      ...(filters.organizationId === undefined ? {} : { organizationId: filters.organizationId }),
      ...(filters.actorId === undefined ? {} : { actorId: filters.actorId }),
      ...(filters.action === undefined ? {} : { action: filters.action }),
      ...(filters.resourceType === undefined ? {} : { resourceType: filters.resourceType }),
      ...(filters.resourceId === undefined ? {} : { resourceId: filters.resourceId }),
      ...(filters.reason === undefined ? {} : { reason: filters.reason }),
      ...(filters.from === undefined ? {} : { from: filters.from }),
      ...(filters.to === undefined ? {} : { to: filters.to }),
    });
    return { items: items.map(toAuditDto) };
  }

  return {
    queryOrganizationEvents,
    getOrganizationEvent,
    queryPlatformEvents,
    appendForTest: (event) => store.append(null, event),
  };
}

module.exports = {
  createAuditService,
};
