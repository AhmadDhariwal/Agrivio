const mongoose = require('mongoose');

const inventoryBalanceSchema = new mongoose.Schema(
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
    quantityBaseMinorUnits: { type: String, required: true },
    unsellableQuantityBaseMinorUnits: { type: String, default: '0' },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, collection: 'inventory_balances' },
);

inventoryBalanceSchema.index(
  { organizationId: 1, warehouseId: 1, productId: 1, batchId: 1 },
  { unique: true, name: 'inventory_balances_scope_unique' },
);

const InventoryBalanceModel =
  mongoose.models['InventoryBalance'] ||
  mongoose.model('InventoryBalance', inventoryBalanceSchema);

module.exports = {
  InventoryBalanceModel,
};
