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

const ACCOUNT_KEYS = [
  'accounts',
  'accounts.features.moduleInfo',
  'accounts.features.search',
  'accounts.features.statusFilter',
  'accounts.features.movementHistory',
  'accounts.features.kpiCards',
  'accounts.fields.name',
  'accounts.fields.accountType',
  'accounts.fields.status',
  'accounts.fields.derivedBalance',
  'accounts.fields.bankName',
  'accounts.fields.accountNumberMasked',
  'accounts.fields.walletIdentifier',
  'accounts.fields.openingBalance',
  'accounts.actions.create',
  'accounts.actions.inspect',
  'accounts.actions.edit',
  'accounts.actions.deactivate',
  'accounts.actions.reactivate',
  'accounts.actions.delete',
  'accounts.actions.postOpeningBalance',
  'accounts.actions.postManualMovement',
  'accounts.actions.transfer',
  'accounts.actions.reverseMovement',
  'accounts.actions.reverseTransfer',
  'accounts.actions.refresh',
];

const ALL_PERMISSIONS = [
  'accounts.view',
  'accounts.manage',
  'accounts.opening-balance.post',
  'accounts.transaction.post',
  'accounts.transaction.correct',
  'accounts.transfer',
  'accounts.transfer.reverse',
];

describe('Accounts capability controls', () => {
  it('registers the exact authoritative 26-control Accounts model', () => {
    expect(
      listCapabilityControls()
        .filter((item) => item.moduleKey === 'accounts')
        .map((item) => item.key),
    ).toEqual(ACCOUNT_KEYS);
  });

  it('preserves defaults and intersects every action with its existing RBAC permission', async () => {
    const { capabilityService } = createHarness();
    const all = await capabilityService.resolveEffective('org-a', { permissions: ALL_PERMISSIONS });
    for (const key of ACCOUNT_KEYS) {
      const item = control(all, key);
      expect(item).toBeTruthy();
      const definition = listCapabilityControls().find((candidate) => candidate.key === key);
      expect(item.effectiveValue).toEqual(definition.defaultPolicy);
    }

    const viewOnly = await capabilityService.resolveEffective('org-a', {
      permissions: ['accounts.view'],
    });
    expect(control(viewOnly, 'accounts.actions.inspect').effectiveValue.allowed).toBe(true);
    expect(control(viewOnly, 'accounts.actions.refresh').effectiveValue.allowed).toBe(true);
    for (const key of [
      'accounts.actions.create',
      'accounts.actions.postOpeningBalance',
      'accounts.actions.postManualMovement',
      'accounts.actions.transfer',
      'accounts.actions.reverseMovement',
      'accounts.actions.reverseTransfer',
    ]) {
      expect(control(viewOnly, key).effectiveValue.allowed).toBe(false);
      expect(control(viewOnly, key).reasons).toContain('permission_denied');
    }
  });

  it('blocks every Accounts control when the module is disabled for only one tenant', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      { expectedVersion: 0, changes: [{ key: 'accounts', value: { enabled: false } }] },
      { actorId: 'platform-admin' },
    );
    const orgA = await capabilityService.resolveEffective('org-a', { permissions: ALL_PERMISSIONS });
    const orgB = await capabilityService.resolveEffective('org-b', { permissions: ALL_PERMISSIONS });
    expect(control(orgA, 'accounts').effectiveValue.enabled).toBe(false);
    expect(control(orgA, 'accounts.actions.transfer').effectiveValue.allowed).toBe(false);
    expect(control(orgA, 'accounts.fields.name').effectiveValue.editable).toBe(false);
    expect(control(orgB, 'accounts').effectiveValue.enabled).toBe(true);
    expect(control(orgB, 'accounts.actions.transfer').effectiveValue.allowed).toBe(true);
    await expect(capabilityService.assertAllowed('org-a', 'accounts', 'enabled')).rejects.toMatchObject({
      code: 'ORG_CAPABILITY_DISABLED',
    });
  });

  it('keeps financial and conditional identity controls platform enforced', async () => {
    const { capabilityService } = createHarness();
    for (const key of [
      'accounts.fields.name',
      'accounts.fields.accountType',
      'accounts.fields.status',
      'accounts.fields.derivedBalance',
      'accounts.fields.bankName',
      'accounts.fields.walletIdentifier',
      'accounts.fields.openingBalance',
    ]) {
      await expect(
        capabilityService.updatePolicy(
          'org-a',
          { expectedVersion: 0, changes: [{ key, value: { visible: false } }] },
          { actorId: 'platform-admin' },
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    }
  });

  it('enforces independent edit, lifecycle, and safe field-editability controls', async () => {
    const editHarness = createHarness();
    await editHarness.capabilityService.updatePolicy(
      'org-a',
      { expectedVersion: 0, changes: [{ key: 'accounts.actions.edit', value: { allowed: false } }] },
      { actorId: 'platform-admin' },
    );
    await expect(
      editHarness.capabilityService.assertAccountPatchAllowed(
        'org-a',
        { name: 'Cash', status: 'active' },
        { name: 'Main Cash' },
      ),
    ).rejects.toMatchObject({ code: 'ORG_ACTION_NOT_ALLOWED' });
    await expect(
      editHarness.capabilityService.assertAccountPatchAllowed(
        'org-a',
        { name: 'Cash', status: 'active' },
        { status: 'inactive' },
      ),
    ).resolves.toBeUndefined();

    const lifecycleHarness = createHarness();
    await lifecycleHarness.capabilityService.updatePolicy(
      'org-a',
      { expectedVersion: 0, changes: [{ key: 'accounts.actions.deactivate', value: { allowed: false } }] },
      { actorId: 'platform-admin' },
    );
    await expect(
      lifecycleHarness.capabilityService.assertAccountPatchAllowed(
        'org-a',
        { status: 'active' },
        { status: 'inactive' },
      ),
    ).rejects.toMatchObject({ code: 'ORG_ACTION_NOT_ALLOWED' });

    const fieldHarness = createHarness();
    await fieldHarness.capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [
          { key: 'accounts.fields.accountNumberMasked', value: { visible: true, editable: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );
    await expect(
      fieldHarness.capabilityService.assertAccountPatchAllowed(
        'org-a',
        { accountNumberMasked: '****1000', status: 'active' },
        { accountNumberMasked: '****2000' },
      ),
    ).rejects.toMatchObject({ code: 'ORG_FIELD_NOT_EDITABLE' });
  });

  it('maps direct financial safeguards to distinct semantic actions', async () => {
    const assertions = [
      ['accounts.actions.postOpeningBalance', 'assertAccountOpeningBalanceAllowed'],
      ['accounts.actions.postManualMovement', 'assertAccountManualMovementAllowed'],
      ['accounts.actions.transfer', 'assertAccountTransferAllowed'],
      ['accounts.actions.reverseMovement', 'assertAccountMovementReversalAllowed'],
      ['accounts.actions.reverseTransfer', 'assertAccountTransferReversalAllowed'],
      ['accounts.actions.delete', 'assertAccountDeleteAllowed'],
    ];
    for (const [key, method] of assertions) {
      const { capabilityService } = createHarness();
      await capabilityService.updatePolicy(
        'org-a',
        { expectedVersion: 0, changes: [{ key, value: { allowed: false } }] },
        { actorId: 'platform-admin' },
      );
      await expect(capabilityService[method]('org-a')).rejects.toMatchObject({
        code: 'ORG_ACTION_NOT_ALLOWED',
      });
    }
  });

  it('resets only Accounts overrides with versioned audit evidence', async () => {
    const { capabilityService, auditStore } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [
          { key: 'accounts.actions.transfer', value: { allowed: false } },
          { key: 'accounts.features.movementHistory', value: { enabled: false } },
          { key: 'expenses.actions.correct', value: { allowed: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );
    const reset = await capabilityService.resetModule(
      'org-a',
      'accounts',
      1,
      { actorId: 'platform-admin' },
      'Restore Accounts defaults',
    );
    expect(reset.version).toBe(2);
    expect(control(reset, 'accounts.actions.transfer').override).toBeNull();
    expect(control(reset, 'accounts.features.movementHistory').override).toBeNull();
    expect(control(reset, 'expenses.actions.correct').override).toEqual({ allowed: false });
    expect(auditStore.listForTest().at(-1)).toMatchObject({
      organizationId: 'org-a',
      actorId: 'platform-admin',
      metadata: { versionBefore: 1, versionAfter: 2 },
    });
  });
});
