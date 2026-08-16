const mongoose = require('mongoose');

const navigationPreferenceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      index: true,
    },
    contextType: {
      type: String,
      required: true,
      enum: ['organization', 'platform'],
    },
    organizationId: {
      type: mongoose.Schema.Types.Mixed,
      required: function () {
        return this.contextType === 'organization';
      },
      default: null,
    },
    hiddenItemIds: {
      type: [String],
      default: [],
    },
    groupOrder: {
      type: [String],
      default: [],
    },
    itemOrderByGroup: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true, collection: 'user_navigation_preferences' },
);

navigationPreferenceSchema.index(
  { userId: 1, contextType: 1, organizationId: 1 },
  { unique: true },
);

const NavigationPreferenceModel =
  mongoose.models['UserNavigationPreference'] ||
  mongoose.model('UserNavigationPreference', navigationPreferenceSchema);

module.exports = {
  NavigationPreferenceModel,
};
