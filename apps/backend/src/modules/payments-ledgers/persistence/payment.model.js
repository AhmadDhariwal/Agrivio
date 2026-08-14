const mongoose = require('mongoose');

const PAYMENT_PARTY_TYPES = ['supplier', 'customer'];
const PAYMENT_ALLOCATION_MODES = ['invoice_specific', 'general'];
const PAYMENT_STATUSES = ['posted'];

const paymentSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
      index: true,
    },
    partyType: {
      type: String,
      required: true,
      enum: PAYMENT_PARTY_TYPES,
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      default: null,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
    },
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Account',
    },
    allocationMode: {
      type: String,
      required: true,
      enum: PAYMENT_ALLOCATION_MODES,
    },
    amountMinorUnits: { type: String, required: true },
    currency: { type: String, required: true, default: 'PKR', enum: ['PKR'] },
    paymentDate: { type: String, required: true },
    notes: { type: String, default: '' },
    status: {
      type: String,
      required: true,
      enum: PAYMENT_STATUSES,
      default: 'posted',
    },
    postedAt: { type: Date, required: true },
    postedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    correctionOfId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      default: null,
    },
    reason: { type: String, default: '' },
    replacementPaymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      default: null,
    },
  },
  { timestamps: true, collection: 'payments' },
);

paymentSchema.index({ organizationId: 1, status: 1, postedAt: -1 });
paymentSchema.index({ organizationId: 1, supplierId: 1, postedAt: -1 });
paymentSchema.index({ organizationId: 1, customerId: 1, postedAt: -1 });
paymentSchema.index({ organizationId: 1, accountId: 1, postedAt: -1 });
paymentSchema.index(
  { organizationId: 1, correctionOfId: 1 },
  {
    unique: true,
    partialFilterExpression: { correctionOfId: { $type: 'objectId' } },
    name: 'payments_correction_of_unique',
  },
);

const PaymentModel = mongoose.models['Payment'] || mongoose.model('Payment', paymentSchema);

module.exports = {
  PAYMENT_PARTY_TYPES,
  PAYMENT_ALLOCATION_MODES,
  PAYMENT_STATUSES,
  PaymentModel,
};
