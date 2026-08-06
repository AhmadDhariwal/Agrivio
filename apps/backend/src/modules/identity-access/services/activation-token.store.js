// @ts-check
import { ActivationTokenModel } from '../persistence/activation-token.model.js';

/**
 * Mongoose-backed activation token store.
 * Controllers must not import this directly.
 */
export function createActivationTokenStore() {
  return {
    /**
     * @param {string} tokenHash
     */
    async findByTokenHash(tokenHash) {
      const doc = await ActivationTokenModel.findOne({ tokenHash }).lean();
      return doc ?? null;
    },

    /**
     * @param {unknown} id
     * @param {unknown} [session]
     */
    async markUsed(id, session) {
      const s = /** @type {import('mongoose').ClientSession | undefined} */ (session);
      await ActivationTokenModel.updateOne(
        { _id: id, usedAt: null },
        { $set: { usedAt: new Date() } },
        s ? { session: s } : undefined,
      );
    },

    /**
     * @param {Record<string, unknown>} data
     * @param {unknown} [session]
     */
    async createForUser(data, session) {
      const s = /** @type {import('mongoose').ClientSession | undefined} */ (session);
      await ActivationTokenModel.create([data], s ? { session: s } : undefined);
    },
  };
}
