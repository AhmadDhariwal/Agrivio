const mongoose = require('mongoose');

const SALE_STATUSES = ['draft', 'posted', 'cancelled'];

const saleLineSchema = new mongoose.Schema(
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
    unitPriceMinorUnits: { type: String, required: true },
    lineProductAmountMinorUnits: { type: String, required: true },
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
