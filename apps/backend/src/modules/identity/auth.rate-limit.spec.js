import { describe, expect, it } from 'vitest';
import { createAuthRateLimiter, resolveAuthRateLimiterOptions } from './auth.rate-limit.js';
import { clientKey, createAuthTransportMiddleware } from './auth.middleware.js';

describe('auth rate-limit isolation', () => {
  it('raises the attempt ceiling only when nodeEnv is test', () => {
    expect(resolveAuthRateLimiterOptions('test')).toEqual({ maxAttempts: 10_000 });
    expect(resolveAuthRateLimiterOptions('development')).toEqual({});
    expect(resolveAuthRateLimiterOptions('production')).toEqual({});
  });

  it('uses 20 attempts per 15 minutes when no test override is passed and throws 429 with retryAfter', async () => {
    const limiter = createAuthRateLimiter({ now: () => 1_000 });
    for (let i = 0; i < 20; i += 1) {
      await limiter.assertAllowed('login:client');
    }
    let thrownError;
    try {
      await limiter.assertAllowed('login:client');
    } catch (err) {
      thrownError = err;
    }
    expect(thrownError).toBeDefined();
    expect(thrownError.statusCode).toBe(429);
    expect(thrownError.code).toBe('TOO_MANY_REQUESTS');
    expect(thrownError.retryAfter).toBe(900); // 15 minutes in seconds
    expect(thrownError.message).toMatch(/Too many authentication attempts/);
  });

  it('resolves clientKey from trusted req.ip and ignores spoofed x-forwarded-for headers', () => {
    const transportMiddleware = createAuthTransportMiddleware();

    // Standard direct connection
    const req1 = {
      ip: '198.51.100.10',
      headers: {
        'x-forwarded-for': '203.0.113.195, 70.41.3.18',
      },
      header: () => undefined,
    };
    expect(clientKey(req1)).toBe('198.51.100.10');

    let nextCalled = false;
    transportMiddleware(req1, {}, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
    expect(req1.authTransport.clientKey).toBe('198.51.100.10');

    // Spoofed X-Forwarded-For with different forged IPs does NOT change clientKey
    const req2 = {
      ip: '198.51.100.10',
      headers: {
        'x-forwarded-for': '1.2.3.4',
      },
      header: () => undefined,
    };
    transportMiddleware(req2, {}, () => undefined);
    expect(req2.authTransport.clientKey).toBe('198.51.100.10');
  });

  it('prevents rate-limit bucket evasion through forged forwarding headers', async () => {
    const limiter = createAuthRateLimiter({
      maxAttempts: 3,
      windowMs: 60_000,
      now: () => 1_000,
    });
    const transportMiddleware = createAuthTransportMiddleware();

    const forgedIps = ['1.1.1.1', '2.2.2.2', '3.3.3.3', '4.4.4.4'];

    for (let i = 0; i < 3; i += 1) {
      const req = {
        ip: '192.0.2.1', // Real client IP assigned by trusted proxy
        headers: { 'x-forwarded-for': forgedIps[i] },
        header: () => undefined,
      };
      transportMiddleware(req, {}, () => undefined);
      await expect(
        limiter.assertAllowed(`login:${req.authTransport.clientKey}`),
      ).resolves.toBeUndefined();
    }

    // 4th request from same real IP but yet another spoofed header is blocked with 429
    const req4 = {
      ip: '192.0.2.1',
      headers: { 'x-forwarded-for': forgedIps[3] },
      header: () => undefined,
    };
    transportMiddleware(req4, {}, () => undefined);
    try {
      await limiter.assertAllowed(`login:${req4.authTransport.clientKey}`);
      expect.unreachable('should have been blocked');
    } catch (err) {
      expect(err.statusCode).toBe(429);
      expect(err.code).toBe('TOO_MANY_REQUESTS');
      expect(err.retryAfter).toBe(60);
    }
  });
});
