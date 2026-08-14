const mongoose = require('mongoose');

const alertSettingsSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
      unique: true,
      index: true,
    },
    deadStockInactivityDays: { type: Number, required: true },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, collection: 'alert_settings' },
);

const AlertSettingsModel =
  mongoose.models['AlertSettings'] || mongoose.model('AlertSettings', alertSettingsSchema);

module.exports = {
  AlertSettingsModel,
};
