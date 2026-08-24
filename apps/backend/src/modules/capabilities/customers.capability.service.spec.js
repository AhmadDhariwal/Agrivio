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

describe('Customers capability controls', () => {
  it('preserves current Customers behavior when an organization has no policy document', async () => {
    const { capabilityService } = createHarness();
    const effective = await capabilityService.resolveEffective('org-a', {
      permissions: ['customers.view', 'customers.manage', 'customers.credit-policy.manage', 'customers.opening-balance.post'],
    });

    expect(control(effective, 'customers').effectiveValue.enabled).toBe(true);
    expect(control(effective, 'customers.views.desktopCards').effectiveValue.enabled).toBe(true);
    expect(control(effective, 'customers.features.moduleInfo').effectiveValue.enabled).toBe(true);
    expect(control(effective, 'customers.features.search').effectiveValue.enabled).toBe(true);
    expect(control(effective, 'customers.features.statusFilter').effectiveValue.enabled).toBe(true);
    expect(control(effective, 'customers.features.kpiCards').effectiveValue.enabled).toBe(true);
    expect(control(effective, 'customers.features.inspector').effectiveValue.enabled).toBe(true);
    expect(control(effective, 'customers.features.technicalDetails').effectiveValue.enabled).toBe(true);
    expect(control(effective, 'customers.features.creditSection').effectiveValue.enabled).toBe(true);
    expect(control(effective, 'customers.fields.name').effectiveValue).toMatchObject({ visible: true });
    expect(control(effective, 'customers.fields.phone').effectiveValue).toMatchObject({ visible: true, editable: true });
    expect(control(effective, 'customers.fields.customerType').effectiveValue).toMatchObject({ visible: true });
    expect(control(effective, 'customers.fields.priceTier').effectiveValue).toMatchObject({ visible: true, editable: true });
    expect(control(effective, 'customers.fields.creditLimit').effectiveValue).toMatchObject({ visible: true, editable: true });
    expect(control(effective, 'customers.fields.creditLimitBehaviour').effectiveValue).toMatchObject({ visible: true, editable: true });
    expect(control(effective, 'customers.fields.derivedBalances').effectiveValue).toMatchObject({ visible: true });
    expect(control(effective, 'customers.fields.openingBalance').effectiveValue).toMatchObject({ visible: true });
    expect(control(effective, 'customers.actions.create').effectiveValue.allowed).toBe(true);
    expect(control(effective, 'customers.actions.inspect').effectiveValue.allowed).toBe(true);
    expect(control(effective, 'customers.actions.edit').effectiveValue.allowed).toBe(true);
    expect(control(effective, 'customers.actions.deactivate').effectiveValue.allowed).toBe(true);
    expect(control(effective, 'customers.actions.reactivate').effectiveValue.allowed).toBe(true);
    expect(control(effective, 'customers.actions.delete').effectiveValue.allowed).toBe(true);
    expect(control(effective, 'customers.actions.editCreditPolicy').effectiveValue.allowed).toBe(true);
    expect(control(effective, 'customers.actions.postOpeningBalance').effectiveValue.allowed).toBe(true);
    expect(control(effective, 'customers.actions.refresh').effectiveValue.allowed).toBe(true);
  });

  it('blocks all Customers controls when the module is disabled', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      { expectedVersion: 0, changes: [{ key: 'customers', value: { enabled: false } }] },
      { actorId: 'platform-admin' },
    );
    const effective = await capabilityService.resolveEffective('org-a', {
      permissions: ['customers.view', 'customers.manage'],
    });
    expect(control(effective, 'customers').effectiveValue.enabled).toBe(false);
    expect(control(effective, 'customers.views.desktopCards').effectiveValue.enabled).toBe(false);
    expect(control(effective, 'customers.features.moduleInfo').effectiveValue.enabled).toBe(false);
    expect(control(effective, 'customers.actions.create').effectiveValue.allowed).toBe(false);
    expect(control(effective, 'customers.actions.edit').effectiveValue.allowed).toBe(false);
    expect(control(effective, 'customers.actions.delete').effectiveValue.allowed).toBe(false);
    expect(control(effective, 'customers.fields.phone').effectiveValue.editable).toBe(false);
  });

  it('rejects unknown capability keys', async () => {
    const { capabilityService } = createHarness();
    await expect(
      capabilityService.updatePolicy(
        'org-a',
        { expectedVersion: 0, changes: [{ key: 'customers.nonexistent.key', value: { enabled: false } }] },
        { actorId: 'platform-admin' },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('rejects overriding a platform-enforced field (customers.fields.name visible)', async () => {
    const { capabilityService } = createHarness();
    await expect(
      capabilityService.updatePolicy(
        'org-a',
        { expectedVersion: 0, changes: [{ key: 'customers.fields.name', value: { visible: false } }] },
        { actorId: 'platform-admin' },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('rejects overriding a platform-enforced field (customers.fields.derivedBalances visible)', async () => {
    const { capabilityService } = createHarness();
    await expect(
      capabilityService.updatePolicy(
        'org-a',
        { expectedVersion: 0, changes: [{ key: 'customers.fields.derivedBalances', value: { visible: false } }] },
        { actorId: 'platform-admin' },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('assertAllowed rejects ORG_CAPABILITY_DISABLED when module is off', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      { expectedVersion: 0, changes: [{ key: 'customers', value: { enabled: false } }] },
      { actorId: 'platform-admin' },
    );
    await expect(capabilityService.assertAllowed('org-a', 'customers', 'enabled')).rejects.toMatchObject({ code: 'ORG_CAPABILITY_DISABLED' });
    await expect(capabilityService.assertAllowed('org-a', 'customers.actions.create', 'allowed')).rejects.toMatchObject({ code: 'ORG_ACTION_NOT_ALLOWED' });
    await expect(capabilityService.assertAllowed('org-a', 'customers.actions.delete', 'allowed')).rejects.toMatchObject({ code: 'ORG_ACTION_NOT_ALLOWED' });
  });

  it('enforces permission_denied intersection when user lacks customers.view', async () => {
    const { capabilityService } = createHarness();
    const effective = await capabilityService.resolveEffective('org-a', { permissions: [] });
    expect(control(effective, 'customers').effectiveValue.enabled).toBe(false);
    expect(control(effective, 'customers').reasons).toContain('permission_denied');
    expect(control(effective, 'customers.actions.create').effectiveValue.allowed).toBe(false);
    expect(control(effective, 'customers.actions.editCreditPolicy').effectiveValue.allowed).toBe(false);
  });

  it('preserves RBAC intersection — view permission does not grant manage actions', async () => {
    const { capabilityService } = createHarness();
    const effective = await capabilityService.resolveEffective('org-a', { permissions: ['customers.view'] });
    expect(control(effective, 'customers.actions.create').effectiveValue.allowed).toBe(false);
    expect(control(effective, 'customers.actions.create').reasons).toContain('permission_denied');
    expect(control(effective, 'customers.actions.editCreditPolicy').effectiveValue.allowed).toBe(false);
    expect(control(effective, 'customers.actions.postOpeningBalance').effectiveValue.allowed).toBe(false);
    expect(control(effective, 'customers.actions.inspect').effectiveValue.allowed).toBe(true);
  });

  it('allows disabling the delete action independently', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      { expectedVersion: 0, changes: [{ key: 'customers.actions.delete', value: { allowed: false } }] },
      { actorId: 'platform-admin' },
    );
    const effective = await capabilityService.resolveEffective('org-a', { permissions: ['customers.view', 'customers.manage'] });
    expect(control(effective, 'customers').effectiveValue.enabled).toBe(true);
    expect(control(effective, 'customers.actions.delete').effectiveValue.allowed).toBe(false);
    expect(control(effective, 'customers.actions.inspect').effectiveValue.allowed).toBe(true);
    await expect(capabilityService.assertAllowed('org-a', 'customers.actions.delete', 'allowed')).rejects.toMatchObject({ code: 'ORG_ACTION_NOT_ALLOWED' });
    await expect(capabilityService.assertAllowed('org-a', 'customers.actions.inspect', 'allowed')).resolves.toBeTruthy();
  });

  it('allows disabling optional field visibility (priceTier) without breaking required name field', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      { expectedVersion: 0, changes: [{ key: 'customers.fields.priceTier', value: { visible: false, editable: false } }] },
      { actorId: 'platform-admin' },
    );
    const effective = await capabilityService.resolveEffective('org-a', { permissions: ['customers.view', 'customers.manage'] });
    expect(control(effective, 'customers.fields.name').effectiveValue.visible).toBe(true);
    expect(control(effective, 'customers.fields.priceTier').effectiveValue.visible).toBe(false);
    expect(control(effective, 'customers.fields.priceTier').effectiveValue.editable).toBe(false);
  });

  it('resets only Customers overrides and leaves other modules intact with version increment', async () => {
    const { capabilityService, auditStore } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        reason: 'Restrict Customers for org-a',
        changes: [
          { key: 'customers.actions.delete', value: { allowed: false } },
          { key: 'customers.features.creditSection', value: { enabled: false } },
          { key: 'inventory.stock.fields.wac', value: { visible: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );

    const moduleReset = await capabilityService.resetModule('org-a', 'customers', 1, { actorId: 'platform-admin' }, 'Restore Customers defaults');
    expect(moduleReset.version).toBe(2);
    expect(control(moduleReset, 'customers.actions.delete').override).toBeNull();
    expect(control(moduleReset, 'customers.features.creditSection').override).toBeNull();
    expect(control(moduleReset, 'inventory.stock.fields.wac').override).toEqual({ visible: false });
    expect(auditStore.listForTest().at(-1)).toMatchObject({
      actorId: 'platform-admin',
      organizationId: 'org-a',
      metadata: { versionBefore: 1, versionAfter: 2 },
    });
  });

  it('isolates policy between two organizations', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy('org-a', { expectedVersion: 0, changes: [{ key: 'customers', value: { enabled: false } }] }, { actorId: 'platform-admin' });
    await capabilityService.updatePolicy('org-b', { expectedVersion: 0, changes: [{ key: 'customers.fields.priceTier', value: { visible: false, editable: false } }] }, { actorId: 'platform-admin' });

    const orgA = await capabilityService.resolveEffective('org-a');
    const orgB = await capabilityService.resolveEffective('org-b');

    expect(control(orgA, 'customers').effectiveValue.enabled).toBe(false);
    expect(control(orgA, 'customers.actions.create').effectiveValue.allowed).toBe(false);
    expect(control(orgB, 'customers').effectiveValue.enabled).toBe(true);
    expect(control(orgB, 'customers.actions.create').effectiveValue.allowed).toBe(true);
    expect(control(orgB, 'customers.fields.priceTier').effectiveValue.visible).toBe(false);

    await expect(capabilityService.assertAllowed('org-a', 'customers', 'enabled')).rejects.toMatchObject({ code: 'ORG_CAPABILITY_DISABLED' });
    await expect(capabilityService.assertAllowed('org-b', 'customers', 'enabled')).resolves.toBeTruthy();
  });

  it('increments policy version monotonically', async () => {
    const { capabilityService } = createHarness();
    const v1 = await capabilityService.updatePolicy('org-a', { expectedVersion: 0, changes: [{ key: 'customers.actions.delete', value: { allowed: false } }] }, { actorId: 'platform-admin' });
    expect(v1.version).toBe(1);
    const v2 = await capabilityService.updatePolicy('org-a', { expectedVersion: 1, changes: [{ key: 'customers.features.creditSection', value: { enabled: false } }] }, { actorId: 'platform-admin' });
    expect(v2.version).toBe(2);
  });

  it('Platform Super Admin can re-enable the Customers module after it was disabled', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy('org-a', { expectedVersion: 0, changes: [{ key: 'customers', value: { enabled: false } }] }, { actorId: 'platform-admin' });
    await expect(capabilityService.assertAllowed('org-a', 'customers', 'enabled')).rejects.toMatchObject({ code: 'ORG_CAPABILITY_DISABLED' });
    await capabilityService.resetOverride('org-a', 'customers', 1, { actorId: 'platform-admin' });
    await expect(capabilityService.assertAllowed('org-a', 'customers', 'enabled')).resolves.toBeTruthy();
  });

  it('emits audit events with actor, organization, control key, before/after override, and version evidence', async () => {
    const { capabilityService, auditStore } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      { expectedVersion: 0, reason: 'Compliance restriction', changes: [{ key: 'customers.actions.delete', value: { allowed: false } }] },
      { actorId: 'admin-user-1' },
    );
    const events = auditStore.listForTest();
    expect(events.length).toBe(1);
    expect(events[0]).toMatchObject({
      actorId: 'admin-user-1',
      organizationId: 'org-a',
      action: 'organization_capability.changed',
      reason: 'Compliance restriction',
      metadata: {
        versionBefore: 0,
        versionAfter: 1,
        controlKey: 'customers.actions.delete',
        previousOverride: null,
        newOverride: { allowed: false },
      },
    });
  });

  it('blocks subscription-unavailable organizations from using Customers', async () => {
    const { capabilityService } = createHarness({
      resolveSubscriptionAccessState: async () => ({ status: 'suspended', accessLevel: 'read_only' }),
    });
    const effective = await capabilityService.resolveEffective('org-a', { permissions: ['customers.view', 'customers.manage'] });
    expect(control(effective, 'customers').effectiveValue.enabled).toBe(false);
    expect(control(effective, 'customers').reasons).toContain('subscription_unavailable');
  });
});

