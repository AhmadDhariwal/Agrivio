const mongoose = require('mongoose');
const {
  AuthSessionModel,
  OrganizationMembershipModel,
  PasswordResetTokenModel,
  UserModel,
} = require('./persistence/identity.model');
const { AuditEventModel } = require('../audit/persistence/audit-event.model');
const { AccessAssignmentModel } = require('../locations/persistence/access-assignment.model');

function withSession(session) {
  return session ? { session: session } : {};
}

function createMongooseAuthStore() {
  return {
    async findUserByEmailNormalized(emailNormalized) {
      return UserModel.findOne({ emailNormalized }).lean().exec();
    },

    async findUserById(id) {
      if (!mongoose.isValidObjectId(id)) {
        return null;
      }
      return UserModel.findById(id).lean().exec();
    },

    async insertUser(session, doc) {
      const [created] = await UserModel.create([doc], withSession(session));
      return created.toObject();
    },

    async updateUser(session, id, patch) {
      return UserModel.findByIdAndUpdate(
        id,
        { $set: patch },
        {
          new: true,
          ...withSession(session),
        },
      )
        .lean()
        .exec();
    },

    async listMembershipsByUserId(userId) {
      return OrganizationMembershipModel.find({ userId }).lean().exec();
    },

    async findMembershipById(id) {
      if (!mongoose.isValidObjectId(id)) {
        return null;
      }
      return OrganizationMembershipModel.findById(id).lean().exec();
    },

    async insertMembership(session, doc) {
      const [created] = await OrganizationMembershipModel.create([doc], withSession(session));
      return created.toObject();
    },

    async updateMembership(session, id, patch) {
      return OrganizationMembershipModel.findByIdAndUpdate(
        id,
        { $set: patch },
        { new: true, ...withSession(session) },
      )
        .lean()
        .exec();
    },

    async listAccessAssignmentsByMembershipId(membershipId) {
      return AccessAssignmentModel.find({
        membershipId,
        status: 'active',
      })
        .lean()
        .exec();
    },

    async insertAccessAssignment(session, doc) {
      const [created] = await AccessAssignmentModel.create([doc], withSession(session));
      return created.toObject();
    },

    async findSessionByTokenHash(tokenHash) {
      return AuthSessionModel.findOne({ tokenHash }).lean().exec();
    },

    async insertSession(session, doc) {
      const [created] = await AuthSessionModel.create([doc], withSession(session));
      return created.toObject();
    },

    async updateSession(session, id, patch) {
      return AuthSessionModel.findByIdAndUpdate(
        id,
        { $set: patch },
        {
          new: true,
          ...withSession(session),
        },
      )
        .lean()
        .exec();
    },

    async revokeSessionByTokenHash(session, tokenHash, revokedAt) {
      return AuthSessionModel.findOneAndUpdate(
        { tokenHash },
        { $set: { revokedAt } },
        { new: true, ...withSession(session) },
      )
        .lean()
        .exec();
    },

    async revokeAllSessionsForUser(session, userId, revokedAt) {
      await AuthSessionModel.updateMany(
        { userId, revokedAt: { $exists: false } },
        { $set: { revokedAt } },
        withSession(session),
      ).exec();
    },

    async insertPasswordResetToken(session, doc) {
      const [created] = await PasswordResetTokenModel.create([doc], withSession(session));
      return created.toObject();
    },

    async findPasswordResetTokenByHash(tokenHash) {
      return PasswordResetTokenModel.findOne({ tokenHash }).lean().exec();
    },

    async updatePasswordResetToken(session, id, patch) {
      return PasswordResetTokenModel.findByIdAndUpdate(
        id,
        { $set: patch },
        {
          new: true,
          ...withSession(session),
        },
      )
        .lean()
        .exec();
    },

    async appendAuditEvent(session, event) {
      await AuditEventModel.create([event], withSession(session));
    },
  };
}

module.exports = {
  createMongooseAuthStore,
};
