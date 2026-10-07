import { describe, expect, it } from 'vitest';
import proxyaddr from 'proxy-addr';
import {
  CLOUDFLARE_CIDRS,
  TRUSTED_PROXIES,
  resolveTrustProxy,
} from './trust-proxy';

describe('trust-proxy production topology resolver', () => {
  it('does not trust forwarding headers in direct local and test profiles', () => {
    expect(resolveTrustProxy('development')).toBe(false);
    expect(resolveTrustProxy('test')).toBe(false);
  });

  it('defines comprehensive Cloudflare IPv4 and IPv6 CIDRs', () => {
    expect(CLOUDFLARE_CIDRS.length).toBeGreaterThanOrEqual(20);
    expect(TRUSTED_PROXIES).toContain('loopback');
    expect(TRUSTED_PROXIES).toContain('uniquelocal');
    expect(TRUSTED_PROXIES).toContain('162.158.0.0/15');
    expect(TRUSTED_PROXIES).toContain('104.16.0.0/13');
    expect(TRUSTED_PROXIES).toContain('2606:4700::/32');
  });

  describe('Path 1: Client -> Render directly -> Express', () => {
    const trustProxy = resolveTrustProxy('production');

    it('correctly resolves real client IP connecting directly to Render', () => {
      const req = {
        socket: { remoteAddress: '10.0.12.3' }, // Render internal proxy socket
        headers: { 'x-forwarded-for': '203.0.113.10' },
      };
      expect(proxyaddr(req, trustProxy)).toBe('203.0.113.10');
    });

    it('prevents direct clients from spoofing their IP via forged X-Forwarded-For', () => {
      // Attacker at 203.0.113.10 sends X-Forwarded-For: 1.1.1.1
      // Render appends attacker's IP to the header
      const req = {
        socket: { remoteAddress: '10.0.12.3' },
        headers: { 'x-forwarded-for': '1.1.1.1, 203.0.113.10' },
      };
      expect(proxyaddr(req, trustProxy)).toBe('203.0.113.10');
    });

    it('rejects forged Cloudflare IPs sent by direct attackers', () => {
      // Attacker at 203.0.113.99 sends X-Forwarded-For: 1.1.1.1, 162.158.1.1 (pretending to be behind CF)
      // Render appends real attacker IP 203.0.113.99
      const req = {
        socket: { remoteAddress: '10.0.12.3' },
        headers: { 'x-forwarded-for': '1.1.1.1, 162.158.1.1, 203.0.113.99' },
      };
      expect(proxyaddr(req, trustProxy)).toBe('203.0.113.99');
    });
  });

  describe('Path 2: Browser -> Cloudflare Pages Function -> Render -> Express', () => {
    const trustProxy = resolveTrustProxy('production');

    it('correctly resolves client IP when proxied through Cloudflare Pages Function', () => {
      // Cloudflare Pages Function at 162.158.1.1 forwards client 198.51.100.50
      // Render appends Cloudflare egress IP
      const reqA = {
        socket: { remoteAddress: '10.0.12.3' },
        headers: { 'x-forwarded-for': '198.51.100.50, 162.158.1.1' },
      };
      expect(proxyaddr(reqA, trustProxy)).toBe('198.51.100.50');
    });

    it('proves two different real clients do not collapse into the same limiter bucket', () => {
      const reqA = {
        socket: { remoteAddress: '10.0.12.3' },
        headers: { 'x-forwarded-for': '198.51.100.50, 162.158.1.1' },
      };
      const reqB = {
        socket: { remoteAddress: '10.0.12.3' },
        headers: { 'x-forwarded-for': '198.51.100.60, 162.158.1.1' },
      };
      const ipA = proxyaddr(reqA, trustProxy);
      const ipB = proxyaddr(reqB, trustProxy);

      expect(ipA).toBe('198.51.100.50');
      expect(ipB).toBe('198.51.100.60');
      expect(ipA).not.toBe(ipB);
      expect(ipA).not.toBe('162.158.1.1');
      expect(ipB).not.toBe('162.158.1.1');
    });

    it('prevents spoofing through Cloudflare when forged header precedes client IP', () => {
      // Attacker behind Cloudflare sends forged X-Forwarded-For: 1.1.1.1
      // Cloudflare Pages Function forwards 198.51.100.50 (real IP) or chain
      // If chain arrives as '1.1.1.1, 198.51.100.50, 162.158.1.1':
      const req = {
        socket: { remoteAddress: '10.0.12.3' },
        headers: { 'x-forwarded-for': '1.1.1.1, 198.51.100.50, 162.158.1.1' },
      };
      expect(proxyaddr(req, trustProxy)).toBe('198.51.100.50');
    });
  });
});
