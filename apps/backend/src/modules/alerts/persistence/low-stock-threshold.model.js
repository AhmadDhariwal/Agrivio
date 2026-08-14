const mongoose = require('mongoose');

const lowStockThresholdSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Product',
    },
    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Warehouse',
    },
    thresholdQuantityBaseMinorUnits: { type: String, required: true },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, collection: 'low_stock_thresholds' },
);

lowStockThresholdSchema.index(
  { organizationId: 1, productId: 1, warehouseId: 1 },
  { unique: true },
);

const LowStockThresholdModel =
  mongoose.models['LowStockThreshold'] ||
  mongoose.model('LowStockThreshold', lowStockThresholdSchema);

module.exports = {
  LowStockThresholdModel,
};
