const mongoose = require('mongoose');

const SALE_STATUSES = ['draft', 'posted', 'cancelled'];

const stockAllocationSchema = new mongoose.Schema(
  {
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductBatch',
      default: null,
    },
    batchNumber: { type: String, default: null },
    expiryDate: { type: String, default: null },
    quantityBaseMinorUnits: { type: String, required: true },
    cogsMinorUnits: { type: String, required: true },
  },
  { _id: false },
);

const saleLineSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Product',
    },
    productNameSnapshot: { type: String, required: true },
    trackingModeSnapshot: { type: String, default: null },
    packagingUnitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductPackagingUnit',
      default: null,
    },
    unitCodeSnapshot: { type: String, required: true },
    conversionFactorSnapshot: { type: String, required: true },
    enteredQuantityMinorUnits: { type: String, required: true },
    quantityBaseMinorUnits: { type: String, required: true },
    unitPriceMinorUnits: { type: String, required: true },
    lineProductAmountMinorUnits: { type: String, required: true },
    priceTierSnapshot: { type: String, default: null },
    catalogPriceMinorUnits: { type: String, default: null },
    priceOverrideReason: { type: String, default: null },
    cogsTotalMinorUnits: { type: String, default: null },
    stockAllocations: {
      type: [stockAllocationSchema],
      default: [],
    },
  },
  { _id: false },
);

const salePaymentSnapshotSchema = new mongoose.Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Account',
    },
    accountNameSnapshot: { type: String, required: true },
    accountTypeSnapshot: { type: String, required: true },
    amountMinorUnits: { type: String, required: true },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      default: null,
    },
  },
  { _id: false },
);

const saleSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
      index: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Branch',
    },
    branchNameSnapshot: { type: String, default: null },
    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Warehouse',
    },
    warehouseNameSnapshot: { type: String, default: null },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
    },
    customerNameSnapshot: { type: String, default: null },
    priceTierSnapshot: { type: String, default: null },
    saleDate: { type: String, required: true },
    notes: { type: String, default: '' },
    lines: {
      type: [saleLineSchema],
      required: true,
      validate: {
        validator(value) {
          return Array.isArray(value) && value.length > 0;
        },
        message: 'Sale must contain at least one line',
      },
    },
    saleTotalMinorUnits: { type: String, default: null },
    paidTotalMinorUnits: { type: String, default: null },
    receivableTotalMinorUnits: { type: String, default: null },
    cogsTotalMinorUnits: { type: String, default: null },
    paymentSnapshots: {
      type: [salePaymentSnapshotSchema],
      default: [],
    },
    invoiceNumber: { type: String, default: null },
    invoiceSequenceNumber: { type: Number, default: null },
    status: {
      type: String,
      required: true,
      enum: SALE_STATUSES,
      default: 'draft',
    },
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
  { timestamps: true, collection: 'sales' },
);

saleSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
saleSchema.index({ organizationId: 1, branchId: 1, postedAt: -1 });
saleSchema.index({ organizationId: 1, warehouseId: 1, createdAt: -1 });
saleSchema.index({ organizationId: 1, customerId: 1, createdAt: -1 });
saleSchema.index(
  { organizationId: 1, branchId: 1, invoiceNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { invoiceNumber: { $type: 'string' } },
  },
);

const SaleModel = mongoose.models['Sale'] || mongoose.model('Sale', saleSchema);

module.exports = {
  SALE_STATUSES,
  SaleModel,
};
