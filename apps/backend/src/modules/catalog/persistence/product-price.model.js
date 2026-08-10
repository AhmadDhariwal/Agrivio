const mongoose = require('mongoose');

const PRICE_TIERS = ['retail', 'wholesale', 'dealer', 'distributor'];
const PRICE_STATUSES = ['active', 'inactive'];

const productPriceSchema = new mongoose.Schema(
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
    priceTier: {
      type: String,
      required: true,
      enum: PRICE_TIERS,
    },
    amountMinorUnits: { type: String, required: true },
    currency: { type: String, required: true, default: 'PKR' },
    status: {
      type: String,
      required: true,
      enum: PRICE_STATUSES,
      default: 'active',
    },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, collection: 'product_prices' },
);

productPriceSchema.index({ organizationId: 1, productId: 1, priceTier: 1 }, { unique: true });
productPriceSchema.index({ organizationId: 1, productId: 1, status: 1 });

const ProductPriceModel =
  mongoose.models['ProductPrice'] || mongoose.model('ProductPrice', productPriceSchema);

module.exports = {
  PRICE_TIERS,
  PRICE_STATUSES,
  ProductPriceModel,
};
