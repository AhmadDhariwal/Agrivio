const mongoose = require('mongoose');

const ALLOCATION_TARGET_TYPES = ['purchase', 'supplier_advance'];
const ALLOCATION_STATUSES = ['posted'];

const paymentAllocationSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
      index: true,
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Payment',
    },
    targetType: {
      type: String,
      required: true,
      enum: ALLOCATION_TARGET_TYPES,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    allocatedAmountMinorUnits: { type: String, required: true },
    currency: { type: String, required: true, default: 'PKR', enum: ['PKR'] },
    status: {
      type: String,
      required: true,
      enum: ALLOCATION_STATUSES,
      default: 'posted',
    },
    postedAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'payment_allocations' },
);

paymentAllocationSchema.index({ organizationId: 1, paymentId: 1 });
paymentAllocationSchema.index({ organizationId: 1, targetType: 1, targetId: 1 });

const PaymentAllocationModel =
  mongoose.models['PaymentAllocation'] ||
  mongoose.model('PaymentAllocation', paymentAllocationSchema);

module.exports = {
  ALLOCATION_TARGET_TYPES,
  ALLOCATION_STATUSES,
  PaymentAllocationModel,
};
