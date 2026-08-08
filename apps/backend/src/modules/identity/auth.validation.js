const { validationFailed } = require('../../platform/errors/app-error');
const { normalizeEmail } = require('./crypto-tokens');

function parseLoginBody(body) {
  const emailRaw = body['email'];
  const password = body['password'];
  const details = [];

  if (typeof emailRaw !== 'string' || emailRaw.trim() === '') {
    details.push({ field: 'email', message: 'email is required' });
  }
  if (typeof password !== 'string' || password === '') {
    details.push({ field: 'password', message: 'password is required' });
  }
  if (details.length > 0) {
    throw validationFailed('Validation failed', details);
  }

  return {
    email: normalizeEmail(emailRaw),
    password: password,
  };
}

function parsePasswordResetRequestBody(body) {
  const emailRaw = body['email'];
  if (typeof emailRaw !== 'string' || emailRaw.trim() === '') {
    throw validationFailed('Validation failed', [{ field: 'email', message: 'email is required' }]);
  }
  return { email: normalizeEmail(emailRaw) };
}

function parsePasswordResetConfirmBody(body) {
  const token = body['token'];
  const password = body['password'];
  const details = [];
  if (typeof token !== 'string' || token.trim() === '') {
    details.push({ field: 'token', message: 'token is required' });
  }
  if (typeof password !== 'string' || password === '') {
    details.push({ field: 'password', message: 'password is required' });
  }
  if (details.length > 0) {
    throw validationFailed('Validation failed', details);
  }
  return {
    token: token.trim(),
    password: password,
  };
}

function optionalScopedId(body, field) {
  if (!Object.prototype.hasOwnProperty.call(body, field)) {
    return undefined;
  }
  const value = body[field];
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    throw validationFailed('Validation failed', [
      { field, message: `${field} must be a non-empty string or null` },
    ]);
  }
  return value.trim();
}

function parseSessionContextBody(body) {
  const contextType = body['contextType'];
  if (contextType !== 'platform' && contextType !== 'organization') {
    throw validationFailed('Validation failed', [
      { field: 'contextType', message: 'contextType must be platform or organization' },
    ]);
  }

  if (contextType === 'platform') {
    return { contextType: 'platform' };
  }

  const membershipId = body['membershipId'];
  const organizationId = body['organizationId'];
  if (typeof membershipId !== 'string' && typeof organizationId !== 'string') {
    throw validationFailed('Validation failed', [
      {
        field: 'membershipId',
        message: 'membershipId or organizationId is required for organization context',
      },
    ]);
  }

  const branchId = optionalScopedId(body, 'branchId');
  const warehouseId = optionalScopedId(body, 'warehouseId');

  return {
    contextType: 'organization',
    ...(typeof membershipId === 'string' ? { membershipId: membershipId.trim() } : {}),
    ...(typeof organizationId === 'string' ? { organizationId: organizationId.trim() } : {}),
    ...(branchId === undefined ? {} : { branchId }),
    ...(warehouseId === undefined ? {} : { warehouseId }),
  };
}

module.exports = {
  parseLoginBody,
  parsePasswordResetRequestBody,
  parsePasswordResetConfirmBody,
  parseSessionContextBody,
};
