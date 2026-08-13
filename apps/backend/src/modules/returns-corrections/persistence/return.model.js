const mongoose = require('mongoose');

const RETURN_STATUSES = ['draft', 'posted', 'reversed'];
const RETURN_TYPES = ['purchase', 'sales', 'sales_without_invoice'];
const RETURN_RESOLUTIONS = ['ledger_adjustment', 'account_refund'];
const STOCK_CONDITIONS = ['sellable', 'unsellable'];
const UNSELLABLE_REASONS = ['expired', 'damaged', 'opened', 'contaminated', 'other'];

const approvalSnapshotSchema = new mongoose.Schema(
  {
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    approvedAt: { type: Date, required: true },
    reason: { type: String, required: true },
  },
  { _id: false },
);

const returnLineSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Product',
    },
    productNameSnapshot: { type: String, required: true },
    packagingUnitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductPackagingUnit',
      default: null,
    },
    unitCodeSnapshot: { type: String, required: true },
    conversionFactorSnapshot: { type: String, required: true },
    enteredQuantityMinorUnits: { type: String, required: true },
    quantityBaseMinorUnits: { type: String, required: true },
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductBatch',
      default: null,
    },
    batchNumber: { type: String, default: null },
    manufacturingDate: { type: String, default: null },
    expiryDate: { type: String, default: null },
    originalLineIndex: { type: Number, default: null },
    stockCondition: {
      type: String,
      enum: STOCK_CONDITIONS,
      default: null,
    },
    unsellableReason: {
      type: String,
      enum: UNSELLABLE_REASONS,
      default: null,
    },
    returnInventoryValueMinorUnits: { type: String, default: null },
    receiptUnitCostMinorUnits: { type: String, default: null },
    returnRevenueMinorUnits: { type: String, default: null },
    documentedUnitCostMinorUnits: { type: String, default: null },
  },
  { _id: false },
);

const returnSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
      index: true,
    },
    returnType: {
      type: String,
      required: true,
      enum: RETURN_TYPES,
    },
    purchaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Purchase',
      default: null,
    },
    saleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sale',
      default: null,
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
    customerIdentifyingName: { type: String, default: null },
    customerIdentifyingPhone: { type: String, default: null },
    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Warehouse',
    },
    reason: { type: String, default: '' },
    resolution: {
      type: String,
      required: true,
      enum: RETURN_RESOLUTIONS,
      default: 'ledger_adjustment',
    },
    refundAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      default: null,
    },
    approvedReturnValueMinorUnits: { type: String, default: null },
    withoutInvoiceApproval: {
      type: approvalSnapshotSchema,
      default: null,
    },
    status: {
      type: String,
      required: true,
      enum: RETURN_STATUSES,
      default: 'draft',
    },
    lines: {
      type: [returnLineSchema],
      required: true,
      validate: {
        validator(value) {
          return Array.isArray(value) && value.length > 0;
        },
        message: 'Return must contain at least one line',
      },
    },
    returnTotalMinorUnits: { type: String, default: null },
    currency: { type: String, default: 'PKR' },
    postedAt: { type: Date, default: null },
    postedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, collection: 'returns' },
);

returnSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
returnSchema.index({ organizationId: 1, purchaseId: 1 });
returnSchema.index({ organizationId: 1, saleId: 1 });
returnSchema.index({ organizationId: 1, supplierId: 1 });
returnSchema.index({ organizationId: 1, customerId: 1 });
returnSchema.index({ organizationId: 1, warehouseId: 1, createdAt: -1 });

const ReturnModel = mongoose.models['Return'] || mongoose.model('Return', returnSchema);

module.exports = {
  RETURN_STATUSES,
  RETURN_TYPES,
  RETURN_RESOLUTIONS,
  STOCK_CONDITIONS,
  UNSELLABLE_REASONS,
  ReturnModel,
};
