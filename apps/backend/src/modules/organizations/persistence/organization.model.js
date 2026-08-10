const mongoose = require('mongoose');

const ORGANIZATION_STATUSES = ['pending_approval', 'approved', 'rejected', 'suspended'];

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    nameNormalized: { type: String, required: true, index: true },
    timezone: { type: String, required: true, default: 'Asia/Karachi' },
    status: {
      type: String,
      required: true,
      enum: ORGANIZATION_STATUSES,
      default: 'pending_approval',
      index: true,
    },
    applicantFingerprint: { type: String, required: true, unique: true },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    rejectionReason: { type: String },
    approvedAt: { type: Date },
    rejectedAt: { type: Date },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, collection: 'organizations' },
);

const OrganizationModel =
  mongoose.models['Organization'] || mongoose.model('Organization', organizationSchema);

module.exports = {
  ORGANIZATION_STATUSES,
  OrganizationModel,
};
