const { createAuditWriter } = require('../../platform/audit/audit-writer');
const {
  allowsSubscriptionLabel,
  evaluateFeatureEntitlement,
} = require('../subscriptions/entitlement');
const {
  orgActionNotAllowed,
  orgCapabilityDisabled,
  orgFieldNotEditable,
  validationFailed,
  versionConflict,
} = require('../../platform/errors/app-error');
const {
  CONTROL_TYPES,
  CATEGORIES_MODULE_KEY,
  PRODUCTS_MODULE_KEY,
  STOCK_MODULE_KEY,
  OPENING_STOCK_MODULE_KEY,
  BATCHES_MODULE_KEY,
  EXPIRY_MODULE_KEY,
  ADJUSTMENTS_MODULE_KEY,
  TRANSFERS_MODULE_KEY,
  RECONCILIATION_MODULE_KEY,
  MOVEMENTS_MODULE_KEY,
  CUSTOMERS_MODULE_KEY,
  SUPPLIERS_MODULE_KEY,
  RETURNS_MODULE_KEY,
  ACCOUNTS_MODULE_KEY,
  EXPENSES_MODULE_KEY,
  EXPENSE_CATEGORIES_MODULE_KEY,
  REPORTS_MODULE_KEY,
  getCapabilityControl,
  listCapabilityControls,
} = require('./capability.registry');

const MODE_BY_TYPE = Object.freeze({
  [CONTROL_TYPES.Module]: ['enabled'],
  [CONTROL_TYPES.Feature]: ['enabled'],
  [CONTROL_TYPES.View]: ['enabled'],
  [CONTROL_TYPES.Widget]: ['visible'],
  [CONTROL_TYPES.Action]: ['allowed'],
  [CONTROL_TYPES.Field]: ['visible', 'editable'],
});

const PRODUCT_FIELD_CONTROLS = Object.freeze({
  name: 'inventory.products.fields.productName',
  sku: 'inventory.products.fields.sku',
  categoryId: 'inventory.products.fields.category',
  trackingMode: 'inventory.products.fields.trackingMode',
  baseUnitCode: 'inventory.products.fields.baseUnit',
  measurementDimension: 'inventory.products.fields.measurementDimension',
});

const CATEGORY_FIELD_CONTROLS = Object.freeze({
  name: 'inventory.categories.fields.name',
  productClass: 'inventory.categories.fields.productClass',
});

const CUSTOMER_FIELD_CONTROLS = Object.freeze({
  name: 'customers.fields.name',
  phone: 'customers.fields.phone',
  customerType: 'customers.fields.customerType',
  priceTier: 'customers.fields.priceTier',
});

const CUSTOMER_CREDIT_FIELD_CONTROLS = Object.freeze({
  creditEnabled: 'customers.fields.creditEnabled',
  creditLimitAmountMinorUnits: 'customers.fields.creditLimit',
  creditLimitBehaviour: 'customers.fields.creditLimitBehaviour',
});

const SUPPLIER_FIELD_CONTROLS = Object.freeze({
  name: 'suppliers.fields.name',
  contactName: 'suppliers.fields.contactName',
  phone: 'suppliers.fields.phone',
  email: 'suppliers.fields.email',
});

const ACCOUNT_FIELD_CONTROLS = Object.freeze({
  name: 'accounts.fields.name',
  bankName: 'accounts.fields.bankName',
  accountNumberMasked: 'accounts.fields.accountNumberMasked',
  walletIdentifier: 'accounts.fields.walletIdentifier',
});

function cloneValue(value) {
  return Object.fromEntries(Object.entries(value ?? {}).map(([key, item]) => [key, item]));
}

function valuesEqual(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function isOperationalAccess(access) {
  if (typeof access?.operationalWriteAllowed === 'boolean') {
    return access.operationalWriteAllowed;
  }
  if (typeof access?.accessLevel === 'string') {
    return access.accessLevel === 'operational';
  }
  return access?.status === 'trial' || access?.status === 'active' || access?.status === 'grace';
}

function hasEntitlement(access, entitlementKey) {
  if (!entitlementKey) {
    return true;
  }
  if (access === null || access === undefined) {
    return true;
  }
  return evaluateFeatureEntitlement(access.plan, entitlementKey).allowed;
}

function disabledValue(definition, configuredValue) {
  const value = cloneValue(configuredValue);
  for (const mode of MODE_BY_TYPE[definition.type] ?? []) {
    value[mode] = false;
  }
  return value;
}

function validateExpectedVersion(value) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw validationFailed('expectedVersion must be a non-negative integer', [
      { field: 'expectedVersion', message: 'expectedVersion must be a non-negative integer' },
    ]);
  }
}

function validatePolicyBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw validationFailed('Capability policy request body must be an object');
  }
  const unknownFields = Object.keys(body).filter(
    (field) => !['expectedVersion', 'changes', 'reason'].includes(field),
  );
  if (unknownFields.length > 0) {
    throw validationFailed(`Unknown capability policy field ${unknownFields[0]}`);
  }
  if (body.reason !== undefined) {
    if (typeof body.reason !== 'string' || body.reason.trim().length > 500) {
      throw validationFailed('reason must be a string of at most 500 characters');
    }
  }
}

function normalizeOverrideValue(definition, value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw validationFailed(`Capability override for ${definition.key} must be an object`);
  }
  const allowedModes = MODE_BY_TYPE[definition.type] ?? [];
  const normalized = {};
  for (const [mode, setting] of Object.entries(value)) {
    if (!allowedModes.includes(mode)) {
      throw validationFailed(`Unknown policy mode ${mode} for ${definition.key}`);
    }
    if (definition.configurable[mode] !== true) {
      throw validationFailed(`${definition.label} ${mode} is safety-controlled`, [
        { field: `${definition.key}.${mode}`, message: definition.reason ?? 'Not configurable' },
      ]);
    }
    if (typeof setting !== 'boolean') {
      throw validationFailed(`${definition.key}.${mode} must be boolean`);
    }
    normalized[mode] = setting;
  }
  if (Object.keys(normalized).length === 0) {
    throw validationFailed(`Capability override for ${definition.key} is empty`);
  }
  return normalized;
}

function createCapabilityService(deps) {
  const store = deps.store;
  const transactionRunner = deps.transactionRunner;
  const auditWriter = createAuditWriter(deps.auditStore);

  async function loadPolicy(organizationId) {
    const policy = await store.findByOrganizationId(organizationId);
    return policy === null
      ? { organizationId, version: 0, overrides: [], updatedBy: null, updatedAt: null }
      : {
          organizationId: String(policy.organizationId),
          version: Number(policy.version),
          overrides: (policy.overrides ?? []).map((override) => ({
            key: override.key,
            value: cloneValue(override.value),
          })),
          updatedBy: policy.updatedBy ?? null,
          updatedAt: policy.updatedAt ?? null,
        };
  }

  async function resolveSubscriptionContext(organizationId, options) {
    const accessState =
      options.subscriptionAccessState ??
      (typeof deps.resolveSubscriptionAccessState === 'function'
        ? await deps.resolveSubscriptionAccessState(organizationId)
        : null);
    const operationalAllowed =
      typeof options.operationalAllowed === 'boolean'
        ? options.operationalAllowed
        : accessState === null
          ? true
          : isOperationalAccess(accessState);
    return { accessState, operationalAllowed };
  }

  async function resolveEffective(organizationId, options = {}) {
    const definitions = listCapabilityControls();
    const policy = options.policy ?? (await loadPolicy(organizationId));
    const overrides = new Map(policy.overrides.map((override) => [override.key, override.value]));
    const permissions = Array.isArray(options.permissions) ? new Set(options.permissions) : null;
    const subscription = await resolveSubscriptionContext(organizationId, options);
    const operationalAllowed = subscription.operationalAllowed;
    const controls = [];
    const effectiveByKey = new Map();

    for (const definition of definitions) {
      const override = overrides.get(definition.key) ?? null;
      const configuredValue = { ...definition.defaultPolicy, ...(override ?? {}) };
      let effectiveValue = cloneValue(configuredValue);
      const reasons = [];
      const parent = definition.parentKey ? effectiveByKey.get(definition.parentKey) : null;
      const parentAvailable =
        parent === null || parent === undefined
          ? true
          : Object.values(parent.effectiveValue).every((value) => value !== false);

      if (!parentAvailable) {
        effectiveValue = disabledValue(definition, effectiveValue);
        reasons.push('parent_disabled');
      }
      const labeledAccessAllowed =
        subscription.accessState?.status === undefined
          ? null
          : allowsSubscriptionLabel(
              subscription.accessState.status,
              definition.subscriptionLabel,
            );
      const subscriptionAllowed =
        definition.subscriptionLabel === undefined
          ? operationalAllowed
          : (labeledAccessAllowed ?? operationalAllowed);
      if (!subscriptionAllowed) {
        effectiveValue = disabledValue(definition, effectiveValue);
        reasons.push('subscription_unavailable');
      }
      if (!hasEntitlement(subscription.accessState, definition.entitlementKey)) {
        effectiveValue = disabledValue(definition, effectiveValue);
        reasons.push('entitlement_unavailable');
      }
      if (permissions !== null) {
        for (const mode of MODE_BY_TYPE[definition.type] ?? []) {
          const requiredPermission = definition.requiredPermissions?.[mode];
          if (requiredPermission && !permissions.has(requiredPermission)) {
            effectiveValue[mode] = false;
            if (!reasons.includes('permission_denied')) {
              reasons.push('permission_denied');
            }
          }
        }
      }
      for (const dependencyKey of definition.dependencies ?? []) {
        const dependency = effectiveByKey.get(dependencyKey);
        if (
          dependency === undefined ||
          Object.values(dependency.effectiveValue).some((value) => value === false)
        ) {
          effectiveValue = disabledValue(definition, effectiveValue);
          if (!reasons.includes('dependency_disabled')) {
            reasons.push('dependency_disabled');
          }
        }
      }
      if (definition.type === CONTROL_TYPES.Field && effectiveValue.visible === false) {
        effectiveValue.editable = false;
      }

      const resolved = {
        ...definition,
        override,
        configuredValue,
        effectiveValue,
        reasons,
      };
      controls.push(resolved);
      effectiveByKey.set(definition.key, resolved);
    }

    return {
      organizationId,
      version: policy.version,
      updatedBy: policy.updatedBy,
      updatedAt: policy.updatedAt,
      operationalAllowed,
      controls,
    };
  }

  function throwDenied(definition, mode) {
    if (definition.type === CONTROL_TYPES.Field && mode === 'editable') {
      throw orgFieldNotEditable(`${definition.label} is read-only for this organization`, {
        controlKey: definition.key,
      });
    }
    if (definition.type === CONTROL_TYPES.Action) {
      throw orgActionNotAllowed(`${definition.label} is not allowed for this organization`, {
        controlKey: definition.key,
      });
    }
    throw orgCapabilityDisabled('This feature is not enabled for your organization', {
      controlKey: definition.key,
    });
  }

  async function assertAllowed(organizationId, key, mode, options = {}) {
    const definition = getCapabilityControl(key);
    if (definition === null || !(MODE_BY_TYPE[definition.type] ?? []).includes(mode)) {
      throw orgCapabilityDisabled('This feature is not enabled for your organization');
    }
    const resolved = await resolveEffective(organizationId, options);
    const control = resolved.controls.find((item) => item.key === key);
    if (control?.effectiveValue?.[mode] !== true) {
      throwDenied(definition, mode);
    }
    return control;
  }

  async function persistChanges(organizationId, body, actor) {
    validatePolicyBody(body);
    validateExpectedVersion(body?.expectedVersion);
    if (!Array.isArray(body?.changes) || body.changes.length === 0) {
      throw validationFailed('changes must contain at least one capability change');
    }
    const seen = new Set();
    for (const change of body.changes) {
      if (change === null || typeof change !== 'object' || Array.isArray(change)) {
        throw validationFailed('Each capability change must be an object');
      }
      const unknownChangeFields = Object.keys(change).filter(
        (field) => !['key', 'value'].includes(field),
      );
      if (unknownChangeFields.length > 0) {
        throw validationFailed(`Unknown capability change field ${unknownChangeFields[0]}`);
      }
      if (typeof change.key !== 'string' || change.key.trim() === '') {
        throw validationFailed('Capability change key is required');
      }
      if (seen.has(change.key)) {
        throw validationFailed(`Duplicate capability change ${change.key}`);
      }
      seen.add(change.key);
      if (getCapabilityControl(change.key) === null) {
        throw validationFailed(`Unknown capability control ${change.key}`);
      }
    }

    return transactionRunner.run(async (session) => {
      const current = await loadPolicy(organizationId);
      if (current.version !== body.expectedVersion) {
        throw versionConflict('Organization capability policy version conflict', {
          expectedVersion: body.expectedVersion,
          actualVersion: current.version,
        });
      }

      const nextOverrides = new Map(
        current.overrides.map((override) => [override.key, cloneValue(override.value)]),
      );
      const auditChanges = [];
      for (const change of body.changes) {
        const definition = getCapabilityControl(change.key);
        const previous = nextOverrides.get(change.key) ?? null;
        if (change.value === null) {
          nextOverrides.delete(change.key);
        } else {
          const normalized = normalizeOverrideValue(definition, change.value);
          const merged = { ...(previous ?? {}), ...normalized };
          for (const [mode, value] of Object.entries(merged)) {
            if (value === definition.defaultPolicy[mode]) {
              delete merged[mode];
            }
          }
          if (Object.keys(merged).length === 0) {
            nextOverrides.delete(change.key);
          } else {
            nextOverrides.set(change.key, merged);
          }
        }
        const next = nextOverrides.get(change.key) ?? null;
        if (!valuesEqual(previous, next)) {
          auditChanges.push({ key: change.key, previousOverride: previous, newOverride: next });
        }
      }

      if (auditChanges.length === 0) {
        return resolveEffective(organizationId, { policy: current });
      }

      const version = current.version + 1;
      const overrides = [...nextOverrides.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => ({ key, value }));
      let persisted;
      if (current.version === 0) {
        try {
          persisted = await store.insert(session, {
            organizationId,
            version,
            overrides,
            updatedBy: actor.actorId,
          });
        } catch (error) {
          if (error?.agrivioDuplicate === true) {
            throw versionConflict('Organization capability policy version conflict', {
              expectedVersion: 0,
            });
          }
          throw error;
        }
      } else {
        persisted = await store.update(session, organizationId, current.version, {
          version,
          overrides,
          updatedBy: actor.actorId,
        });
        if (persisted === null) {
          throw versionConflict('Organization capability policy version conflict', {
            expectedVersion: current.version,
          });
        }
      }

      const beforeEffective = await resolveEffective(organizationId, { policy: current });
      const afterPolicy = {
        organizationId,
        version: Number(persisted.version),
        overrides: (persisted.overrides ?? []).map((override) => ({
          key: override.key,
          value: cloneValue(override.value),
        })),
        updatedBy: persisted.updatedBy ?? actor.actorId,
        updatedAt: persisted.updatedAt ?? new Date(),
      };
      const afterEffective = await resolveEffective(organizationId, { policy: afterPolicy });

      for (const change of auditChanges) {
        const effectiveBefore = beforeEffective.controls.find(
          (control) => control.key === change.key,
        )?.effectiveValue;
        const effectiveAfter = afterEffective.controls.find(
          (control) => control.key === change.key,
        )?.effectiveValue;
        await auditWriter.appendBusinessEvent(session, {
          organizationId,
          actorId: actor.actorId,
          action: 'organization_capability.changed',
          resourceType: 'organization_capability_policy',
          resourceId: organizationId,
          reason:
            typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : undefined,
          metadata: {
            versionBefore: current.version,
            versionAfter: version,
            controlKey: change.key,
            previousOverride: change.previousOverride,
            newOverride: change.newOverride,
            effectiveBefore,
            effectiveAfter,
          },
        });
      }

      return afterEffective;
    });
  }

  return {
    listRegistry: listCapabilityControls,
    loadPolicy,
    resolveEffective,
    assertAllowed,
    updatePolicy: persistChanges,

    async resetOverride(organizationId, key, expectedVersion, actor, reason) {
      return persistChanges(
        organizationId,
        { expectedVersion, changes: [{ key, value: null }], reason },
        actor,
      );
    },

    async resetModule(organizationId, moduleKey, expectedVersion, actor, reason) {
      if (
        ![
          PRODUCTS_MODULE_KEY,
          CATEGORIES_MODULE_KEY,
          STOCK_MODULE_KEY,
          OPENING_STOCK_MODULE_KEY,
          BATCHES_MODULE_KEY,
          EXPIRY_MODULE_KEY,
          ADJUSTMENTS_MODULE_KEY,
          TRANSFERS_MODULE_KEY,
          RECONCILIATION_MODULE_KEY,
          MOVEMENTS_MODULE_KEY,
          CUSTOMERS_MODULE_KEY,
          SUPPLIERS_MODULE_KEY,
          RETURNS_MODULE_KEY,
          ACCOUNTS_MODULE_KEY,
          EXPENSES_MODULE_KEY,
          EXPENSE_CATEGORIES_MODULE_KEY,
          REPORTS_MODULE_KEY,
        ].includes(moduleKey)
      ) {
        throw validationFailed(`Unknown configurable module ${moduleKey}`);
      }
      const current = await loadPolicy(organizationId);
      const changes = current.overrides
        .filter((override) => getCapabilityControl(override.key)?.moduleKey === moduleKey)
        .map((override) => ({ key: override.key, value: null }));
      if (changes.length === 0) {
        validateExpectedVersion(expectedVersion);
        if (current.version !== expectedVersion) {
          throw versionConflict('Organization capability policy version conflict', {
            expectedVersion,
            actualVersion: current.version,
          });
        }
        return resolveEffective(organizationId, { policy: current });
      }
      return persistChanges(organizationId, { expectedVersion, changes, reason }, actor);
    },

    async resetAll(organizationId, expectedVersion, actor, reason) {
      const current = await loadPolicy(organizationId);
      const changes = current.overrides.map((override) => ({ key: override.key, value: null }));
      if (changes.length === 0) {
        validateExpectedVersion(expectedVersion);
        if (current.version !== expectedVersion) {
          throw versionConflict('Organization capability policy version conflict', {
            expectedVersion,
            actualVersion: current.version,
          });
        }
        return resolveEffective(organizationId, { policy: current });
      }
      return persistChanges(organizationId, { expectedVersion, changes, reason }, actor);
    },

    async getHistory(organizationId) {
      if (typeof deps.auditStore.query !== 'function') {
        return [];
      }
      return deps.auditStore.query({
        organizationId,
        action: 'organization_capability.changed',
        resourceType: 'organization_capability_policy',
        resourceId: organizationId,
      });
    },

    async assertProductCreateAllowed(organizationId) {
      await assertAllowed(organizationId, 'inventory.products.actions.create', 'allowed');
    },

    async assertProductPatchAllowed(organizationId, current, patch) {
      const changedFields = Object.keys(PRODUCT_FIELD_CONTROLS).filter(
        (field) => patch[field] !== undefined && String(patch[field]) !== String(current[field]),
      );
      if (changedFields.length > 0) {
        await assertAllowed(organizationId, 'inventory.products.actions.edit', 'allowed');
      }
      for (const field of changedFields) {
        await assertAllowed(organizationId, PRODUCT_FIELD_CONTROLS[field], 'editable');
      }
      if (patch.status !== undefined && patch.status !== current.status) {
        const action = patch.status === 'active' ? 'reactivate' : 'deactivate';
        await assertAllowed(organizationId, `inventory.products.actions.${action}`, 'allowed');
      }
    },

    async assertProductEditAllowed(organizationId) {
      await assertAllowed(organizationId, 'inventory.products.actions.edit', 'allowed');
    },

    async assertProductDeleteAllowed(organizationId) {
      await assertAllowed(organizationId, 'inventory.products.actions.delete', 'allowed');
    },

    async assertProductPricingAllowed(organizationId) {
      await assertAllowed(organizationId, 'inventory.products.actions.managePricing', 'allowed');
      await assertAllowed(organizationId, 'inventory.products.fields.sellingPrice', 'editable');
    },

    async assertCategoryCreateAllowed(organizationId) {
      await assertAllowed(organizationId, 'inventory.categories.actions.create', 'allowed');
    },

    async assertCategoryInspectAllowed(organizationId) {
      await assertAllowed(organizationId, 'inventory.categories.actions.inspect', 'allowed');
    },

    async assertCategoryPatchAllowed(organizationId, current, patch) {
      const changedFields = Object.keys(CATEGORY_FIELD_CONTROLS).filter(
        (field) => patch[field] !== undefined && String(patch[field]) !== String(current[field]),
      );
      if (changedFields.length > 0) {
        await assertAllowed(organizationId, 'inventory.categories.actions.edit', 'allowed');
      }
      for (const field of changedFields) {
        await assertAllowed(organizationId, CATEGORY_FIELD_CONTROLS[field], 'editable');
      }
      if (patch.status !== undefined && patch.status !== current.status) {
        const action = patch.status === 'active' ? 'reactivate' : 'deactivate';
        await assertAllowed(organizationId, `inventory.categories.actions.${action}`, 'allowed');
      }
    },

    async assertCategoryDeleteAllowed(organizationId) {
      await assertAllowed(organizationId, 'inventory.categories.actions.delete', 'allowed');
    },

    async assertCustomerCreateAllowed(organizationId) {
      await assertAllowed(organizationId, 'customers.actions.create', 'allowed');
    },

    async assertCustomerPatchAllowed(organizationId, current, patch) {
      await assertAllowed(organizationId, 'customers.actions.edit', 'allowed');
      const changedFields = Object.keys(CUSTOMER_FIELD_CONTROLS).filter(
        (field) => patch[field] !== undefined && String(patch[field]) !== String(current[field]),
      );
      for (const field of changedFields) {
        await assertAllowed(organizationId, CUSTOMER_FIELD_CONTROLS[field], 'editable');
      }
      if (patch.status !== undefined && patch.status !== current.status) {
        const action = patch.status === 'active' ? 'reactivate' : 'deactivate';
        await assertAllowed(organizationId, `customers.actions.${action}`, 'allowed');
      }
    },

    async assertCustomerDeleteAllowed(organizationId) {
      await assertAllowed(organizationId, 'customers.actions.delete', 'allowed');
    },

    async assertCustomerDeactivateAllowed(organizationId) {
      await assertAllowed(organizationId, 'customers.actions.deactivate', 'allowed');
    },

    async assertCustomerReactivateAllowed(organizationId) {
      await assertAllowed(organizationId, 'customers.actions.reactivate', 'allowed');
    },

    async assertCustomerCreditPolicyAllowed(organizationId, current, patch) {
      await assertAllowed(organizationId, 'customers.actions.editCreditPolicy', 'allowed');
      const changedFields = Object.keys(CUSTOMER_CREDIT_FIELD_CONTROLS).filter(
        (field) => patch[field] !== undefined && String(patch[field]) !== String(current[field]),
      );
      for (const field of changedFields) {
        await assertAllowed(
          organizationId,
          CUSTOMER_CREDIT_FIELD_CONTROLS[field],
          'editable',
        );
      }
    },

    async assertCustomerOpeningBalanceAllowed(organizationId) {
      await assertAllowed(organizationId, 'customers.actions.postOpeningBalance', 'allowed');
    },

    async assertSupplierCreateAllowed(organizationId) {
      await assertAllowed(organizationId, 'suppliers.actions.create', 'allowed');
    },

    async assertSupplierPatchAllowed(organizationId, current, patch) {
      await assertAllowed(organizationId, 'suppliers.actions.edit', 'allowed');
      const changedFields = Object.keys(SUPPLIER_FIELD_CONTROLS).filter(
        (field) => patch[field] !== undefined && String(patch[field]) !== String(current[field]),
      );
      for (const field of changedFields) {
        await assertAllowed(organizationId, SUPPLIER_FIELD_CONTROLS[field], 'editable');
      }
      if (patch.status !== undefined && patch.status !== current.status) {
        const action = patch.status === 'active' ? 'reactivate' : 'deactivate';
        await assertAllowed(organizationId, `suppliers.actions.${action}`, 'allowed');
      }
    },

    async assertSupplierDeleteAllowed(organizationId) {
      await assertAllowed(organizationId, 'suppliers.actions.delete', 'allowed');
    },

    async assertSupplierOpeningBalanceAllowed(organizationId) {
      await assertAllowed(organizationId, 'suppliers.actions.postOpeningBalance', 'allowed');
    },

    async assertAccountCreateAllowed(organizationId) {
      await assertAllowed(organizationId, 'accounts.actions.create', 'allowed');
    },

    async assertAccountPatchAllowed(organizationId, current, patch) {
      const changedFields = Object.keys(ACCOUNT_FIELD_CONTROLS).filter(
        (field) => patch[field] !== undefined && String(patch[field]) !== String(current[field]),
      );
      if (changedFields.length > 0) {
        await assertAllowed(organizationId, 'accounts.actions.edit', 'allowed');
      }
      for (const field of changedFields) {
        await assertAllowed(organizationId, ACCOUNT_FIELD_CONTROLS[field], 'editable');
      }
      if (patch.status !== undefined && patch.status !== current.status) {
        const action = patch.status === 'active' ? 'reactivate' : 'deactivate';
        await assertAllowed(organizationId, `accounts.actions.${action}`, 'allowed');
      }
    },

    async assertAccountDeleteAllowed(organizationId) {
      await assertAllowed(organizationId, 'accounts.actions.delete', 'allowed');
    },

    async assertAccountOpeningBalanceAllowed(organizationId) {
      await assertAllowed(organizationId, 'accounts.actions.postOpeningBalance', 'allowed');
    },

    async assertAccountManualMovementAllowed(organizationId) {
      await assertAllowed(organizationId, 'accounts.actions.postManualMovement', 'allowed');
    },

    async assertAccountTransferAllowed(organizationId) {
      await assertAllowed(organizationId, 'accounts.actions.transfer', 'allowed');
    },

    async assertAccountMovementReversalAllowed(organizationId) {
      await assertAllowed(organizationId, 'accounts.actions.reverseMovement', 'allowed');
    },

    async assertAccountTransferReversalAllowed(organizationId) {
      await assertAllowed(organizationId, 'accounts.actions.reverseTransfer', 'allowed');
    },
  };
}

module.exports = {
  createCapabilityService,
  MODE_BY_TYPE,
  ACCOUNT_FIELD_CONTROLS,
  CATEGORY_FIELD_CONTROLS,
  CUSTOMER_CREDIT_FIELD_CONTROLS,
  CUSTOMER_FIELD_CONTROLS,
  PRODUCT_FIELD_CONTROLS,
  SUPPLIER_FIELD_CONTROLS,
};
