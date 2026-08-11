const mongoose = require('mongoose');

const PURCHASE_STATUSES = ['draft', 'posted', 'cancelled'];

const purchaseLineSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Product',
    },
    productNameSnapshot: { type: String, required: true },
    trackingModeSnapshot: { type: String, required: true },
    packagingUnitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductPackagingUnit',
      default: null,
    },
    unitCodeSnapshot: { type: String, required: true },
    conversionFactorSnapshot: { type: String, required: true },
    enteredQuantityMinorUnits: { type: String, required: true },
    quantityBaseMinorUnits: { type: String, required: true },
    unitCostMinorUnits: { type: String, required: true },
    lineProductAmountMinorUnits: { type: String, required: true },
    batchNumber: { type: String, default: null },
    manufacturingDate: { type: String, default: null },
    expiryDate: { type: String, default: null },
  },
  { _id: false },
);

const landedCostSchema = new mongoose.Schema(
  {
    freightMinorUnits: { type: String, default: '0' },
    loadingMinorUnits: { type: String, default: '0' },
    transportMinorUnits: { type: String, default: '0' },
    otherMinorUnits: { type: String, default: '0' },
  },
  { _id: false },
);

const purchaseSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
      index: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
    },
    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Warehouse',
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Supplier',
    },
    supplierNameSnapshot: { type: String, required: true },
    supplierInvoiceReference: { type: String, default: '' },
    supplierInvoiceReferenceNormalized: { type: String, default: '' },
    purchaseDate: { type: String, required: true },
    notes: { type: String, default: '' },
    lines: {
      type: [purchaseLineSchema],
      required: true,
      validate: {
        validator(value) {
          return Array.isArray(value) && value.length > 0;
        },
        message: 'Purchase must contain at least one line',
      },
    },
    landedCosts: {
      type: landedCostSchema,
      default: () => ({
        freightMinorUnits: '0',
        loadingMinorUnits: '0',
        transportMinorUnits: '0',
        otherMinorUnits: '0',
      }),
    },
    status: {
      type: String,
      required: true,
      enum: PURCHASE_STATUSES,
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
  { timestamps: true, collection: 'purchases' },
);

purchaseSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
purchaseSchema.index({ organizationId: 1, warehouseId: 1, createdAt: -1 });
purchaseSchema.index({ organizationId: 1, supplierId: 1, createdAt: -1 });
purchaseSchema.index({ organizationId: 1, supplierInvoiceReferenceNormalized: 1 });

const PurchaseModel = mongoose.models['Purchase'] || mongoose.model('Purchase', purchaseSchema);

module.exports = {
  PURCHASE_STATUSES,
  PurchaseModel,
};
