const { validationFailed, unauthorized } = require('../../platform/errors/app-error');
const { NavigationPreferenceModel } = require('./persistence/navigation-preference.model');

const NAV_ID_PATTERN = /^[a-zA-Z0-9_.:-]+$/;
const MAX_HIDDEN_IDS = 200;
const MAX_GROUP_ORDER = 100;
const MAX_ORDER_GROUPS = 100;
const MAX_CHILD_ORDER = 200;

function validateNavId(item, field) {
  if (typeof item !== 'string' || item.trim().length === 0 || item.length > 100) {
    throw validationFailed('Invalid navigation item ID', [
      {
        field,
        message: 'Each item ID must be a non-empty string of 100 characters or fewer',
      },
    ]);
  }
  const trimmed = item.trim();
  if (!NAV_ID_PATTERN.test(trimmed)) {
    throw validationFailed('Invalid navigation item ID characters', [
      {
        field,
        message: 'Item ID contains invalid characters',
      },
    ]);
  }
  return trimmed;
}

function validateIdList(input, field, maxItems) {
  if (input === undefined || input === null) {
    return [];
  }
  if (!Array.isArray(input)) {
    throw validationFailed(`Invalid ${field}`, [
      { field, message: `${field} must be an array of strings` },
    ]);
  }
  if (input.length > maxItems) {
    throw validationFailed(`Too many ${field} items`, [
      { field, message: `${field} cannot exceed ${maxItems} items` },
    ]);
  }

  const seen = new Set();
  const cleaned = [];
  for (let i = 0; i < input.length; i++) {
    const trimmed = validateNavId(input[i], `${field}[${i}]`);
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      cleaned.push(trimmed);
    }
  }
  return cleaned;
}

function validateHiddenItemIds(input) {
  return validateIdList(input, 'hiddenItemIds', MAX_HIDDEN_IDS);
}

function validateGroupOrder(input) {
  return validateIdList(input, 'groupOrder', MAX_GROUP_ORDER);
}

function validateItemOrderByGroup(input) {
  if (input === undefined || input === null) {
    return {};
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw validationFailed('Invalid itemOrderByGroup', [
      { field: 'itemOrderByGroup', message: 'itemOrderByGroup must be an object of ID arrays' },
    ]);
  }

  const keys = Object.keys(input);
  if (keys.length > MAX_ORDER_GROUPS) {
    throw validationFailed('Too many itemOrderByGroup keys', [
      { field: 'itemOrderByGroup', message: `itemOrderByGroup cannot exceed ${MAX_ORDER_GROUPS} groups` },
    ]);
  }

  const cleaned = {};
  for (const key of keys) {
    const groupId = validateNavId(key, `itemOrderByGroup.${key}`);
    cleaned[groupId] = validateIdList(input[key], `itemOrderByGroup.${groupId}`, MAX_CHILD_ORDER);
  }
  return cleaned;
}

function emptyPreferences() {
  return {
    hiddenItemIds: [],
    groupOrder: [],
    itemOrderByGroup: {},
  };
}

function normalizeRecord(record) {
  return {
    hiddenItemIds: record?.hiddenItemIds ?? [],
    groupOrder: record?.groupOrder ?? [],
    itemOrderByGroup: record?.itemOrderByGroup ?? {},
  };
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
        ...emptyPreferences(),
        ...update.$set,
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
      return normalizeRecord(record);
    },

    async updatePreferences(auth, authContext, payload) {
      const scope = resolveScopeFromAuth(auth, authContext);
      const hiddenItemIds = validateHiddenItemIds(payload?.hiddenItemIds ?? []);
      const groupOrder = validateGroupOrder(payload?.groupOrder ?? []);
      const itemOrderByGroup = validateItemOrderByGroup(payload?.itemOrderByGroup ?? {});

      const filter = {
        userId: scope.userId,
        contextType: scope.contextType,
        organizationId: scope.organizationId,
      };

      const update = {
        $set: {
          hiddenItemIds,
          groupOrder,
          itemOrderByGroup,
        },
      };

      const options = {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      };

      const updated = await store.findOneAndUpdate(filter, update, options);
      return normalizeRecord(updated);
    },
  };
}

module.exports = {
  createNavigationPreferencesService,
  validateHiddenItemIds,
  validateGroupOrder,
  validateItemOrderByGroup,
  resolveScopeFromAuth,
};
