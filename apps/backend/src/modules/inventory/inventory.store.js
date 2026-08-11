const mongoose = require('mongoose');
const { ProductBatchModel } = require('./persistence/product-batch.model');
const { StockMovementModel } = require('./persistence/stock-movement.model');
const { InventoryBalanceModel } = require('./persistence/inventory-balance.model');
const { InventoryCostStateModel } = require('./persistence/inventory-cost-state.model');
const { AuditEventModel } = require('../audit/persistence/audit-event.model');

function withSession(session) {
  return session ? { session } : {};
}

function isDuplicateKeyError(error) {
  return error && (error.code === 11000 || error.code === 11001);
}

function markDuplicate(error) {
  if (isDuplicateKeyError(error)) {
    error.agrivioDuplicate = true;
  }
  return error;
}

function batchKey(batchId) {
  return batchId === null || batchId === undefined || batchId === '' ? null : String(batchId);
}

function createMongooseInventoryStore() {
  return {
    async findBatchById(organizationId, id) {
      if (!mongoose.isValidObjectId(id)) {
        return null;
      }
      return ProductBatchModel.findOne({ _id: id, organizationId }).lean().exec();
    },

    async findBatchByNumber(organizationId, productId, batchNumber) {
      return ProductBatchModel.findOne({ organizationId, productId, batchNumber }).lean().exec();
    },

    async listBatches(organizationId, filters) {
      const query = { organizationId };
      if (filters.productId) {
        query.productId = filters.productId;
      }
      return ProductBatchModel.find(query).sort({ firstReceivedAt: 1, createdAt: 1 }).lean().exec();
    },

    async insertBatch(session, doc) {
      try {
        const [created] = await ProductBatchModel.create([doc], withSession(session));
        return created.toObject();
      } catch (error) {
        throw markDuplicate(error);
      }
    },

    async insertMovement(session, doc) {
      try {
        const [created] = await StockMovementModel.create([doc], withSession(session));
        return created.toObject();
      } catch (error) {
        throw markDuplicate(error);
      }
    },

    async listMovements(organizationId, filters) {
      const query = { organizationId, status: 'posted' };
      if (filters.warehouseId) {
        query.warehouseId = filters.warehouseId;
      }
      if (filters.productId) {
        query.productId = filters.productId;
      }
      if (filters.batchId !== undefined) {
        query.batchId = filters.batchId;
      }
      return StockMovementModel.find(query).sort({ postedAt: -1, createdAt: -1 }).lean().exec();
    },

    async sumMovementSignedQuantity(organizationId, scope) {
      const query = {
        organizationId,
        warehouseId: scope.warehouseId,
        productId: scope.productId,
        status: 'posted',
      };
      if (scope.batchId === null) {
        query.batchId = null;
      } else if (scope.batchId !== undefined) {
        query.batchId = scope.batchId;
      }
      const records = await StockMovementModel.find(query)
        .select('direction quantityBaseMinorUnits')
        .lean()
        .exec();
      let total = 0n;
      for (const record of records) {
        const qty = BigInt(String(record.quantityBaseMinorUnits ?? '0'));
        total += record.direction === 'inbound' ? qty : -qty;
      }
      return total.toString();
    },

    async findBalance(organizationId, warehouseId, productId, batchId) {
      return InventoryBalanceModel.findOne({
        organizationId,
        warehouseId,
        productId,
        batchId: batchId ?? null,
      })
        .lean()
        .exec();
    },

    async listBalances(organizationId, filters) {
      const query = { organizationId };
      if (filters.warehouseId) {
        query.warehouseId = filters.warehouseId;
      }
      if (filters.productId) {
        query.productId = filters.productId;
      }
      if (filters.batchId !== undefined) {
        query.batchId = filters.batchId;
      }
      return InventoryBalanceModel.find(query).sort({ updatedAt: -1 }).lean().exec();
    },

    async insertBalance(session, doc) {
      try {
        const [created] = await InventoryBalanceModel.create([doc], withSession(session));
        return created.toObject();
      } catch (error) {
        throw markDuplicate(error);
      }
    },

    async updateBalanceConditional(session, organizationId, id, expectedVersion, patch) {
      const updated = await InventoryBalanceModel.findOneAndUpdate(
        { _id: id, organizationId, version: expectedVersion },
        { $set: { ...patch, version: expectedVersion + 1 } },
        { new: true, ...withSession(session) },
      )
        .lean()
        .exec();
      return updated;
    },

    async findCostState(organizationId, warehouseId, productId) {
      return InventoryCostStateModel.findOne({ organizationId, warehouseId, productId })
        .lean()
        .exec();
    },

    async listCostStates(organizationId, filters) {
      const query = { organizationId };
      if (filters.warehouseId) {
        query.warehouseId = filters.warehouseId;
      }
      if (filters.productId) {
        query.productId = filters.productId;
      }
      return InventoryCostStateModel.find(query).lean().exec();
    },

    async insertCostState(session, doc) {
      try {
        const [created] = await InventoryCostStateModel.create([doc], withSession(session));
        return created.toObject();
      } catch (error) {
        throw markDuplicate(error);
      }
    },

    async updateCostStateConditional(session, organizationId, id, expectedVersion, patch) {
      const updated = await InventoryCostStateModel.findOneAndUpdate(
        { _id: id, organizationId, version: expectedVersion },
        { $set: { ...patch, version: expectedVersion + 1 } },
        { new: true, ...withSession(session) },
      )
        .lean()
        .exec();
      return updated;
    },

    async appendAuditEvent(session, event) {
      await AuditEventModel.create([event], withSession(session));
    },
  };
}

function createInMemoryInventoryStore() {
  const batches = new Map();
  const movements = new Map();
  const balances = new Map();
  const costStates = new Map();
  const audits = [];
  let seq = 1;

  function nextId() {
    const id = `inv_${seq}`;
    seq += 1;
    return id;
  }

  function balanceMapKey(organizationId, warehouseId, productId, batchId) {
    return `${organizationId}|${warehouseId}|${productId}|${batchKey(batchId)}`;
  }

  function costMapKey(organizationId, warehouseId, productId) {
    return `${organizationId}|${warehouseId}|${productId}`;
  }

  return {
    async findBatchById(organizationId, id) {
      const record = batches.get(String(id));
      if (!record || String(record.organizationId) !== String(organizationId)) {
        return null;
      }
      return { ...record };
    },

    async findBatchByNumber(organizationId, productId, batchNumber) {
      for (const record of batches.values()) {
        if (
          String(record.organizationId) === String(organizationId) &&
          String(record.productId) === String(productId) &&
          record.batchNumber === batchNumber
        ) {
          return { ...record };
        }
      }
      return null;
    },

    async listBatches(organizationId, filters) {
      return [...batches.values()]
        .filter((item) => {
          if (String(item.organizationId) !== String(organizationId)) {
            return false;
          }
          if (filters.productId && String(item.productId) !== String(filters.productId)) {
            return false;
          }
          return true;
        })
        .sort((a, b) => String(a.firstReceivedAt).localeCompare(String(b.firstReceivedAt)))
        .map((item) => ({ ...item }));
    },

    async insertBatch(session, doc) {
      void session;
      const existing = await this.findBatchByNumber(
        doc.organizationId,
        doc.productId,
        doc.batchNumber,
      );
      if (existing !== null) {
        const error = new Error('Duplicate batch');
        error.agrivioDuplicate = true;
        throw error;
      }
      const created = {
        _id: doc._id ?? nextId(),
        ...doc,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      batches.set(String(created._id), created);
      return { ...created };
    },

    async insertMovement(session, doc) {
      void session;
      const created = {
        _id: doc._id ?? nextId(),
        ...doc,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      movements.set(String(created._id), created);
      return { ...created };
    },

    async listMovements(organizationId, filters) {
      return [...movements.values()]
        .filter((item) => {
          if (String(item.organizationId) !== String(organizationId)) {
            return false;
          }
          if (item.status !== 'posted') {
            return false;
          }
          if (filters.warehouseId && String(item.warehouseId) !== String(filters.warehouseId)) {
            return false;
          }
          if (filters.productId && String(item.productId) !== String(filters.productId)) {
            return false;
          }
          if (filters.batchId !== undefined) {
            if (batchKey(item.batchId) !== batchKey(filters.batchId)) {
              return false;
            }
          }
          return true;
        })
        .sort((a, b) => String(b.postedAt).localeCompare(String(a.postedAt)))
        .map((item) => ({ ...item }));
    },

    async sumMovementSignedQuantity(organizationId, scope) {
      const records = await this.listMovements(organizationId, {
        warehouseId: scope.warehouseId,
        productId: scope.productId,
        batchId: scope.batchId,
      });
      let total = 0n;
      for (const record of records) {
        const qty = BigInt(String(record.quantityBaseMinorUnits ?? '0'));
        total += record.direction === 'inbound' ? qty : -qty;
      }
      return total.toString();
    },

    async findBalance(organizationId, warehouseId, productId, batchId) {
      const record = balances.get(
        balanceMapKey(organizationId, warehouseId, productId, batchId),
      );
      return record ? { ...record } : null;
    },

    async listBalances(organizationId, filters) {
      return [...balances.values()]
        .filter((item) => {
          if (String(item.organizationId) !== String(organizationId)) {
            return false;
          }
          if (filters.warehouseId && String(item.warehouseId) !== String(filters.warehouseId)) {
            return false;
          }
          if (filters.productId && String(item.productId) !== String(filters.productId)) {
            return false;
          }
          if (filters.batchId !== undefined) {
            if (batchKey(item.batchId) !== batchKey(filters.batchId)) {
              return false;
            }
          }
          return true;
        })
        .map((item) => ({ ...item }));
    },

    async insertBalance(session, doc) {
      void session;
      const key = balanceMapKey(doc.organizationId, doc.warehouseId, doc.productId, doc.batchId);
      if (balances.has(key)) {
        const error = new Error('Duplicate balance');
        error.agrivioDuplicate = true;
        throw error;
      }
      const created = {
        _id: doc._id ?? nextId(),
        ...doc,
        batchId: doc.batchId ?? null,
        version: doc.version ?? 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      balances.set(key, created);
      return { ...created };
    },

    async updateBalanceConditional(session, organizationId, id, expectedVersion, patch) {
      void session;
      for (const [key, record] of balances.entries()) {
        if (String(record._id) !== String(id) || String(record.organizationId) !== String(organizationId)) {
          continue;
        }
        if (Number(record.version) !== Number(expectedVersion)) {
          return null;
        }
        const updated = {
          ...record,
          ...patch,
          version: expectedVersion + 1,
          updatedAt: new Date(),
        };
        balances.set(key, updated);
        return { ...updated };
      }
      return null;
    },

    async findCostState(organizationId, warehouseId, productId) {
      const record = costStates.get(costMapKey(organizationId, warehouseId, productId));
      return record ? { ...record } : null;
    },

    async listCostStates(organizationId, filters) {
      return [...costStates.values()]
        .filter((item) => {
          if (String(item.organizationId) !== String(organizationId)) {
            return false;
          }
          if (filters.warehouseId && String(item.warehouseId) !== String(filters.warehouseId)) {
            return false;
          }
          if (filters.productId && String(item.productId) !== String(filters.productId)) {
            return false;
          }
          return true;
        })
        .map((item) => ({ ...item }));
    },

    async insertCostState(session, doc) {
      void session;
      const key = costMapKey(doc.organizationId, doc.warehouseId, doc.productId);
      if (costStates.has(key)) {
        const error = new Error('Duplicate cost state');
        error.agrivioDuplicate = true;
        throw error;
      }
      const created = {
        _id: doc._id ?? nextId(),
        ...doc,
        version: doc.version ?? 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      costStates.set(key, created);
      return { ...created };
    },

    async updateCostStateConditional(session, organizationId, id, expectedVersion, patch) {
      void session;
      for (const [key, record] of costStates.entries()) {
        if (String(record._id) !== String(id) || String(record.organizationId) !== String(organizationId)) {
          continue;
        }
        if (Number(record.version) !== Number(expectedVersion)) {
          return null;
        }
        const updated = {
          ...record,
          ...patch,
          version: expectedVersion + 1,
          updatedAt: new Date(),
        };
        costStates.set(key, updated);
        return { ...updated };
      }
      return null;
    },

    async appendAuditEvent(session, event) {
      void session;
      audits.push({ ...event, _id: nextId() });
    },

    _debug: {
      batches,
      movements,
      balances,
      costStates,
      audits,
    },
  };
}

module.exports = {
  createMongooseInventoryStore,
  createInMemoryInventoryStore,
};
