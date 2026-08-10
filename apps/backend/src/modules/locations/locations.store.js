const mongoose = require('mongoose');
const { BranchModel } = require('./persistence/branch.model');
const { WarehouseModel } = require('./persistence/warehouse.model');
const { AccessAssignmentModel } = require('./persistence/access-assignment.model');
const { AuditEventModel } = require('../audit/persistence/audit-event.model');

function withSession(session) {
  return session ? { session: session } : {};
}

function isDuplicateKeyError(error) {
  return error && (error.code === 11000 || error.code === 11001);
}

function createMongooseLocationsStore() {
  return {
    async listBranches(organizationId) {
      return BranchModel.find({ organizationId }).sort({ createdAt: -1 }).lean().exec();
    },

    async countBranches(organizationId) {
      return BranchModel.countDocuments({ organizationId }).exec();
    },

    async findBranchById(organizationId, id) {
      if (!mongoose.isValidObjectId(id)) {
        return null;
      }
      return BranchModel.findOne({ _id: id, organizationId }).lean().exec();
    },

    async insertBranch(session, doc) {
      try {
        const [created] = await BranchModel.create([doc], withSession(session));
        return created.toObject();
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          error.agrivioDuplicate = true;
        }
        throw error;
      }
    },

    async updateBranch(session, organizationId, id, patch) {
      try {
        return await BranchModel.findOneAndUpdate(
          { _id: id, organizationId },
          { $set: patch },
          { new: true, ...withSession(session) },
        )
          .lean()
          .exec();
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          error.agrivioDuplicate = true;
        }
        throw error;
      }
    },

    async listWarehouses(organizationId) {
      return WarehouseModel.find({ organizationId }).sort({ createdAt: -1 }).lean().exec();
    },

    async countWarehouses(organizationId) {
      return WarehouseModel.countDocuments({ organizationId }).exec();
    },

    async findWarehouseById(organizationId, id) {
      if (!mongoose.isValidObjectId(id)) {
        return null;
      }
      return WarehouseModel.findOne({ _id: id, organizationId }).lean().exec();
    },

    async insertWarehouse(session, doc) {
      try {
        const [created] = await WarehouseModel.create([doc], withSession(session));
        return created.toObject();
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          error.agrivioDuplicate = true;
        }
        throw error;
      }
    },

    async updateWarehouse(session, organizationId, id, patch) {
      try {
        return await WarehouseModel.findOneAndUpdate(
          { _id: id, organizationId },
          { $set: patch },
          { new: true, ...withSession(session) },
        )
          .lean()
          .exec();
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          error.agrivioDuplicate = true;
        }
        throw error;
      }
    },

    async listAccessAssignmentsByMembershipId(organizationId, membershipId) {
      return AccessAssignmentModel.find({ organizationId, membershipId }).lean().exec();
    },

    async insertAccessAssignment(session, doc) {
      const [created] = await AccessAssignmentModel.create([doc], withSession(session));
      return created.toObject();
    },

    async updateAccessAssignment(session, id, patch) {
      return AccessAssignmentModel.findByIdAndUpdate(
        id,
        { $set: patch },
        { new: true, ...withSession(session) },
      )
        .lean()
        .exec();
    },

    async appendAuditEvent(session, event) {
      await AuditEventModel.create([event], withSession(session));
    },
  };
}

function createInMemoryLocationsStore() {
  const branches = new Map();
  const warehouses = new Map();
  const assignments = new Map();
  const audits = [];
  let seq = 1;

  function assertUniqueBranch(organizationId, nameNormalized, invoicePrefixNormalized, excludeId) {
    for (const record of branches.values()) {
      if (String(record.organizationId) !== String(organizationId)) {
        continue;
      }
      if (excludeId !== undefined && String(record._id) === String(excludeId)) {
        continue;
      }
      if (record.nameNormalized === nameNormalized || record.invoicePrefixNormalized === invoicePrefixNormalized) {
        const error = new Error('Duplicate branch');
        error.agrivioDuplicate = true;
        throw error;
      }
    }
  }

  function assertUniqueWarehouse(organizationId, nameNormalized, excludeId) {
    for (const record of warehouses.values()) {
      if (String(record.organizationId) !== String(organizationId)) {
        continue;
      }
      if (excludeId !== undefined && String(record._id) === String(excludeId)) {
        continue;
      }
      if (record.nameNormalized === nameNormalized) {
        const error = new Error('Duplicate warehouse');
        error.agrivioDuplicate = true;
        throw error;
      }
    }
  }

  return {
    async listBranches(organizationId) {
      return [...branches.values()]
        .filter((item) => String(item.organizationId) === String(organizationId))
        .map((item) => ({ ...item }));
    },

    async countBranches(organizationId) {
      return [...branches.values()].filter(
        (item) => String(item.organizationId) === String(organizationId),
      ).length;
    },

    async findBranchById(organizationId, id) {
      const record = branches.get(id);
      if (record === undefined || String(record.organizationId) !== String(organizationId)) {
        return null;
      }
      return { ...record };
    },

    async insertBranch(_session, doc) {
      assertUniqueBranch(doc.organizationId, doc.nameNormalized, doc.invoicePrefixNormalized);
      const id = `branch-${seq++}`;
      const record = { _id: id, ...doc };
      branches.set(id, record);
      return { ...record };
    },

    async updateBranch(_session, organizationId, id, patch) {
      const existing = await this.findBranchById(organizationId, id);
      if (existing === null) {
        return null;
      }
      const next = { ...existing, ...patch };
      assertUniqueBranch(
        organizationId,
        next.nameNormalized,
        next.invoicePrefixNormalized,
        id,
      );
      branches.set(id, next);
      return { ...next };
    },

    async listWarehouses(organizationId) {
      return [...warehouses.values()]
        .filter((item) => String(item.organizationId) === String(organizationId))
        .map((item) => ({ ...item }));
    },

    async countWarehouses(organizationId) {
      return [...warehouses.values()].filter(
        (item) => String(item.organizationId) === String(organizationId),
      ).length;
    },

    async findWarehouseById(organizationId, id) {
      const record = warehouses.get(id);
      if (record === undefined || String(record.organizationId) !== String(organizationId)) {
        return null;
      }
      return { ...record };
    },

    async insertWarehouse(_session, doc) {
      assertUniqueWarehouse(doc.organizationId, doc.nameNormalized);
      const id = `warehouse-${seq++}`;
      const record = { _id: id, ...doc };
      warehouses.set(id, record);
      return { ...record };
    },

    async updateWarehouse(_session, organizationId, id, patch) {
      const existing = await this.findWarehouseById(organizationId, id);
      if (existing === null) {
        return null;
      }
      const next = { ...existing, ...patch };
      assertUniqueWarehouse(organizationId, next.nameNormalized, id);
      warehouses.set(id, next);
      return { ...next };
    },

    async listAccessAssignmentsByMembershipId(organizationId, membershipId) {
      return [...assignments.values()]
        .filter(
          (item) =>
            String(item.organizationId) === String(organizationId) &&
            String(item.membershipId) === String(membershipId),
        )
        .map((item) => ({ ...item }));
    },

    async listAccessAssignmentsByMembershipOnly(membershipId) {
      return [...assignments.values()]
        .filter(
          (item) =>
            String(item.membershipId) === String(membershipId) && item.status === 'active',
        )
        .map((item) => ({ ...item }));
    },

    async insertAccessAssignment(_session, doc) {
      const id = `assignment-${seq++}`;
      const record = { _id: id, ...doc };
      assignments.set(id, record);
      return { ...record };
    },

    async updateAccessAssignment(_session, id, patch) {
      const existing = assignments.get(id);
      if (existing === undefined) {
        return null;
      }
      const next = { ...existing, ...patch };
      assignments.set(id, next);
      return { ...next };
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
  createMongooseLocationsStore,
  createInMemoryLocationsStore,
};
