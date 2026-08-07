// @ts-check
const mongoose = require('mongoose');
const { OrganizationModel } = require('../organizations/organization.model');
const {
  AccountActivationTokenModel,
  OrganizationMembershipModel,
  UserModel,
} = require('../identity/identity.model');
const { SubscriptionModel } = require('../subscriptions/subscription.model');
const { AuditEventModel } = require('../audit/audit-event.model');

/**
 * @param {unknown} session
 */
function withSession(session) {
  return session ? { session: /** @type {import('mongoose').ClientSession} */ (session) } : {};
}

/**
 * Mongoose-backed onboarding persistence using frozen canonical collections only.
 * @returns {import('./onboarding.types').OnboardingStore}
 */
function createMongooseOnboardingStore() {
  return {
    async findOrganizationByFingerprint(fingerprint) {
      return OrganizationModel.findOne({ applicantFingerprint: fingerprint }).lean().exec();
    },

    async findOrganizationById(id) {
      if (!mongoose.isValidObjectId(id)) {
        return null;
      }
      return OrganizationModel.findById(id).lean().exec();
    },

    async listOrganizations(filter = {}) {
      /** @type {Record<string, unknown>} */
      const query = {};
      if (filter.status !== undefined) {
        query['status'] = filter.status;
      }
      return OrganizationModel.find(query).sort({ createdAt: -1 }).lean().exec();
    },

    async insertOrganization(session, doc) {
      const [created] = await OrganizationModel.create([doc], withSession(session));
      return created.toObject();
    },

    async updateOrganization(session, id, patch) {
      return OrganizationModel.findByIdAndUpdate(id, { $set: patch }, {
        new: true,
        ...withSession(session),
      })
        .lean()
        .exec();
    },

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
      return UserModel.findByIdAndUpdate(id, { $set: patch }, {
        new: true,
        ...withSession(session),
      })
        .lean()
        .exec();
    },

    async findMembership(organizationId, userId) {
      return OrganizationMembershipModel.findOne({ organizationId, userId }).lean().exec();
    },

    async insertMembership(session, doc) {
      const [created] = await OrganizationMembershipModel.create([doc], withSession(session));
      return created.toObject();
    },

    async updateMembership(session, id, patch) {
      return OrganizationMembershipModel.findByIdAndUpdate(id, { $set: patch }, {
        new: true,
        ...withSession(session),
      })
        .lean()
        .exec();
    },

    async findSubscriptionByOrganizationId(organizationId) {
      return SubscriptionModel.findOne({ organizationId }).lean().exec();
    },

    async insertSubscription(session, doc) {
      const [created] = await SubscriptionModel.create([doc], withSession(session));
      return created.toObject();
    },

    async updateSubscription(session, id, patch) {
      return SubscriptionModel.findByIdAndUpdate(id, { $set: patch }, {
        new: true,
        ...withSession(session),
      })
        .lean()
        .exec();
    },

    async findActivationTokenByHash(tokenHash) {
      return AccountActivationTokenModel.findOne({ tokenHash }).lean().exec();
    },

    async insertActivationToken(session, doc) {
      const [created] = await AccountActivationTokenModel.create([doc], withSession(session));
      return created.toObject();
    },

    async updateActivationToken(session, id, patch) {
      return AccountActivationTokenModel.findByIdAndUpdate(id, { $set: patch }, {
        new: true,
        ...withSession(session),
      })
        .lean()
        .exec();
    },

    async appendAuditEvent(session, event) {
      await AuditEventModel.create([event], withSession(session));
    },
  };
}

function createMongooseTransactionSessionPort() {
  return {
    async startSession() {
      return mongoose.startSession();
    },
    /**
     * @param {import('mongoose').ClientSession} session
     * @param {(activeSession: import('mongoose').ClientSession) => Promise<unknown>} fn
     */
    async withTransaction(session, fn) {
      return session.withTransaction(async () => fn(session));
    },
    /**
     * @param {import('mongoose').ClientSession} session
     */
    async endSession(session) {
      await session.endSession();
    },
  };
}

module.exports = {
  createMongooseOnboardingStore,
  createMongooseTransactionSessionPort,
};
