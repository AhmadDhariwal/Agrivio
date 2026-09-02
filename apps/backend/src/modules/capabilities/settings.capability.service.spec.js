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

const SETTINGS_KEYS = [
  'settings',
  'settings.features.summary',
  'settings.features.documentPreview',
  'settings.features.guidance',
  'settings.fields.tradingName',
  'settings.fields.contactPhone',
  'settings.fields.contactEmail',
  'settings.fields.addressLine',
  'settings.fields.documentFooterNote',
  'settings.actions.update',
];

const ALL_PERMISSIONS = ['settings.view', 'settings.manage'];

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

describe('Settings capability controls', () => {
  it('registers exactly the ten source-backed controls', () => {
    const controls = listCapabilityControls().filter((item) => item.moduleKey === 'settings');
    expect(controls.map((item) => item.key)).toEqual(SETTINGS_KEYS);
    expect(controls.find((item) => item.key === 'settings')).toMatchObject({
      type: 'MODULE',
      defaultPolicy: { enabled: true },
      configurable: { enabled: true },
    });
    expect(controls.filter((item) => item.type === 'FEATURE').map((item) => item.key)).toEqual(
      SETTINGS_KEYS.slice(1, 4),
    );
    expect(controls.filter((item) => item.type === 'FIELD')).toHaveLength(5);
    expect(controls.filter((item) => item.type === 'ACTION')).toHaveLength(1);
    expect(controls.some((item) => item.key === 'settings.fields.legalName')).toBe(false);
    expect(controls.some((item) => item.key === 'settings.fields.timezone')).toBe(false);
    expect(controls.some((item) => item.key === 'settings.actions.organizationProfileUpdate')).toBe(
      false,
    );
  });

  it('resolves Default / Override / Effective values, resets only Settings, and isolates organizations', async () => {
    const { capabilityService, auditStore } = createHarness();
    const defaults = await capabilityService.resolveEffective('org-a', {
      permissions: ALL_PERMISSIONS,
    });
    expect(control(defaults, 'settings').effectiveValue).toEqual({ enabled: true });
    expect(control(defaults, 'settings.actions.update')).toMatchObject({
      override: null,
      configuredValue: { allowed: true },
      effectiveValue: { allowed: true },
    });

    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [
          { key: 'settings', value: { enabled: false } },
          { key: 'settings.fields.contactEmail', value: { editable: false } },
          { key: 'branches.features.search', value: { enabled: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );

    const restricted = await capabilityService.resolveEffective('org-a', {
      permissions: ALL_PERMISSIONS,
    });
    expect(control(restricted, 'settings')).toMatchObject({
      override: { enabled: false },
      effectiveValue: { enabled: false },
    });
    expect(control(restricted, 'settings.features.summary').effectiveValue.enabled).toBe(false);
    expect(control(restricted, 'settings.fields.contactEmail').effectiveValue.editable).toBe(false);

    const orgB = await capabilityService.resolveEffective('org-b', {
      permissions: ALL_PERMISSIONS,
    });
    expect(control(orgB, 'settings').effectiveValue.enabled).toBe(true);
    expect(control(orgB, 'settings.fields.contactEmail').effectiveValue.editable).toBe(true);

    const reset = await capabilityService.resetModule(
      'org-a',
      'settings',
      1,
      { actorId: 'platform-admin' },
      'Restore Settings defaults',
    );
    expect(reset.version).toBe(2);
    expect(control(reset, 'settings').override).toBeNull();
    expect(control(reset, 'settings.fields.contactEmail').override).toBeNull();
    expect(control(reset, 'branches.features.search').override).toEqual({ enabled: false });
    expect(auditStore.listForTest().length).toBe(5);
  });

  it('intersects capability with RBAC and does not grant settings access', async () => {
    const { capabilityService } = createHarness();
    const viewOnly = await capabilityService.resolveEffective('org-a', {
      permissions: ['settings.view'],
    });
    expect(control(viewOnly, 'settings').effectiveValue.enabled).toBe(true);
    expect(control(viewOnly, 'settings.actions.update').effectiveValue.allowed).toBe(false);

    const noView = await capabilityService.resolveEffective('org-a', {
      permissions: [],
    });
    expect(control(noView, 'settings').effectiveValue.enabled).toBe(false);
    expect(control(noView, 'settings').reasons).toContain('permission_denied');
  });

  it('rejects every disabled configurable field through crafted mutations', async () => {
    const fields = [
      'tradingName',
      'contactPhone',
      'contactEmail',
      'addressLine',
      'documentFooterNote',
    ];
    for (const field of fields) {
      const { capabilityService } = createHarness();
      await capabilityService.updatePolicy(
        'org-a',
        {
          expectedVersion: 0,
          changes: [{ key: `settings.fields.${field}`, value: { editable: false } }],
        },
        { actorId: 'platform-admin' },
      );
      await expect(
        capabilityService.assertSettingsPatchAllowed(
          'org-a',
          { [field]: `existing-${field}` },
          { [field]: `crafted-${field}` },
        ),
      ).rejects.toMatchObject({
        code: 'ORG_FIELD_NOT_EDITABLE',
        details: { controlKey: `settings.fields.${field}` },
      });
    }
  });
});
