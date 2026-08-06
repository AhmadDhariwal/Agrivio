// @ts-check
import mongoose from 'mongoose';

/**
 * @typedef {'Owner' | 'Manager' | 'Cashier' | 'StoreKeeper' | 'Viewer'} MembershipRole
 * @typedef {'pending' | 'active' | 'deactivated'} MembershipStatus
 * @typedef {{
 *   _id: mongoose.Types.ObjectId;
 *   organizationId: mongoose.Types.ObjectId;
 *   userId: mongoose.Types.ObjectId;
 *   role: MembershipRole;
 *   status: MembershipStatus;
 *   conditionalPermissionGrants: string[];
 *   createdAt: Date;
 *   updatedAt: Date;
 *   version: number;
 * }} MembershipDocument
 */

const membershipSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Organization' },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    role: {
      type: String,
      enum: ['Owner', 'Manager', 'Cashier', 'StoreKeeper', 'Viewer'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'deactivated'],
      default: 'pending',
      required: true,
    },
    conditionalPermissionGrants: { type: [String], default: [] },
    version: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    collection: 'organization_memberships',
    optimisticConcurrency: true,
  },
);

membershipSchema.index({ organizationId: 1, userId: 1 }, { unique: true });
membershipSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
membershipSchema.index({ userId: 1 });

export const MembershipModel = mongoose.model('Membership', membershipSchema);
