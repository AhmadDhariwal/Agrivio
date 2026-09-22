import { describe, expect, it } from 'vitest';
import { environment } from './environment';
import {
  loadWebPublicConfigFromEnv,
  validateWebPublicConfig,
  WebConfigValidationError,
} from './public-config';

describe('web public configuration', () => {
  it('exposes only browser-safe values in the Angular environment', () => {
    expect(environment.publicApiBaseUrl).toBe('http://localhost:3000');
    expect(environment).not.toHaveProperty('SESSION_SECRET');
    expect(environment).not.toHaveProperty('MONGODB_URI');
  });

  it('rejects secret-bearing keys in the public config object', () => {
    expect(() =>
      validateWebPublicConfig({
        publicApiBaseUrl: 'http://localhost:3000',
        SESSION_SECRET: 'must-not-leak',
      }),
    ).toThrow(WebConfigValidationError);
  });

  it('rejects secret-bearing process env keys for browser config', () => {
    expect(() =>
      loadWebPublicConfigFromEnv({
        AGRIVIO_PUBLIC_API_BASE_URL: 'http://localhost:3000',
        SESSION_SECRET: 'must-not-leak',
      }),
    ).toThrow(/SESSION_SECRET/);
  });

  it('rejects non-http public API base URLs', () => {
    expect(() =>
      validateWebPublicConfig({
        publicApiBaseUrl: 'ftp://example.invalid',
      }),
    ).toThrow(/publicApiBaseUrl/);
  });

  it('uses a same-origin API route for the staging Pages build', () => {
    const cfg = loadWebPublicConfigFromEnv({
      AGRIVIO_PUBLIC_API_BASE_URL: 'same-origin',
    });
    expect(cfg.publicApiBaseUrl).toBe('');
    expect(`${cfg.publicApiBaseUrl}/api/v1/auth/csrf`).toBe('/api/v1/auth/csrf');
  });

  it('defaults to localhost:3000 when AGRIVIO_PUBLIC_API_BASE_URL is absent', () => {
    const cfg = loadWebPublicConfigFromEnv({});
    expect(cfg.publicApiBaseUrl).toBe('http://localhost:3000');
  });
});
