const mongoose = require('mongoose');

const PRODUCT_CLASSES = ['general', 'fertilizer', 'seed', 'pesticide', 'chemical'];
const CATEGORY_STATUSES = ['active', 'inactive'];
const MANDATORY_BATCH_PRODUCT_CLASSES = new Set(['fertilizer', 'seed', 'pesticide', 'chemical']);

const productCategorySchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
      index: true,
    },
    name: { type: String, required: true, trim: true },
    nameNormalized: { type: String, required: true },
    productClass: {
      type: String,
      required: true,
      enum: PRODUCT_CLASSES,
      default: 'general',
    },
    status: {
      type: String,
      required: true,
      enum: CATEGORY_STATUSES,
      default: 'active',
    },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, collection: 'product_categories' },
);

productCategorySchema.index({ organizationId: 1, nameNormalized: 1 }, { unique: true });
productCategorySchema.index({ organizationId: 1, status: 1, createdAt: -1 });

const ProductCategoryModel =
  mongoose.models['ProductCategory'] || mongoose.model('ProductCategory', productCategorySchema);

module.exports = {
  PRODUCT_CLASSES,
  CATEGORY_STATUSES,
  MANDATORY_BATCH_PRODUCT_CLASSES,
  ProductCategoryModel,
};
