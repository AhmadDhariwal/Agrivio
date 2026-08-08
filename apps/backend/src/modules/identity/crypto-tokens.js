const { createHash, randomBytes } = require('node:crypto');

function hashToken(plaintext) {
  return createHash('sha256').update(plaintext, 'utf8').digest('hex');
}

function generateOpaqueToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

function generateActivationToken() {
  return generateOpaqueToken();
}

function generatePasswordResetToken() {
  return generateOpaqueToken();
}

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function normalizeOrganizationName(value) {
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * Non-secret applicant fingerprint for public onboarding idempotency (DATA_MODEL.md).
 */
function buildApplicantFingerprint(input) {
  const normalized = `${normalizeOrganizationName(input.organizationName).toLowerCase()}::${normalizeEmail(input.ownerEmail)}`;
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

module.exports = {
  hashToken,
  generateOpaqueToken,
  generateActivationToken,
  generatePasswordResetToken,
  normalizeEmail,
  normalizeOrganizationName,
  buildApplicantFingerprint,
};
