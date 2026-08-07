// @ts-check
const { createHash, randomBytes } = require('node:crypto');

/**
 * @param {string} plaintext
 * @returns {string}
 */
function hashToken(plaintext) {
  return createHash('sha256').update(plaintext, 'utf8').digest('hex');
}

/**
 * @returns {{ token: string; tokenHash: string }}
 */
function generateActivationToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeOrganizationName(value) {
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * Non-secret applicant fingerprint for public onboarding idempotency (DATA_MODEL.md).
 * @param {{ organizationName: string; ownerEmail: string }} input
 */
function buildApplicantFingerprint(input) {
  const normalized = `${normalizeOrganizationName(input.organizationName).toLowerCase()}::${normalizeEmail(input.ownerEmail)}`;
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

module.exports = {
  hashToken,
  generateActivationToken,
  normalizeEmail,
  normalizeOrganizationName,
  buildApplicantFingerprint,
};
