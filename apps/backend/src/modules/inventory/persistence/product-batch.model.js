const mongoose = require('mongoose');

const productBatchSchema = new mongoose.Schema(
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
    batchNumber: { type: String, required: true, trim: true },
    manufacturingDate: { type: String, default: null },
    expiryDate: { type: String, default: null },
    firstReceivedAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'product_batches' },
);

productBatchSchema.index(
  { organizationId: 1, productId: 1, batchNumber: 1 },
  { unique: true, name: 'product_batches_identity_unique' },
);
productBatchSchema.index({ organizationId: 1, expiryDate: 1 });
productBatchSchema.index({ organizationId: 1, productId: 1, firstReceivedAt: 1 });

const ProductBatchModel =
  mongoose.models['ProductBatch'] || mongoose.model('ProductBatch', productBatchSchema);

module.exports = {
  ProductBatchModel,
};
