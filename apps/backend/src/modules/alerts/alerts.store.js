const mongoose = require('mongoose');
const { AlertSettingsModel } = require('./persistence/alert-settings.model');
const { LowStockThresholdModel } = require('./persistence/low-stock-threshold.model');
const { NotificationItemModel } = require('./persistence/notification-item.model');

function createMongooseAlertsStore() {
  return {
    async findAlertSettings(organizationId) {
      if (!mongoose.isValidObjectId(organizationId)) {
        return null;
      }
      return AlertSettingsModel.findOne({ organizationId }).lean().exec();
    },

    async upsertAlertSettings(organizationId, patch) {
      return AlertSettingsModel.findOneAndUpdate(
        { organizationId },
        {
          $set: {
            deadStockInactivityDays: patch.deadStockInactivityDays,
          },
          $setOnInsert: {
            organizationId,
            version: 1,
          },
          $inc: { version: 0 },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
        .lean()
        .exec();
    },

    async listLowStockThresholds(organizationId) {
      if (!mongoose.isValidObjectId(organizationId)) {
        return [];
      }
      return LowStockThresholdModel.find({ organizationId }).lean().exec();
    },

    async upsertLowStockThreshold(organizationId, input) {
      return LowStockThresholdModel.findOneAndUpdate(
        {
          organizationId,
          productId: input.productId,
          warehouseId: input.warehouseId,
        },
        {
          $set: {
            thresholdQuantityBaseMinorUnits: String(input.thresholdQuantityBaseMinorUnits),
          },
          $setOnInsert: {
            organizationId,
            productId: input.productId,
            warehouseId: input.warehouseId,
            version: 1,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
        .lean()
        .exec();
    },

    async listNotificationItems(organizationId) {
      if (!mongoose.isValidObjectId(organizationId)) {
        return [];
      }
      return NotificationItemModel.find({ organizationId })
        .sort({ updatedAt: -1 })
        .lean()
        .exec();
    },

    async findNotificationById(organizationId, id) {
      if (!mongoose.isValidObjectId(organizationId) || !mongoose.isValidObjectId(id)) {
        return null;
      }
      return NotificationItemModel.findOne({ _id: id, organizationId }).lean().exec();
    },

    async upsertNotificationItem(organizationId, item) {
      return NotificationItemModel.findOneAndUpdate(
        { organizationId, fingerprint: item.fingerprint },
        {
          $set: {
            alertType: item.alertType,
            title: item.title,
            body: item.body,
            subjectKey: item.subjectKey,
          },
          $setOnInsert: {
            organizationId,
            fingerprint: item.fingerprint,
            acknowledgedAt: null,
            acknowledgedBy: null,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
        .lean()
        .exec();
    },

    async acknowledgeNotification(organizationId, id, actorId, acknowledgedAt) {
      if (!mongoose.isValidObjectId(organizationId) || !mongoose.isValidObjectId(id)) {
        return null;
      }
      return NotificationItemModel.findOneAndUpdate(
        { _id: id, organizationId },
        {
          $set: {
            acknowledgedAt,
            acknowledgedBy: actorId,
          },
        },
        { new: true },
      )
        .lean()
        .exec();
    },
  };
}

function createInMemoryAlertsStore() {
  const settings = new Map();
  const thresholds = new Map();
  const notifications = new Map();
  let notificationSeq = 1;

  function thresholdKey(organizationId, productId, warehouseId) {
    return `${organizationId}::${productId}::${warehouseId}`;
  }

  return {
    async findAlertSettings(organizationId) {
      const record = settings.get(String(organizationId));
      return record ? { ...record } : null;
    },

    async upsertAlertSettings(organizationId, patch) {
      const key = String(organizationId);
      const existing = settings.get(key);
      const record = {
        _id: existing?._id ?? `alert-settings-${key}`,
        organizationId: key,
        deadStockInactivityDays: Number(patch.deadStockInactivityDays),
        version: existing ? Number(existing.version) + 1 : 1,
      };
      settings.set(key, record);
      return { ...record };
    },

    async listLowStockThresholds(organizationId) {
      return [...thresholds.values()]
        .filter((item) => String(item.organizationId) === String(organizationId))
        .map((item) => ({ ...item }));
    },

    async upsertLowStockThreshold(organizationId, input) {
      const key = thresholdKey(organizationId, input.productId, input.warehouseId);
      const existing = thresholds.get(key);
      const record = {
        _id: existing?._id ?? `low-stock-${key}`,
        organizationId: String(organizationId),
        productId: String(input.productId),
        warehouseId: String(input.warehouseId),
        thresholdQuantityBaseMinorUnits: String(input.thresholdQuantityBaseMinorUnits),
        version: existing ? Number(existing.version) + 1 : 1,
      };
      thresholds.set(key, record);
      return { ...record };
    },

    async listNotificationItems(organizationId) {
      return [...notifications.values()]
        .filter((item) => String(item.organizationId) === String(organizationId))
        .map((item) => ({ ...item }))
        .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
    },

    async findNotificationById(organizationId, id) {
      const record = notifications.get(String(id));
      if (!record || String(record.organizationId) !== String(organizationId)) {
        return null;
      }
      return { ...record };
    },

    async upsertNotificationItem(organizationId, item) {
      const existing = [...notifications.values()].find(
        (row) =>
          String(row.organizationId) === String(organizationId) &&
          row.fingerprint === item.fingerprint,
      );
      const id = existing?._id ?? `notification-${notificationSeq++}`;
      const record = {
        _id: id,
        organizationId: String(organizationId),
        fingerprint: item.fingerprint,
        alertType: item.alertType,
        title: item.title,
        body: item.body,
        subjectKey: item.subjectKey,
        acknowledgedAt: existing?.acknowledgedAt ?? null,
        acknowledgedBy: existing?.acknowledgedBy ?? null,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      notifications.set(String(id), record);
      return { ...record };
    },

    async acknowledgeNotification(organizationId, id, actorId, acknowledgedAt) {
      const record = notifications.get(String(id));
      if (!record || String(record.organizationId) !== String(organizationId)) {
        return null;
      }
      const updated = {
        ...record,
        acknowledgedAt,
        acknowledgedBy: actorId,
        updatedAt: new Date().toISOString(),
      };
      notifications.set(String(id), updated);
      return { ...updated };
    },
  };
}

module.exports = {
  createInMemoryAlertsStore,
  createMongooseAlertsStore,
};
