// @ts-check
import mongoose from 'mongoose';

/**
 * @typedef {'pending' | 'active' | 'suspended' | 'rejected'} OrganizationStatus
 * @typedef {{
 *   _id: mongoose.Types.ObjectId;
 *   name: string;
 *   normalizedName: string;
 *   timezone: string;
 *   status: OrganizationStatus;
 *   approvedAt: Date | null;
 *   approvedBy: mongoose.Types.ObjectId | null;
 *   rejectedAt: Date | null;
 *   rejectedBy: mongoose.Types.ObjectId | null;
 *   rejectionReason: string | null;
 *   createdAt: Date;
 *   updatedAt: Date;
 *   version: number;
 * }} OrganizationDocument
 */

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, trim: true, lowercase: true },
    timezone: { type: String, required: true, default: 'Asia/Karachi' },
    status: {
      type: String,
      enum: ['pending', 'active', 'suspended', 'rejected'],
      default: 'pending',
      required: true,
    },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rejectedAt: { type: Date, default: null },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rejectionReason: { type: String, default: null },
    version: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    collection: 'organizations',
    optimisticConcurrency: true,
  },
);

organizationSchema.index({ status: 1, createdAt: -1 });
organizationSchema.index({ normalizedName: 1 });

export const OrganizationModel = mongoose.model('Organization', organizationSchema);
