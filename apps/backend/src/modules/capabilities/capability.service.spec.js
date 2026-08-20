import { describe, expect, it } from 'vitest';
import transactionRunnerModule from '../../platform/transactions/transaction-runner';
import auditWriterModule from '../../platform/audit/audit-writer';
import capabilityStoreModule from './capability.store';
import capabilityServiceModule from './capability.service';

const { createMockTransactionSessionPort, createTransactionRunner } = transactionRunnerModule;
const { createInMemoryAuditEventStore } = auditWriterModule;
const { createInMemoryCapabilityPolicyStore } = capabilityStoreModule;
const { createCapabilityService } = capabilityServiceModule;

function createHarness(options = {}) {
  const store = createInMemoryCapabilityPolicyStore();
  const auditStore = createInMemoryAuditEventStore();
  const capabilityService = createCapabilityService({
    store,
    auditStore,
    transactionRunner: createTransactionRunner(createMockTransactionSessionPort().port),
    resolveSubscriptionAccessState:
      options.resolveSubscriptionAccessState ??
      (async () => ({ status: 'active', accessLevel: 'operational' })),
  });
  return { capabilityService, store, auditStore };
}

function control(result, key) {
  return result.controls.find((item) => item.key === key);
}

describe('Organization Capability Policy with registered inventory modules', () => {
  it('preserves current Products behavior when an organization has no policy document', async () => {
    const { capabilityService } = createHarness();
    const effective = await capabilityService.resolveEffective('org-a', {
      permissions: ['catalog.view', 'catalog.manage', 'pricing.view', 'pricing.manage'],
    });

    expect(effective.version).toBe(0);
    expect(control(effective, 'inventory.products').effectiveValue.enabled).toBe(true);
    expect(control(effective, 'inventory.products.views.desktopCards').effectiveValue.enabled).toBe(
      true,
    );
    expect(control(effective, 'inventory.products.fields.sku').effectiveValue).toEqual({
      visible: true,
      editable: true,
    });
    expect(
      control(effective, 'inventory.products.actions.managePricing').effectiveValue.allowed,
    ).toBe(true);
  });

  it('preserves current Categories behavior when an organization has no override', async () => {
    const { capabilityService } = createHarness();
    const effective = await capabilityService.resolveEffective('org-a', {
      permissions: ['catalog.view', 'catalog.manage'],
    });

    expect(control(effective, 'inventory.categories').effectiveValue.enabled).toBe(true);
    expect(
      control(effective, 'inventory.categories.views.desktopCards').effectiveValue.enabled,
    ).toBe(true);
    expect(control(effective, 'inventory.categories.fields.name').effectiveValue).toEqual({
      visible: true,
      editable: true,
    });
    expect(
      control(effective, 'inventory.categories.widgets.totalCategories').effectiveValue.visible,
    ).toBe(true);
  });

  it('preserves current Stock-on-Hand behavior when an organization has no override', async () => {
    const { capabilityService } = createHarness();
    const effective = await capabilityService.resolveEffective('org-a', {
      permissions: ['inventory.view'],
    });

    expect(control(effective, 'inventory.stock').effectiveValue.enabled).toBe(true);
    expect(control(effective, 'inventory.stock.views.desktopCards').effectiveValue.enabled).toBe(
      true,
    );
    expect(control(effective, 'inventory.stock.fields.product').effectiveValue.visible).toBe(true);
    expect(control(effective, 'inventory.stock.fields.quantityBase').effectiveValue.visible).toBe(
      true,
    );
    expect(control(effective, 'inventory.stock.fields.wac').effectiveValue.visible).toBe(true);
    expect(control(effective, 'inventory.stock.actions.inspect').effectiveValue.allowed).toBe(true);
  });

  it('registers safe Opening Stock controls while keeping required workflow fields enforced', async () => {
    const { capabilityService } = createHarness();
    const effective = await capabilityService.resolveEffective('org-a', {
      permissions: ['inventory.view', 'inventory.opening-stock.post'],
    });

    expect(control(effective, 'inventory.openingStock').effectiveValue.enabled).toBe(true);
    expect(
      control(effective, 'inventory.openingStock.features.productSearch').effectiveValue.enabled,
    ).toBe(true);
    expect(
      control(effective, 'inventory.openingStock.fields.packagingUnit').effectiveValue.visible,
    ).toBe(true);
    expect(control(effective, 'inventory.openingStock.actions.post').effectiveValue.allowed).toBe(
      true,
    );

    await expect(
      capabilityService.updatePolicy(
        'org-a',
        {
          expectedVersion: 0,
          changes: [
            { key: 'inventory.openingStock.fields.batchExpiry', value: { visible: false } },
          ],
        },
        { actorId: 'platform-admin' },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('isolates Opening Stock module and optional presentation policy by organization', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'inventory.openingStock', value: { enabled: false } }],
      },
      { actorId: 'platform-admin' },
    );
    await capabilityService.updatePolicy(
      'org-b',
      {
        expectedVersion: 0,
        changes: [
          { key: 'inventory.openingStock.fields.manufacturingDate', value: { visible: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );

    const orgA = await capabilityService.resolveEffective('org-a');
    const orgB = await capabilityService.resolveEffective('org-b');
    expect(control(orgA, 'inventory.openingStock').effectiveValue.enabled).toBe(false);
    expect(control(orgA, 'inventory.openingStock.actions.post').effectiveValue.allowed).toBe(false);
    expect(
      control(orgA, 'inventory.openingStock.fields.manufacturingDate').effectiveValue.visible,
    ).toBe(false);
    expect(control(orgB, 'inventory.openingStock').effectiveValue.enabled).toBe(true);
    expect(control(orgB, 'inventory.openingStock.actions.post').effectiveValue.allowed).toBe(true);
    expect(
      control(orgB, 'inventory.openingStock.fields.manufacturingDate').effectiveValue.visible,
    ).toBe(false);
    expect(
      control(orgB, 'inventory.openingStock.fields.packagingUnit').effectiveValue.visible,
    ).toBe(true);

    await expect(
      capabilityService.assertAllowed('org-a', 'inventory.openingStock', 'enabled'),
    ).rejects.toMatchObject({ code: 'ORG_CAPABILITY_DISABLED' });
    await expect(
      capabilityService.assertAllowed('org-a', 'inventory.openingStock.actions.post', 'allowed'),
    ).rejects.toMatchObject({ code: 'ORG_ACTION_NOT_ALLOWED' });
    await expect(
      capabilityService.assertAllowed('org-b', 'inventory.openingStock.actions.post', 'allowed'),
    ).resolves.toBeTruthy();

    const reenabled = await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 1,
        changes: [{ key: 'inventory.openingStock', value: { enabled: true } }],
      },
      { actorId: 'platform-admin' },
    );
    expect(reenabled.version).toBe(2);
    expect(control(reenabled, 'inventory.openingStock').override).toBeNull();
    expect(control(reenabled, 'inventory.openingStock').effectiveValue.enabled).toBe(true);
  });

  it('resets only Opening Stock overrides with audit and monotonic policy versions', async () => {
    const { capabilityService, auditStore } = createHarness();
    const updated = await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        reason: 'Limit opening workflow presentation',
        changes: [
          { key: 'inventory.openingStock.actions.post', value: { allowed: false } },
          { key: 'inventory.openingStock.features.moduleInfo', value: { enabled: false } },
          { key: 'inventory.stock.fields.wac', value: { visible: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );
    expect(updated.version).toBe(1);

    const oneReset = await capabilityService.resetOverride(
      'org-a',
      'inventory.openingStock.features.moduleInfo',
      1,
      { actorId: 'platform-admin' },
      'Restore guidance',
    );
    expect(oneReset.version).toBe(2);
    expect(control(oneReset, 'inventory.openingStock.features.moduleInfo').override).toBeNull();

    const moduleReset = await capabilityService.resetModule(
      'org-a',
      'inventory.openingStock',
      2,
      { actorId: 'platform-admin' },
      'Restore Opening Stock defaults',
    );
    expect(moduleReset.version).toBe(3);
    expect(control(moduleReset, 'inventory.openingStock.actions.post').override).toBeNull();
    expect(control(moduleReset, 'inventory.stock.fields.wac').override).toEqual({ visible: false });
    expect(auditStore.listForTest().at(-1)).toMatchObject({
      actorId: 'platform-admin',
      organizationId: 'org-a',
      metadata: {
        controlKey: 'inventory.openingStock.actions.post',
        versionBefore: 2,
        versionAfter: 3,
        previousOverride: { allowed: false },
        newOverride: null,
      },
    });
  });

  it('isolates Stock-on-Hand module and valuation visibility policy by organization', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [
          { key: 'inventory.stock', value: { enabled: false } },
          { key: 'inventory.stock.fields.wac', value: { visible: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );
    await capabilityService.updatePolicy(
      'org-b',
      {
        expectedVersion: 0,
        changes: [{ key: 'inventory.stock.fields.inventoryValue', value: { visible: false } }],
      },
      { actorId: 'platform-admin' },
    );

    const orgA = await capabilityService.resolveEffective('org-a');
    const orgB = await capabilityService.resolveEffective('org-b');
    expect(control(orgA, 'inventory.stock').effectiveValue.enabled).toBe(false);
    expect(control(orgA, 'inventory.stock.actions.inspect').effectiveValue.allowed).toBe(false);
    expect(control(orgA, 'inventory.stock.fields.wac').override).toEqual({ visible: false });
    expect(control(orgB, 'inventory.stock').effectiveValue.enabled).toBe(true);
    expect(control(orgB, 'inventory.stock.fields.wac').effectiveValue.visible).toBe(true);
    expect(control(orgB, 'inventory.stock.fields.inventoryValue').effectiveValue.visible).toBe(
      false,
    );
  });

  it('rejects unknown Stock controls and safety-controlled Stock identity fields', async () => {
    const { capabilityService } = createHarness();

    await expect(
      capabilityService.updatePolicy(
        'org-a',
        {
          expectedVersion: 0,
          changes: [{ key: 'inventory.stock.fields.unknown', value: { visible: false } }],
        },
        { actorId: 'platform-admin' },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    await expect(
      capabilityService.updatePolicy(
        'org-a',
        {
          expectedVersion: 0,
          changes: [{ key: 'inventory.stock.fields.quantityBase', value: { visible: false } }],
        },
        { actorId: 'platform-admin' },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('resets only Stock-on-Hand overrides and emits auditable version transitions', async () => {
    const { capabilityService, auditStore } = createHarness();
    const updated = await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        reason: 'Hide valuation from store users',
        changes: [
          { key: 'inventory.stock.fields.wac', value: { visible: false } },
          { key: 'inventory.stock.widgets.expiringExpired', value: { visible: false } },
          { key: 'inventory.categories.widgets.totalCategories', value: { visible: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );
    expect(updated.version).toBe(1);

    const oneReset = await capabilityService.resetOverride(
      'org-a',
      'inventory.stock.fields.wac',
      1,
      { actorId: 'platform-admin' },
      'Restore WAC',
    );
    expect(oneReset.version).toBe(2);
    expect(control(oneReset, 'inventory.stock.fields.wac').override).toBeNull();

    const moduleReset = await capabilityService.resetModule('org-a', 'inventory.stock', 2, {
      actorId: 'platform-admin',
    });
    expect(moduleReset.version).toBe(3);
    expect(control(moduleReset, 'inventory.stock.widgets.expiringExpired').override).toBeNull();
    expect(control(moduleReset, 'inventory.categories.widgets.totalCategories').override).toEqual({
      visible: false,
    });

    const events = auditStore.listForTest();
    expect(events).toHaveLength(5);
    expect(events.at(-1)).toMatchObject({
      actorId: 'platform-admin',
      metadata: {
        controlKey: 'inventory.stock.widgets.expiringExpired',
        versionBefore: 2,
        versionAfter: 3,
        previousOverride: { visible: false },
        newOverride: null,
      },
    });
  });

  it('lets platform policy management re-enable a disabled Stock-on-Hand module', async () => {
    const { capabilityService } = createHarness();
    const disabled = await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'inventory.stock', value: { enabled: false } }],
      },
      { actorId: 'platform-admin' },
    );
    expect(control(disabled, 'inventory.stock').effectiveValue.enabled).toBe(false);

    const enabled = await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 1,
        changes: [{ key: 'inventory.stock', value: { enabled: true } }],
      },
      { actorId: 'platform-admin' },
    );
    expect(enabled.version).toBe(2);
    expect(control(enabled, 'inventory.stock').effectiveValue.enabled).toBe(true);
    expect(control(enabled, 'inventory.stock').override).toBeNull();
  });

  it('rejects unknown controls and safety-controlled modes', async () => {
    const { capabilityService } = createHarness();

    await expect(
      capabilityService.updatePolicy(
        'org-a',
        { expectedVersion: 0, changes: [{ key: 'unknown.control', value: { enabled: false } }] },
        { actorId: 'platform-admin' },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    await expect(
      capabilityService.updatePolicy(
        'org-a',
        {
          expectedVersion: 0,
          changes: [
            {
              key: 'inventory.products.fields.sku',
              value: { editable: false },
              arbitrary: true,
            },
          ],
        },
        { actorId: 'platform-admin' },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    await expect(
      capabilityService.updatePolicy(
        'org-a',
        {
          expectedVersion: 0,
          changes: [{ key: 'inventory.products.fields.baseUnit', value: { editable: false } }],
        },
        { actorId: 'platform-admin' },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('increments versions, emits per-control audit evidence, and rejects stale updates', async () => {
    const { capabilityService, auditStore } = createHarness();
    const first = await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        reason: 'Client operating policy',
        changes: [
          { key: 'inventory.products.widgets.lowStock', value: { visible: false } },
          { key: 'inventory.products.fields.sku', value: { editable: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );

    expect(first.version).toBe(1);
    expect(auditStore.listForTest()).toHaveLength(2);
    expect(auditStore.listForTest()[0]).toMatchObject({
      organizationId: 'org-a',
      actorId: 'platform-admin',
      action: 'organization_capability.changed',
      metadata: {
        versionBefore: 0,
        versionAfter: 1,
        effectiveBefore: { visible: true },
        effectiveAfter: { visible: false },
      },
    });

    await expect(
      capabilityService.updatePolicy(
        'org-a',
        {
          expectedVersion: 0,
          changes: [{ key: 'inventory.products.widgets.trackedItems', value: { visible: false } }],
        },
        { actorId: 'platform-admin' },
      ),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  });

  it('isolates a disabled Categories module to its target organization', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'inventory.categories', value: { enabled: false } }],
      },
      { actorId: 'platform-admin' },
    );

    const orgA = await capabilityService.resolveEffective('org-a');
    const orgB = await capabilityService.resolveEffective('org-b');
    expect(control(orgA, 'inventory.categories').effectiveValue.enabled).toBe(false);
    expect(control(orgA, 'inventory.categories.actions.create').effectiveValue.allowed).toBe(false);
    expect(control(orgB, 'inventory.categories').effectiveValue.enabled).toBe(true);
    expect(control(orgB, 'inventory.categories.actions.create').effectiveValue.allowed).toBe(true);
  });

  it('isolates organization policies and applies disabled parents to descendants', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'inventory.products', value: { enabled: false } }],
      },
      { actorId: 'platform-admin' },
    );
    await capabilityService.updatePolicy(
      'org-b',
      {
        expectedVersion: 0,
        changes: [{ key: 'inventory.products.fields.sku', value: { editable: false } }],
      },
      { actorId: 'platform-admin' },
    );

    const orgA = await capabilityService.resolveEffective('org-a');
    const orgB = await capabilityService.resolveEffective('org-b');
    expect(control(orgA, 'inventory.products').effectiveValue.enabled).toBe(false);
    expect(control(orgA, 'inventory.products.views.desktopCards').effectiveValue.enabled).toBe(
      false,
    );
    expect(control(orgA, 'inventory.products.fields.sku').effectiveValue.editable).toBe(false);
    await expect(capabilityService.assertProductCreateAllowed('org-a')).rejects.toMatchObject({
      code: 'ORG_ACTION_NOT_ALLOWED',
    });
    expect(control(orgB, 'inventory.products.views.desktopCards').effectiveValue.enabled).toBe(
      true,
    );
    expect(control(orgB, 'inventory.products.fields.sku').effectiveValue.editable).toBe(false);
    expect(control(orgB, 'inventory.products.fields.sku').effectiveValue.visible).toBe(true);
  });

  it('blocks Category actions and read-only field mutations backend-side', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [
          { key: 'inventory.categories.actions.delete', value: { allowed: false } },
          { key: 'inventory.categories.fields.productClass', value: { editable: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );

    await expect(capabilityService.assertCategoryDeleteAllowed('org-a')).rejects.toMatchObject({
      code: 'ORG_ACTION_NOT_ALLOWED',
    });
    await expect(
      capabilityService.assertCategoryPatchAllowed(
        'org-a',
        { name: 'Inputs', productClass: 'general', status: 'active' },
        { productClass: 'seed' },
      ),
    ).rejects.toMatchObject({ code: 'ORG_FIELD_NOT_EDITABLE' });
  });

  it('allows hiding only the derived tracking display, not overriding the tracking rule', async () => {
    const { capabilityService } = createHarness();
    const result = await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [
          {
            key: 'inventory.categories.features.trackingRequirementDisplay',
            value: { enabled: false },
          },
        ],
      },
      { actorId: 'platform-admin' },
    );
    expect(
      control(result, 'inventory.categories.features.trackingRequirementDisplay').effectiveValue
        .enabled,
    ).toBe(false);
    await expect(
      capabilityService.updatePolicy(
        'org-a',
        {
          expectedVersion: 1,
          changes: [
            {
              key: 'inventory.categories.rules.trackingRequirement',
              value: { enabled: false },
            },
          ],
        },
        { actorId: 'platform-admin' },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('does not let organization policy bypass subscription or RBAC restrictions', async () => {
    const { capabilityService } = createHarness({
      resolveSubscriptionAccessState: async () => ({
        status: 'suspended',
        accessLevel: 'billing-access',
      }),
    });
    const suspended = await capabilityService.resolveEffective('org-a', {
      permissions: ['catalog.view', 'catalog.manage', 'pricing.view', 'pricing.manage'],
    });
    expect(control(suspended, 'inventory.products').effectiveValue.enabled).toBe(false);

    const { capabilityService: activeService } = createHarness();
    const noManagePermission = await activeService.resolveEffective('org-a', {
      permissions: ['catalog.view', 'pricing.view'],
    });
    expect(
      control(noManagePermission, 'inventory.products.actions.create').effectiveValue.allowed,
    ).toBe(false);
    expect(
      control(noManagePermission, 'inventory.products.actions.managePricing').effectiveValue
        .allowed,
    ).toBe(false);
  });

  it('returns stable action and field errors for blocked Product mutations', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [
          { key: 'inventory.products.actions.managePricing', value: { allowed: false } },
          { key: 'inventory.products.fields.sku', value: { editable: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );

    await expect(capabilityService.assertProductPricingAllowed('org-a')).rejects.toMatchObject({
      code: 'ORG_ACTION_NOT_ALLOWED',
    });
    await expect(
      capabilityService.assertProductPatchAllowed(
        'org-a',
        { name: 'Urea', sku: 'OLD', status: 'active' },
        { sku: 'NEW' },
      ),
    ).rejects.toMatchObject({ code: 'ORG_FIELD_NOT_EDITABLE' });
  });

  it('resets individual, module, and organization overrides without decreasing versions', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [
          { key: 'inventory.products.widgets.lowStock', value: { visible: false } },
          { key: 'inventory.products.actions.delete', value: { allowed: false } },
          { key: 'inventory.categories.widgets.totalCategories', value: { visible: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );
    const oneReset = await capabilityService.resetOverride(
      'org-a',
      'inventory.products.widgets.lowStock',
      1,
      { actorId: 'platform-admin' },
    );
    expect(oneReset.version).toBe(2);
    expect(control(oneReset, 'inventory.products.widgets.lowStock').effectiveValue.visible).toBe(
      true,
    );

    const moduleReset = await capabilityService.resetModule('org-a', 'inventory.products', 2, {
      actorId: 'platform-admin',
    });
    expect(moduleReset.version).toBe(3);
    expect(control(moduleReset, 'inventory.products.actions.delete').effectiveValue.allowed).toBe(
      true,
    );
    expect(control(moduleReset, 'inventory.categories.widgets.totalCategories').override).toEqual({
      visible: false,
    });

    const organizationReset = await capabilityService.resetAll('org-a', 3, {
      actorId: 'platform-admin',
    });
    expect(organizationReset.version).toBe(4);
    expect(
      control(organizationReset, 'inventory.categories.widgets.totalCategories').override,
    ).toBeNull();
  });

  it('registers safe Product Batch controls and rejects unknown or enforced-field overrides', async () => {
    const { capabilityService } = createHarness();
    const effective = await capabilityService.resolveEffective('org-a', {
      permissions: ['inventory.view', 'catalog.view'],
    });

    expect(control(effective, 'inventory.batches').effectiveValue.enabled).toBe(true);
    expect(control(effective, 'inventory.batches.views.desktopCards').effectiveValue.enabled).toBe(
      true,
    );
    expect(control(effective, 'inventory.batches.fields.batchNumber')).toMatchObject({
      platformEnforced: true,
      configurable: { visible: false },
      effectiveValue: { visible: true },
    });
    expect(control(effective, 'inventory.batches.fields.product')).toMatchObject({
      platformEnforced: true,
      configurable: { visible: false },
      effectiveValue: { visible: true },
    });
    expect(control(effective, 'inventory.batches.actions.inspect').effectiveValue.allowed).toBe(
      true,
    );

    await expect(
      capabilityService.updatePolicy(
        'org-a',
        {
          expectedVersion: 0,
          changes: [{ key: 'inventory.batches.fields.unknown', value: { visible: false } }],
        },
        { actorId: 'platform-admin' },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      capabilityService.updatePolicy(
        'org-a',
        {
          expectedVersion: 0,
          changes: [{ key: 'inventory.batches.fields.batchNumber', value: { visible: false } }],
        },
        { actorId: 'platform-admin' },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('isolates Product Batch policy and resets only its namespace with audit and versions', async () => {
    const { capabilityService, auditStore } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'inventory.batches', value: { enabled: false } }],
      },
      { actorId: 'platform-admin' },
    );
    await capabilityService.updatePolicy(
      'org-b',
      {
        expectedVersion: 0,
        reason: 'Limit Batch presentation',
        changes: [
          { key: 'inventory.batches.fields.expiryDate', value: { visible: false } },
          { key: 'inventory.batches.actions.inspect', value: { allowed: false } },
          { key: 'inventory.stock.fields.wac', value: { visible: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );

    const orgA = await capabilityService.resolveEffective('org-a');
    const orgB = await capabilityService.resolveEffective('org-b');
    expect(control(orgA, 'inventory.batches').effectiveValue.enabled).toBe(false);
    expect(control(orgA, 'inventory.batches.actions.inspect').effectiveValue.allowed).toBe(false);
    expect(control(orgB, 'inventory.batches').effectiveValue.enabled).toBe(true);
    expect(control(orgB, 'inventory.batches.fields.expiryDate').effectiveValue.visible).toBe(false);
    expect(control(orgB, 'inventory.batches.actions.inspect').effectiveValue.allowed).toBe(false);

    await expect(
      capabilityService.assertAllowed('org-a', 'inventory.batches', 'enabled'),
    ).rejects.toMatchObject({ code: 'ORG_CAPABILITY_DISABLED' });
    await expect(
      capabilityService.assertAllowed('org-b', 'inventory.batches', 'enabled'),
    ).resolves.toBeTruthy();

    const oneReset = await capabilityService.resetOverride(
      'org-b',
      'inventory.batches.fields.expiryDate',
      1,
      { actorId: 'platform-admin' },
      'Restore expiry presentation',
    );
    expect(oneReset.version).toBe(2);
    expect(control(oneReset, 'inventory.batches.fields.expiryDate').override).toBeNull();
    expect(control(oneReset, 'inventory.batches.fields.expiryDate').effectiveValue.visible).toBe(
      true,
    );

    const moduleReset = await capabilityService.resetModule(
      'org-b',
      'inventory.batches',
      2,
      { actorId: 'platform-admin' },
      'Restore Product Batch defaults',
    );
    expect(moduleReset.version).toBe(3);
    expect(control(moduleReset, 'inventory.batches.actions.inspect').override).toBeNull();
    expect(control(moduleReset, 'inventory.stock.fields.wac').override).toEqual({ visible: false });
    expect(
      control(await capabilityService.resolveEffective('org-a'), 'inventory.batches'),
    ).toMatchObject({ effectiveValue: { enabled: false } });
    expect(auditStore.listForTest().at(-1)).toMatchObject({
      actorId: 'platform-admin',
      organizationId: 'org-b',
      metadata: {
        controlKey: 'inventory.batches.actions.inspect',
        versionBefore: 2,
        versionAfter: 3,
        previousOverride: { allowed: false },
        newOverride: null,
      },
    });
  });

  it('blocks Batch cross-module actions when their target module is unavailable', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [
          { key: 'inventory.products', value: { enabled: false } },
          { key: 'inventory.stock', value: { enabled: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );

    const effective = await capabilityService.resolveEffective('org-a');
    expect(control(effective, 'inventory.batches.actions.viewProduct')).toMatchObject({
      effectiveValue: { allowed: false },
      reasons: ['dependency_disabled'],
    });
    expect(control(effective, 'inventory.batches.actions.viewStock')).toMatchObject({
      effectiveValue: { allowed: false },
      reasons: ['dependency_disabled'],
    });
    expect(
      control(effective, 'inventory.batches.actions.viewMovements').effectiveValue.allowed,
    ).toBe(true);
  });
});
