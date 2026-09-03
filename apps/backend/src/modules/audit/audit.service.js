const { forbidden, notFound, validationFailed } = require('../../platform/errors/app-error');
const {
  evaluateFeatureEntitlement,
  parseAuditHistoryWindow,
} = require('../subscriptions/entitlement');
const { createAuditWriter } = require('../../platform/audit/audit-writer');

const FILTER_OPTION_FIELDS = new Set(['actorId', 'action', 'resourceType', 'resourceId']);

const DEFAULT_FILTER_OPTION_LIMIT = 20;
const MAX_FILTER_OPTION_LIMIT = 50;
const LEGACY_PLATFORM_ACTIONS = Object.freeze([
  'organization.activation_token_reissued',
  'organization.approved',
  'organization.rejected',
  'organization.suspended',
  'organization_capability.changed',
  'subscription_plan.version_created',
  'subscription.billing_approved',
  'subscription.billing_rejected',
  'subscription.billing_review_started',
  'subscription.plan_change_scheduled',
  'subscription.plan_changed',
  'subscription.renewed_by_billing',
]);

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
    scope:
      event.scope ??
      (event.organizationId === undefined || event.organizationId === null ? 'platform' : 'tenant'),
    organizationId:
      event.organizationId === undefined || event.organizationId === null
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
  let resolveActorOptions = deps.resolveActorOptions;
  const auditWriter = createAuditWriter({
    append: (session, event) => store.append(session, event),
  });

  function retentionFilter(scope, organizationId) {
    if (scope === 'platform') {
      return { scope: 'platform' };
    }
    return {
      scope: 'tenant',
      organizationId,
      excludeActions: LEGACY_PLATFORM_ACTIONS,
    };
  }

  async function resolveRetentionPolicy(scope, organizationId) {
    if (scope !== 'tenant' && scope !== 'platform') {
      throw validationFailed('scope must be tenant or platform');
    }
    if (
      scope === 'tenant' &&
      (typeof organizationId !== 'string' || organizationId.trim() === '')
    ) {
      throw validationFailed('organizationId is required for tenant audit retention');
    }
    if (scope === 'platform') {
      if (organizationId !== undefined && organizationId !== null && organizationId !== '') {
        throw validationFailed('organizationId is not allowed for platform audit retention');
      }
      const days = deps.config?.platformAuditRetentionDays ?? null;
      return days === null
        ? { days: null, source: 'unconfigured', cutoff: null }
        : {
            days,
            source: 'platform_config',
            cutoff: new Date(now().getTime() - days * 24 * 60 * 60 * 1000),
          };
    }

    const overrideDays = deps.config?.auditRetentionOverrideDays ?? null;
    if (overrideDays !== null) {
      return {
        days: overrideDays,
        source: 'non_production_override',
        cutoff: new Date(now().getTime() - overrideDays * 24 * 60 * 60 * 1000),
      };
    }

    const entitlements =
      typeof deps.resolvePlanEntitlements === 'function'
        ? await deps.resolvePlanEntitlements(organizationId)
        : null;
    const feature = evaluateFeatureEntitlement(
      entitlements ? { entitlements } : null,
      'auditHistory',
    );
    const window = parseAuditHistoryWindow(feature.value, now());
    if (window.allowed !== true) {
      return { days: null, source: 'unconfigured', cutoff: null };
    }
    if (window.unlimited) {
      return { days: null, source: 'subscription_unlimited', cutoff: null };
    }
    const days = Math.round((now().getTime() - window.from.getTime()) / (24 * 60 * 60 * 1000));
    return { days, source: 'subscription', cutoff: window.from };
  }

  async function getRetentionStatus(input) {
    const scope = optionalString(input?.scope) ?? 'platform';
    const organizationId = optionalString(input?.organizationId);
    const policy = await resolveRetentionPolicy(scope, organizationId);
    const stats = await store.getRetentionStats(
      retentionFilter(scope, organizationId),
      policy.cutoff,
    );
    return {
      scope,
      organizationId: scope === 'tenant' ? organizationId : null,
      configuredRetentionDays: policy.days,
      retentionSource: policy.source,
      cutoffAt: policy.cutoff?.toISOString() ?? null,
      oldestAccessibleEvent: stats.oldestAccessibleEvent?.toISOString() ?? null,
      newestEvent: stats.newestEvent?.toISOString() ?? null,
      currentEventCount: stats.currentEventCount,
      expiredEventCount: stats.expiredEventCount,
      lastCleanupAt: null,
      nextCleanupAt: null,
    };
  }

  async function purgeExpiredRecords(input, actor) {
    if (input?.confirmed !== true) {
      throw validationFailed('confirmed must be true');
    }
    const reason = optionalString(input?.reason);
    if (reason === undefined) {
      throw validationFailed('reason is required');
    }
    const scope = optionalString(input?.scope) ?? 'platform';
    const organizationId = optionalString(input?.organizationId);
    const policy = await resolveRetentionPolicy(scope, organizationId);
    if (policy.cutoff === null) {
      throw validationFailed('No finite authorized retention window is configured for this scope');
    }
    const deletedCount = await store.purgeBefore(
      retentionFilter(scope, organizationId),
      policy.cutoff,
    );
    const completedAt = now();
    await auditWriter.appendBusinessEvent(null, {
      scope: 'platform',
      actorId: String(actor.actorId),
      action: 'audit.retention.purged',
      resourceType: 'audit_retention',
      resourceId: scope === 'tenant' ? String(organizationId) : 'platform',
      reason,
      occurredAt: completedAt,
      metadata: {
        targetScope: scope,
        organizationId: scope === 'tenant' ? organizationId : null,
        retentionDays: policy.days,
        retentionSource: policy.source,
        cutoffAt: policy.cutoff.toISOString(),
        deletedCount,
      },
    });
    return {
      scope,
      organizationId: scope === 'tenant' ? organizationId : null,
      cutoffAt: policy.cutoff.toISOString(),
      deletedCount,
      completedAt: completedAt.toISOString(),
    };
  }

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
    if (filters.action !== undefined && LEGACY_PLATFORM_ACTIONS.includes(filters.action)) {
      return { items: [], total: 0 };
    }
    const result = await store.queryPage(
      {
        scope: 'tenant',
        organizationId,
        excludeActions: LEGACY_PLATFORM_ACTIONS,
        ...(filters.actorId === undefined ? {} : { actorId: filters.actorId }),
        ...(filters.action === undefined ? {} : { action: filters.action }),
        ...(filters.resourceType === undefined ? {} : { resourceType: filters.resourceType }),
        ...(filters.resourceId === undefined ? {} : { resourceId: filters.resourceId }),
        ...(filters.reason === undefined ? {} : { reason: filters.reason }),
        ...(from === undefined ? {} : { from }),
        ...(filters.to === undefined ? {} : { to: filters.to }),
      },
      { skip: query.skip, pageSize: query.pageSize },
    );
    return { items: result.items.map(toAuditDto), total: result.total };
  }

  async function getOrganizationEvent(organizationId, id) {
    const window = await resolveHistoryWindow(organizationId);
    const event = await store.findById(id);
    if (
      event === null ||
      event.scope === 'platform' ||
      LEGACY_PLATFORM_ACTIONS.includes(String(event.action)) ||
      String(event.organizationId ?? '') !== String(organizationId)
    ) {
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
    if (field === 'actorId' && typeof resolveActorOptions === 'function') {
      const limit = filterOptionLimit(query?.limit);
      const employeeOptions = await resolveActorOptions(organizationId, {
        ...(search === undefined ? {} : { search }),
        limit,
      });
      const systemValues = await store.distinctValues(
        {
          scope: 'tenant',
          organizationId,
          excludeActions: LEGACY_PLATFORM_ACTIONS,
          ...(window.unlimited ? {} : { from: window.from }),
        },
        field,
        { search: 'system', limit: 1 },
      );
      const includeSystem =
        systemValues.some((value) => value.toLowerCase() === 'system') &&
        (search === undefined || 'system'.includes(search.toLowerCase()));
      return {
        field,
        items: [
          ...(includeSystem ? [{ value: 'system', label: 'System', system: true }] : []),
          ...employeeOptions,
        ].slice(0, limit),
      };
    }
    const items = await store.distinctValues(
      {
        scope: 'tenant',
        organizationId,
        excludeActions: LEGACY_PLATFORM_ACTIONS,
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
    const result = await store.queryPage(
      {
        scope: 'platform',
        ...(filters.actorId === undefined ? {} : { actorId: filters.actorId }),
        ...(filters.action === undefined ? {} : { action: filters.action }),
        ...(filters.resourceType === undefined ? {} : { resourceType: filters.resourceType }),
        ...(filters.resourceId === undefined ? {} : { resourceId: filters.resourceId }),
        ...(filters.reason === undefined ? {} : { reason: filters.reason }),
        ...(filters.from === undefined ? {} : { from: filters.from }),
        ...(filters.to === undefined ? {} : { to: filters.to }),
      },
      { skip: query.skip, pageSize: query.pageSize },
    );
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
    const baseSummary = await store.getSummary(
      {
        scope: 'tenant',
        organizationId,
        excludeActions: LEGACY_PLATFORM_ACTIONS,
        ...(from === undefined ? {} : { from }),
      },
      { startOfToday },
    );

    const policy = await resolveRetentionPolicy('tenant', organizationId);
    const stats = await store.getRetentionStats(
      retentionFilter('tenant', organizationId),
      policy.cutoff,
    );

    return {
      ...baseSummary,
      retention: {
        retentionDays: policy.days,
        cutoffAt: policy.cutoff ? policy.cutoff.toISOString() : null,
        oldestVisibleEventAt: stats.oldestAccessibleEvent
          ? stats.oldestAccessibleEvent.toISOString()
          : null,
        automaticCleanupEnabled: false,
        nextCleanupAt: null,
        expiredEventCount: stats.expiredEventCount,
        retentionSource: policy.source,
      },
    };
  }

  return {
    queryOrganizationEvents,
    queryOrganizationFilterOptions,
    getOrganizationEvent,
    getOrganizationSummary,
    queryPlatformEvents,
    getRetentionStatus,
    purgeExpiredRecords,
    setActorOptionResolver(resolver) {
      resolveActorOptions = resolver;
    },
    appendForTest: (event) => store.append(null, event),
  };
}

module.exports = {
  createAuditService,
  getStartOfDayInTimezone,
};
