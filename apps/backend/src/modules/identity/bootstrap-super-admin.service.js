const { normalizeEmail } = require('./crypto-tokens');
const { hashPassword } = require('./password.service');
const { validationFailed } = require('../../platform/errors/app-error');

function assertDisplayName(displayName) {
  if (typeof displayName !== 'string' || displayName.trim() === '') {
    throw validationFailed('Validation failed', [
      { field: 'displayName', message: 'displayName is required' },
    ]);
  }
  return displayName.trim();
}

function assertEmail(email) {
  if (typeof email !== 'string' || email.trim() === '') {
    throw validationFailed('Validation failed', [
      { field: 'email', message: 'email is required' },
    ]);
  }
  const normalized = normalizeEmail(email);
  if (!normalized.includes('@') || normalized.startsWith('@') || normalized.endsWith('@')) {
    throw validationFailed('Validation failed', [
      { field: 'email', message: 'email must be a valid address' },
    ]);
  }
  return { email: email.trim(), emailNormalized: normalized };
}

/**
 * Operational bootstrap for the initial platform Super Admin.
 * Not an HTTP endpoint. Never promotes an existing organization user.
 * Password is Argon2id-hashed; plaintext is never persisted.
 */
async function bootstrapSuperAdmin(deps, input) {
  const store = deps.store;
  if (store === undefined || typeof store.findUserByEmailNormalized !== 'function') {
    throw new Error('Auth store is required for Super Admin bootstrap');
  }

  const { email, emailNormalized } = assertEmail(input.email);
  const displayName = assertDisplayName(input.displayName);
  const password = input.password;

  const existing = await store.findUserByEmailNormalized(emailNormalized);
  if (existing !== null) {
    if (existing['platformAccess'] === 'super_admin') {
      return {
        created: false,
        alreadyExisted: true,
        userId: String(existing['_id']),
        email: String(existing['email']),
        emailNormalized: String(existing['emailNormalized']),
        status: String(existing['status']),
      };
    }

    throw validationFailed(
      'Refusing to promote an existing user to Super Admin. Owner and organization users cannot self-elevate.',
      [{ field: 'email', message: 'user already exists without platform Super Admin access' }],
    );
  }

  const passwordHash = await hashPassword(password);
  const created = await store.insertUser(null, {
    email,
    emailNormalized,
    displayName,
    passwordHash,
    status: 'active',
    platformAccess: 'super_admin',
    version: 1,
  });

  return {
    created: true,
    alreadyExisted: false,
    userId: String(created['_id']),
    email: String(created['email']),
    emailNormalized: String(created['emailNormalized']),
    status: String(created['status']),
  };
}

module.exports = {
  bootstrapSuperAdmin,
  assertEmail,
  assertDisplayName,
};
