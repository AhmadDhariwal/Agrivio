// @ts-check
import mongoose from 'mongoose';
import { MembershipModel } from '../persistence/membership.model.js';

/**
 * Mongoose-backed membership store for use in service layer.
 * Controllers must not import this directly.
 */
export function createMembershipStore() {
  return {
    /**
     * Not used at this level — duplicate-request check done in onboarding service.
     */
    async findPendingOwnerByEmail() {
      // Implemented via userId join at onboarding service level
      return null;
    },

    /**
     * @param {unknown} userId
     * @param {unknown} orgId
     */
    async findByUserAndOrg(userId, orgId) {
      const doc = await MembershipModel.findOne({ userId, organizationId: orgId }).lean();
      return doc ?? null;
    },

    /**
     * @param {Record<string, unknown>} data
     * @param {unknown} [session]
     */
    async create(data, session) {
      const s = /** @type {import('mongoose').ClientSession | undefined} */ (session);
      const [doc] = await MembershipModel.create([data], s ? { session: s } : undefined);
      if (doc === undefined) throw new Error('Failed to create membership');
      return doc;
    },

    /**
     * Find a membership by organization and role.
     * @param {string} orgId
     * @param {string} role
     */
    async findByOrgAndRole(orgId, role) {
      const doc = await MembershipModel.findOne({ organizationId: orgId, role }).lean();
      return doc ?? null;
    },

    /**
     * Activate the pending Owner membership for an organization.
     * Returns the activated owner's userId.
     * @param {string} orgId
     * @param {unknown} [session]
     * @returns {Promise<{ userId: string } | null>}
     */
    async activateOwner(orgId, session) {
      const s = /** @type {import('mongoose').ClientSession | undefined} */ (session);
      const membership = await MembershipModel.findOneAndUpdate(
        { organizationId: new mongoose.Types.ObjectId(orgId), role: 'Owner', status: 'pending' },
        { $set: { status: 'active' }, $inc: { version: 1 } },
        { new: true, ...(s ? { session: s } : {}) },
      ).lean();

      if (!membership) return null;
      return { userId: String(membership.userId) };
    },
  };
}
