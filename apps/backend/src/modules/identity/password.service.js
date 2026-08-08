const argon2 = require('argon2');
const { validationFailed } = require('../../platform/errors/app-error');

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

/**
 * Minimal common-password denylist for Release 1.
 */
const COMMON_PASSWORDS = new Set([
  'password',
  'password123',
  'password1234',
  '123456789012',
  'qwertyuiopas',
  'letmeinletmein',
  'adminadmin12',
  'changeme1234',
  'welcome12345',
]);

function assertPasswordPolicy(password) {
  if (typeof password !== 'string') {
    throw validationFailed('Validation failed', [
      { field: 'password', message: 'password is required' },
    ]);
  }

  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw validationFailed('Validation failed', [
      {
        field: 'password',
        message: `password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters`,
      },
    ]);
  }

  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    throw validationFailed('Validation failed', [
      { field: 'password', message: 'password is too common' },
    ]);
  }
}

async function hashPassword(password) {
  assertPasswordPolicy(password);
  return argon2.hash(password, { type: argon2.argon2id });
}

async function verifyPassword(hash, password) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

module.exports = {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  assertPasswordPolicy,
  hashPassword,
  verifyPassword,
};
