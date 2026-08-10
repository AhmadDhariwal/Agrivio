const mongoose = require('mongoose');

const PACKAGING_STATUSES = ['active', 'inactive'];

const productPackagingUnitSchema = new mongoose.Schema(
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
      index: true,
    },
    name: { type: String, required: true, trim: true },
    nameNormalized: { type: String, required: true },
    /** Canonical positive decimal string (≤6 places). Snapshot later onto transactions. */
    conversionFactor: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: PACKAGING_STATUSES,
      default: 'active',
    },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, collection: 'product_packaging_units' },
);

productPackagingUnitSchema.index(
  { organizationId: 1, productId: 1, nameNormalized: 1 },
  { unique: true },
);
productPackagingUnitSchema.index({ organizationId: 1, productId: 1, status: 1 });

const ProductPackagingUnitModel =
  mongoose.models['ProductPackagingUnit'] ||
  mongoose.model('ProductPackagingUnit', productPackagingUnitSchema);

module.exports = {
  PACKAGING_STATUSES,
  ProductPackagingUnitModel,
};
