const mongoose = require('mongoose');

const MOVEMENT_DIRECTIONS = ['inbound', 'outbound'];
const MOVEMENT_SOURCE_TYPES = [
  'opening_stock',
  'stock_adjustment',
  'stock_adjustment_reversal',
  'warehouse_transfer',
  'warehouse_transfer_reversal',
];
const MOVEMENT_STATUSES = ['posted'];

const stockMovementSchema = new mongoose.Schema(
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
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductBatch',
      default: null,
    },
    direction: {
      type: String,
      required: true,
      enum: MOVEMENT_DIRECTIONS,
    },
    quantityBaseMinorUnits: { type: String, required: true },
    enteredQuantityMinorUnits: { type: String, required: true },
    unitCode: { type: String, required: true },
    conversionFactorSnapshot: { type: String, required: true },
    packagingUnitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductPackagingUnit',
      default: null,
    },
    inventoryValueMinorUnits: { type: String, default: null },
    unitCostMinorUnits: { type: String, default: null },
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
    correctionOfId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    reversalOfId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    reason: { type: String, default: null },
    negativeStockOverride: { type: Boolean, default: false },
    negativeStockOverrideReason: { type: String, default: null },
    negativeStockOverrideBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true, collection: 'stock_movements' },
);

stockMovementSchema.index({
  organizationId: 1,
  warehouseId: 1,
  productId: 1,
  batchId: 1,
  postedAt: -1,
});
stockMovementSchema.index({ organizationId: 1, sourceType: 1, sourceId: 1 });
stockMovementSchema.index({ organizationId: 1, warehouseId: 1, postedAt: -1 });
stockMovementSchema.index({ organizationId: 1, productId: 1, postedAt: -1 });

const StockMovementModel =
  mongoose.models['StockMovement'] || mongoose.model('StockMovement', stockMovementSchema);

module.exports = {
  MOVEMENT_DIRECTIONS,
  MOVEMENT_SOURCE_TYPES,
  MOVEMENT_STATUSES,
  StockMovementModel,
};
