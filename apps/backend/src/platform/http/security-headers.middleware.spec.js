import { describe, expect, it, vi } from 'vitest';
import { createSecurityHeadersMiddleware } from './security-headers.middleware.js';

describe('security-headers.middleware', () => {
  it('sets standard defensive security headers in non-production mode', () => {
    const middleware = createSecurityHeadersMiddleware({ nodeEnv: 'development' });
    const headers = new Map();
    const res = {
      setHeader: vi.fn((key, value) => headers.set(key, value)),
    };
    const next = vi.fn();

    middleware({}, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=(), payment=()');
    expect(headers.get('Content-Security-Policy')).toBe("default-src 'none'; frame-ancestors 'none';");
    expect(headers.has('Strict-Transport-Security')).toBe(false);
  });

  it('sets Strict-Transport-Security in production mode', () => {
    const middleware = createSecurityHeadersMiddleware({ nodeEnv: 'production' });
    const headers = new Map();
    const res = {
      setHeader: vi.fn((key, value) => headers.set(key, value)),
    };
    const next = vi.fn();

    middleware({}, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains');
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});
