const { forbidden, notFound, validationFailed } = require('../../platform/errors/app-error');
const {
  evaluateFeatureEntitlement,
  parseAuditHistoryWindow,
} = require('../subscriptions/entitlement');

const FILTER_OPTION_FIELDS = new Set(['actorId', 'action', 'resourceType', 'resourceId']);

const DEFAULT_FILTER_OPTION_LIMIT = 20;
const MAX_FILTER_OPTION_LIMIT = 50;

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

function filterOptionLimit(value) {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_FILTER_OPTION_LIMIT;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_FILTER_OPTION_LIMIT) {
    throw validationFailed(`limit must be an integer between 1 and ${MAX_FILTER_OPTION_LIMIT}`);
  }
  return parsed;
}

function getStartOfDayInTimezone(timezone, at = new Date()) {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    });
    const p1 = dtf.formatToParts(at);
    const y = Number(p1.find((p) => p.type === 'year')?.value);
    const m = Number(p1.find((p) => p.type === 'month')?.value);
    const d = Number(p1.find((p) => p.type === 'day')?.value);
    const guess = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    const p2 = dtf.formatToParts(guess);
    const gy = Number(p2.find((p) => p.type === 'year')?.value);
    const gm = Number(p2.find((p) => p.type === 'month')?.value);
    const gd = Number(p2.find((p) => p.type === 'day')?.value);
    const gh = Number(p2.find((p) => p.type === 'hour')?.value % 24);
    const gmin = Number(p2.find((p) => p.type === 'minute')?.value);
    const diff = Date.UTC(gy, gm - 1, gd, gh, gmin) - Date.UTC(y, m - 1, d, 0, 0);
    const result = new Date(guess.getTime() - diff);
    const check = dtf.formatToParts(result);
    const cy = Number(check.find((p) => p.type === 'year')?.value);
    const cm = Number(check.find((p) => p.type === 'month')?.value);
    const cd = Number(check.find((p) => p.type === 'day')?.value);
    const ch = Number(check.find((p) => p.type === 'hour')?.value % 24);
    const cmin = Number(check.find((p) => p.type === 'minute')?.value);
    if (cy !== y || cm !== m || cd !== d || ch !== 0 || cmin !== 0) {
      const diff2 = Date.UTC(cy, cm - 1, cd, ch, cmin) - Date.UTC(y, m - 1, d, 0, 0);
      return new Date(result.getTime() - diff2);
    }
    return result;
  } catch {
    const fallback = new Date(at);
    fallback.setUTCHours(0, 0, 0, 0);
    return fallback;
  }
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
    const filters = {
      actorId: optionalString(query.actorId),
      action: optionalString(query.action ?? query.type),
      resourceType: optionalString(query.resourceType),
      resourceId: optionalString(query.resourceId ?? query.sourceId),
      reason: optionalString(query.reason),
      from: optionalDate(query.from ?? query.occurredFrom, 'from'),
      to: optionalDate(query.to ?? query.occurredTo, 'to'),
      organizationId: optionalString(query.organizationId),
    };
    if (filters.from !== undefined && filters.to !== undefined && filters.from > filters.to) {
      throw validationFailed('from must be earlier than or equal to to', [
        { field: 'from', message: 'from must be earlier than or equal to to' },
        { field: 'to', message: 'to must be later than or equal to from' },
      ]);
    }
    return filters;
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
    const result = await store.queryPage({
      organizationId,
      ...(filters.actorId === undefined ? {} : { actorId: filters.actorId }),
      ...(filters.action === undefined ? {} : { action: filters.action }),
      ...(filters.resourceType === undefined ? {} : { resourceType: filters.resourceType }),
      ...(filters.resourceId === undefined ? {} : { resourceId: filters.resourceId }),
      ...(filters.reason === undefined ? {} : { reason: filters.reason }),
      ...(from === undefined ? {} : { from }),
      ...(filters.to === undefined ? {} : { to: filters.to }),
    }, { skip: query.skip, pageSize: query.pageSize });
    return { items: result.items.map(toAuditDto), total: result.total };
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

  async function queryOrganizationFilterOptions(organizationId, query) {
    const field = optionalString(query?.field);
    if (field === undefined || !FILTER_OPTION_FIELDS.has(field)) {
      throw validationFailed('field must be actorId, action, resourceType, or resourceId');
    }
    const search = optionalString(query?.search);
    if (search !== undefined && search.length > 100) {
      throw validationFailed('search must not exceed 100 characters');
    }
    const window = await resolveHistoryWindow(organizationId);
    const items = await store.distinctValues(
      {
        organizationId,
        ...(window.unlimited ? {} : { from: window.from }),
      },
      field,
      {
        ...(search === undefined ? {} : { search }),
        limit: filterOptionLimit(query?.limit),
      },
    );
    return { field, items };
  }

  async function queryPlatformEvents(query) {
    const filters = parseFilters(query ?? {});
    const result = await store.queryPage({
      ...(filters.organizationId === undefined ? {} : { organizationId: filters.organizationId }),
      ...(filters.actorId === undefined ? {} : { actorId: filters.actorId }),
      ...(filters.action === undefined ? {} : { action: filters.action }),
      ...(filters.resourceType === undefined ? {} : { resourceType: filters.resourceType }),
      ...(filters.resourceId === undefined ? {} : { resourceId: filters.resourceId }),
      ...(filters.reason === undefined ? {} : { reason: filters.reason }),
      ...(filters.from === undefined ? {} : { from: filters.from }),
      ...(filters.to === undefined ? {} : { to: filters.to }),
    }, { skip: query.skip, pageSize: query.pageSize });
    return { items: result.items.map(toAuditDto), total: result.total };
  }

  async function getOrganizationSummary(organizationId) {
    const window = await resolveHistoryWindow(organizationId);
    const timezone =
      typeof deps.resolveOrganizationTimezone === 'function'
        ? await deps.resolveOrganizationTimezone(organizationId)
        : 'Asia/Karachi';
    const currentDate = now();
    const startOfToday = getStartOfDayInTimezone(timezone, currentDate);
    const from = window.unlimited ? undefined : window.from;
    return store.getSummary(
      {
        organizationId,
        ...(from === undefined ? {} : { from }),
      },
      { startOfToday },
    );
  }

  return {
    queryOrganizationEvents,
    queryOrganizationFilterOptions,
    getOrganizationEvent,
    getOrganizationSummary,
    queryPlatformEvents,
    appendForTest: (event) => store.append(null, event),
  };
}

module.exports = {
  createAuditService,
  getStartOfDayInTimezone,
};
