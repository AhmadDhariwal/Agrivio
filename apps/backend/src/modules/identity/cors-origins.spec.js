import { describe, expect, it } from 'vitest';
import {
  isAllowedBrowserOrigin,
  isLoopbackBrowserOrigin,
  resolveAllowedOrigins,
} from './cors-origins';

describe('browser origin allowlist', () => {
  it('treats http(s) localhost and 127.0.0.1 as loopback origins regardless of port', () => {
    expect(isLoopbackBrowserOrigin('http://localhost:4400')).toBe(true);
    expect(isLoopbackBrowserOrigin('http://127.0.0.1:4400')).toBe(true);
    expect(isLoopbackBrowserOrigin('http://localhost:4200')).toBe(true);
    expect(isLoopbackBrowserOrigin('https://localhost:4400')).toBe(true);
    expect(isLoopbackBrowserOrigin('http://[::1]:4400')).toBe(true);
    expect(isLoopbackBrowserOrigin('https://evil.example')).toBe(false);
    expect(isLoopbackBrowserOrigin('http://localhost.evil.example')).toBe(false);
    expect(isLoopbackBrowserOrigin('http://localhost:4400/login')).toBe(false);
  });

  it('allows loopback frontend ports in non-production without listing each port', () => {
    const config = {
      nodeEnv: 'development',
      publicWebBaseUrl: 'http://localhost:4200',
      allowedOrigins: ['http://localhost:4200'],
      allowLoopbackBrowserOrigins: true,
    };

    expect(isAllowedBrowserOrigin('http://localhost:4200', config)).toBe(true);
    expect(isAllowedBrowserOrigin('http://localhost:4400', config)).toBe(true);
    expect(isAllowedBrowserOrigin('http://127.0.0.1:3000', config)).toBe(true);
    expect(isAllowedBrowserOrigin('https://evil.example', config)).toBe(false);
  });

  it('does not auto-allow loopback in production', () => {
    const config = {
      nodeEnv: 'production',
      publicWebBaseUrl: 'https://app.example.com',
      allowedOrigins: ['https://app.example.com'],
      allowLoopbackBrowserOrigins: false,
    };

    expect(isAllowedBrowserOrigin('https://app.example.com', config)).toBe(true);
    expect(isAllowedBrowserOrigin('http://localhost:4400', config)).toBe(false);
    expect(isAllowedBrowserOrigin('http://localhost:4200', config)).toBe(false);
    expect(resolveAllowedOrigins(config)).toEqual(new Set(['https://app.example.com']));
  });

  it('allows extra explicit origins in every environment', () => {
    const config = {
      nodeEnv: 'production',
      allowedOrigins: ['https://app.example.com', 'https://admin.example.com'],
      allowLoopbackBrowserOrigins: false,
    };

    expect(isAllowedBrowserOrigin('https://admin.example.com', config)).toBe(true);
    expect(isAllowedBrowserOrigin('http://192.168.1.10:4400', config)).toBe(false);
  });
});
