const mongoose = require('mongoose');
const {
  AccountActivationTokenModel,
  OrganizationMembershipModel,
  UserModel,
  AuthSessionModel,
} = require('./persistence/identity.model');
const { AuditEventModel } = require('../audit/persistence/audit-event.model');
const { AccessAssignmentModel } = require('../locations/persistence/access-assignment.model');

function withSession(session) {
  return session ? { session: session } : {};
}

function createMongooseEmployeesStore() {
  return {
    async listMembershipsByOrganizationId(organizationId) {
      return OrganizationMembershipModel.find({ organizationId }).sort({ createdAt: -1 }).lean().exec();
    },

    async listMembershipsPage(organizationId, filter = {}, pagination = {}) {
      const match = { organizationId: new mongoose.Types.ObjectId(String(organizationId)) };
      const search = String(filter.search ?? '').trim().toLowerCase();
      const pipeline = [
        { $match: match },
        { $lookup: { from: UserModel.collection.name, localField: 'userId', foreignField: '_id', as: 'user' } },
        { $unwind: '$user' },
      ];
      if (search) pipeline.push({ $match: { 'user.emailNormalized': { $regex: `^${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } } });
      pipeline.push(
        { $sort: { createdAt: -1, _id: -1 } },
        { $facet: { metadata: [{ $count: 'total' }], items: [{ $skip: pagination.skip ?? 0 }, { $limit: pagination.pageSize ?? 25 }] } },
      );
      const [result] = await OrganizationMembershipModel.aggregate(pipeline).exec();
      return { items: result?.items ?? [], total: result?.metadata?.[0]?.total ?? 0 };
    },

    async countActiveUsers(organizationId) {
      return OrganizationMembershipModel.countDocuments({
        organizationId,
        status: { $in: ['active', 'pending'] },
      }).exec();
    },

    async findMembershipByOrganizationAndUserId(organizationId, userId) {
      if (!mongoose.isValidObjectId(userId)) {
        return null;
      }
      return OrganizationMembershipModel.findOne({ organizationId, userId }).lean().exec();
    },

    async findMembershipsWithUsersByUserIds(organizationId, userIds) {
      if (!Array.isArray(userIds) || userIds.length === 0) {
        return [];
      }
      const objectIds = userIds
        .filter((id) => mongoose.isValidObjectId(id))
        .map((id) => new mongoose.Types.ObjectId(String(id)));
      if (objectIds.length === 0) {
        return [];
      }
      return OrganizationMembershipModel.aggregate([
        {
          $match: {
            organizationId: new mongoose.Types.ObjectId(String(organizationId)),
            userId: { $in: objectIds },
          },
        },
        {
          $lookup: {
            from: UserModel.collection.name,
            localField: 'userId',
            foreignField: '_id',
            as: 'user',
          },
        },
        { $unwind: '$user' },
      ]).exec();
    },

    async findMembershipById(organizationId, membershipId) {
      if (!mongoose.isValidObjectId(membershipId)) {
        return null;
      }
      return OrganizationMembershipModel.findOne({
        _id: membershipId,
        organizationId,
      })
        .lean()
        .exec();
    },

    async listMembershipsByOrganization(organizationId) {
      return this.listMembershipsByOrganizationId(organizationId);
    },

    async findUserById(id) {
      if (!mongoose.isValidObjectId(id)) {
        return null;
      }
      return UserModel.findById(id).lean().exec();
    },

    async findUserByEmailNormalized(emailNormalized) {
      return UserModel.findOne({ emailNormalized }).lean().exec();
    },

    async insertUser(session, doc) {
      const [created] = await UserModel.create([doc], withSession(session));
      return created.toObject();
    },

    async updateUser(session, id, patch) {
      return UserModel.findByIdAndUpdate(id, { $set: patch }, { new: true, ...withSession(session) })
        .lean()
        .exec();
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

    async insertActivationToken(session, doc) {
      const [created] = await AccountActivationTokenModel.create([doc], withSession(session));
      return created.toObject();
    },

    async consumeOpenActivationTokens(session, userId, organizationId, consumedAt) {
      await AccountActivationTokenModel.updateMany(
        {
          userId,
          organizationId,
          consumedAt: { $exists: false },
        },
        { $set: { consumedAt } },
        withSession(session),
      ).exec();
    },

    async listAccessAssignmentsByMembershipId(membershipId) {
      return AccessAssignmentModel.find({ membershipId, status: 'active' }).lean().exec();
    },

    async revokeAccessAssignmentsForMembership(session, membershipId, revokedAt) {
      await AccessAssignmentModel.updateMany(
        { membershipId, status: 'active' },
        {
          $set: { status: 'revoked' },
          $inc: { version: 1 },
        },
        withSession(session),
      ).exec();
      return revokedAt;
    },

    async revokeAllSessionsForUser(session, userId, revokedAt) {
      await AuthSessionModel.updateMany(
        { userId, revokedAt: { $exists: false } },
        { $set: { revokedAt } },
        withSession(session),
      ).exec();
    },

    async appendAuditEvent(session, event) {
      await AuditEventModel.create([event], withSession(session));
    },
  };
}

function createInMemoryEmployeesStore(options = {}) {
  const users = options.users ?? new Map();
  const memberships = options.memberships ?? new Map();
  const activationTokens = options.activationTokens ?? new Map();
  const assignments = options.assignments ?? new Map();
  const sessions = options.sessions ?? new Map();
  const audits = [];
  let seq = 1;

  return {
    users,
    memberships,
    activationTokens,
    assignments,
    sessions,

    async listMembershipsByOrganizationId(organizationId) {
      return [...memberships.values()]
        .filter((item) => String(item.organizationId) === String(organizationId))
        .map((item) => ({ ...item }));
    },

    async listMembershipsPage(organizationId, filter = {}, pagination = {}) {
      const items = await this.listMembershipsByOrganizationId(organizationId);
      const search = String(filter.search ?? '').trim().toLowerCase();
      const withUsers = [];
      for (const membership of items) {
        const user = await this.findUserById(String(membership.userId));
        if (user && (!search || String(user.emailNormalized).startsWith(search))) withUsers.push({ ...membership, user });
      }
      withUsers.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')) || String(b._id).localeCompare(String(a._id)));
      const total = withUsers.length; const skip = pagination.skip ?? 0;
      return { items: withUsers.slice(skip, skip + (pagination.pageSize ?? 25)), total };
    },

    async countActiveUsers(organizationId) {
      return [...memberships.values()].filter(
        (item) =>
          String(item.organizationId) === String(organizationId) &&
          (item.status === 'active' || item.status === 'pending'),
      ).length;
    },

    async findMembershipByOrganizationAndUserId(organizationId, userId) {
      for (const item of memberships.values()) {
        if (
          String(item.organizationId) === String(organizationId) &&
          String(item.userId) === String(userId)
        ) {
          return { ...item };
        }
      }
      return null;
    },

    async findMembershipsWithUsersByUserIds(organizationId, userIds) {
      if (!Array.isArray(userIds) || userIds.length === 0) {
        return [];
      }
      const idSet = new Set(userIds.map(String));
      const results = [];
      for (const membership of memberships.values()) {
        if (String(membership.organizationId) !== String(organizationId)) {
          continue;
        }
        const userId = String(membership.userId);
        if (!idSet.has(userId)) {
          continue;
        }
        const user = users.get(userId);
        if (user !== undefined) {
          results.push({ ...membership, user: { ...user } });
        }
      }
      return results;
    },

    async findMembershipById(organizationId, membershipId) {
      const item = memberships.get(membershipId);
      if (item === undefined || String(item.organizationId) !== String(organizationId)) {
        return null;
      }
      return { ...item };
    },

    async listMembershipsByOrganization(organizationId) {
      return this.listMembershipsByOrganizationId(organizationId);
    },

    async findUserById(id) {
      const user = users.get(id);
      return user === undefined ? null : { ...user };
    },

    async findUserByEmailNormalized(emailNormalized) {
      for (const user of users.values()) {
        if (user.emailNormalized === emailNormalized) {
          return { ...user };
        }
      }
      return null;
    },

    async insertUser(_session, doc) {
      const id = `user-${seq++}`;
      const record = { _id: id, ...doc };
      users.set(id, record);
      return { ...record };
    },

    async updateUser(_session, id, patch) {
      const existing = users.get(id);
      if (existing === undefined) {
        return null;
      }
      const next = { ...existing, ...patch };
      users.set(id, next);
      return { ...next };
    },

    async insertMembership(_session, doc) {
      const id = `membership-${seq++}`;
      const record = { _id: id, ...doc };
      memberships.set(id, record);
      return { ...record };
    },

    async updateMembership(_session, id, patch) {
      const existing = memberships.get(id);
      if (existing === undefined) {
        return null;
      }
      const next = { ...existing, ...patch };
      memberships.set(id, next);
      return { ...next };
    },

    async insertActivationToken(_session, doc) {
      const id = `activation-${seq++}`;
      const record = { _id: id, ...doc };
      activationTokens.set(id, record);
      return { ...record };
    },

    async consumeOpenActivationTokens(_session, userId, organizationId, consumedAt) {
      for (const [id, token] of activationTokens.entries()) {
        if (
          String(token.userId) === String(userId) &&
          String(token.organizationId) === String(organizationId) &&
          (token.consumedAt === undefined || token.consumedAt === null)
        ) {
          activationTokens.set(id, { ...token, consumedAt });
        }
      }
    },

    async listAccessAssignmentsByMembershipId(membershipId) {
      return [...assignments.values()]
        .filter(
          (item) => String(item.membershipId) === String(membershipId) && item.status === 'active',
        )
        .map((item) => ({ ...item }));
    },

    async revokeAccessAssignmentsForMembership(_session, membershipId) {
      for (const [id, assignment] of assignments.entries()) {
        if (
          String(assignment.membershipId) === String(membershipId) &&
          assignment.status === 'active'
        ) {
          assignments.set(id, {
            ...assignment,
            status: 'revoked',
            version: Number(assignment.version ?? 1) + 1,
          });
        }
      }
    },

    async revokeAllSessionsForUser(_session, userId, revokedAt) {
      for (const [id, session] of sessions.entries()) {
        if (String(session.userId) === String(userId) && session.revokedAt == null) {
          sessions.set(id, { ...session, revokedAt });
        }
      }
    },

    async appendAuditEvent(_session, event) {
      audits.push({ ...event });
    },

    listAuditsForTest() {
      return [...audits];
    },
  };
}

module.exports = {
  createMongooseEmployeesStore,
  createInMemoryEmployeesStore,
};
