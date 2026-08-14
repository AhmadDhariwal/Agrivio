const DEFAULT_TRIAL_DAYS = 14;
const DEFAULT_GRACE_DAYS = 7;
const DEFAULT_RETENTION_DAYS = 90;

const OPERATIONAL_STATUSES = Object.freeze(['trial', 'active', 'grace']);
const BILLING_ACCESS_STATUSES = Object.freeze(['trial', 'active', 'grace', 'suspended']);
const SUSPENDED_READ_STATUSES = Object.freeze(['suspended', 'cancelled', 'retained']);

const ALLOWED_TRANSITIONS = Object.freeze({
  pending_approval: Object.freeze(['trial', 'active']),
  trial: Object.freeze(['grace', 'cancelled', 'active']),
  active: Object.freeze(['grace', 'cancelled']),
  grace: Object.freeze(['active', 'suspended', 'cancelled']),
  suspended: Object.freeze(['active', 'cancelled']),
  cancelled: Object.freeze(['retained']),
  retained: Object.freeze(['deleted']),
  deleted: Object.freeze([]),
  rejected: Object.freeze([]),
});

function daysFrom(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function isAllowedTransition(fromStatus, toStatus) {
  const allowed = ALLOWED_TRANSITIONS[fromStatus];
  if (allowed === undefined) {
    return false;
  }
  return allowed.includes(toStatus);
}

function assertTransition(fromStatus, toStatus) {
  if (!isAllowedTransition(fromStatus, toStatus)) {
    const error = new Error(`Invalid subscription transition ${fromStatus} → ${toStatus}`);
    error.code = 'INVALID_SUBSCRIPTION_TRANSITION';
    throw error;
  }
}

/**
 * Apply time-based expiry transitions without inventing commercial values.
 * trial → grace, active → grace, grace → suspended.
 */
function applyExpiryTransitions(subscription, at, options = {}) {
  const graceDays = options.graceDays ?? DEFAULT_GRACE_DAYS;
  const current = { ...subscription };
  const warnings = [];

  if (current.status === 'trial' && current.trialEndsAt) {
    const trialEndsAt = new Date(current.trialEndsAt);
    if (trialEndsAt.getTime() <= at.getTime()) {
      current.status = 'grace';
      current.graceEndsAt = daysFrom(at, graceDays);
      warnings.push({
        code: 'trial_expired',
        message: 'Trial expired; subscription entered grace.',
      });
    } else {
      warnings.push({
        code: 'trial_expiring',
        message: 'Trial period is active and will expire.',
        endsAt: trialEndsAt.toISOString(),
      });
    }
  }

  if (current.status === 'active' && current.periodEndsAt) {
    const periodEndsAt = new Date(current.periodEndsAt);
    if (periodEndsAt.getTime() <= at.getTime()) {
      current.status = 'grace';
      current.graceEndsAt = daysFrom(at, graceDays);
      warnings.push({
        code: 'period_expired',
        message: 'Paid period expired; subscription entered grace.',
      });
    } else {
      warnings.push({
        code: 'period_expiring',
        message: 'Current paid period is active.',
        endsAt: periodEndsAt.toISOString(),
      });
    }
  }

  if (current.status === 'grace' && current.graceEndsAt) {
    const graceEndsAt = new Date(current.graceEndsAt);
    if (graceEndsAt.getTime() <= at.getTime()) {
      current.status = 'suspended';
      warnings.push({
        code: 'grace_expired',
        message: 'Grace expired; subscription suspended.',
      });
    } else {
      warnings.push({
        code: 'grace_active',
        message: 'Subscription is in grace; submit billing evidence to continue.',
        endsAt: graceEndsAt.toISOString(),
      });
    }
  }

  return { subscription: current, warnings };
}

function evaluateAccessLevel(status) {
  if (OPERATIONAL_STATUSES.includes(status)) {
    return 'operational';
  }
  if (status === 'suspended') {
    return 'billing-access';
  }
  if (SUSPENDED_READ_STATUSES.includes(status)) {
    return 'suspended-read';
  }
  return 'none';
}

function allowsSubscriptionLabel(status, label) {
  if (label === 'none-public' || label === 'none-auth' || label === 'none-platform') {
    return true;
  }
  if (label === 'billing-access') {
    return BILLING_ACCESS_STATUSES.includes(status);
  }
  if (label === 'operational' || label === 'operational+limit') {
    return OPERATIONAL_STATUSES.includes(status);
  }
  if (label === 'suspended-read') {
    return SUSPENDED_READ_STATUSES.includes(status) || OPERATIONAL_STATUSES.includes(status);
  }
  // Unknown labels default safely to deny.
  return false;
}

function parseAuditHistoryWindow(value, at = new Date()) {
  if (value === null || value === undefined) {
    return { allowed: false, reason: 'entitlement_unconfigured' };
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return { allowed: false, reason: 'entitlement_unconfigured' };
  }
  const trimmed = value.trim().toLowerCase();
  if (trimmed === 'unlimited' || trimmed === 'full' || trimmed === 'all') {
    return { allowed: true, unlimited: true, reason: 'entitled', value };
  }
  const dayMatch = trimmed.match(/^(\d+)\s*d(?:ays?)?$/);
  if (dayMatch !== null) {
    const days = Number(dayMatch[1]);
    if (!Number.isFinite(days) || days < 0) {
      return { allowed: false, reason: 'entitlement_unhandled' };
    }
    return {
      allowed: true,
      unlimited: false,
      from: new Date(at.getTime() - days * 24 * 60 * 60 * 1000),
      reason: 'entitled',
      value,
    };
  }
  return { allowed: false, reason: 'entitlement_unhandled' };
}

function evaluateFeatureEntitlement(plan, entitlementKey) {
  if (plan === null || plan === undefined) {
    return { allowed: false, reason: 'plan_missing' };
  }
  const entitlements = plan.entitlements ?? {};
  const value = entitlements[entitlementKey];
  if (value === null || value === undefined) {
    return { allowed: false, reason: 'entitlement_unconfigured' };
  }
  if (typeof value === 'boolean') {
    return { allowed: value, reason: value ? 'entitled' : 'not_entitled' };
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return { allowed: true, reason: 'entitled', value };
  }
  return { allowed: false, reason: 'entitlement_unhandled' };
}

function evaluateNumericLimit(plan, limitKey, currentUsage) {
  if (plan === null || plan === undefined) {
    return { allowed: false, softWarning: false, reason: 'plan_missing' };
  }
  const limits = plan.limits ?? {};
  const limit = limits[limitKey];
  if (limit === null || limit === undefined) {
    // Commercially unresolved limits are not invented; creation is not hard-blocked by a fabricated number.
    return { allowed: true, softWarning: false, reason: 'limit_unconfigured', limit: null };
  }
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 0) {
    return { allowed: false, softWarning: false, reason: 'limit_unhandled' };
  }
  if (currentUsage >= limit) {
    return {
      allowed: false,
      softWarning: false,
      reason: 'limit_reached',
      limit,
      currentUsage,
    };
  }
  const remaining = limit - currentUsage;
  const softWarning = remaining <= Math.max(1, Math.floor(limit * 0.1));
  return {
    allowed: true,
    softWarning,
    reason: softWarning ? 'approaching_limit' : 'within_limit',
    limit,
    currentUsage,
    remaining,
  };
}

function buildSubscriptionAccessState(subscription, plan, at = new Date(), options = {}) {
  if (subscription === null || subscription === undefined) {
    return {
      status: null,
      accessLevel: 'none',
      operationalWriteAllowed: false,
      billingAccessAllowed: false,
      warnings: [{ code: 'subscription_missing', message: 'No subscription record found.' }],
      plan: null,
    };
  }

  const { subscription: effective, warnings } = applyExpiryTransitions(subscription, at, options);
  const accessLevel = evaluateAccessLevel(effective.status);

  return {
    status: effective.status,
    accessLevel,
    operationalWriteAllowed: allowsSubscriptionLabel(effective.status, 'operational'),
    billingAccessAllowed: allowsSubscriptionLabel(effective.status, 'billing-access'),
    planCode: effective.planCode,
    planVersion: effective.planVersion,
    trialEndsAt: effective.trialEndsAt ? new Date(effective.trialEndsAt).toISOString() : null,
    graceEndsAt: effective.graceEndsAt ? new Date(effective.graceEndsAt).toISOString() : null,
    periodStartsAt: effective.periodStartsAt
      ? new Date(effective.periodStartsAt).toISOString()
      : null,
    periodEndsAt: effective.periodEndsAt ? new Date(effective.periodEndsAt).toISOString() : null,
    billingPeriod: effective.billingPeriod ?? null,
    warnings,
    plan:
      plan === null || plan === undefined
        ? null
        : {
            planCode: plan.planCode,
            planVersion: plan.planVersion,
            limits: plan.limits ?? {},
            entitlements: plan.entitlements ?? {},
            currency: plan.currency ?? 'PKR',
            monthlyPriceMinorUnits: plan.monthlyPriceMinorUnits ?? null,
            annualPriceMinorUnits: plan.annualPriceMinorUnits ?? null,
            annualDiscountPercent: plan.annualDiscountPercent ?? null,
          },
    effectiveSubscription: effective,
  };
}

module.exports = {
  DEFAULT_TRIAL_DAYS,
  DEFAULT_GRACE_DAYS,
  DEFAULT_RETENTION_DAYS,
  OPERATIONAL_STATUSES,
  BILLING_ACCESS_STATUSES,
  ALLOWED_TRANSITIONS,
  daysFrom,
  isAllowedTransition,
  assertTransition,
  applyExpiryTransitions,
  evaluateAccessLevel,
  allowsSubscriptionLabel,
  evaluateFeatureEntitlement,
  parseAuditHistoryWindow,
  evaluateNumericLimit,
  buildSubscriptionAccessState,
};
