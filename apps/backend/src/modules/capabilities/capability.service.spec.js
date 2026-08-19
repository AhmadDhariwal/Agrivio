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

describe('Organization Capability Policy foundation and Products reference module', () => {
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
      metadata: { versionBefore: 0, versionAfter: 1 },
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
  });
});
