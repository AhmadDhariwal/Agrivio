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
    async listBranches(organizationId, filter = {}, pagination = {}) {
      const query = { organizationId };
      if (filter.status === 'active' || filter.status === 'inactive') query.status = filter.status;
      const search = String(filter.search ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
      if (search) query.nameNormalized = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') };
      const { skip, pageSize } = pagination;
      let find = BranchModel.find(query).sort({ createdAt: -1, _id: -1 });
      if (skip !== undefined || pageSize !== undefined) find = find.skip(skip ?? 0).limit(pageSize ?? 25);
      const [total, items] = await Promise.all([BranchModel.countDocuments(query).exec(), find.lean().exec()]);
      return { items, total };
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

    async deleteBranch(session, organizationId, id) {
      const result = await BranchModel.deleteOne({ _id: id, organizationId }, withSession(session));
      return result.deletedCount === 1;
    },

    async listWarehouses(organizationId, filter = {}, pagination = {}) {
      const query = { organizationId };
      if (filter.status === 'active' || filter.status === 'inactive') query.status = filter.status;
      const search = String(filter.search ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
      if (search) query.nameNormalized = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') };
      const { skip, pageSize } = pagination;
      let find = WarehouseModel.find(query).sort({ createdAt: -1, _id: -1 });
      if (skip !== undefined || pageSize !== undefined) find = find.skip(skip ?? 0).limit(pageSize ?? 25);
      const [total, items] = await Promise.all([WarehouseModel.countDocuments(query).exec(), find.lean().exec()]);
      return { items, total };
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

    async findWarehousesByIds(organizationId, warehouseIds) {
      if (!Array.isArray(warehouseIds) || warehouseIds.length === 0) {
        return [];
      }
      const ids = warehouseIds.filter((id) => mongoose.isValidObjectId(id));
      if (ids.length === 0) {
        return [];
      }
      return WarehouseModel.find({ organizationId, _id: { $in: ids } }).lean().exec();
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

    async deleteWarehouse(session, organizationId, id) {
      const result = await WarehouseModel.deleteOne({ _id: id, organizationId }, withSession(session));
      return result.deletedCount === 1;
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
    async listBranches(organizationId, filter = {}, pagination = {}) {
      let items = [...branches.values()].filter((item) => String(item.organizationId) === String(organizationId));
      if (filter.status === 'active' || filter.status === 'inactive') items = items.filter((item) => item.status === filter.status);
      const search = String(filter.search ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
      if (search) items = items.filter((item) => String(item.nameNormalized).includes(search));
      items.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')) || String(b._id).localeCompare(String(a._id)));
      const total = items.length; const { skip, pageSize } = pagination;
      if (skip !== undefined || pageSize !== undefined) items = items.slice(skip ?? 0, (skip ?? 0) + (pageSize ?? 25));
      return { items: items.map((item) => ({ ...item })), total };
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

    async deleteBranch(_session, organizationId, id) {
      const existing = await this.findBranchById(organizationId, id);
      if (existing === null) {
        return false;
      }
      branches.delete(id);
      return true;
    },

    async listWarehouses(organizationId, filter = {}, pagination = {}) {
      let items = [...warehouses.values()].filter((item) => String(item.organizationId) === String(organizationId));
      if (filter.status === 'active' || filter.status === 'inactive') items = items.filter((item) => item.status === filter.status);
      const search = String(filter.search ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
      if (search) items = items.filter((item) => String(item.nameNormalized).includes(search));
      items.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')) || String(b._id).localeCompare(String(a._id)));
      const total = items.length; const { skip, pageSize } = pagination;
      if (skip !== undefined || pageSize !== undefined) items = items.slice(skip ?? 0, (skip ?? 0) + (pageSize ?? 25));
      return { items: items.map((item) => ({ ...item })), total };
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

    async findWarehousesByIds(organizationId, warehouseIds) {
      if (!Array.isArray(warehouseIds) || warehouseIds.length === 0) {
        return [];
      }
      const allowed = new Set(warehouseIds.map(String));
      return [...warehouses.values()]
        .filter(
          (item) =>
            String(item.organizationId) === String(organizationId) &&
            allowed.has(String(item._id)),
        )
        .map((item) => ({ ...item }));
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

    async deleteWarehouse(_session, organizationId, id) {
      const existing = await this.findWarehouseById(organizationId, id);
      if (existing === null) {
        return false;
      }
      warehouses.delete(id);
      return true;
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
