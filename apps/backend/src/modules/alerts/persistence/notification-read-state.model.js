const mongoose = require('mongoose');

const notificationReadStateSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    notificationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'NotificationItem',
      index: true,
    },
    readAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  { timestamps: true, collection: 'notification_read_states' },
);

notificationReadStateSchema.index(
  { organizationId: 1, userId: 1, notificationId: 1 },
  { unique: true },
);
notificationReadStateSchema.index({ organizationId: 1, userId: 1, readAt: -1 });

const NotificationReadStateModel =
  mongoose.models['NotificationReadState'] ||
  mongoose.model('NotificationReadState', notificationReadStateSchema);

module.exports = {
  NotificationReadStateModel,
};
