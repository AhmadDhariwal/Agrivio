const mongoose = require('mongoose');

const PARTY_TYPES = ['customer', 'supplier'];
const EFFECT_KINDS = ['receivable', 'advance', 'payable', 'supplier_advance'];
const SOURCE_TYPES = [
  'customer_opening_receivable',
  'customer_opening_advance',
  'supplier_opening_payable',
  'supplier_opening_advance',
  'purchase_payable',
  'supplier_payment_allocation',
  'supplier_payment_advance',
  'supplier_advance_application',
];
const OPENING_SOURCE_TYPES = [
  'customer_opening_receivable',
  'customer_opening_advance',
  'supplier_opening_payable',
  'supplier_opening_advance',
];
const EFFECT_STATUSES = ['posted'];

const ledgerEffectSchema = new mongoose.Schema(
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
      enum: PARTY_TYPES,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      default: null,
    },
    effectKind: {
      type: String,
      required: true,
      enum: EFFECT_KINDS,
    },
    signedAmountMinorUnits: { type: String, required: true },
    currency: { type: String, required: true, default: 'PKR', enum: ['PKR'] },
    sourceType: {
      type: String,
      required: true,
      enum: SOURCE_TYPES,
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: EFFECT_STATUSES,
      default: 'posted',
    },
    postedAt: { type: Date, required: true },
    postedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
  },
  { timestamps: true, collection: 'ledger_effects' },
);

ledgerEffectSchema.index({ organizationId: 1, customerId: 1, postedAt: -1 });
ledgerEffectSchema.index({ organizationId: 1, supplierId: 1, postedAt: -1 });
ledgerEffectSchema.index(
  { organizationId: 1, sourceType: 1, sourceId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      sourceType: { $in: OPENING_SOURCE_TYPES },
      status: 'posted',
    },
    name: 'ledger_effects_opening_unique',
  },
);
ledgerEffectSchema.index(
  { organizationId: 1, sourceType: 1, sourceId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      sourceType: {
        $in: [
          'purchase_payable',
          'supplier_payment_allocation',
          'supplier_payment_advance',
          'supplier_advance_application',
        ],
      },
      status: 'posted',
    },
    name: 'ledger_effects_operational_source_unique',
  },
);

const LedgerEffectModel =
  mongoose.models['LedgerEffect'] || mongoose.model('LedgerEffect', ledgerEffectSchema);

module.exports = {
  PARTY_TYPES,
  EFFECT_KINDS,
  SOURCE_TYPES,
  OPENING_SOURCE_TYPES,
  EFFECT_STATUSES,
  LedgerEffectModel,
};
