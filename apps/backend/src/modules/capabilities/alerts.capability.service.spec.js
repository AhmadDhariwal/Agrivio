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

const ALERT_KEYS = [
  'alerts',
  'alerts.features.moduleInfo',
  'alerts.features.summaryCards',
  'alerts.features.navbarNotifications',
  'alerts.alertTypeAvailability.lowStock',
  'alerts.alertTypeAvailability.upcomingExpiry',
  'alerts.alertTypeAvailability.expiredStock',
  'alerts.alertTypeAvailability.deadStock',
  'alerts.alertTypeAvailability.customerDues',
  'alerts.alertTypeAvailability.supplierDues',
  'alerts.actions.acknowledge',
  'alerts.actions.markRead',
  'alerts.actions.markAllRead',
];

function createHarness(accessState = activeAccess()) {
  const auditStore = createInMemoryAuditEventStore();
  const capabilityService = createCapabilityService({
    store: createInMemoryCapabilityPolicyStore(),
    auditStore,
    transactionRunner: createTransactionRunner(createMockTransactionSessionPort().port),
    resolveSubscriptionAccessState: async () => accessState,
  });
  return { capabilityService, auditStore };
}

function activeAccess() {
  return { status: 'active', accessLevel: 'operational', plan: { entitlements: {} } };
}

function control(result, key) {
  return result.controls.find((item) => item.key === key);
}

describe('Alerts capability registry and service', () => {
  it('registers the exact authoritative 13-control Alerts model without dependencies', () => {
    const definitions = listCapabilityControls().filter((item) => item.moduleKey === 'alerts');
    expect(definitions.map((item) => item.key)).toEqual(ALERT_KEYS);
    expect(definitions.filter((item) => item.type === 'MODULE')).toHaveLength(1);
    expect(
      definitions.filter((item) => item.key.startsWith('alerts.alertTypeAvailability.')),
    ).toHaveLength(6);
    expect(definitions.filter((item) => item.key.startsWith('alerts.features.'))).toHaveLength(3);
    expect(definitions.filter((item) => item.type === 'ACTION')).toHaveLength(3);
    expect(definitions.every((item) => (item.dependencies ?? []).length === 0)).toBe(true);
  });

  it('intersects Alerts with operational subscription access and alerts.view RBAC', async () => {
    const suspended = createHarness({
      status: 'suspended',
      accessLevel: 'read-only',
      plan: { entitlements: {} },
    });
    const suspendedResult = await suspended.capabilityService.resolveEffective('org-a', {
      permissions: ['alerts.view'],
    });
    expect(control(suspendedResult, 'alerts').effectiveValue.enabled).toBe(false);
    expect(control(suspendedResult, 'alerts.actions.markRead').effectiveValue.allowed).toBe(false);
    expect(control(suspendedResult, 'alerts').reasons).toContain('subscription_unavailable');

    const noPermission = await createHarness().capabilityService.resolveEffective('org-a', {
      permissions: [],
    });
    expect(control(noPermission, 'alerts').effectiveValue.enabled).toBe(false);
    expect(control(noPermission, 'alerts.alertTypeAvailability.lowStock').reasons).toContain(
      'permission_denied',
    );
  });

  it('disables one alert family independently and cascades a module disable', async () => {
    const oneFamily = createHarness();
    await oneFamily.capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [
          {
            key: 'alerts.alertTypeAvailability.lowStock',
            value: { enabled: false },
          },
        ],
      },
      { actorId: 'platform-admin' },
    );
    await expect(
      oneFamily.capabilityService.assertAllowed(
        'org-a',
        'alerts.alertTypeAvailability.lowStock',
        'enabled',
        { permissions: ['alerts.view'] },
      ),
    ).rejects.toMatchObject({ code: 'ORG_CAPABILITY_DISABLED' });
    await expect(
      oneFamily.capabilityService.assertAllowed(
        'org-a',
        'alerts.alertTypeAvailability.customerDues',
        'enabled',
        { permissions: ['alerts.view'] },
      ),
    ).resolves.toBeTruthy();

    const wholeModule = createHarness();
    await wholeModule.capabilityService.updatePolicy(
      'org-a',
      { expectedVersion: 0, changes: [{ key: 'alerts', value: { enabled: false } }] },
      { actorId: 'platform-admin' },
    );
    const result = await wholeModule.capabilityService.resolveEffective('org-a', {
      permissions: ['alerts.view'],
    });
    expect(control(result, 'alerts.features.navbarNotifications').effectiveValue.enabled).toBe(
      false,
    );
    expect(control(result, 'alerts.actions.acknowledge').effectiveValue.allowed).toBe(false);
  });

  it('resets only Alerts overrides with versioned audit evidence', async () => {
    const { capabilityService, auditStore } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [
          { key: 'alerts.actions.markAllRead', value: { allowed: false } },
          { key: 'alerts.alertTypeAvailability.deadStock', value: { enabled: false } },
          { key: 'reports.actions.exportCsv', value: { allowed: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );
    const reset = await capabilityService.resetModule(
      'org-a',
      'alerts',
      1,
      { actorId: 'platform-admin' },
      'Restore Alerts defaults',
    );
    expect(reset.version).toBe(2);
    expect(control(reset, 'alerts.actions.markAllRead').override).toBeNull();
    expect(control(reset, 'alerts.alertTypeAvailability.deadStock').override).toBeNull();
    expect(control(reset, 'reports.actions.exportCsv').override).toEqual({ allowed: false });
    expect(auditStore.listForTest().at(-1)).toMatchObject({
      organizationId: 'org-a',
      actorId: 'platform-admin',
      metadata: { versionBefore: 1, versionAfter: 2 },
    });
  });
});
