import { describe, expect, it } from 'vitest';
import transactionRunnerModule from '../../platform/transactions/transaction-runner';
import auditWriterModule from '../../platform/audit/audit-writer';
import capabilityStoreModule from '../capabilities/capability.store';
import capabilityServiceModule from '../capabilities/capability.service';
import capabilityRegistryModule from '../capabilities/capability.registry';

const { createMockTransactionSessionPort, createTransactionRunner } = transactionRunnerModule;
const { createInMemoryAuditEventStore } = auditWriterModule;
const { createInMemoryCapabilityPolicyStore } = capabilityStoreModule;
const { createCapabilityService } = capabilityServiceModule;
const { CONTROL_TYPES, MOVEMENTS_MODULE_KEY, getCapabilityControl, listCapabilityControls } =
  capabilityRegistryModule;

const FEATURE_IDS = [
  'moduleInfo',
  'search',
  'filters',
  'kpiCards',
  'referenceResolution',
  'inspector',
  'technicalDetails',
  'mobileCards',
];
const FIELD_IDS = [
  'product',
  'warehouse',
  'direction',
  'quantity',
  'sourceType',
  'batch',
  'inventoryValue',
];
const ACTION_IDS = ['refresh', 'inspect', 'viewStock', 'viewProduct', 'viewBatch'];

function createHarness() {
  const store = createInMemoryCapabilityPolicyStore();
  const auditStore = createInMemoryAuditEventStore();
  const capabilityService = createCapabilityService({
    store,
    auditStore,
    transactionRunner: createTransactionRunner(createMockTransactionSessionPort().port),
    resolveSubscriptionAccessState: async () => ({ status: 'active', accessLevel: 'operational' }),
  });
  return { capabilityService, auditStore };
}

function control(result, key) {
  return result.controls.find((item) => item.key === key);
}

describe('Stock Movements capability registry', () => {
  it('registers the root MODULE and exactly 21 Stock Movements controls', () => {
    expect(MOVEMENTS_MODULE_KEY).toBe('inventory.movements');
    expect(
      listCapabilityControls().filter((item) => item.moduleKey === MOVEMENTS_MODULE_KEY),
    ).toHaveLength(21);
    expect(getCapabilityControl(MOVEMENTS_MODULE_KEY)).toMatchObject({
      type: CONTROL_TYPES.Module,
      parentKey: 'inventory',
      defaultPolicy: { enabled: true },
      configurable: { enabled: true },
      risk: 'CRITICAL',
      requiredPermissions: { enabled: 'inventory.view' },
    });
  });

  it('registers all requested configurable features', () => {
    for (const id of FEATURE_IDS) {
      expect(getCapabilityControl(`inventory.movements.features.${id}`)).toMatchObject({
        type: CONTROL_TYPES.Feature,
        defaultPolicy: { enabled: true },
        configurable: { enabled: true },
        requiredPermissions: { enabled: 'inventory.view' },
      });
    }
  });

  it('keeps every core movement field visible and platform enforced', () => {
    for (const id of FIELD_IDS) {
      expect(getCapabilityControl(`inventory.movements.fields.${id}`)).toMatchObject({
        type: CONTROL_TYPES.Field,
        defaultPolicy: { visible: true },
        configurable: { visible: false },
        platformEnforced: true,
        requiredPermissions: { visible: 'inventory.view' },
      });
    }
  });

  it('registers only the five meaningful read-only actions and their dependencies', () => {
    const actions = listCapabilityControls().filter(
      (item) => item.moduleKey === MOVEMENTS_MODULE_KEY && item.type === CONTROL_TYPES.Action,
    );
    expect(actions.map((item) => item.key)).toEqual(
      ACTION_IDS.map((id) => `inventory.movements.actions.${id}`),
    );
    expect(getCapabilityControl('inventory.movements.actions.viewStock').dependencies).toEqual([
      'inventory.stock',
    ]);
    expect(getCapabilityControl('inventory.movements.actions.viewProduct').dependencies).toEqual([
      'inventory.products',
    ]);
    expect(getCapabilityControl('inventory.movements.actions.viewBatch').dependencies).toEqual([
      'inventory.batches',
    ]);
    for (const action of actions) {
      expect(action.requiredPermissions).toEqual({ allowed: 'inventory.view' });
    }
    for (const forbidden of ['edit', 'delete', 'reverse', 'post']) {
      expect(getCapabilityControl(`inventory.movements.actions.${forbidden}`)).toBeNull();
    }
  });

  it('rejects unknown keys and overrides for platform-enforced fields', async () => {
    const { capabilityService } = createHarness();
    await expect(
      capabilityService.updatePolicy(
        'org-a',
        {
          expectedVersion: 0,
          changes: [{ key: 'inventory.movements.features.nonExistent', value: { enabled: false } }],
        },
        { actorId: 'platform-admin' },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    for (const id of FIELD_IDS) {
      await expect(
        capabilityService.updatePolicy(
          'org-a',
          {
            expectedVersion: 0,
            changes: [{ key: `inventory.movements.fields.${id}`, value: { visible: false } }],
          },
          { actorId: 'platform-admin' },
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    }
  });
});

describe('Stock Movements capability resolution and isolation', () => {
  it('preserves current read-only behavior by default', async () => {
    const { capabilityService } = createHarness();
    const effective = await capabilityService.resolveEffective('org-a', {
      permissions: ['inventory.view', 'catalog.view'],
    });

    expect(control(effective, MOVEMENTS_MODULE_KEY).effectiveValue.enabled).toBe(true);
    for (const id of FEATURE_IDS) {
      expect(control(effective, `inventory.movements.features.${id}`).effectiveValue.enabled).toBe(
        true,
      );
    }
    for (const id of FIELD_IDS) {
      expect(control(effective, `inventory.movements.fields.${id}`).effectiveValue.visible).toBe(
        true,
      );
    }
    for (const id of ACTION_IDS) {
      expect(control(effective, `inventory.movements.actions.${id}`).effectiveValue.allowed).toBe(
        true,
      );
    }
  });

  it('disables only org-a Stock Movements while org-b and other inventory modules remain enabled', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: MOVEMENTS_MODULE_KEY, value: { enabled: false } }],
      },
      { actorId: 'platform-admin' },
    );

    const orgA = await capabilityService.resolveEffective('org-a');
    const orgB = await capabilityService.resolveEffective('org-b');
    expect(control(orgA, MOVEMENTS_MODULE_KEY).effectiveValue.enabled).toBe(false);
    expect(control(orgB, MOVEMENTS_MODULE_KEY).effectiveValue.enabled).toBe(true);
    for (const key of [
      'inventory.products',
      'inventory.stock',
      'inventory.batches',
      'inventory.adjustments',
      'inventory.transfers',
      'inventory.reconciliation',
    ]) {
      expect(control(orgA, key).effectiveValue.enabled).toBe(true);
    }
  });

  it.each([
    ['inventory.stock', 'viewStock'],
    ['inventory.products', 'viewProduct'],
    ['inventory.batches', 'viewBatch'],
  ])('blocks %s navigation only for the dependent %s action', async (dependency, action) => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      { expectedVersion: 0, changes: [{ key: dependency, value: { enabled: false } }] },
      { actorId: 'platform-admin' },
    );

    const effective = await capabilityService.resolveEffective('org-a');
    expect(control(effective, MOVEMENTS_MODULE_KEY).effectiveValue.enabled).toBe(true);
    expect(control(effective, `inventory.movements.actions.${action}`)).toMatchObject({
      effectiveValue: { allowed: false },
      reasons: ['dependency_disabled'],
    });
    expect(control(effective, 'inventory.movements.actions.inspect').effectiveValue.allowed).toBe(
      true,
    );
  });

  it('capabilities cannot grant inventory.view or bypass existing RBAC', async () => {
    const { capabilityService } = createHarness();
    const effective = await capabilityService.resolveEffective('org-a', { permissions: [] });
    expect(control(effective, MOVEMENTS_MODULE_KEY)).toMatchObject({
      configuredValue: { enabled: true },
      effectiveValue: { enabled: false },
      reasons: ['permission_denied'],
    });
    for (const id of ACTION_IDS) {
      expect(control(effective, `inventory.movements.actions.${id}`).effectiveValue.allowed).toBe(
        false,
      );
    }
  });

  it('resets only the movements namespace with version, actor, reason, and audit evidence', async () => {
    const { capabilityService, auditStore } = createHarness();
    const preservedKeys = [
      ['inventory.products.actions.inspect', { allowed: false }],
      ['inventory.categories.actions.inspect', { allowed: false }],
      ['inventory.stock.actions.inspect', { allowed: false }],
      ['inventory.openingStock.features.moduleInfo', { enabled: false }],
      ['inventory.batches.actions.inspect', { allowed: false }],
      ['inventory.expiry.features.moduleInfo', { enabled: false }],
      ['inventory.adjustments.actions.viewStock', { allowed: false }],
      ['inventory.transfers.actions.inspect', { allowed: false }],
      ['inventory.reconciliation.actions.inspect', { allowed: false }],
    ];
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        reason: 'Configure movement inquiry',
        changes: [
          { key: MOVEMENTS_MODULE_KEY, value: { enabled: false } },
          { key: 'inventory.movements.actions.inspect', value: { allowed: false } },
          ...preservedKeys.map(([key, value]) => ({ key, value })),
        ],
      },
      { actorId: 'platform-admin' },
    );
    await capabilityService.updatePolicy(
      'org-b',
      {
        expectedVersion: 0,
        changes: [{ key: 'inventory.movements.actions.inspect', value: { allowed: false } }],
      },
      { actorId: 'other-admin' },
    );

    const reset = await capabilityService.resetModule(
      'org-a',
      MOVEMENTS_MODULE_KEY,
      1,
      { actorId: 'platform-admin' },
      'Restore movement inquiry defaults',
    );

    expect(reset.version).toBe(2);
    expect(control(reset, MOVEMENTS_MODULE_KEY).override).toBeNull();
    expect(control(reset, 'inventory.movements.actions.inspect').override).toBeNull();
    for (const [key, value] of preservedKeys) {
      expect(control(reset, key).override).toEqual(value);
    }
    const orgB = await capabilityService.resolveEffective('org-b');
    expect(control(orgB, 'inventory.movements.actions.inspect').override).toEqual({
      allowed: false,
    });

    const resetEvents = auditStore
      .listForTest()
      .filter(
        (event) =>
          event.organizationId === 'org-a' &&
          event.metadata?.versionBefore === 1 &&
          event.metadata?.versionAfter === 2,
      );
    expect(resetEvents).toHaveLength(2);
    for (const event of resetEvents) {
      expect(event).toMatchObject({
        actorId: 'platform-admin',
        organizationId: 'org-a',
        reason: 'Restore movement inquiry defaults',
        metadata: { newOverride: null },
      });
      expect(event.occurredAt).toBeInstanceOf(Date);
      expect(event.metadata.controlKey.startsWith('inventory.movements')).toBe(true);
    }
  });
});
