// @ts-check
const { validationFailed } = require('../../platform/errors/app-error');
const {
  normalizeEmail,
  normalizeOrganizationName,
} = require('../identity/crypto-tokens');

/**
 * @param {Record<string, unknown>} body
 */
function parseOrganizationActivationRequest(body) {
  /** @type {{ field: string; message: string }[]} */
  const issues = [];

  const organizationNameRaw = body['organizationName'];
  const ownerEmailRaw = body['ownerEmail'];
  const ownerDisplayNameRaw = body['ownerDisplayName'];
  const timezoneRaw = body['timezone'];

  if (typeof organizationNameRaw !== 'string' || organizationNameRaw.trim() === '') {
    issues.push({ field: 'organizationName', message: 'organizationName is required' });
  } else if (organizationNameRaw.trim().length > 200) {
    issues.push({ field: 'organizationName', message: 'organizationName exceeds maximum length' });
  }

  if (typeof ownerEmailRaw !== 'string' || ownerEmailRaw.trim() === '') {
    issues.push({ field: 'ownerEmail', message: 'ownerEmail is required' });
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmailRaw.trim())) {
    issues.push({ field: 'ownerEmail', message: 'ownerEmail must be a valid email' });
  }

  if (typeof ownerDisplayNameRaw !== 'string' || ownerDisplayNameRaw.trim() === '') {
    issues.push({ field: 'ownerDisplayName', message: 'ownerDisplayName is required' });
  } else if (ownerDisplayNameRaw.trim().length > 200) {
    issues.push({ field: 'ownerDisplayName', message: 'ownerDisplayName exceeds maximum length' });
  }

  if (
    timezoneRaw !== undefined &&
    (typeof timezoneRaw !== 'string' || timezoneRaw.trim() === '')
  ) {
    issues.push({ field: 'timezone', message: 'timezone must be a non-empty IANA identifier' });
  }

  if (issues.length > 0) {
    throw validationFailed('Validation failed', issues);
  }

  return {
    organizationName: normalizeOrganizationName(/** @type {string} */ (organizationNameRaw)),
    ownerEmail: normalizeEmail(/** @type {string} */ (ownerEmailRaw)),
    ownerDisplayName: /** @type {string} */ (ownerDisplayNameRaw).trim().replace(/\s+/g, ' '),
    timezone:
      typeof timezoneRaw === 'string' && timezoneRaw.trim() !== ''
        ? timezoneRaw.trim()
        : 'Asia/Karachi',
  };
}

/**
 * @param {Record<string, unknown>} body
 */
function parseActivationBody(body) {
  /** @type {{ field: string; message: string }[]} */
  const issues = [];
  const token = body['token'];
  const password = body['password'];

  if (typeof token !== 'string' || token.trim() === '') {
    issues.push({ field: 'token', message: 'token is required' });
  }
  if (typeof password !== 'string' || password.length === 0) {
    issues.push({ field: 'password', message: 'password is required' });
  }

  if (issues.length > 0) {
    throw validationFailed('Validation failed', issues);
  }

  return {
    token: /** @type {string} */ (token).trim(),
    password: /** @type {string} */ (password),
  };
}

/**
 * @param {Record<string, unknown>} body
 */
function parseRejectionBody(body) {
  const reason = body['reason'];
  if (typeof reason !== 'string' || reason.trim() === '') {
    throw validationFailed('Validation failed', [
      { field: 'reason', message: 'reason is required' },
    ]);
  }
  return { reason: reason.trim() };
}

module.exports = {
  parseOrganizationActivationRequest,
  parseActivationBody,
  parseRejectionBody,
};
