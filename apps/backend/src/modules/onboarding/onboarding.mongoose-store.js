const mongoose = require('mongoose');
const { OrganizationModel } = require('../organizations/persistence/organization.model');
const {
  AccountActivationTokenModel,
  OrganizationMembershipModel,
  UserModel,
} = require('../identity/persistence/identity.model');
const { SubscriptionModel } = require('../subscriptions/persistence/subscription.model');
const { AuditEventModel } = require('../audit/persistence/audit-event.model');

function withSession(session) {
  return session ? { session: session } : {};
}

/**
 * Mongoose-backed onboarding persistence using frozen canonical collections only.
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

    async findOrganizationsByIds(ids) {
      const validIds = ids.filter((id) => mongoose.isValidObjectId(id));
      if (validIds.length === 0) {
        return [];
      }
      return OrganizationModel.find({ _id: { $in: validIds } })
        .lean()
        .exec();
    },

    async findOrganizationIdsBySearch(search) {
      const needle = String(search ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
      if (needle === '') {
        return [];
      }
      const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const organizations = await OrganizationModel.find({
        nameNormalized: { $regex: escaped },
      })
        .select({ _id: 1 })
        .lean()
        .exec();
      return organizations.map((organization) => String(organization._id));
    },

    async listOrganizations(filter = {}) {
      const query = {};
      if (filter.status !== undefined) {
        query['status'] = filter.status;
      }
      const search = String(filter.search ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
      if (search) query.nameNormalized = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') };
      let find = OrganizationModel.find(query).sort({ createdAt: -1, _id: -1 });
      if (filter.skip !== undefined || filter.pageSize !== undefined)
        find = find.skip(filter.skip ?? 0).limit(filter.pageSize ?? 25);
      const [total, items] = await Promise.all([
        OrganizationModel.countDocuments(query).exec(),
        find.lean().exec(),
      ]);
      return { items, total };
    },

    async insertOrganization(session, doc) {
      const [created] = await OrganizationModel.create([doc], withSession(session));
      return created.toObject();
    },

    async updateOrganization(session, id, patch) {
      return OrganizationModel.findByIdAndUpdate(
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

    async findUserByEmailNormalized(emailNormalized) {
      return UserModel.findOne({ emailNormalized }).lean().exec();
    },

    async findUserById(id) {
      if (!mongoose.isValidObjectId(id)) {
        return null;
      }
      return UserModel.findById(id).lean().exec();
    },

    async findUsersByIds(ids) {
      const validIds = ids.filter((id) => mongoose.isValidObjectId(id));
      if (validIds.length === 0) {
        return [];
      }
      return UserModel.find({ _id: { $in: validIds } })
        .lean()
        .exec();
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

    async findMembership(organizationId, userId) {
      return OrganizationMembershipModel.findOne({ organizationId, userId }).lean().exec();
    },

    async listMembershipsByUserId(userId) {
      return OrganizationMembershipModel.find({ userId }).lean().exec();
    },

    async listMembershipsByOrganizationId(organizationId) {
      return OrganizationMembershipModel.find({ organizationId })
        .sort({ createdAt: -1 })
        .lean()
        .exec();
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
        {
          new: true,
          ...withSession(session),
        },
      )
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
      return SubscriptionModel.findByIdAndUpdate(
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

    async findActivationTokenByHash(tokenHash) {
      return AccountActivationTokenModel.findOne({ tokenHash }).lean().exec();
    },

    async listOpenActivationTokens(filter) {
      const query = {
        userId: filter.userId,
        organizationId: filter.organizationId,
        $or: [{ consumedAt: null }, { consumedAt: { $exists: false } }],
      };
      return AccountActivationTokenModel.find(query).lean().exec();
    },

    async insertActivationToken(session, doc) {
      const [created] = await AccountActivationTokenModel.create([doc], withSession(session));
      return created.toObject();
    },

    async updateActivationToken(session, id, patch) {
      return AccountActivationTokenModel.findByIdAndUpdate(
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

function createMongooseTransactionSessionPort() {
  return {
    async startSession() {
      return mongoose.startSession();
    },
    async withTransaction(session, fn) {
      return session.withTransaction(async () => fn(session));
    },
    async endSession(session) {
      await session.endSession();
    },
  };
}

module.exports = {
  createMongooseOnboardingStore,
  createMongooseTransactionSessionPort,
};
