import { describe, expect, it } from 'vitest';
import { buildSubscriptionBanner } from './subscription-access.util';

describe('buildSubscriptionBanner', () => {
  it('explains the subscription recovery path when no subscription is available', () => {
    expect(buildSubscriptionBanner({ status: null })).toEqual({
      tone: 'warning',
      title: 'Subscription unavailable',
      message:
        'No active subscription was found for this organization. Select a plan and submit payment evidence to activate or recover your subscription.',
    });
  });

  it('builds informational banners for trial, grace, and suspended states', () => {
    expect(
      buildSubscriptionBanner({
        status: 'trial',
        trialEndsAt: '2026-08-20T00:00:00.000Z',
      })?.tone,
    ).toBe('info');

    expect(
      buildSubscriptionBanner({
        status: 'grace',
        graceEndsAt: '2026-08-15T00:00:00.000Z',
      })?.tone,
    ).toBe('warning');

    const suspended = buildSubscriptionBanner({ status: 'suspended' });
    expect(suspended?.tone).toBe('danger');
    expect(suspended?.message).toContain('Operational writes and imports are blocked');
  });

  it('does not treat frontend banners as authorization', () => {
    const banner = buildSubscriptionBanner({
      status: 'suspended',
      operationalWriteAllowed: false,
    });
    expect(banner?.tone).toBe('danger');
    expect(banner?.title).toBe('Subscription suspended');
  });
});
