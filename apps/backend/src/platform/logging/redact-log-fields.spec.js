import { describe, expect, it } from 'vitest';
import { redactLogFields } from './redact-log-fields';

describe('redactLogFields', () => {
  it('redacts sensitive keys and nested secret values', () => {
    const redacted = redactLogFields({
      requestId: 'req-12345678',
      password: 'plain-text-password',
      nested: {
        accessToken: 'abc123',
        safeField: 'visible',
      },
      authorization: 'Bearer secret-token',
    });

    expect(redacted['password']).toBe('[REDACTED]');
    expect(redacted['authorization']).toBe('[REDACTED]');
    expect(redacted['nested']).toEqual({
      accessToken: '[REDACTED]',
      safeField: 'visible',
    });
  });

  it('preserves Date values while redacting secrets', () => {
    const occurredAt = new Date('2026-08-10T12:00:00.000Z');
    const redacted = redactLogFields({
      occurredAt,
      passwordHash: 'secret',
      safe: 'ok',
    });
    expect(redacted['occurredAt']).toBe(occurredAt);
    expect(redacted['passwordHash']).toBe('[REDACTED]');
    expect(redacted['safe']).toBe('ok');
  });
});
