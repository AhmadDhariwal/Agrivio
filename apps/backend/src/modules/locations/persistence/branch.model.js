const mongoose = require('mongoose');

const BRANCH_STATUSES = ['active', 'inactive'];

const branchSchema = new mongoose.Schema(
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
    invoicePrefix: { type: String, required: true, trim: true },
    invoicePrefixNormalized: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: BRANCH_STATUSES,
      default: 'active',
    },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, collection: 'branches' },
);

branchSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
branchSchema.index({ organizationId: 1, nameNormalized: 1 }, { unique: true });
branchSchema.index({ organizationId: 1, invoicePrefixNormalized: 1 }, { unique: true });

const BranchModel = mongoose.models['Branch'] || mongoose.model('Branch', branchSchema);

module.exports = {
  BRANCH_STATUSES,
  BranchModel,
};
