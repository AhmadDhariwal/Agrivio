const mongoose = require('mongoose');

const TRACKING_MODES = ['none', 'batch', 'batch_expiry'];
const MEASUREMENT_DIMENSIONS = ['mass', 'volume'];
const PRODUCT_STATUSES = ['active', 'inactive'];

const productSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
      index: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'ProductCategory',
    },
    name: { type: String, required: true, trim: true },
    nameNormalized: { type: String, required: true },
    sku: { type: String, trim: true, default: '' },
    trackingMode: {
      type: String,
      required: true,
      enum: TRACKING_MODES,
    },
    baseUnitCode: { type: String, required: true, trim: true },
    measurementDimension: {
      type: String,
      required: true,
      enum: MEASUREMENT_DIMENSIONS,
    },
    status: {
      type: String,
      required: true,
      enum: PRODUCT_STATUSES,
      default: 'active',
    },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, collection: 'products' },
);

productSchema.index({ organizationId: 1, nameNormalized: 1 });
productSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
productSchema.index(
  { organizationId: 1, sku: 1 },
  {
    unique: true,
    partialFilterExpression: { sku: { $type: 'string', $gt: '' } },
  },
);

const ProductModel = mongoose.models['Product'] || mongoose.model('Product', productSchema);

module.exports = {
  TRACKING_MODES,
  MEASUREMENT_DIMENSIONS,
  PRODUCT_STATUSES,
  ProductModel,
};
