// @ts-check
import mongoose from 'mongoose';

/**
 * @typedef {'Starter' | 'Business' | 'Enterprise'} PlanCode
 * @typedef {'trial' | 'active' | 'grace' | 'suspended' | 'cancelled'} SubscriptionStatus
 * @typedef {{
 *   _id: mongoose.Types.ObjectId;
 *   organizationId: mongoose.Types.ObjectId;
 *   planCode: PlanCode;
 *   status: SubscriptionStatus;
 *   trialEndsAt: Date | null;
 *   currentPeriodStart: Date | null;
 *   currentPeriodEnd: Date | null;
 *   createdAt: Date;
 *   updatedAt: Date;
 *   version: number;
 * }} SubscriptionDocument
 */

const subscriptionSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
    },
    planCode: {
      type: String,
      enum: ['Starter', 'Business', 'Enterprise'],
      required: true,
      default: 'Starter',
    },
    status: {
      type: String,
      enum: ['trial', 'active', 'grace', 'suspended', 'cancelled'],
      required: true,
      default: 'trial',
    },
    trialEndsAt: { type: Date, default: null },
    currentPeriodStart: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    version: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    collection: 'subscriptions',
    optimisticConcurrency: true,
  },
);

subscriptionSchema.index({ organizationId: 1 }, { unique: true });
subscriptionSchema.index({ status: 1 });

export const SubscriptionModel = mongoose.model('Subscription', subscriptionSchema);

/** Default trial period: 30 days. */
export function defaultTrialEndsAt() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d;
}
