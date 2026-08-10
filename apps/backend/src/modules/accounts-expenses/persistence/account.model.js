const mongoose = require('mongoose');

const ACCOUNT_TYPES = ['cash', 'bank', 'jazzcash', 'easypaisa'];
const ACCOUNT_STATUSES = ['active', 'inactive'];

const accountSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
      index: true,
    },
    accountType: {
      type: String,
      required: true,
      enum: ACCOUNT_TYPES,
    },
    name: { type: String, required: true, trim: true },
    nameNormalized: { type: String, required: true },
    bankName: { type: String, trim: true, default: '' },
    accountNumberMasked: { type: String, trim: true, default: '' },
    walletIdentifier: { type: String, trim: true, default: '' },
    status: {
      type: String,
      required: true,
      enum: ACCOUNT_STATUSES,
      default: 'active',
    },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, collection: 'accounts' },
);

accountSchema.index({ organizationId: 1, nameNormalized: 1 }, { unique: true });
accountSchema.index({ organizationId: 1, accountType: 1, status: 1 });
accountSchema.index({ organizationId: 1, status: 1, createdAt: -1 });

const AccountModel = mongoose.models['Account'] || mongoose.model('Account', accountSchema);

module.exports = {
  ACCOUNT_TYPES,
  ACCOUNT_STATUSES,
  AccountModel,
};
