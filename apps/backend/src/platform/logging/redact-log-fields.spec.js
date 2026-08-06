import { describe, expect, it } from 'vitest';
import { redactLogFields } from './redact-log-fields.js';

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
});
