// @ts-check
import { UserModel } from '../persistence/user.model.js';

/**
 * Mongoose-backed user store for use in service layer.
 * Controllers must not import this directly.
 */
export function createUserStore() {
  return {
    /**
     * @param {string} normalizedEmail
     */
    async findOneByEmail(normalizedEmail) {
      const doc = await UserModel.findOne({ normalizedEmail }).lean();
      return doc ?? null;
    },

    /**
     * @param {Record<string, unknown>} data
     * @param {unknown} [session]
     */
    async create(data, session) {
      const s = /** @type {import('mongoose').ClientSession | undefined} */ (session);
      const [doc] = await UserModel.create([data], s ? { session: s } : undefined);
      if (doc === undefined) throw new Error('Failed to create user');
      return doc;
    },

    /**
     * @param {unknown} id
     */
    async findById(id) {
      const doc = await UserModel.findById(id).lean();
      return doc ?? null;
    },

    /**
     * @param {unknown} id
     * @param {string} passwordHash
     * @param {unknown} [session]
     */
    async setPasswordHashAndActivate(id, passwordHash, session) {
      const s = /** @type {import('mongoose').ClientSession | undefined} */ (session);
      await UserModel.updateOne(
        { _id: id },
        { $set: { passwordHash, status: 'active' }, $inc: { version: 1 } },
        s ? { session: s } : undefined,
      );
    },
  };
}
