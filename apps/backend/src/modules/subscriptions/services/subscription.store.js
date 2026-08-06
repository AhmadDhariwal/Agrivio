// @ts-check
import mongoose from 'mongoose';
import { SubscriptionModel } from '../persistence/subscription.model.js';

/**
 * Mongoose-backed subscription store.
 * Controllers must not import this directly.
 */
export function createSubscriptionStore() {
  return {
    /**
     * @param {Record<string, unknown>} data
     * @param {unknown} [session]
     */
    async createForOrg(data, session) {
      const s = /** @type {import('mongoose').ClientSession | undefined} */ (session);
      await SubscriptionModel.create([data], s ? { session: s } : undefined);
    },

    /**
     * @param {string} orgId
     */
    async findByOrgId(orgId) {
      const doc = await SubscriptionModel.findOne({
        organizationId: new mongoose.Types.ObjectId(orgId),
      }).lean();
      return doc ?? null;
    },
  };
}
