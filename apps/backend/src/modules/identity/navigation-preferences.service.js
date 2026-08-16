const { validationFailed, unauthorized } = require('../../platform/errors/app-error');
const { NavigationPreferenceModel } = require('./persistence/navigation-preference.model');

function validateHiddenItemIds(input) {
  if (!Array.isArray(input)) {
    throw validationFailed('Invalid hidden navigation items', [
      { field: 'hiddenItemIds', message: 'hiddenItemIds must be an array of strings' },
    ]);
  }

  if (input.length > 200) {
    throw validationFailed('Too many hidden navigation items', [
      { field: 'hiddenItemIds', message: 'hiddenItemIds cannot exceed 200 items' },
    ]);
  }

  const seen = new Set();
  const cleaned = [];

  for (let i = 0; i < input.length; i++) {
    const item = input[i];
    if (typeof item !== 'string' || item.trim().length === 0 || item.length > 100) {
      throw validationFailed('Invalid hidden navigation item ID', [
        {
          field: `hiddenItemIds[${i}]`,
          message: 'Each item ID must be a non-empty string of 100 characters or fewer',
        },
      ]);
    }
    const trimmed = item.trim();
    if (!/^[a-zA-Z0-9_.:-]+$/.test(trimmed)) {
      throw validationFailed('Invalid hidden navigation item ID characters', [
        {
          field: `hiddenItemIds[${i}]`,
          message: 'Item ID contains invalid characters',
        },
      ]);
    }
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      cleaned.push(trimmed);
    }
  }

  return cleaned;
}

function resolveScopeFromAuth(auth, authContext) {
  const userId = auth?.user?._id ?? auth?.user?.id;
  if (!userId) {
    throw unauthorized('Authentication required');
  }

  const contextType = authContext?.contextType === 'platform' ? 'platform' : 'organization';
  const organizationId =
    contextType === 'organization' ? authContext?.organizationId ?? null : null;

  return { userId: String(userId), contextType, organizationId };
}

function createInMemoryNavigationPreferencesStore() {
  const store = new Map();
  return {
    async findOne(query) {
      const key = `${query.userId}:${query.contextType}:${query.organizationId}`;
      return store.get(key) || null;
    },
    async findOneAndUpdate(filter, update) {
      const key = `${filter.userId}:${filter.contextType}:${filter.organizationId}`;
      const record = {
        userId: filter.userId,
        contextType: filter.contextType,
        organizationId: filter.organizationId,
        hiddenItemIds: update.$set.hiddenItemIds,
      };
      store.set(key, record);
      return record;
    },
  };
}

function createNavigationPreferencesService(deps = {}) {
  const persistence = deps.persistence ?? (deps.NavigationPreferenceModel ? 'mongoose' : 'memory');
  const store =
    deps.store ??
    (persistence === 'mongoose'
      ? {
          async findOne(query) {
            const model = deps.NavigationPreferenceModel || NavigationPreferenceModel;
            return model.findOne(query).lean().exec();
          },
          async findOneAndUpdate(filter, update, options) {
            const model = deps.NavigationPreferenceModel || NavigationPreferenceModel;
            return model.findOneAndUpdate(filter, update, options).lean().exec();
          },
        }
      : createInMemoryNavigationPreferencesStore());

  return {
    async getPreferences(auth, authContext) {
      const scope = resolveScopeFromAuth(auth, authContext);
      const query = {
        userId: scope.userId,
        contextType: scope.contextType,
        organizationId: scope.organizationId,
      };

      const record = await store.findOne(query);
      return {
        hiddenItemIds: record?.hiddenItemIds ?? [],
      };
    },

    async updatePreferences(auth, authContext, payload) {
      const scope = resolveScopeFromAuth(auth, authContext);
      const hiddenItemIds = validateHiddenItemIds(payload?.hiddenItemIds ?? []);

      const filter = {
        userId: scope.userId,
        contextType: scope.contextType,
        organizationId: scope.organizationId,
      };

      const update = {
        $set: {
          hiddenItemIds,
        },
      };

      const options = {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      };

      const updated = await store.findOneAndUpdate(filter, update, options);
      return {
        hiddenItemIds: updated.hiddenItemIds,
      };
    },
  };
}

module.exports = {
  createNavigationPreferencesService,
  validateHiddenItemIds,
  resolveScopeFromAuth,
};
