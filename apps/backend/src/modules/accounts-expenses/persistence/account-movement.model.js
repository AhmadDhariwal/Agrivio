const mongoose = require('mongoose');

const MOVEMENT_SOURCE_TYPES = [
  'account_opening',
  'supplier_payment',
  'purchase_payment',
  'purchase_cancellation_refund',
  'purchase_return_refund',
];
const MOVEMENT_STATUSES = ['posted'];

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
  },
  { timestamps: true, collection: 'account_movements' },
);

accountMovementSchema.index({ organizationId: 1, accountId: 1, postedAt: -1 });
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
        ],
      },
      status: 'posted',
    },
    name: 'account_movements_payment_source_unique',
  },
);

const AccountMovementModel =
  mongoose.models['AccountMovement'] || mongoose.model('AccountMovement', accountMovementSchema);

module.exports = {
  MOVEMENT_SOURCE_TYPES,
  MOVEMENT_STATUSES,
  AccountMovementModel,
};
