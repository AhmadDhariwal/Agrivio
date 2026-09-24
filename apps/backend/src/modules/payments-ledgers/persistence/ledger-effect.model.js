const mongoose = require('mongoose');

const PARTY_TYPES = ['customer', 'supplier'];
const EFFECT_KINDS = ['receivable', 'loan_receivable', 'advance', 'payable', 'supplier_advance'];
const SOURCE_TYPES = [
  'customer_opening_receivable',
  'customer_opening_advance',
  'supplier_opening_payable',
  'supplier_opening_advance',
  'purchase_payable',
  'supplier_payment_allocation',
  'supplier_payment_advance',
  'supplier_advance_application',
  'supplier_advance_consumption',
  'purchase_cancellation_advance_payable_reversal',
  'purchase_cancellation_advance_reinstatement',
  'purchase_cancellation',
  'purchase_cancellation_allocation_reversal',
  'purchase_return',
  'sale_receivable',
  'customer_payment_allocation',
  'customer_payment_advance',
  'customer_advance_application',
  'customer_advance_consumption',
  'sale_cancellation',
  'sale_cancellation_allocation_reversal',
  'sale_cancellation_advance_receivable_reversal',
  'sale_cancellation_advance_reinstatement',
  'customer_opening_correction_reversal',
  'customer_opening_correction_replacement',
  'sales_return',
  'purchase_return_reversal',
  'sales_return_reversal',
  'customer_payment_allocation_reversal',
  'customer_payment_advance_reversal',
  'supplier_payment_allocation_reversal',
  'supplier_payment_advance_reversal',
  'customer_loan_disbursement',
  'customer_loan_repayment',
  'customer_loan_repayment_reversal',
  'customer_loan_reversal',
  'customer_trade_receivable_adjustment',
  'customer_advance_adjustment',
  'customer_loan_adjustment',
  'customer_balance_adjustment_reversal',
  'supplier_advance_refund',
  'supplier_advance_refund_reversal',
  'supplier_payable_adjustment',
  'supplier_advance_adjustment',
  'supplier_balance_adjustment_reversal',
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
    loanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CustomerLoan',
      default: null,
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
ledgerEffectSchema.index({ organizationId: 1, loanId: 1, postedAt: -1 });
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
          'supplier_advance_consumption',
          'purchase_cancellation_advance_payable_reversal',
          'purchase_cancellation_advance_reinstatement',
          'purchase_cancellation',
          'purchase_cancellation_allocation_reversal',
          'purchase_return',
          'sale_receivable',
          'customer_payment_allocation',
          'customer_payment_advance',
          'customer_advance_application',
          'customer_advance_consumption',
          'sale_cancellation',
          'sale_cancellation_allocation_reversal',
          'sale_cancellation_advance_receivable_reversal',
          'sale_cancellation_advance_reinstatement',
          'customer_opening_correction_reversal',
          'customer_opening_correction_replacement',
          'purchase_return_reversal',
          'sales_return_reversal',
          'customer_payment_allocation_reversal',
          'customer_payment_advance_reversal',
          'supplier_payment_allocation_reversal',
          'supplier_payment_advance_reversal',
          'customer_loan_disbursement',
          'customer_loan_repayment',
          'customer_loan_repayment_reversal',
          'customer_loan_reversal',
          'customer_trade_receivable_adjustment',
          'customer_advance_adjustment',
          'customer_loan_adjustment',
          'customer_balance_adjustment_reversal',
          'supplier_advance_refund',
          'supplier_advance_refund_reversal',
          'supplier_payable_adjustment',
          'supplier_advance_adjustment',
          'supplier_balance_adjustment_reversal',
        ],
      },
      status: 'posted',
    },
    name: 'ledger_effects_operational_source_unique',
  },
);

const LedgerEffectModel =
  mongoose.models['LedgerEffect'] || mongoose.model('LedgerEffect', ledgerEffectSchema);

const customerFinancialVersionSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    version: { type: Number, required: true, default: 0 },
  },
  { timestamps: true, collection: 'customer_financial_versions' },
);
customerFinancialVersionSchema.index(
  { organizationId: 1, customerId: 1 },
  { unique: true, name: 'customer_financial_version_unique' },
);
const CustomerFinancialVersionModel =
  mongoose.models.CustomerFinancialVersion ||
  mongoose.model('CustomerFinancialVersion', customerFinancialVersionSchema);

const supplierFinancialVersionSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, required: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, required: true },
    version: { type: Number, required: true, default: 0 },
  },
  { timestamps: true, collection: 'supplier_financial_versions' },
);
supplierFinancialVersionSchema.index(
  { organizationId: 1, supplierId: 1 },
  { unique: true, name: 'supplier_financial_version_unique' },
);
const SupplierFinancialVersionModel =
  mongoose.models.SupplierFinancialVersion ||
  mongoose.model('SupplierFinancialVersion', supplierFinancialVersionSchema);

module.exports = {
  PARTY_TYPES,
  EFFECT_KINDS,
  SOURCE_TYPES,
  OPENING_SOURCE_TYPES,
  EFFECT_STATUSES,
  LedgerEffectModel,
  CustomerFinancialVersionModel,
  SupplierFinancialVersionModel,
};
