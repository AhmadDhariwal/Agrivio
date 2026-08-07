// @ts-check
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    emailNormalized: { type: String, required: true, unique: true },
    displayName: { type: String, required: true, trim: true },
    passwordHash: { type: String },
    status: {
      type: String,
      required: true,
      enum: ['pending_activation', 'active', 'deactivated'],
      default: 'pending_activation',
    },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, collection: 'users' },
);

const membershipSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
      index: true,
    },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User', index: true },
    role: { type: String, required: true, enum: ['Owner', 'Manager', 'Cashier', 'StoreKeeper'] },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'active', 'deactivated'],
      default: 'pending',
    },
    conditionalPermissionGrants: { type: [String], default: [] },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, collection: 'organization_memberships' },
);

membershipSchema.index({ organizationId: 1, userId: 1 }, { unique: true });

const activationTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User', index: true },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
      index: true,
    },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date },
    purpose: { type: String, required: true, default: 'owner_activation' },
  },
  { timestamps: true, collection: 'account_activation_tokens' },
);

activationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** @type {import('mongoose').Model<any>} */
const UserModel = mongoose.models['User'] || mongoose.model('User', userSchema);
/** @type {import('mongoose').Model<any>} */
const OrganizationMembershipModel =
  mongoose.models['OrganizationMembership'] ||
  mongoose.model('OrganizationMembership', membershipSchema);
/** @type {import('mongoose').Model<any>} */
const AccountActivationTokenModel =
  mongoose.models['AccountActivationToken'] ||
  mongoose.model('AccountActivationToken', activationTokenSchema);

module.exports = {
  UserModel,
  OrganizationMembershipModel,
  AccountActivationTokenModel,
};
