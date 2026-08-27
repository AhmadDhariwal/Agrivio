const mongoose = require('mongoose');
const { AlertSettingsModel } = require('./persistence/alert-settings.model');
const { LowStockThresholdModel } = require('./persistence/low-stock-threshold.model');
const { NotificationItemModel } = require('./persistence/notification-item.model');
const { NotificationReadStateModel } = require('./persistence/notification-read-state.model');

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

    async listNotificationItems(organizationId, options = {}) {
      if (!mongoose.isValidObjectId(organizationId)) {
        return [];
      }
      let query = NotificationItemModel.find({ organizationId, active: { $ne: false } }).sort({
        activatedAt: -1,
      });
      if (typeof options?.limit === 'number' && options.limit > 0) {
        query = query.limit(options.limit);
      }
      return query.lean().exec();
    },

    async findNotificationById(organizationId, id) {
      if (!mongoose.isValidObjectId(organizationId) || !mongoose.isValidObjectId(id)) {
        return null;
      }
      return NotificationItemModel.findOne({ _id: id, organizationId }).lean().exec();
    },

    async upsertNotificationItem(organizationId, item) {
      const existing = await NotificationItemModel.findOne({
        organizationId,
        fingerprint: item.fingerprint,
      })
        .lean()
        .exec();
      const reactivated = existing !== null && existing.active === false;
      const record = await NotificationItemModel.findOneAndUpdate(
        { organizationId, fingerprint: item.fingerprint },
        {
          $set: {
            alertType: item.alertType,
            title: item.title,
            body: item.body,
            subjectKey: item.subjectKey,
            active: true,
            activatedAt:
              existing?.activatedAt ?? existing?.createdAt ?? item.observedAt,
            resolvedAt: null,
            ...(reactivated
              ? {
                  activatedAt: item.observedAt,
                  acknowledgedAt: null,
                  acknowledgedBy: null,
                }
              : {}),
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
      if (reactivated) {
        await NotificationReadStateModel.deleteMany({
          organizationId,
          notificationId: record['_id'],
        }).exec();
      }
      return record;
    },

    async resolveMissingNotifications(organizationId, activeFingerprints, resolvedAt) {
      if (!mongoose.isValidObjectId(organizationId)) {
        return;
      }
      await NotificationItemModel.updateMany(
        {
          organizationId,
          active: { $ne: false },
          fingerprint: { $nin: activeFingerprints },
        },
        { $set: { active: false, resolvedAt } },
      ).exec();
    },

    async acknowledgeNotification(organizationId, id, actorId, acknowledgedAt) {
      if (!mongoose.isValidObjectId(organizationId) || !mongoose.isValidObjectId(id)) {
        return null;
      }
      return NotificationItemModel.findOneAndUpdate(
        { _id: id, organizationId, active: { $ne: false } },
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

    async markNotificationRead(organizationId, userId, notificationId, readAt) {
      if (
        !mongoose.isValidObjectId(organizationId) ||
        !mongoose.isValidObjectId(userId) ||
        !mongoose.isValidObjectId(notificationId)
      ) {
        return null;
      }
      const notification = await NotificationItemModel.findOne({
        _id: notificationId,
        organizationId,
        active: { $ne: false },
      })
        .lean()
        .exec();
      if (notification === null) return null;
      return NotificationReadStateModel.findOneAndUpdate(
        { organizationId, userId, notificationId },
        {
          $set: { readAt },
          $setOnInsert: { organizationId, userId, notificationId },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
        .lean()
        .exec();
    },

    async markAllNotificationsRead(organizationId, userId, notificationIds, readAt) {
      if (
        !mongoose.isValidObjectId(organizationId) ||
        !mongoose.isValidObjectId(userId) ||
        !Array.isArray(notificationIds) ||
        notificationIds.length === 0
      ) {
        return { modifiedCount: 0 };
      }
      const validIds = notificationIds.filter((id) => mongoose.isValidObjectId(id));
      if (validIds.length === 0) return { modifiedCount: 0 };
      const ops = validIds.map((notificationId) => ({
        updateOne: {
          filter: { organizationId, userId, notificationId },
          update: {
            $set: { readAt },
            $setOnInsert: { organizationId, userId, notificationId },
          },
          upsert: true,
        },
      }));
      return NotificationReadStateModel.bulkWrite(ops);
    },

    async listReadNotificationIds(organizationId, userId) {
      if (!mongoose.isValidObjectId(organizationId) || !mongoose.isValidObjectId(userId)) {
        return [];
      }
      const records = await NotificationReadStateModel.find(
        { organizationId, userId },
        { notificationId: 1 },
      )
        .lean()
        .exec();
      return records.map((record) => String(record.notificationId));
    },

    async countUnreadNotifications(organizationId, userId) {
      if (!mongoose.isValidObjectId(organizationId) || !mongoose.isValidObjectId(userId)) {
        return 0;
      }
      const [allNotifications, readStates] = await Promise.all([
        NotificationItemModel.find(
          { organizationId, active: { $ne: false } },
          { _id: 1 },
        )
          .lean()
          .exec(),
        NotificationReadStateModel.find({ organizationId, userId }, { notificationId: 1 })
          .lean()
          .exec(),
      ]);
      const readSet = new Set(readStates.map((r) => String(r.notificationId)));
      return allNotifications.filter((n) => !readSet.has(String(n._id))).length;
    },
  };
}

function createInMemoryAlertsStore() {
  const settings = new Map();
  const thresholds = new Map();
  const notifications = new Map();
  const notificationReads = new Map();
  let notificationSeq = 1;

  function thresholdKey(organizationId, productId, warehouseId) {
    return `${organizationId}::${productId}::${warehouseId}`;
  }

  function readKey(organizationId, userId, notificationId) {
    return `${organizationId}::${userId}::${notificationId}`;
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

    async listNotificationItems(organizationId, options = {}) {
      let list = [...notifications.values()]
        .filter(
          (item) =>
            String(item.organizationId) === String(organizationId) && item.active !== false,
        )
        .map((item) => ({ ...item }))
        .sort((a, b) => String(b.activatedAt ?? '').localeCompare(String(a.activatedAt ?? '')));
      if (typeof options?.limit === 'number' && options.limit > 0) {
        list = list.slice(0, options.limit);
      }
      return list;
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
      const reactivated = existing !== undefined && existing.active === false;
      const record = {
        _id: id,
        organizationId: String(organizationId),
        fingerprint: item.fingerprint,
        alertType: item.alertType,
        title: item.title,
        body: item.body,
        subjectKey: item.subjectKey,
        active: true,
        activatedAt:
          existing && existing.active !== false
            ? (existing.activatedAt ?? existing.createdAt ?? item.observedAt)
            : item.observedAt,
        resolvedAt: null,
        acknowledgedAt:
          existing && existing.active !== false ? existing.acknowledgedAt : null,
        acknowledgedBy:
          existing && existing.active !== false ? existing.acknowledgedBy : null,
        createdAt: existing?.createdAt ?? item.observedAt,
        updatedAt: item.observedAt,
      };
      notifications.set(String(id), record);
      if (reactivated) {
        for (const [key, readState] of notificationReads.entries()) {
          if (
            String(readState.organizationId) === String(organizationId) &&
            String(readState.notificationId) === String(id)
          ) {
            notificationReads.delete(key);
          }
        }
      }
      return { ...record };
    },

    async resolveMissingNotifications(organizationId, activeFingerprints, resolvedAt) {
      const active = new Set(activeFingerprints);
      for (const [id, record] of notifications.entries()) {
        if (
          String(record.organizationId) === String(organizationId) &&
          record.active !== false &&
          !active.has(record.fingerprint)
        ) {
          notifications.set(id, {
            ...record,
            active: false,
            resolvedAt,
            updatedAt: resolvedAt,
          });
        }
      }
    },

    async acknowledgeNotification(organizationId, id, actorId, acknowledgedAt) {
      const record = notifications.get(String(id));
      if (
        !record ||
        String(record.organizationId) !== String(organizationId) ||
        record.active === false
      ) {
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

    async markNotificationRead(organizationId, userId, notificationId, readAt) {
      const notification = notifications.get(String(notificationId));
      if (
        !notification ||
        String(notification.organizationId) !== String(organizationId) ||
        notification.active === false
      ) {
        return null;
      }
      const key = readKey(organizationId, userId, notificationId);
      const record = {
        organizationId: String(organizationId),
        userId: String(userId),
        notificationId: String(notificationId),
        readAt: readAt instanceof Date ? readAt.toISOString() : String(readAt),
      };
      notificationReads.set(key, record);
      return { ...record };
    },

    async markAllNotificationsRead(organizationId, userId, notificationIds, readAt) {
      for (const notificationId of notificationIds) {
        const key = readKey(organizationId, userId, notificationId);
        notificationReads.set(key, {
          organizationId: String(organizationId),
          userId: String(userId),
          notificationId: String(notificationId),
          readAt: readAt instanceof Date ? readAt.toISOString() : String(readAt),
        });
      }
      return { modifiedCount: notificationIds.length };
    },

    async listReadNotificationIds(organizationId, userId) {
      return [...notificationReads.values()]
        .filter(
          (r) =>
            String(r.organizationId) === String(organizationId) &&
            String(r.userId) === String(userId),
        )
        .map((r) => String(r.notificationId));
    },

    async countUnreadNotifications(organizationId, userId) {
      const orgNotifications = [...notifications.values()].filter(
        (n) =>
          String(n.organizationId) === String(organizationId) && n.active !== false,
      );
      const readSet = new Set(
        [...notificationReads.values()]
          .filter(
            (r) =>
              String(r.organizationId) === String(organizationId) &&
              String(r.userId) === String(userId),
          )
          .map((r) => String(r.notificationId)),
      );
      return orgNotifications.filter((n) => !readSet.has(String(n._id))).length;
    },
  };
}

module.exports = {
  createInMemoryAlertsStore,
  createMongooseAlertsStore,
};
