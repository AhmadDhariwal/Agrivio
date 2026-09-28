const mongoose = require('mongoose');

const OPENING_STOCK_STATUSES = ['draft', 'posted'];

const openingStockSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
      index: true,
    },
    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Warehouse',
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Product',
    },
    enteredQuantityMinorUnits: { type: String, required: true },
    quantityBaseMinorUnits: { type: String, required: true },
    unitCode: { type: String, required: true },
    conversionFactorSnapshot: { type: String, required: true },
    packagingUnitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductPackagingUnit',
      default: null,
    },
    batchNumber: { type: String, default: null },
    manufacturingDate: { type: String, default: null },
    expiryDate: { type: String, default: null },
    inventoryValueMinorUnits: { type: String, required: true },
    currency: { type: String, required: true, enum: ['PKR'], default: 'PKR' },
    status: {
      type: String,
      required: true,
      enum: OPENING_STOCK_STATUSES,
      default: 'draft',
    },
    postedAt: { type: Date, default: null },
    postedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    postedMovementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StockMovement',
      default: null,
    },
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductBatch',
      default: null,
    },
    version: { type: Number, required: true, default: 1 },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
  },
  { timestamps: true, collection: 'opening_stocks' },
);

openingStockSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
openingStockSchema.index({ organizationId: 1, warehouseId: 1, createdAt: -1 });

const OpeningStockModel =
  mongoose.models['OpeningStock'] || mongoose.model('OpeningStock', openingStockSchema);

module.exports = {
  OPENING_STOCK_STATUSES,
  OpeningStockModel,
};
