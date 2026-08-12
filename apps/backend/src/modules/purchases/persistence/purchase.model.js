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
    allocatedLandedCostMinorUnits: { type: String, default: '0' },
    receiptInventoryValueMinorUnits: { type: String, default: null },
    receiptUnitCostMinorUnits: { type: String, default: null },
    batchNumber: { type: String, default: null },
    manufacturingDate: { type: String, default: null },
    expiryDate: { type: String, default: null },
    batchIdSnapshot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductBatch',
      default: null,
    },
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

const purchasePaymentSnapshotSchema = new mongoose.Schema(
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
    branchNameSnapshot: { type: String, default: null },
    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Warehouse',
    },
    warehouseNameSnapshot: { type: String, default: null },
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
    goodsTotalMinorUnits: { type: String, default: null },
    landedCostTotalMinorUnits: { type: String, default: null },
    purchaseTotalMinorUnits: { type: String, default: null },
    paidTotalMinorUnits: { type: String, default: null },
    payableTotalMinorUnits: { type: String, default: null },
    paymentSnapshots: {
      type: [purchasePaymentSnapshotSchema],
      default: [],
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
    cancellationReason: { type: String, default: null },
    cancelledAt: { type: Date, default: null },
    cancelledBy: {
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
