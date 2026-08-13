const mongoose = require('mongoose');
const { ProductBatchModel } = require('./persistence/product-batch.model');
const { StockMovementModel } = require('./persistence/stock-movement.model');
const { InventoryBalanceModel } = require('./persistence/inventory-balance.model');
const { InventoryCostStateModel } = require('./persistence/inventory-cost-state.model');
const { StockAdjustmentModel } = require('./persistence/stock-adjustment.model');
const { InventorySettingsModel } = require('./persistence/inventory-settings.model');
const { WarehouseTransferModel } = require('./persistence/warehouse-transfer.model');
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
      if (filters.sourceType) {
        query.sourceType = filters.sourceType;
      }
      if (filters.sourceId) {
        if (!mongoose.isValidObjectId(filters.sourceId)) {
          return [];
        }
        query.sourceId = filters.sourceId;
      }
      const find = StockMovementModel.find(query).sort({ postedAt: -1, createdAt: -1 });
      if (filters.session) {
        find.session(filters.session);
      }
      return find.lean().exec();
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

    async findInventorySettings(organizationId) {
      return InventorySettingsModel.findOne({ organizationId }).lean().exec();
    },

    async upsertInventorySettings(session, organizationId, patch) {
      const updated = await InventorySettingsModel.findOneAndUpdate(
        { organizationId },
        { $set: patch, $setOnInsert: { organizationId, version: 1 } },
        { upsert: true, new: true, ...withSession(session) },
      )
        .lean()
        .exec();
      return updated;
    },

    async findAdjustmentById(organizationId, id) {
      if (!mongoose.isValidObjectId(id)) {
        return null;
      }
      return StockAdjustmentModel.findOne({ _id: id, organizationId }).lean().exec();
    },

    async listAdjustments(organizationId, filters) {
      const query = { organizationId };
      if (filters.status) {
        query.status = filters.status;
      }
      if (filters.warehouseId) {
        query.warehouseId = filters.warehouseId;
      }
      return StockAdjustmentModel.find(query).sort({ createdAt: -1 }).lean().exec();
    },

    async insertAdjustment(session, doc) {
      try {
        const [created] = await StockAdjustmentModel.create([doc], withSession(session));
        return created.toObject();
      } catch (error) {
        throw markDuplicate(error);
      }
    },

    async updateAdjustmentConditional(session, organizationId, id, expectedVersion, patch) {
      const updated = await StockAdjustmentModel.findOneAndUpdate(
        { _id: id, organizationId, version: expectedVersion },
        { $set: { ...patch, version: expectedVersion + 1 } },
        { new: true, ...withSession(session) },
      )
        .lean()
        .exec();
      return updated;
    },

    async listPositiveBalancesWithBatchFacts(organizationId, filters) {
      const balanceQuery = { organizationId };
      if (filters.warehouseId) {
        balanceQuery.warehouseId = filters.warehouseId;
      }
      if (filters.productId) {
        balanceQuery.productId = filters.productId;
      }
      const balances = await InventoryBalanceModel.find(balanceQuery).lean().exec();
      const positive = balances.filter((row) => BigInt(String(row.quantityBaseMinorUnits ?? '0')) > 0n);

      const batchIds = positive
        .map((row) => row.batchId)
        .filter((batchId) => batchId !== null && batchId !== undefined);
      const batches =
        batchIds.length === 0
          ? []
          : await ProductBatchModel.find({ organizationId, _id: { $in: batchIds } }).lean().exec();
      const batchById = new Map(batches.map((row) => [String(row['_id']), row]));

      return positive.map((balance) => {
        const batch = balance.batchId ? batchById.get(String(balance.batchId)) : null;
        return {
          batchId: balance.batchId ?? null,
          batchNumber: batch ? batch.batchNumber : null,
          expiryDate: batch ? batch.expiryDate : null,
          firstReceivedAt: batch ? batch.firstReceivedAt : balance.createdAt,
          quantityBaseMinorUnits: balance.quantityBaseMinorUnits,
          warehouseId: balance.warehouseId,
          productId: balance.productId,
        };
      });
    },

    async findTransferById(organizationId, id) {
      if (!mongoose.isValidObjectId(id)) {
        return null;
      }
      return WarehouseTransferModel.findOne({ _id: id, organizationId }).lean().exec();
    },

    async listTransfers(organizationId, filters) {
      const query = { organizationId };
      if (filters.status) {
        query.status = filters.status;
      }
      if (filters.sourceWarehouseId) {
        query.sourceWarehouseId = filters.sourceWarehouseId;
      }
      if (filters.destinationWarehouseId) {
        query.destinationWarehouseId = filters.destinationWarehouseId;
      }
      return WarehouseTransferModel.find(query).sort({ createdAt: -1 }).lean().exec();
    },

    async insertTransfer(session, doc) {
      try {
        const [created] = await WarehouseTransferModel.create([doc], withSession(session));
        return created.toObject();
      } catch (error) {
        throw markDuplicate(error);
      }
    },

    async updateTransferConditional(session, organizationId, id, expectedVersion, patch) {
      const updated = await WarehouseTransferModel.findOneAndUpdate(
        { _id: id, organizationId, version: expectedVersion },
        { $set: { ...patch, version: expectedVersion + 1 } },
        { new: true, ...withSession(session) },
      )
        .lean()
        .exec();
      return updated;
    },

    async listAllBalances(organizationId) {
      return InventoryBalanceModel.find({ organizationId }).lean().exec();
    },

    async listAllCostStates(organizationId) {
      return InventoryCostStateModel.find({ organizationId }).lean().exec();
    },

    async listAllMovements(organizationId) {
      return StockMovementModel.find({ organizationId, status: 'posted' }).lean().exec();
    },
  };
}

function createInMemoryInventoryStore() {
  const batches = new Map();
  const movements = new Map();
  const balances = new Map();
  const costStates = new Map();
  const adjustments = new Map();
  const transfers = new Map();
  const inventorySettings = new Map();
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
          if (filters.sourceType && String(item.sourceType) !== String(filters.sourceType)) {
            return false;
          }
          if (filters.sourceId && String(item.sourceId) !== String(filters.sourceId)) {
            return false;
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

    async findInventorySettings(organizationId) {
      const record = inventorySettings.get(String(organizationId));
      return record ? { ...record } : null;
    },

    async upsertInventorySettings(session, organizationId, patch) {
      void session;
      const existing = inventorySettings.get(String(organizationId));
      const updated = {
        organizationId,
        expiryThresholdDays: 30,
        version: 1,
        ...existing,
        ...patch,
        updatedAt: new Date(),
        createdAt: existing?.createdAt ?? new Date(),
        _id: existing?._id ?? nextId(),
      };
      inventorySettings.set(String(organizationId), updated);
      return { ...updated };
    },

    async findAdjustmentById(organizationId, id) {
      const record = adjustments.get(String(id));
      if (!record || String(record.organizationId) !== String(organizationId)) {
        return null;
      }
      return { ...record };
    },

    async listAdjustments(organizationId, filters) {
      return [...adjustments.values()]
        .filter((item) => {
          if (String(item.organizationId) !== String(organizationId)) {
            return false;
          }
          if (filters.status && item.status !== filters.status) {
            return false;
          }
          if (filters.warehouseId && String(item.warehouseId) !== String(filters.warehouseId)) {
            return false;
          }
          return true;
        })
        .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
        .map((item) => ({ ...item }));
    },

    async insertAdjustment(session, doc) {
      void session;
      const created = {
        _id: doc._id ?? nextId(),
        ...doc,
        version: doc.version ?? 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      adjustments.set(String(created._id), created);
      return { ...created };
    },

    async updateAdjustmentConditional(session, organizationId, id, expectedVersion, patch) {
      void session;
      const record = adjustments.get(String(id));
      if (!record || String(record.organizationId) !== String(organizationId)) {
        return null;
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
      adjustments.set(String(id), updated);
      return { ...updated };
    },

    async listPositiveBalancesWithBatchFacts(organizationId, filters) {
      const rows = [...balances.values()].filter((item) => {
        if (String(item.organizationId) !== String(organizationId)) {
          return false;
        }
        if (filters.warehouseId && String(item.warehouseId) !== String(filters.warehouseId)) {
          return false;
        }
        if (filters.productId && String(item.productId) !== String(filters.productId)) {
          return false;
        }
        return BigInt(String(item.quantityBaseMinorUnits ?? '0')) > 0n;
      });

      return rows.map((balance) => {
        const batch = balance.batchId ? batches.get(String(balance.batchId)) : null;
        return {
          batchId: balance.batchId ?? null,
          batchNumber: batch ? batch.batchNumber : null,
          expiryDate: batch ? batch.expiryDate : null,
          firstReceivedAt: batch ? batch.firstReceivedAt : balance.createdAt,
          quantityBaseMinorUnits: balance.quantityBaseMinorUnits,
          warehouseId: balance.warehouseId,
          productId: balance.productId,
        };
      });
    },

    async findTransferById(organizationId, id) {
      const record = transfers.get(String(id));
      if (!record || String(record.organizationId) !== String(organizationId)) {
        return null;
      }
      return { ...record };
    },

    async listTransfers(organizationId, filters) {
      return [...transfers.values()]
        .filter((item) => {
          if (String(item.organizationId) !== String(organizationId)) {
            return false;
          }
          if (filters.status && item.status !== filters.status) {
            return false;
          }
          if (
            filters.sourceWarehouseId &&
            String(item.sourceWarehouseId) !== String(filters.sourceWarehouseId)
          ) {
            return false;
          }
          if (
            filters.destinationWarehouseId &&
            String(item.destinationWarehouseId) !== String(filters.destinationWarehouseId)
          ) {
            return false;
          }
          return true;
        })
        .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
        .map((item) => ({ ...item }));
    },

    async insertTransfer(session, doc) {
      void session;
      const created = {
        _id: doc._id ?? nextId(),
        ...doc,
        version: doc.version ?? 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      transfers.set(String(created._id), created);
      return { ...created };
    },

    async updateTransferConditional(session, organizationId, id, expectedVersion, patch) {
      void session;
      const record = transfers.get(String(id));
      if (!record || String(record.organizationId) !== String(organizationId)) {
        return null;
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
      transfers.set(String(id), updated);
      return { ...updated };
    },

    async listAllBalances(organizationId) {
      return [...balances.values()]
        .filter((item) => String(item.organizationId) === String(organizationId))
        .map((item) => ({ ...item }));
    },

    async listAllCostStates(organizationId) {
      return [...costStates.values()]
        .filter((item) => String(item.organizationId) === String(organizationId))
        .map((item) => ({ ...item }));
    },

    async listAllMovements(organizationId) {
      return [...movements.values()]
        .filter(
          (item) =>
            String(item.organizationId) === String(organizationId) && item.status === 'posted',
        )
        .map((item) => ({ ...item }));
    },

    _debug: {
      batches,
      movements,
      balances,
      costStates,
      adjustments,
      transfers,
      inventorySettings,
      audits,
    },
  };
}

module.exports = {
  createMongooseInventoryStore,
  createInMemoryInventoryStore,
};
