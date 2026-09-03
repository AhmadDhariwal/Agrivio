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

const AUDIT_KEYS = [
  'audit',
  'audit.features.moduleInfo',
  'audit.features.search',
  'audit.features.filters',
  'audit.fields.timestamp',
  'audit.fields.actor',
  'audit.fields.action',
  'audit.fields.entityType',
  'audit.fields.entityId',
  'audit.fields.details',
  'audit.actions.inspect',
];

const ALL_PERMISSIONS = ['audit.view'];

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

describe('Audit capability controls', () => {
  it('registers all source-backed audit controls with explicit metadata', () => {
    const controls = listCapabilityControls().filter((item) => item.moduleKey === 'audit');
    expect(controls.map((item) => item.key)).toEqual(AUDIT_KEYS);
    expect(controls.find((item) => item.key === 'audit')).toMatchObject({
      type: 'MODULE',
      defaultPolicy: { enabled: true },
      configurable: { enabled: true },
    });
    expect(controls.filter((item) => item.type === 'FEATURE').map((item) => item.key)).toEqual(
      AUDIT_KEYS.slice(1, 4),
    );
    expect(controls.filter((item) => item.type === 'FIELD')).toHaveLength(6);
    // Platform enforced immutable audit trail fields
    for (const field of controls.filter((item) => item.type === 'FIELD')) {
      expect(field.platformEnforced).toBe(true);
      expect(field.configurable).toEqual({ visible: false, editable: false });
    }
    expect(controls.filter((item) => item.type === 'ACTION')).toHaveLength(1);
    expect(controls.find((item) => item.key === 'audit.actions.inspect')).toMatchObject({
      type: 'ACTION',
      configurable: { allowed: true },
      requiredPermissions: { allowed: 'audit.view' },
    });
  });

  it('resolves Default / Override / Effective values, resets audit module, and isolates organizations', async () => {
    const { capabilityService, auditStore } = createHarness();
    const defaults = await capabilityService.resolveEffective('org-a', {
      permissions: ALL_PERMISSIONS,
    });
    expect(control(defaults, 'audit').effectiveValue).toEqual({ enabled: true });
    expect(control(defaults, 'audit.actions.inspect')).toMatchObject({
      override: null,
      configuredValue: { allowed: true },
      effectiveValue: { allowed: true },
    });

    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [
          { key: 'audit.actions.inspect', value: { allowed: false } },
          { key: 'branches.features.search', value: { enabled: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );

    const restricted = await capabilityService.resolveEffective('org-a', {
      permissions: ALL_PERMISSIONS,
    });
    expect(control(restricted, 'audit.actions.inspect')).toMatchObject({
      override: { allowed: false },
      effectiveValue: { allowed: false },
    });
    expect(control(restricted, 'audit').effectiveValue.enabled).toBe(true);

    const orgB = await capabilityService.resolveEffective('org-b', {
      permissions: ALL_PERMISSIONS,
    });
    expect(control(orgB, 'audit.actions.inspect').effectiveValue.allowed).toBe(true);

    const reset = await capabilityService.resetModule(
      'org-a',
      'audit',
      1,
      { actorId: 'platform-admin' },
      'Restore Audit defaults',
    );
    expect(reset.version).toBe(2);
    expect(control(reset, 'audit.actions.inspect').override).toBeNull();
    expect(control(reset, 'branches.features.search').override).toEqual({ enabled: false });
    expect(auditStore.listForTest().length).toBe(3);
  });

  it('blocks audit module when disabled', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'audit', value: { enabled: false } }],
      },
      { actorId: 'platform-admin' },
    );

    await expect(
      capabilityService.assertAllowed('org-a', 'audit', 'enabled', {
        permissions: ['audit.view'],
      }),
    ).rejects.toMatchObject({
      code: 'ORG_CAPABILITY_DISABLED',
      details: { controlKey: 'audit' },
    });
  });

  it('intersects capability with RBAC and does not grant unassigned permissions', async () => {
    const { capabilityService } = createHarness();
    const noPerms = await capabilityService.resolveEffective('org-a', {
      permissions: [],
    });
    expect(control(noPerms, 'audit').effectiveValue.enabled).toBe(false);
    expect(control(noPerms, 'audit.actions.inspect').effectiveValue.allowed).toBe(false);
  });
});
