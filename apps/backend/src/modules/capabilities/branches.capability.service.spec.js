import { describe, expect, it } from 'vitest';
import transactionRunnerModule from '../../platform/transactions/transaction-runner';
import auditWriterModule from '../../platform/audit/audit-writer';
import capabilityStoreModule from './capability.store';
import capabilityServiceModule from './capability.service';
import capabilityRegistryModule from './capability.registry';

const { createMockTransactionSessionPort, createTransactionRunner } = transactionRunnerModule;
const { createInMemoryAuditEventStore } = auditWriterModule;
const { createInMemoryCapabilityPolicyStore } = capabilityStoreModule;
const { createCapabilityService } = capabilityServiceModule;
const { listCapabilityControls } = capabilityRegistryModule;

const BRANCH_KEYS = [
  'branches',
  'branches.features.moduleInfo',
  'branches.features.search',
  'branches.features.statusFilter',
  'branches.fields.name',
  'branches.fields.invoicePrefix',
  'branches.fields.code',
  'branches.fields.status',
  'branches.actions.create',
  'branches.actions.edit',
  'branches.actions.deactivate',
  'branches.actions.reactivate',
  'branches.actions.delete',
  'branches.actions.refresh',
];

function createHarness() {
  const auditStore = createInMemoryAuditEventStore();
  return {
    auditStore,
    capabilityService: createCapabilityService({
      store: createInMemoryCapabilityPolicyStore(),
      auditStore,
      transactionRunner: createTransactionRunner(createMockTransactionSessionPort().port),
      resolveSubscriptionAccessState: async () => ({
        status: 'active',
        accessLevel: 'operational',
      }),
    }),
  };
}

function control(result, key) {
  return result.controls.find((item) => item.key === key);
}

describe('Branches capability controls', () => {
  it('registers exactly the source-backed controls and field safety policy', () => {
    const controls = listCapabilityControls().filter((item) => item.moduleKey === 'branches');
    expect(controls.map((item) => item.key)).toEqual(BRANCH_KEYS);
    expect(controls.find((item) => item.key === 'branches.fields.name')).toMatchObject({
      defaultPolicy: { visible: true, editable: true },
      configurable: { visible: false, editable: false },
      platformEnforced: true,
    });
    expect(controls.find((item) => item.key === 'branches.fields.invoicePrefix')).toMatchObject({
      configurable: { visible: false, editable: false },
      platformEnforced: true,
    });
    expect(controls.find((item) => item.key === 'branches.fields.code')).toMatchObject({
      configurable: { visible: true, editable: true },
    });
    expect(controls.find((item) => item.key === 'branches.fields.status')).toMatchObject({
      configurable: { visible: true, editable: true },
    });
  });

  it('resolves defaults, sparse overrides, effective parent restriction, isolation, and reset', async () => {
    const { capabilityService, auditStore } = createHarness();
    const defaults = await capabilityService.resolveEffective('org-a', {
      permissions: ['branches.view', 'branches.manage'],
    });
    expect(control(defaults, 'branches.actions.create')).toMatchObject({
      override: null,
      configuredValue: { allowed: true },
      effectiveValue: { allowed: true },
    });

    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [
          { key: 'branches', value: { enabled: false } },
          { key: 'branches.actions.delete', value: { allowed: false } },
          { key: 'customers.features.search', value: { enabled: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );
    const restricted = await capabilityService.resolveEffective('org-a', {
      permissions: ['branches.view', 'branches.manage'],
    });
    expect(control(restricted, 'branches').effectiveValue.enabled).toBe(false);
    expect(control(restricted, 'branches.actions.create').effectiveValue.allowed).toBe(false);
    expect(control(restricted, 'branches.actions.create').reasons).toContain('parent_disabled');
    expect(
      control(await capabilityService.resolveEffective('org-b'), 'branches').effectiveValue.enabled,
    ).toBe(true);

    const reset = await capabilityService.resetModule(
      'org-a',
      'branches',
      1,
      { actorId: 'platform-admin' },
      'Restore Branch defaults',
    );
    expect(reset.version).toBe(2);
    expect(control(reset, 'branches').override).toBeNull();
    expect(control(reset, 'branches.actions.delete').override).toBeNull();
    expect(control(reset, 'customers.features.search').override).toEqual({ enabled: false });
    expect(auditStore.listForTest().at(-1)).toMatchObject({
      organizationId: 'org-a',
      metadata: { controlKey: 'branches.actions.delete', versionBefore: 1, versionAfter: 2 },
    });
  });

  it('keeps capability enabled from granting branches RBAC', async () => {
    const { capabilityService } = createHarness();
    const effective = await capabilityService.resolveEffective('org-a', {
      permissions: ['branches.view'],
    });
    expect(control(effective, 'branches').effectiveValue.enabled).toBe(true);
    expect(control(effective, 'branches.actions.refresh').effectiveValue.allowed).toBe(true);
    expect(control(effective, 'branches.actions.create').effectiveValue.allowed).toBe(false);
    expect(control(effective, 'branches.actions.create').reasons).toContain('permission_denied');
  });

  it('rejects attempts to disable required Name or Invoice Prefix controls', async () => {
    const { capabilityService } = createHarness();
    for (const key of ['branches.fields.name', 'branches.fields.invoicePrefix']) {
      await expect(
        capabilityService.updatePolicy(
          'org-a',
          {
            expectedVersion: 0,
            changes: [{ key, value: { visible: false } }],
          },
          { actorId: 'platform-admin' },
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    }
  });

  it('enforces edit, configurable fields, and lifecycle actions independently', async () => {
    const edit = createHarness();
    await edit.capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'branches.actions.edit', value: { allowed: false } }],
      },
      { actorId: 'platform-admin' },
    );
    await expect(
      edit.capabilityService.assertBranchPatchAllowed(
        'org-a',
        { name: 'Main', invoicePrefix: 'MAIN', code: 'M', status: 'active' },
        { name: 'Central' },
      ),
    ).rejects.toMatchObject({ code: 'ORG_ACTION_NOT_ALLOWED' });

    const code = createHarness();
    await code.capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'branches.fields.code', value: { editable: false } }],
      },
      { actorId: 'platform-admin' },
    );
    await expect(
      code.capabilityService.assertBranchPatchAllowed(
        'org-a',
        { name: 'Main', invoicePrefix: 'MAIN', code: 'M', status: 'active' },
        { code: 'CRAFTED' },
      ),
    ).rejects.toMatchObject({ code: 'ORG_FIELD_NOT_EDITABLE' });

    const status = createHarness();
    await status.capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'branches.fields.status', value: { editable: false } }],
      },
      { actorId: 'platform-admin' },
    );
    await expect(
      status.capabilityService.assertBranchPatchAllowed(
        'org-a',
        { name: 'Main', invoicePrefix: 'MAIN', code: 'M', status: 'active' },
        { status: 'inactive' },
      ),
    ).rejects.toMatchObject({ code: 'ORG_FIELD_NOT_EDITABLE' });

    for (const [action, currentStatus, nextStatus] of [
      ['deactivate', 'active', 'inactive'],
      ['reactivate', 'inactive', 'active'],
    ]) {
      const lifecycle = createHarness();
      await lifecycle.capabilityService.updatePolicy(
        'org-a',
        {
          expectedVersion: 0,
          changes: [{ key: `branches.actions.${action}`, value: { allowed: false } }],
        },
        { actorId: 'platform-admin' },
      );
      await expect(
        lifecycle.capabilityService.assertBranchPatchAllowed(
          'org-a',
          { name: 'Main', invoicePrefix: 'MAIN', code: 'M', status: currentStatus },
          { status: nextStatus },
        ),
      ).rejects.toMatchObject({ code: 'ORG_ACTION_NOT_ALLOWED' });
    }
  });
});
