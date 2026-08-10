const mongoose = require('mongoose');

const BILLING_STATUSES = Object.freeze([
  'draft',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'expired',
  'cancelled',
]);

const PAYMENT_METHODS = Object.freeze(['bank_transfer', 'jazzcash', 'easypaisa']);

const subscriptionBillingRecordSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
    },
    requestedPlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPlan', default: null },
    requestedPlanCode: { type: String, required: true },
    requestedPlanVersion: { type: Number, required: true },
    billingPeriod: { type: String, required: true, enum: ['monthly', 'annual'] },
    submittedAmountMinorUnits: { type: Number, required: true },
    currency: { type: String, required: true, default: 'PKR' },
    paymentMethod: { type: String, required: true, enum: PAYMENT_METHODS },
    paymentReferenceNormalized: { type: String, required: true },
    paymentReferenceDuplicateWarning: { type: Boolean, required: true, default: false },
    evidenceStorageRef: { type: String, required: true },
    evidenceOriginalFileName: { type: String, default: null },
    evidenceContentType: { type: String, default: null },
    evidenceSize: { type: Number, default: null },
    evidenceChecksum: { type: String, default: null },
    status: { type: String, required: true, enum: BILLING_STATUSES, default: 'submitted' },
    submittedAt: { type: Date, required: true },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: String, default: null },
    rejectionReason: { type: String, default: null },
    appliedAt: { type: Date, default: null },
    appliedSubscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', default: null },
    coverageStart: { type: Date, default: null },
    coverageEnd: { type: Date, default: null },
    notes: { type: String, default: null },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, collection: 'subscription_billing_records' },
);

subscriptionBillingRecordSchema.index({ organizationId: 1, status: 1, submittedAt: -1 });
subscriptionBillingRecordSchema.index({ organizationId: 1, submittedAt: -1 });
subscriptionBillingRecordSchema.index({ paymentMethod: 1, paymentReferenceNormalized: 1 });
subscriptionBillingRecordSchema.index({ appliedSubscriptionId: 1 });

const SubscriptionBillingRecordModel =
  mongoose.models['SubscriptionBillingRecord'] ||
  mongoose.model('SubscriptionBillingRecord', subscriptionBillingRecordSchema);

module.exports = {
  BILLING_STATUSES,
  PAYMENT_METHODS,
  SubscriptionBillingRecordModel,
};
