const mongoose = require('mongoose');

const accessAssignmentSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
      index: true,
    },
    membershipId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'OrganizationMembership',
      index: true,
    },
    assignmentType: {
      type: String,
      required: true,
      enum: ['branch', 'warehouse'],
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['active', 'revoked'],
      default: 'active',
    },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, collection: 'access_assignments' },
);

accessAssignmentSchema.index({ organizationId: 1, membershipId: 1, status: 1 });
accessAssignmentSchema.index(
  { membershipId: 1, assignmentType: 1, targetId: 1 },
  { unique: true },
);

const AccessAssignmentModel =
  mongoose.models['AccessAssignment'] ||
  mongoose.model('AccessAssignment', accessAssignmentSchema);

module.exports = {
  AccessAssignmentModel,
};
