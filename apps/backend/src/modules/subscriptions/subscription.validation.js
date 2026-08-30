const { validationFailed } = require('../../platform/errors/app-error');
const { PLAN_CODES } = require('./persistence/subscription-plan.model');
const {
  BILLING_STATUSES,
  PAYMENT_METHODS,
} = require('./persistence/subscription-billing-record.model');
const { parseEvidenceStorageRef } = require('./billing-evidence-storage');

function requireObject(body, label = 'body') {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw validationFailed(`${label} must be an object`);
  }
  return body;
}

function optionalNumber(value, field) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw validationFailed(`${field} must be a finite number or null`);
  }
  return value;
}

function optionalBoolean(value, field) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'boolean') {
    throw validationFailed(`${field} must be a boolean or null`);
  }
  return value;
}

function optionalString(value, field, maxLength = 200) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw validationFailed(`${field} must be a string or null`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > maxLength) {
    throw validationFailed(`${field} exceeds maximum length`);
  }
  return trimmed;
}

function parsePlanCreateBody(body) {
  const input = requireObject(body);
  const planCode = input.planCode;
  if (typeof planCode !== 'string' || !PLAN_CODES.includes(planCode)) {
    throw validationFailed('planCode must be Starter, Business, or Enterprise');
  }

  const activate = input.activate === true;
  const limitsInput = input.limits === undefined ? {} : requireObject(input.limits, 'limits');
  const entitlementsInput =
    input.entitlements === undefined ? {} : requireObject(input.entitlements, 'entitlements');

  return {
    planCode,
    activate,
    currency: optionalString(input.currency, 'currency', 8) ?? 'PKR',
    monthlyPriceMinorUnits: optionalNumber(input.monthlyPriceMinorUnits, 'monthlyPriceMinorUnits'),
    annualPriceMinorUnits: optionalNumber(input.annualPriceMinorUnits, 'annualPriceMinorUnits'),
    annualDiscountPercent: optionalNumber(input.annualDiscountPercent, 'annualDiscountPercent'),
    trialEligible: input.trialEligible === undefined ? true : Boolean(input.trialEligible),
    limits: {
      branches: optionalNumber(limitsInput.branches, 'limits.branches'),
      warehouses: optionalNumber(limitsInput.warehouses, 'limits.warehouses'),
      activeUsers: optionalNumber(limitsInput.activeUsers, 'limits.activeUsers'),
      products: optionalNumber(limitsInput.products, 'limits.products'),
      customers: optionalNumber(limitsInput.customers, 'limits.customers'),
      suppliers: optionalNumber(limitsInput.suppliers, 'limits.suppliers'),
    },
    entitlements: {
      imports: optionalBoolean(entitlementsInput.imports, 'entitlements.imports'),
      reportsExports: optionalBoolean(
        entitlementsInput.reportsExports,
        'entitlements.reportsExports',
      ),
      auditHistory: optionalString(entitlementsInput.auditHistory, 'entitlements.auditHistory'),
      backupPolicyRef: optionalString(
        entitlementsInput.backupPolicyRef,
        'entitlements.backupPolicyRef',
      ),
      dedicatedCloudEligible: optionalBoolean(
        entitlementsInput.dedicatedCloudEligible,
        'entitlements.dedicatedCloudEligible',
      ),
      supportLevelRef: optionalString(
        entitlementsInput.supportLevelRef,
        'entitlements.supportLevelRef',
      ),
    },
  };
}

function parseExpectedVersion(body) {
  const input = requireObject(body);
  const expectedVersion = input.expectedVersion;
  if (
    typeof expectedVersion !== 'number' ||
    !Number.isInteger(expectedVersion) ||
    expectedVersion < 1
  ) {
    throw validationFailed('expectedVersion must be a positive integer');
  }
  return expectedVersion;
}

function parseLifecycleBody(body, { requireReason = false } = {}) {
  const input = requireObject(body);
  const expectedVersion = parseExpectedVersion(input);
  const reason = optionalString(input.reason, 'reason', 500);
  if (requireReason && (reason === null || reason.length === 0)) {
    throw validationFailed('reason is required');
  }
  return { expectedVersion, reason };
}

function parseChangePlanBody(body) {
  const input = requireObject(body);
  const expectedVersion = parseExpectedVersion(input);
  const planCode = input.planCode;
  if (typeof planCode !== 'string' || !PLAN_CODES.includes(planCode)) {
    throw validationFailed('planCode must be Starter, Business, or Enterprise');
  }
  const planVersion = input.planVersion;
  if (typeof planVersion !== 'number' || !Number.isInteger(planVersion) || planVersion < 1) {
    throw validationFailed('planVersion must be a positive integer');
  }
  const reason = optionalString(input.reason, 'reason', 500);
  const effective = input.effective === 'next_period' ? 'next_period' : 'immediate';
  return { expectedVersion, planCode, planVersion, reason, effective };
}

function normalizePaymentReference(raw) {
  if (typeof raw !== 'string') {
    throw validationFailed('paymentReference is required');
  }
  const normalized = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (normalized.length < 3 || normalized.length > 120) {
    throw validationFailed('paymentReference must be between 3 and 120 characters');
  }
  return normalized;
}

function parseBillingSubmitBody(body) {
  const input = requireObject(body);
  const paymentMethod = input.paymentMethod;
  if (typeof paymentMethod !== 'string' || !PAYMENT_METHODS.includes(paymentMethod)) {
    throw validationFailed('paymentMethod must be bank_transfer, jazzcash, or easypaisa');
  }
  const billingPeriod = input.billingPeriod;
  if (billingPeriod !== 'monthly' && billingPeriod !== 'annual') {
    throw validationFailed('billingPeriod must be monthly or annual');
  }
  const submittedAmountMinorUnits = input.submittedAmountMinorUnits;
  if (
    typeof submittedAmountMinorUnits !== 'number' ||
    !Number.isInteger(submittedAmountMinorUnits) ||
    submittedAmountMinorUnits <= 0
  ) {
    throw validationFailed('submittedAmountMinorUnits must be a positive integer');
  }
  const evidenceStorageRef = optionalString(input.evidenceStorageRef, 'evidenceStorageRef', 500);
  if (evidenceStorageRef === null) {
    throw validationFailed('evidenceStorageRef is required');
  }
  if (evidenceStorageRef.startsWith('data:')) {
    throw validationFailed('evidenceStorageRef must be an opaque storage reference');
  }
  if (parseEvidenceStorageRef(evidenceStorageRef) === null) {
    throw validationFailed('evidenceStorageRef must be a server-issued evidence reference');
  }

  const requestedPlanCode = input.requestedPlanCode;
  if (typeof requestedPlanCode !== 'string' || !PLAN_CODES.includes(requestedPlanCode)) {
    throw validationFailed('requestedPlanCode must be Starter, Business, or Enterprise');
  }
  const requestedPlanVersion = input.requestedPlanVersion;
  if (
    typeof requestedPlanVersion !== 'number' ||
    !Number.isInteger(requestedPlanVersion) ||
    requestedPlanVersion < 1
  ) {
    throw validationFailed('requestedPlanVersion must be a positive integer');
  }

  return {
    paymentMethod,
    billingPeriod,
    submittedAmountMinorUnits,
    currency: optionalString(input.currency, 'currency', 8) ?? 'PKR',
    paymentReferenceNormalized: normalizePaymentReference(input.paymentReference),
    evidenceStorageRef,
    requestedPlanCode,
    requestedPlanVersion,
    notes: optionalString(input.notes, 'notes', 1000),
  };
}

function parsePositiveInt(value, field, fallback, { min = 1, max = 100 } = {}) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw validationFailed(`${field} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function parseBillingQueueQuery(query = {}) {
  const input = query === null || typeof query !== 'object' || Array.isArray(query) ? {} : query;
  const status = optionalString(input.status, 'status', 40);
  if (status !== null && !BILLING_STATUSES.includes(status)) {
    throw validationFailed('status is not a recognized billing status');
  }
  return {
    status,
    organizationId: optionalString(input.organizationId, 'organizationId', 40),
    q:
      input.q === undefined
        ? optionalString(input.search, 'search', 120)
        : optionalString(input.q, 'q', 120),
    limit: parsePositiveInt(input.limit, 'limit', 25, { min: 1, max: 100 }),
    offset: parsePositiveInt(input.offset, 'offset', 0, { min: 0, max: 100000 }),
  };
}

function parseBillingRejectBody(body) {
  const input = requireObject(body);
  const expectedVersion = parseExpectedVersion(input);
  const reason = optionalString(input.reason, 'reason', 500);
  if (reason === null) {
    throw validationFailed('rejection reason is required');
  }
  return { expectedVersion, reason };
}

function parseBillingApproveBody(body) {
  const input = requireObject(body);
  const expectedVersion = parseExpectedVersion(input);
  const coverageStart =
    input.coverageStart === undefined || input.coverageStart === null
      ? null
      : optionalString(input.coverageStart, 'coverageStart', 40);
  return { expectedVersion, coverageStart };
}

module.exports = {
  parsePlanCreateBody,
  parseLifecycleBody,
  parseChangePlanBody,
  parseBillingSubmitBody,
  parseBillingRejectBody,
  parseBillingApproveBody,
  parseBillingQueueQuery,
  parseExpectedVersion,
  normalizePaymentReference,
};
