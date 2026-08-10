const mongoose = require('mongoose');

/**
 * Residual organization settings not owned by specialized modules.
 * Timezone lives on organizations; invoice prefix on branches; credit/expiry/subscription elsewhere.
 */
const organizationSettingsSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
      unique: true,
      index: true,
    },
    tradingName: { type: String, trim: true, default: '' },
    contactPhone: { type: String, trim: true, default: '' },
    contactEmail: { type: String, trim: true, default: '' },
    addressLine: { type: String, trim: true, default: '' },
    documentFooterNote: { type: String, trim: true, default: '' },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, collection: 'organization_settings' },
);

const OrganizationSettingsModel =
  mongoose.models['OrganizationSettings'] ||
  mongoose.model('OrganizationSettings', organizationSettingsSchema);

module.exports = {
  OrganizationSettingsModel,
};
