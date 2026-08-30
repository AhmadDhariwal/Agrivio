const mongoose = require('mongoose');

const MOVEMENT_SOURCE_TYPES = [
  'account_opening',
  'supplier_payment',
  'purchase_payment',
  'customer_payment',
  'purchase_cancellation_refund',
  'purchase_return_refund',
  'sale_cancellation_refund',
  'sales_return_refund',
  'purchase_return_refund_reversal',
  'sales_return_refund_reversal',
  'manual_inflow',
  'manual_outflow',
  'manual_inflow_reversal',
  'manual_outflow_reversal',
  'account_transfer_out',
  'account_transfer_in',
  'account_transfer_out_reversal',
  'account_transfer_in_reversal',
  'expense',
  'expense_correction',
  'customer_payment_correction',
  'supplier_payment_correction',
];
const MOVEMENT_STATUSES = ['posted'];
const ACCOUNT_OWNED_SOURCE_TYPES = [
  'manual_inflow',
  'manual_outflow',
  'manual_inflow_reversal',
  'manual_outflow_reversal',
  'account_transfer_out',
  'account_transfer_in',
  'account_transfer_out_reversal',
  'account_transfer_in_reversal',
  'expense',
  'expense_correction',
];

const accountMovementSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
      index: true,
    },
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Account',
    },
    signedAmountMinorUnits: { type: String, required: true },
    currency: { type: String, required: true, default: 'PKR', enum: ['PKR'] },
    sourceType: {
      type: String,
      required: true,
      enum: MOVEMENT_SOURCE_TYPES,
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    purpose: { type: String, default: null },
    reference: { type: String, default: null },
    status: {
      type: String,
      required: true,
      enum: MOVEMENT_STATUSES,
      default: 'posted',
    },
    postedAt: { type: Date, required: true },
    postedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    reversalOfId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  { timestamps: true, collection: 'account_movements' },
);

accountMovementSchema.index({ organizationId: 1, accountId: 1, postedAt: -1 });
accountMovementSchema.index({ organizationId: 1, sourceType: 1, sourceId: 1 });
accountMovementSchema.index({ organizationId: 1, reversalOfId: 1 });
accountMovementSchema.index(
  { organizationId: 1, sourceType: 1, sourceId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      sourceType: 'account_opening',
      status: 'posted',
    },
    name: 'account_movements_opening_unique',
  },
);
accountMovementSchema.index(
  { organizationId: 1, sourceType: 1, sourceId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      sourceType: {
        $in: [
          'supplier_payment',
          'purchase_payment',
          'purchase_cancellation_refund',
          'purchase_return_refund',
          'sale_cancellation_refund',
          'purchase_return_refund_reversal',
          'sales_return_refund_reversal',
          'customer_payment',
          'customer_payment_correction',
          'supplier_payment_correction',
        ],
      },
      status: 'posted',
    },
    name: 'account_movements_payment_source_unique',
  },
);
accountMovementSchema.index(
  { organizationId: 1, sourceType: 1, sourceId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      sourceType: { $in: ACCOUNT_OWNED_SOURCE_TYPES },
      status: 'posted',
    },
    name: 'account_movements_owned_source_unique',
  },
);
accountMovementSchema.index(
  { organizationId: 1, reversalOfId: 1 },
  {
    unique: true,
    partialFilterExpression: { reversalOfId: { $type: 'objectId' } },
    name: 'account_movements_reversal_of_unique',
  },
);

const AccountMovementModel =
  mongoose.models['AccountMovement'] || mongoose.model('AccountMovement', accountMovementSchema);

module.exports = {
  MOVEMENT_SOURCE_TYPES,
  MOVEMENT_STATUSES,
  ACCOUNT_OWNED_SOURCE_TYPES,
  AccountMovementModel,
};
