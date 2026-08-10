const mongoose = require('mongoose');

const WAREHOUSE_STATUSES = ['active', 'inactive'];

const warehouseSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
      index: true,
    },
    name: { type: String, required: true, trim: true },
    nameNormalized: { type: String, required: true },
    code: { type: String, trim: true, default: '' },
    status: {
      type: String,
      required: true,
      enum: WAREHOUSE_STATUSES,
      default: 'active',
    },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, collection: 'warehouses' },
);

warehouseSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
warehouseSchema.index({ organizationId: 1, nameNormalized: 1 }, { unique: true });

const WarehouseModel =
  mongoose.models['Warehouse'] || mongoose.model('Warehouse', warehouseSchema);

module.exports = {
  WAREHOUSE_STATUSES,
  WarehouseModel,
};
