const mongoose = require('mongoose');

const inventorySettingsSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
      unique: true,
      index: true,
    },
    expiryThresholdDays: { type: Number, required: true, default: 30 },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, collection: 'inventory_settings' },
);

const InventorySettingsModel =
  mongoose.models['InventorySettings'] ||
  mongoose.model('InventorySettings', inventorySettingsSchema);

module.exports = {
  InventorySettingsModel,
};
