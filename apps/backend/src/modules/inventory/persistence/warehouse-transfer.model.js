const mongoose = require('mongoose');

const TRANSFER_STATUSES = ['draft', 'posted', 'reversed'];

const warehouseTransferSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
      index: true,
    },
    sourceWarehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Warehouse',
    },
    destinationWarehouseId: {
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
    enteredQuantityMinorUnits: { type: String, required: true },
    quantityBaseMinorUnits: { type: String, required: true },
    unitCode: { type: String, required: true },
    conversionFactorSnapshot: { type: String, required: true },
    packagingUnitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductPackagingUnit',
      default: null,
    },
    transferValueMinorUnits: { type: String, default: null },
    reason: { type: String, default: null },
    status: {
      type: String,
      required: true,
      enum: TRANSFER_STATUSES,
      default: 'draft',
    },
    postedAt: { type: Date, default: null },
    postedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    outboundMovementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StockMovement',
      default: null,
    },
    inboundMovementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StockMovement',
      default: null,
    },
    reversalOfId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WarehouseTransfer',
      default: null,
    },
    reversedByTransferId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WarehouseTransfer',
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
  { timestamps: true, collection: 'warehouse_transfers' },
);

warehouseTransferSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
warehouseTransferSchema.index({ organizationId: 1, sourceWarehouseId: 1, createdAt: -1 });
warehouseTransferSchema.index({ organizationId: 1, destinationWarehouseId: 1, createdAt: -1 });
warehouseTransferSchema.index({ organizationId: 1, reversalOfId: 1 });

const WarehouseTransferModel =
  mongoose.models['WarehouseTransfer'] ||
  mongoose.model('WarehouseTransfer', warehouseTransferSchema);

module.exports = {
  TRANSFER_STATUSES,
  WarehouseTransferModel,
};
