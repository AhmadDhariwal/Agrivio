import { describe, expect, it } from 'vitest';
import { createAuditModule } from './audit.module.js';
import { loadApiEnv } from '../../platform/config/runtime-config.js';

const now = new Date('2026-09-03T12:00:00.000Z');

describe('platform-controlled audit retention', () => {
  it('purges only expired records for the selected organization and records a platform audit event', async () => {
    const audit = createAuditModule({
      now: () => now,
      config: { auditRetentionOverrideDays: null, platformAuditRetentionDays: 365 },
      resolvePlanEntitlements: async (organizationId) => ({
        auditHistory: organizationId === 'org-a' ? '30d' : '90d',
      }),
    });
    await append(audit, 'old-a', 'org-a', '2026-07-01T00:00:00.000Z');
    await append(audit, 'current-a', 'org-a', '2026-08-20T00:00:00.000Z');
    await append(audit, 'old-b', 'org-b', '2026-07-01T00:00:00.000Z');
    await audit.store.append(null, {
      _id: 'old-platform',
      scope: 'platform',
      actorId: 'super-admin',
      action: 'organization.approved',
      resourceType: 'organization',
      occurredAt: new Date('2025-01-01T00:00:00.000Z'),
    });

    const before = await audit.auditService.getRetentionStatus({
      scope: 'tenant',
      organizationId: 'org-a',
    });
    expect(before).toMatchObject({
      configuredRetentionDays: 30,
      retentionSource: 'subscription',
      currentEventCount: 1,
      expiredEventCount: 1,
    });

    const result = await audit.auditService.purgeExpiredRecords(
      {
        scope: 'tenant',
        organizationId: 'org-a',
        reason: 'Scheduled retention cleanup',
        confirmed: true,
      },
      { actorId: 'super-admin' },
    );
    expect(result.deletedCount).toBe(1);

    const orgA = await audit.store.query({ scope: 'tenant', organizationId: 'org-a' });
    const orgB = await audit.store.query({ scope: 'tenant', organizationId: 'org-b' });
    const platform = await audit.store.query({ scope: 'platform' });
    expect(orgA.map((event) => event._id)).toEqual(['current-a']);
    expect(orgB.map((event) => event._id)).toEqual(['old-b']);
    expect(platform.some((event) => event._id === 'old-platform')).toBe(true);
    expect(platform.some((event) => event.action === 'audit.retention.purged')).toBe(true);
  });

  it('cannot purge in-window records, unlimited retention, or without confirmation and reason', async () => {
    const audit = createAuditModule({
      now: () => now,
      config: { auditRetentionOverrideDays: null, platformAuditRetentionDays: null },
      resolvePlanEntitlements: async () => ({ auditHistory: 'unlimited' }),
    });
    await append(audit, 'current', 'org-a', '2026-09-02T00:00:00.000Z');

    await expect(
      audit.auditService.purgeExpiredRecords(
        { scope: 'tenant', organizationId: 'org-a', reason: 'cleanup', confirmed: true },
        { actorId: 'super-admin' },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      audit.auditService.purgeExpiredRecords(
        { scope: 'tenant', organizationId: 'org-a', reason: '', confirmed: true },
        { actorId: 'super-admin' },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      audit.auditService.purgeExpiredRecords(
        { scope: 'tenant', organizationId: 'org-a', reason: 'cleanup', confirmed: false },
        { actorId: 'super-admin' },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect((await audit.store.query({ scope: 'tenant', organizationId: 'org-a' })).length).toBe(1);
  });

  it('supports a short non-production override but rejects it in production configuration', async () => {
    const audit = createAuditModule({
      now: () => now,
      config: { auditRetentionOverrideDays: 2, platformAuditRetentionDays: null },
      resolvePlanEntitlements: async () => ({ auditHistory: '90d' }),
    });
    const status = await audit.auditService.getRetentionStatus({
      scope: 'tenant',
      organizationId: 'org-a',
    });
    expect(status).toMatchObject({
      configuredRetentionDays: 2,
      retentionSource: 'non_production_override',
    });

    expect(() =>
      loadApiEnv({
        NODE_ENV: 'production',
        AGRIVIO_AUDIT_RETENTION_DAYS_OVERRIDE: '2',
      }),
    ).toThrow(/AGRIVIO_AUDIT_RETENTION_DAYS_OVERRIDE is not permitted in production/);
  });
});

async function append(audit, id, organizationId, occurredAt) {
  await audit.store.append(null, {
    _id: id,
    scope: 'tenant',
    organizationId,
    actorId: 'owner',
    action: 'sale.posted',
    resourceType: 'sale',
    occurredAt: new Date(occurredAt),
  });
}
