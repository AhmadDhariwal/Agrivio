const { validationFailed } = require('../../platform/errors/app-error');

const R1_CATALOG_ID = 'R1-CATALOG-1';

const R1_PLAN_CATALOG = Object.freeze([
  Object.freeze({
    planCode: 'Starter',
    displayName: 'Starter',
    shortDescription: 'Essential POS and inventory for a single-location agricultural retailer.',
    targetCustomer: 'Single-shop agricultural retailer',
    currency: 'PKR',
    monthlyPriceMinorUnits: 500000,
    annualPriceMinorUnits: 5000000,
    annualDiscountPercent: 16.67,
    trialEligible: true,
    limits: Object.freeze({
      products: 200,
      activeUsers: 2,
      branches: 1,
      warehouses: 1,
      customers: 100,
      suppliers: 50,
    }),
    entitlements: Object.freeze({
      imports: false,
      reportsExports: false,
      auditHistory: '30d',
      backupPolicyRef: 'weekly',
      dedicatedCloudEligible: false,
      supportLevelRef: 'standard',
    }),
  }),
  Object.freeze({
    planCode: 'Business',
    displayName: 'Business',
    shortDescription: 'Expanded capacity and data tools for a growing dealer or wholesaler.',
    targetCustomer: 'Growing dealer or wholesaler',
    currency: 'PKR',
    monthlyPriceMinorUnits: 1500000,
    annualPriceMinorUnits: 15000000,
    annualDiscountPercent: 16.67,
    trialEligible: true,
    limits: Object.freeze({
      products: 2000,
      activeUsers: 15,
      branches: 5,
      warehouses: 10,
      customers: 1000,
      suppliers: 500,
    }),
    entitlements: Object.freeze({
      imports: true,
      reportsExports: true,
      auditHistory: '90d',
      backupPolicyRef: 'daily',
      dedicatedCloudEligible: false,
      supportLevelRef: 'business',
    }),
  }),
  Object.freeze({
    planCode: 'Enterprise',
    displayName: 'Enterprise',
    shortDescription:
      'High-volume, multi-branch operations with priority support and dedicated-cloud eligibility.',
    targetCustomer: 'Multi-branch agricultural business, distributor, or enterprise customer',
    currency: 'PKR',
    monthlyPriceMinorUnits: 3500000,
    annualPriceMinorUnits: 35000000,
    annualDiscountPercent: 16.67,
    trialEligible: true,
    limits: Object.freeze({
      products: 10000,
      activeUsers: 100,
      branches: 50,
      warehouses: 50,
      customers: 10000,
      suppliers: 5000,
    }),
    entitlements: Object.freeze({
      imports: true,
      reportsExports: true,
      auditHistory: '365d',
      backupPolicyRef: 'daily_immutable',
      dedicatedCloudEligible: true,
      supportLevelRef: 'priority',
    }),
  }),
]);

const REQUIRED_LIMITS = Object.freeze([
  'products',
  'activeUsers',
  'branches',
  'warehouses',
  'customers',
  'suppliers',
]);
const REQUIRED_BOOLEAN_ENTITLEMENTS = Object.freeze([
  'imports',
  'reportsExports',
  'dedicatedCloudEligible',
]);
const REQUIRED_STRING_ENTITLEMENTS = Object.freeze([
  'auditHistory',
  'backupPolicyRef',
  'supportLevelRef',
]);

function deriveAnnualSavings(monthlyPriceMinorUnits, annualPriceMinorUnits) {
  if (
    !Number.isFinite(monthlyPriceMinorUnits) ||
    !Number.isFinite(annualPriceMinorUnits) ||
    monthlyPriceMinorUnits <= 0
  ) {
    return { amountMinorUnits: null, percent: null };
  }
  const fullAnnualPriceMinorUnits = monthlyPriceMinorUnits * 12;
  const amountMinorUnits = fullAnnualPriceMinorUnits - annualPriceMinorUnits;
  return {
    amountMinorUnits,
    percent: Math.round((amountMinorUnits / fullAnnualPriceMinorUnits) * 10000) / 100,
  };
}

function validateActivatableR1Plan(plan) {
  const errors = [];
  const requireText = (field, value) => {
    if (typeof value !== 'string' || value.trim() === '') {
      errors.push({ field, message: `${field} is required for an active R1 plan` });
    }
  };
  const requirePositiveInteger = (field, value) => {
    if (!Number.isInteger(value) || value <= 0) {
      errors.push({ field, message: `${field} must be a positive integer for an active R1 plan` });
    }
  };

  requireText('displayName', plan.displayName);
  requireText('shortDescription', plan.shortDescription);
  requireText('targetCustomer', plan.targetCustomer);
  requireText('catalogRevision', plan.catalogRevision);
  requireText('currency', plan.currency);
  requirePositiveInteger('monthlyPriceMinorUnits', plan.monthlyPriceMinorUnits);
  requirePositiveInteger('annualPriceMinorUnits', plan.annualPriceMinorUnits);
  for (const key of REQUIRED_LIMITS) {
    requirePositiveInteger(`limits.${key}`, plan.limits?.[key]);
  }
  for (const key of REQUIRED_BOOLEAN_ENTITLEMENTS) {
    if (typeof plan.entitlements?.[key] !== 'boolean') {
      errors.push({
        field: `entitlements.${key}`,
        message: `entitlements.${key} must be explicitly true or false for an active R1 plan`,
      });
    }
  }
  for (const key of REQUIRED_STRING_ENTITLEMENTS) {
    requireText(`entitlements.${key}`, plan.entitlements?.[key]);
  }
  if (typeof plan.trialEligible !== 'boolean') {
    errors.push({ field: 'trialEligible', message: 'trialEligible is required' });
  }

  const savings = deriveAnnualSavings(plan.monthlyPriceMinorUnits, plan.annualPriceMinorUnits);
  if (savings.amountMinorUnits !== null && savings.amountMinorUnits < 0) {
    errors.push({
      field: 'annualPriceMinorUnits',
      message: 'annualPriceMinorUnits cannot exceed twelve monthly payments',
    });
  }
  if (
    plan.annualDiscountPercent !== null &&
    plan.annualDiscountPercent !== undefined &&
    savings.percent !== null &&
    Math.abs(Number(plan.annualDiscountPercent) - savings.percent) > 0.01
  ) {
    errors.push({
      field: 'annualDiscountPercent',
      message: `annualDiscountPercent must match the price-derived value ${savings.percent}`,
    });
  }

  if (errors.length > 0) {
    throw validationFailed('Active R1 plan is incomplete or inconsistent', errors);
  }
}

function r1PlanPayload(plan) {
  return {
    ...plan,
    catalogRevision: R1_CATALOG_ID,
    limits: { ...plan.limits },
    entitlements: { ...plan.entitlements },
  };
}

module.exports = {
  R1_CATALOG_ID,
  R1_PLAN_CATALOG,
  REQUIRED_LIMITS,
  deriveAnnualSavings,
  r1PlanPayload,
  validateActivatableR1Plan,
};
