const mongoose = require('mongoose');

const notificationItemSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
      index: true,
    },
    fingerprint: { type: String, required: true },
    alertType: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    subjectKey: { type: String, required: true },
    acknowledgedAt: { type: Date, default: null },
    acknowledgedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true, collection: 'notification_items' },
);

notificationItemSchema.index({ organizationId: 1, fingerprint: 1 }, { unique: true });
notificationItemSchema.index({ organizationId: 1, acknowledgedAt: 1, createdAt: -1 });

const NotificationItemModel =
  mongoose.models['NotificationItem'] ||
  mongoose.model('NotificationItem', notificationItemSchema);

module.exports = {
  NotificationItemModel,
};
