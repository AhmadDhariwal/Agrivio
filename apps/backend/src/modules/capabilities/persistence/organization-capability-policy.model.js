const mongoose = require('mongoose');

const overrideSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { _id: false },
);

const organizationCapabilityPolicySchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
      unique: true,
      index: true,
    },
    version: { type: Number, required: true, min: 1 },
    overrides: { type: [overrideSchema], required: true, default: () => [] },
    updatedBy: { type: String, required: true },
  },
  { timestamps: true, collection: 'organization_capability_policies' },
);

const OrganizationCapabilityPolicyModel =
  mongoose.models['OrganizationCapabilityPolicy'] ||
  mongoose.model('OrganizationCapabilityPolicy', organizationCapabilityPolicySchema);

module.exports = {
  OrganizationCapabilityPolicyModel,
};
