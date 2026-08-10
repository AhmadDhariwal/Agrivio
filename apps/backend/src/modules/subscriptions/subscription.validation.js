const { validationFailed } = require('../../platform/errors/app-error');
const { PLAN_CODES } = require('./persistence/subscription-plan.model');
const { PAYMENT_METHODS } = require('./persistence/subscription-billing-record.model');

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
  if (typeof expectedVersion !== 'number' || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
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
  if (evidenceStorageRef.startsWith('data:') || evidenceStorageRef.length > 500) {
    throw validationFailed('evidenceStorageRef must be an opaque storage reference');
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
    evidenceOriginalFileName: optionalString(
      input.evidenceOriginalFileName,
      'evidenceOriginalFileName',
      255,
    ),
    evidenceContentType: optionalString(input.evidenceContentType, 'evidenceContentType', 120),
    evidenceSize: optionalNumber(input.evidenceSize, 'evidenceSize'),
    evidenceChecksum: optionalString(input.evidenceChecksum, 'evidenceChecksum', 128),
    requestedPlanCode,
    requestedPlanVersion,
    notes: optionalString(input.notes, 'notes', 1000),
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
  parseExpectedVersion,
  normalizePaymentReference,
};
