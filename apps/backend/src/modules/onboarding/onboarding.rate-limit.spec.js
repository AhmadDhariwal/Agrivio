import { describe, expect, it } from 'vitest';
import {
  createOnboardingRateLimiter,
  createOnboardingRateLimiterMiddleware,
  resolveOnboardingRateLimiterOptions,
} from './onboarding.rate-limit';

describe('onboarding.rate-limit', () => {
  it('allows requests within maxAttempts and throws 429 when exceeded', async () => {
    let now = 10_000;
    const limiter = createOnboardingRateLimiter({
      maxAttempts: 3,
      windowMs: 60_000,
      now: () => now,
    });

    await limiter.assertAllowed('onboarding:192.168.1.1');
    await limiter.assertAllowed('onboarding:192.168.1.1');
    await limiter.assertAllowed('onboarding:192.168.1.1');

    try {
      await limiter.assertAllowed('onboarding:192.168.1.1');
      expect.unreachable('should have thrown 429');
    } catch (err) {
      expect(err.statusCode).toBe(429);
      expect(err.code).toBe('TOO_MANY_REQUESTS');
      expect(err.retryAfter).toBe(60);
      expect(err.message).toContain('Too many organization activation requests');
    }

    // Different IP is unaffected
    await expect(limiter.assertAllowed('onboarding:10.0.0.1')).resolves.toBeUndefined();

    // After window expires, bucket resets
    now += 60_001;
    await expect(limiter.assertAllowed('onboarding:192.168.1.1')).resolves.toBeUndefined();
  });

  it('reset() clears bucket immediately', async () => {
    const limiter = createOnboardingRateLimiter({
      maxAttempts: 1,
      windowMs: 60_000,
      now: () => 1_000,
    });

    await limiter.assertAllowed('onboarding:1.2.3.4');
    await expect(limiter.assertAllowed('onboarding:1.2.3.4')).rejects.toMatchObject({
      statusCode: 429,
    });

    await limiter.reset('onboarding:1.2.3.4');
    await expect(limiter.assertAllowed('onboarding:1.2.3.4')).resolves.toBeUndefined();
  });

  it('middleware extracts client IP from req.ip and calls next() or next(err)', async () => {
    const limiter = createOnboardingRateLimiter({
      maxAttempts: 1,
      windowMs: 60_000,
      now: () => 1_000,
    });
    const middleware = createOnboardingRateLimiterMiddleware(limiter);

    let nextCalled = false;
    let nextError = null;

    const req1 = { ip: '203.0.113.5' };
    await new Promise((resolve) =>
      middleware(req1, {}, (err) => {
        nextCalled = true;
        nextError = err;
        resolve();
      }),
    );

    expect(nextCalled).toBe(true);
    expect(nextError).toBeUndefined();

    // Second request from same IP is throttled
    let secondCalled = false;
    let secondError = null;
    await new Promise((resolve) =>
      middleware(req1, {}, (err) => {
        secondCalled = true;
        secondError = err;
        resolve();
      }),
    );

    expect(secondCalled).toBe(true);
    expect(secondError?.statusCode).toBe(429);
    expect(secondError?.code).toBe('TOO_MANY_REQUESTS');
    expect(secondError?.retryAfter).toBe(60);
  });

  it('middleware falls back to socket.remoteAddress if req.ip is empty', async () => {
    const limiter = createOnboardingRateLimiter({
      maxAttempts: 1,
      windowMs: 60_000,
      now: () => 1_000,
    });
    const middleware = createOnboardingRateLimiterMiddleware(limiter);

    let nextError = null;
    await new Promise((resolve) =>
      middleware({ ip: '', socket: { remoteAddress: '198.51.100.2' } }, {}, (err) => {
        nextError = err;
        resolve();
      }),
    );
    expect(nextError).toBeUndefined();

    await new Promise((resolve) =>
      middleware({ ip: '', socket: { remoteAddress: '198.51.100.2' } }, {}, (err) => {
        nextError = err;
        resolve();
      }),
    );
    expect(nextError?.statusCode).toBe(429);
  });

  it('resolves conservative defaults for production and generous for test', () => {
    expect(resolveOnboardingRateLimiterOptions('production')).toEqual({ maxAttempts: 5 });
    expect(resolveOnboardingRateLimiterOptions('test')).toEqual({ maxAttempts: 10_000 });
  });
});
