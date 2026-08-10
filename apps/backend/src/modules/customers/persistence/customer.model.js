const mongoose = require('mongoose');

const CUSTOMER_TYPES = ['walk_in', 'farmer', 'individual', 'business', 'corporate'];
const PRICE_TIERS = ['retail', 'wholesale', 'dealer', 'distributor'];
const CREDIT_LIMIT_BEHAVIOURS = ['warning', 'manager_approval', 'block'];
const CUSTOMER_STATUSES = ['active', 'inactive'];

const customerSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
      index: true,
    },
    name: { type: String, required: true, trim: true },
    nameNormalized: { type: String, required: true },
    phone: { type: String, trim: true, default: '' },
    phoneNormalized: { type: String, default: '' },
    customerType: {
      type: String,
      required: true,
      enum: CUSTOMER_TYPES,
    },
    priceTier: {
      type: String,
      required: true,
      enum: PRICE_TIERS,
      default: 'retail',
    },
    creditEnabled: { type: Boolean, required: true, default: false },
    creditLimitAmountMinorUnits: { type: String, required: true, default: '0' },
    creditLimitCurrency: { type: String, required: true, default: 'PKR' },
    creditLimitBehaviour: {
      type: String,
      required: true,
      enum: CREDIT_LIMIT_BEHAVIOURS,
      default: 'warning',
    },
    status: {
      type: String,
      required: true,
      enum: CUSTOMER_STATUSES,
      default: 'active',
    },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, collection: 'customers' },
);

customerSchema.index({ organizationId: 1, nameNormalized: 1 });
customerSchema.index({ organizationId: 1, phoneNormalized: 1 });
customerSchema.index({ organizationId: 1, status: 1, createdAt: -1 });

const CustomerModel = mongoose.models['Customer'] || mongoose.model('Customer', customerSchema);

module.exports = {
  CUSTOMER_TYPES,
  PRICE_TIERS,
  CREDIT_LIMIT_BEHAVIOURS,
  CUSTOMER_STATUSES,
  CustomerModel,
};
