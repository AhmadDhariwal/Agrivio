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
    /**
     * Platform Super Admin access; omit/undefined means no platform context.
     */
    platformAccess: {
      type: String,
      enum: ['super_admin'],
      required: false,
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

const authSessionSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    csrfHash: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    activeContextType: {
      type: String,
      required: true,
      enum: ['none', 'platform', 'organization'],
      default: 'none',
    },
    activeMembershipId: { type: mongoose.Schema.Types.ObjectId },
    activeOrganizationId: { type: mongoose.Schema.Types.ObjectId, index: true },
    absoluteExpiresAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
  },
  { timestamps: true, collection: 'auth_sessions' },
);

authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
authSessionSchema.index({ userId: 1, revokedAt: 1 });

const passwordResetTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User', index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date },
  },
  { timestamps: true, collection: 'password_reset_tokens' },
);

passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const UserModel = mongoose.models['User'] || mongoose.model('User', userSchema);
const OrganizationMembershipModel =
  mongoose.models['OrganizationMembership'] ||
  mongoose.model('OrganizationMembership', membershipSchema);
const AccountActivationTokenModel =
  mongoose.models['AccountActivationToken'] ||
  mongoose.model('AccountActivationToken', activationTokenSchema);
const AuthSessionModel =
  mongoose.models['AuthSession'] || mongoose.model('AuthSession', authSessionSchema);
const PasswordResetTokenModel =
  mongoose.models['PasswordResetToken'] ||
  mongoose.model('PasswordResetToken', passwordResetTokenSchema);

module.exports = {
  UserModel,
  OrganizationMembershipModel,
  AccountActivationTokenModel,
  AuthSessionModel,
  PasswordResetTokenModel,
};
