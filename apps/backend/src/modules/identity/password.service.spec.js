import { describe, expect, it } from 'vitest';
import { assertPasswordPolicy, hashPassword, verifyPassword } from './password.service';
import { ApiTransportErrorCode } from '@agrivio/api-contracts';

describe('password.service', () => {
  it('enforces password policy', () => {
    try {
      assertPasswordPolicy('short');
      expect.unreachable('expected short password to fail');
    } catch (error) {
      expect(error).toMatchObject({
        name: 'AppError',
        code: ApiTransportErrorCode.ValidationFailed,
        message: 'Validation failed',
      });
      expect(String(error.details?.[0]?.message ?? '')).toMatch(/between/);
    }

    try {
      assertPasswordPolicy('password1234');
      expect.unreachable('expected common password to fail');
    } catch (error) {
      expect(error).toMatchObject({
        name: 'AppError',
        code: ApiTransportErrorCode.ValidationFailed,
      });
    }
  });

  it('hashes and verifies with Argon2id', async () => {
    const hash = await hashPassword('a-strong-passphrase');
    expect(hash).not.toContain('a-strong-passphrase');
    expect(await verifyPassword(hash, 'a-strong-passphrase')).toBe(true);
    expect(await verifyPassword(hash, 'wrong-passphrase')).toBe(false);
  });
});
