// @ts-check
import mongoose from 'mongoose';
import { OrganizationModel } from '../persistence/organization.model.js';
import { MembershipModel } from '../../identity-access/persistence/membership.model.js';
import { UserModel } from '../../identity-access/persistence/user.model.js';

/**
 * Mongoose-backed organization store for use in service layer.
 * Controllers must not import this directly.
 */
export function createOrganizationStore() {
  return {
    /**
     * Find a pending or active organization associated with the given owner email.
     * Checks memberships for Owner role linked to users with that email.
     * @param {string} normalizedEmail
     */
    async findPendingOrActiveByOwnerEmail(normalizedEmail) {
      const user = await UserModel.findOne({ normalizedEmail }).lean();
      if (!user) return null;

      const membership = await MembershipModel.findOne({
        userId: user._id,
        role: 'Owner',
        status: { $in: ['pending', 'active'] },
      }).lean();

      if (!membership) return null;

      const org = await OrganizationModel.findOne({
        _id: membership.organizationId,
        status: { $in: ['pending', 'active'] },
      }).lean();

      return org ?? null;
    },

    /**
     * @param {Record<string, unknown>} data
     * @param {unknown} [session]
     */
    async create(data, session) {
      const s = /** @type {import('mongoose').ClientSession | undefined} */ (session);
      const [doc] = await OrganizationModel.create([data], s ? { session: s } : undefined);
      if (doc === undefined) throw new Error('Failed to create organization');
      return doc;
    },

    /**
     * @param {string} id
     */
    async findById(id) {
      if (!mongoose.Types.ObjectId.isValid(id)) return null;
      const doc = await OrganizationModel.findById(id).lean();
      return doc ?? null;
    },

    /**
     * @param {Record<string, unknown>} filter
     */
    async list(filter) {
      return OrganizationModel.find(filter).sort({ createdAt: -1 }).lean();
    },

    /**
     * @param {string} id
     * @param {string} actorId
     * @param {unknown} [session]
     */
    async activate(id, actorId, session) {
      const s = /** @type {import('mongoose').ClientSession | undefined} */ (session);
      await OrganizationModel.updateOne(
        { _id: id, status: 'pending' },
        {
          $set: {
            status: 'active',
            approvedAt: new Date(),
            approvedBy: new mongoose.Types.ObjectId(actorId),
          },
          $inc: { version: 1 },
        },
        s ? { session: s } : undefined,
      );
    },

    /**
     * @param {string} id
     * @param {string} actorId
     * @param {string | undefined} reason
     * @param {unknown} [session]
     */
    async reject(id, actorId, reason, session) {
      const s = /** @type {import('mongoose').ClientSession | undefined} */ (session);
      await OrganizationModel.updateOne(
        { _id: id, status: 'pending' },
        {
          $set: {
            status: 'rejected',
            rejectedAt: new Date(),
            rejectedBy: new mongoose.Types.ObjectId(actorId),
            rejectionReason: reason ?? null,
          },
          $inc: { version: 1 },
        },
        s ? { session: s } : undefined,
      );
    },
  };
}
