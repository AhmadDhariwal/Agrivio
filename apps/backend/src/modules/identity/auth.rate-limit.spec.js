import { describe, expect, it } from 'vitest';
import {
  createAuthRateLimiter,
  resolveAuthRateLimiterOptions,
} from './auth.rate-limit.js';

describe('auth rate-limit isolation', () => {
  it('raises the attempt ceiling only when nodeEnv is test', () => {
    expect(resolveAuthRateLimiterOptions('test')).toEqual({ maxAttempts: 10_000 });
    expect(resolveAuthRateLimiterOptions('development')).toEqual({});
    expect(resolveAuthRateLimiterOptions('production')).toEqual({});
  });

  it('uses 20 attempts per 15 minutes when no test override is passed', () => {
    const limiter = createAuthRateLimiter({ now: () => 1_000 });
    for (let i = 0; i < 20; i += 1) {
      limiter.assertAllowed('login:client');
    }
    expect(() => limiter.assertAllowed('login:client')).toThrow(/Too many authentication attempts/);
  });
});
