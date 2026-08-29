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

describe('Employees capability controls', () => {
  it('registers the exact authoritative Employees control set', () => {
    expect(
      listCapabilityControls()
        .filter((item) => item.moduleKey === 'employees')
        .map((item) => item.key),
    ).toEqual([
      'employees',
      'employees.features.moduleInfo',
      'employees.features.search',
      'employees.features.statusFilter',
      'employees.features.roleFilter',
      'employees.features.kpiCards',
      'employees.fields.email',
      'employees.fields.displayName',
      'employees.fields.role',
      'employees.fields.branchAccess',
      'employees.fields.warehouseAccess',
      'employees.fields.status',
      'employees.actions.create',
      'employees.actions.edit',
      'employees.actions.deactivate',
      'employees.actions.assignAccess',
      'employees.actions.refresh',
    ]);
  });

  it('preserves current Employees behavior when an organization has no policy document', async () => {
    const { capabilityService } = createHarness();
    const effective = await capabilityService.resolveEffective('org-a', {
      permissions: [
        'users.view',
        'users.create',
        'users.update',
        'users.deactivate',
        'users.assign-access',
      ],
    });

    expect(control(effective, 'employees').effectiveValue.enabled).toBe(true);
    expect(control(effective, 'employees.actions.create').effectiveValue.allowed).toBe(true);
    expect(control(effective, 'employees.actions.assignAccess').effectiveValue.allowed).toBe(true);
    expect(control(effective, 'employees.fields.displayName').effectiveValue).toMatchObject({
      visible: true,
      editable: true,
    });
  });

  it('blocks create and assign-access actions when organization overrides disable them', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [
          { key: 'employees.actions.create', value: { allowed: false } },
          { key: 'employees.actions.assignAccess', value: { allowed: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );

    await expect(
      capabilityService.assertAllowed('org-a', 'employees.actions.create', 'allowed'),
    ).rejects.toMatchObject({ code: 'ORG_ACTION_NOT_ALLOWED' });
    await expect(
      capabilityService.assertEmployeeAssignAccessAllowed('org-a'),
    ).rejects.toMatchObject({ code: 'ORG_ACTION_NOT_ALLOWED' });
  });

  it('does not grant actions when RBAC permission is missing', async () => {
    const { capabilityService } = createHarness();
    const effective = await capabilityService.resolveEffective('org-a', {
      permissions: ['users.view'],
    });

    expect(control(effective, 'employees.actions.create').effectiveValue.allowed).toBe(false);
    expect(control(effective, 'employees.actions.create').reasons).toContain('permission_denied');
    expect(control(effective, 'employees.actions.assignAccess').effectiveValue.allowed).toBe(false);
  });

  it('rejects patching displayName when edit field control is disabled', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [
          {
            key: 'employees.fields.displayName',
            value: { visible: true, editable: false },
          },
        ],
      },
      { actorId: 'platform-admin' },
    );

    await expect(
      capabilityService.assertEmployeePatchAllowed(
        'org-a',
        { displayName: 'Before', role: 'Cashier' },
        { displayName: 'After' },
      ),
    ).rejects.toMatchObject({ code: 'ORG_FIELD_NOT_EDITABLE' });
  });
});
