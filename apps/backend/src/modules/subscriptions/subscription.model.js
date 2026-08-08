const mongoose = require('mongoose');

const SUBSCRIPTION_STATUSES = Object.freeze([
  'pending_approval',
  'trial',
  'active',
  'grace',
  'suspended',
  'cancelled',
  'retained',
  'deleted',
  'rejected',
]);

const BILLING_PERIODS = Object.freeze(['monthly', 'annual']);

const subscriptionSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
      ref: 'Organization',
    },
    status: {
      type: String,
      required: true,
      enum: SUBSCRIPTION_STATUSES,
      default: 'pending_approval',
    },
    planCode: { type: String, required: true, default: 'Starter' },
    planVersion: { type: Number, required: true, default: 1 },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPlan', default: null },
    billingPeriod: { type: String, enum: ['monthly', 'annual'], default: null },
    trialEndsAt: { type: Date, default: null },
    graceEndsAt: { type: Date, default: null },
    periodStartsAt: { type: Date, default: null },
    periodEndsAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    retainedUntil: { type: Date, default: null },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, collection: 'subscriptions' },
);

const SubscriptionModel =
  mongoose.models['Subscription'] || mongoose.model('Subscription', subscriptionSchema);

module.exports = {
  SUBSCRIPTION_STATUSES,
  BILLING_PERIODS,
  SubscriptionModel,
};
