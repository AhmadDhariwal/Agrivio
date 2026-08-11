const mongoose = require('mongoose');

const ADJUSTMENT_TYPES = ['damage', 'expiry', 'loss', 'correction'];
const ADJUSTMENT_STATUSES = ['draft', 'posted', 'reversed'];
const ADJUSTMENT_DIRECTIONS = ['inbound', 'outbound'];

const stockAdjustmentSchema = new mongoose.Schema(
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
    adjustmentType: {
      type: String,
      required: true,
      enum: ADJUSTMENT_TYPES,
    },
    direction: {
      type: String,
      required: true,
      enum: ADJUSTMENT_DIRECTIONS,
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
    inventoryValueMinorUnits: { type: String, default: null },
    reason: { type: String, default: null },
    status: {
      type: String,
      required: true,
      enum: ADJUSTMENT_STATUSES,
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
    reversalOfId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StockAdjustment',
      default: null,
    },
    reversedByAdjustmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StockAdjustment',
      default: null,
    },
    negativeStockOverride: { type: Boolean, default: false },
    negativeStockOverrideReason: { type: String, default: null },
    negativeStockOverrideBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, collection: 'stock_adjustments' },
);

stockAdjustmentSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
stockAdjustmentSchema.index({ organizationId: 1, warehouseId: 1, createdAt: -1 });
stockAdjustmentSchema.index({ organizationId: 1, reversalOfId: 1 });

const StockAdjustmentModel =
  mongoose.models['StockAdjustment'] ||
  mongoose.model('StockAdjustment', stockAdjustmentSchema);

module.exports = {
  ADJUSTMENT_TYPES,
  ADJUSTMENT_STATUSES,
  ADJUSTMENT_DIRECTIONS,
  StockAdjustmentModel,
};
