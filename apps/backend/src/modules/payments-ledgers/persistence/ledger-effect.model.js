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
  'purchase_cancellation',
  'purchase_cancellation_allocation_reversal',
  'purchase_return',
  'sale_receivable',
  'customer_payment_allocation',
  'customer_payment_advance',
  'customer_advance_application',
  'sale_cancellation',
  'sale_cancellation_allocation_reversal',
  'sales_return',
  'purchase_return_reversal',
  'sales_return_reversal',
  'customer_payment_allocation_reversal',
  'customer_payment_advance_reversal',
  'supplier_payment_allocation_reversal',
  'supplier_payment_advance_reversal',
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
    reversalOfId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
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
          'purchase_cancellation',
          'purchase_cancellation_allocation_reversal',
          'purchase_return',
          'sale_receivable',
          'customer_payment_allocation',
          'customer_payment_advance',
          'customer_advance_application',
          'sale_cancellation',
          'sale_cancellation_allocation_reversal',
          'purchase_return_reversal',
          'sales_return_reversal',
          'customer_payment_allocation_reversal',
          'customer_payment_advance_reversal',
          'supplier_payment_allocation_reversal',
          'supplier_payment_advance_reversal',
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
