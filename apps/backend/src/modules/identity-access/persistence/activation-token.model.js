// @ts-check
import mongoose from 'mongoose';

const ACTIVATION_TOKEN_EXPIRY_HOURS = 24;

/**
 * @typedef {{
 *   _id: mongoose.Types.ObjectId;
 *   userId: mongoose.Types.ObjectId;
 *   organizationId?: mongoose.Types.ObjectId;
 *   scope: string;
 *   tokenHash: string;
 *   expiresAt: Date;
 *   usedAt: Date | null;
 *   createdAt: Date;
 * }} ActivationTokenDocument
 */

const activationTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
    scope: { type: String, required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'account_activation_tokens',
  },
);

activationTokenSchema.index({ tokenHash: 1 }, { unique: true });
activationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
activationTokenSchema.index({ userId: 1, scope: 1 });

export const ActivationTokenModel = mongoose.model('ActivationToken', activationTokenSchema);

/**
 * Default expiry date for new activation tokens.
 * @returns {Date}
 */
export function defaultActivationTokenExpiry() {
  const d = new Date();
  d.setHours(d.getHours() + ACTIVATION_TOKEN_EXPIRY_HOURS);
  return d;
}
