const mongoose = require('mongoose');

const inventoryCostStateSchema = new mongoose.Schema(
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
    quantityBaseMinorUnits: { type: String, required: true },
    inventoryValueMinorUnits: { type: String, required: true },
    weightedAverageCostMinorUnits: { type: String, required: true },
    lastWeightedAverageCostMinorUnits: { type: String, required: true },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, collection: 'inventory_cost_states' },
);

inventoryCostStateSchema.index(
  { organizationId: 1, warehouseId: 1, productId: 1 },
  { unique: true, name: 'inventory_cost_states_scope_unique' },
);

const InventoryCostStateModel =
  mongoose.models['InventoryCostState'] ||
  mongoose.model('InventoryCostState', inventoryCostStateSchema);

module.exports = {
  InventoryCostStateModel,
};
