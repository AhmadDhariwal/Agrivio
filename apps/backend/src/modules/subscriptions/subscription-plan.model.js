const mongoose = require('mongoose');

const PLAN_CODES = Object.freeze(['Starter', 'Business', 'Enterprise']);
const PLAN_STATUSES = Object.freeze(['draft', 'active', 'superseded']);

const limitFields = {
  branches: { type: Number, default: null },
  warehouses: { type: Number, default: null },
  activeUsers: { type: Number, default: null },
  products: { type: Number, default: null },
  customers: { type: Number, default: null },
  suppliers: { type: Number, default: null },
};

const entitlementFields = {
  imports: { type: Boolean, default: null },
  reportsExports: { type: Boolean, default: null },
  auditHistory: { type: String, default: null },
  backupPolicyRef: { type: String, default: null },
  dedicatedCloudEligible: { type: Boolean, default: null },
  supportLevelRef: { type: String, default: null },
};

const subscriptionPlanSchema = new mongoose.Schema(
  {
    planCode: { type: String, required: true, enum: PLAN_CODES },
    planVersion: { type: Number, required: true, min: 1 },
    status: { type: String, required: true, enum: PLAN_STATUSES, default: 'draft' },
    currency: { type: String, required: true, default: 'PKR' },
    monthlyPriceMinorUnits: { type: Number, default: null },
    annualPriceMinorUnits: { type: Number, default: null },
    annualDiscountPercent: { type: Number, default: null },
    trialEligible: { type: Boolean, required: true, default: true },
    limits: { type: limitFields, default: () => ({}) },
    entitlements: { type: entitlementFields, default: () => ({}) },
    referencedAt: { type: Date, default: null },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, collection: 'subscription_plans' },
);

subscriptionPlanSchema.index({ planCode: 1, planVersion: 1 }, { unique: true });
subscriptionPlanSchema.index(
  { planCode: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'active' },
  },
);

const SubscriptionPlanModel =
  mongoose.models['SubscriptionPlan'] || mongoose.model('SubscriptionPlan', subscriptionPlanSchema);

module.exports = {
  PLAN_CODES,
  PLAN_STATUSES,
  SubscriptionPlanModel,
};
