import { describe, expect, it } from 'vitest';
import { createSettingsModule } from './settings.module.js';

describe('settings service', () => {
  it('returns persisted settings and preserves untouched fields on partial update', async () => {
    const { settingsService } = createSettingsModule({ persistence: 'memory' });
    const organizationId = 'org-settings-1';

    const initial = await settingsService.getSettings(organizationId);
    expect(initial.organizationId).toBe(organizationId);
    expect(initial.tradingName).toBe('');
    expect(initial.version).toBe(1);

    const updated = await settingsService.updateSettings(
      organizationId,
      {
        expectedVersion: 1,
        tradingName: 'Agrivio Trading',
        contactPhone: '03001112222',
      },
      { actorId: 'owner-1' },
    );
    expect(updated.tradingName).toBe('Agrivio Trading');
    expect(updated.contactPhone).toBe('03001112222');
    expect(updated.contactEmail).toBe('');
    expect(updated.version).toBe(2);

    const partial = await settingsService.updateSettings(
      organizationId,
      {
        expectedVersion: 2,
        contactEmail: 'ops@example.com',
      },
      { actorId: 'owner-1' },
    );
    expect(partial.tradingName).toBe('Agrivio Trading');
    expect(partial.contactPhone).toBe('03001112222');
    expect(partial.contactEmail).toBe('ops@example.com');
    expect(partial.version).toBe(3);

    const authoritative = await settingsService.getSettings(organizationId);
    expect(authoritative).toEqual(partial);
  });

  it('isolates settings by organizationId from authenticated service context', async () => {
    const { settingsService } = createSettingsModule({ persistence: 'memory' });

    await settingsService.updateSettings(
      'org-a',
      { expectedVersion: 1, tradingName: 'Org A' },
      { actorId: 'owner-a' },
    );
    await settingsService.updateSettings(
      'org-b',
      { expectedVersion: 1, tradingName: 'Org B' },
      { actorId: 'owner-b' },
    );

    const orgA = await settingsService.getSettings('org-a');
    const orgB = await settingsService.getSettings('org-b');
    expect(orgA.tradingName).toBe('Org A');
    expect(orgB.tradingName).toBe('Org B');
    expect(orgA.organizationId).toBe('org-a');
    expect(orgB.organizationId).toBe('org-b');
  });
});
