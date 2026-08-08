const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
      ref: 'Organization',
    },
    status: {
      type: String,
      required: true,
      enum: ['pending_approval', 'trial', 'active', 'grace', 'suspended', 'cancelled', 'rejected'],
      default: 'pending_approval',
    },
    planCode: { type: String, required: true, default: 'Starter' },
    planVersion: { type: Number, required: true, default: 1 },
    trialEndsAt: { type: Date },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, collection: 'subscriptions' },
);

const SubscriptionModel =
  mongoose.models['Subscription'] || mongoose.model('Subscription', subscriptionSchema);

module.exports = {
  SubscriptionModel,
};
