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

const IMPORTS_KEYS = [
  'imports',
  'imports.features.moduleInfo',
  'imports.features.templateDownloads',
  'imports.features.jobHistory',
  'imports.fields.importType',
  'imports.fields.fileName',
  'imports.fields.fileSize',
  'imports.fields.status',
  'imports.fields.totalRows',
  'imports.fields.validRows',
  'imports.fields.errorRows',
  'imports.actions.preview',
  'imports.actions.execute',
];

const ALL_PERMISSIONS = ['imports.preview', 'imports.execute'];

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

describe('Imports capability controls', () => {
  it('registers all source-backed imports controls with explicit metadata', () => {
    const controls = listCapabilityControls().filter((item) => item.moduleKey === 'imports');
    expect(controls.map((item) => item.key)).toEqual(IMPORTS_KEYS);
    expect(controls.find((item) => item.key === 'imports')).toMatchObject({
      type: 'MODULE',
      defaultPolicy: { enabled: true },
      configurable: { enabled: true },
    });
    expect(controls.filter((item) => item.type === 'FEATURE').map((item) => item.key)).toEqual(
      IMPORTS_KEYS.slice(1, 4),
    );
    expect(controls.filter((item) => item.type === 'FIELD')).toHaveLength(7);
    // Platform enforced fields
    for (const field of controls.filter((item) => item.type === 'FIELD')) {
      expect(field.platformEnforced).toBe(true);
      expect(field.configurable).toEqual({ visible: false, editable: false });
    }
    expect(controls.filter((item) => item.type === 'ACTION')).toHaveLength(2);
    // Preview action vs Execute action separation
    expect(controls.find((item) => item.key === 'imports.actions.preview')).toMatchObject({
      type: 'ACTION',
      configurable: { allowed: true },
      requiredPermissions: { allowed: 'imports.preview' },
    });
    expect(controls.find((item) => item.key === 'imports.actions.execute')).toMatchObject({
      type: 'ACTION',
      configurable: { allowed: true },
      requiredPermissions: { allowed: 'imports.execute' },
    });
  });

  it('resolves Default / Override / Effective values, resets imports module, and isolates organizations', async () => {
    const { capabilityService, auditStore } = createHarness();
    const defaults = await capabilityService.resolveEffective('org-a', {
      permissions: ALL_PERMISSIONS,
    });
    expect(control(defaults, 'imports').effectiveValue).toEqual({ enabled: true });
    expect(control(defaults, 'imports.actions.execute')).toMatchObject({
      override: null,
      configuredValue: { allowed: true },
      effectiveValue: { allowed: true },
    });

    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [
          { key: 'imports.actions.execute', value: { allowed: false } },
          { key: 'branches.features.search', value: { enabled: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );

    const restricted = await capabilityService.resolveEffective('org-a', {
      permissions: ALL_PERMISSIONS,
    });
    expect(control(restricted, 'imports.actions.execute')).toMatchObject({
      override: { allowed: false },
      effectiveValue: { allowed: false },
    });
    // preview remains allowed when execute is disabled
    expect(control(restricted, 'imports.actions.preview').effectiveValue.allowed).toBe(true);
    expect(control(restricted, 'imports').effectiveValue.enabled).toBe(true);

    const orgB = await capabilityService.resolveEffective('org-b', {
      permissions: ALL_PERMISSIONS,
    });
    expect(control(orgB, 'imports.actions.execute').effectiveValue.allowed).toBe(true);

    const reset = await capabilityService.resetModule(
      'org-a',
      'imports',
      1,
      { actorId: 'platform-admin' },
      'Restore Imports defaults',
    );
    expect(reset.version).toBe(2);
    expect(control(reset, 'imports.actions.execute').override).toBeNull();
    expect(control(reset, 'branches.features.search').override).toEqual({ enabled: false });
    expect(auditStore.listForTest().length).toBe(3);
  });

  it('permits preview when execute is disabled', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'imports.actions.execute', value: { allowed: false } }],
      },
      { actorId: 'platform-admin' },
    );

    await expect(
      capabilityService.assertAllowed('org-a', 'imports.actions.preview', 'allowed', {
        permissions: ['imports.preview'],
      }),
    ).resolves.toMatchObject({
      effectiveValue: { allowed: true },
    });

    await expect(
      capabilityService.assertAllowed('org-a', 'imports.actions.execute', 'allowed', {
        permissions: ['imports.execute'],
      }),
    ).rejects.toMatchObject({
      code: 'ORG_ACTION_NOT_ALLOWED',
      details: { controlKey: 'imports.actions.execute' },
    });
  });

  it('intersects capability with RBAC and does not grant unassigned permissions', async () => {
    const { capabilityService } = createHarness();
    const previewOnly = await capabilityService.resolveEffective('org-a', {
      permissions: ['imports.preview'],
    });
    expect(control(previewOnly, 'imports').effectiveValue.enabled).toBe(true);
    expect(control(previewOnly, 'imports.actions.preview').effectiveValue.allowed).toBe(true);
    expect(control(previewOnly, 'imports.actions.execute').effectiveValue.allowed).toBe(false);

    const noPerms = await capabilityService.resolveEffective('org-a', {
      permissions: [],
    });
    expect(control(noPerms, 'imports').effectiveValue.enabled).toBe(false);
  });
});
