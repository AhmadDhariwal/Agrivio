const { validationFailed } = require('../../platform/errors/app-error');
const { assertOptimisticVersion } = require('../../platform/validation/request-validation');

const MAX_TEXT = 200;
const MAX_NOTE = 500;

function parseExpectedVersion(body) {
  const expectedVersion = body?.expectedVersion;
  if (typeof expectedVersion !== 'number' || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw validationFailed('expectedVersion must be a positive integer', [
      { field: 'expectedVersion', message: 'expectedVersion must be a positive integer' },
    ]);
  }
  return expectedVersion;
}

function optionalTrimmedString(value, field, maxLength) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return '';
  }
  if (typeof value !== 'string') {
    throw validationFailed(`${field} must be a string`, [{ field, message: `${field} must be a string` }]);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw validationFailed(`${field} exceeds maximum length`, [
      { field, message: `${field} must be at most ${maxLength} characters` },
    ]);
  }
  return trimmed;
}

function parseSettingsPatch(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw validationFailed('Request body must be an object');
  }

  const expectedVersion = parseExpectedVersion(body);
  const patch = {};

  const tradingName = optionalTrimmedString(body.tradingName, 'tradingName', MAX_TEXT);
  if (tradingName !== undefined) {
    patch.tradingName = tradingName;
  }
  const contactPhone = optionalTrimmedString(body.contactPhone, 'contactPhone', MAX_TEXT);
  if (contactPhone !== undefined) {
    patch.contactPhone = contactPhone;
  }
  const contactEmail = optionalTrimmedString(body.contactEmail, 'contactEmail', MAX_TEXT);
  if (contactEmail !== undefined) {
    patch.contactEmail = contactEmail;
  }
  const addressLine = optionalTrimmedString(body.addressLine, 'addressLine', MAX_TEXT);
  if (addressLine !== undefined) {
    patch.addressLine = addressLine;
  }
  const documentFooterNote = optionalTrimmedString(
    body.documentFooterNote,
    'documentFooterNote',
    MAX_NOTE,
  );
  if (documentFooterNote !== undefined) {
    patch.documentFooterNote = documentFooterNote;
  }

  const forbiddenKeys = [
    'organizationId',
    'creditPolicy',
    'expiryThresholdDays',
    'invoicePrefix',
    'timezone',
    'subscription',
  ];
  for (const key of forbiddenKeys) {
    if (Object.prototype.hasOwnProperty.call(body, key) && key !== 'timezone') {
      // timezone is owned by organizations; reject if sent to residual settings
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, 'timezone')) {
    throw validationFailed('timezone is managed on the organization profile, not residual settings', [
      { field: 'timezone', message: 'Use organization profile update for timezone' },
    ]);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'invoicePrefix')) {
    throw validationFailed('invoicePrefix is owned by branches', [
      { field: 'invoicePrefix', message: 'Configure invoice prefix on branches' },
    ]);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'creditPolicy')) {
    throw validationFailed('creditPolicy is owned by Customers', [
      { field: 'creditPolicy', message: 'Credit policy is not a residual setting' },
    ]);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'expiryThresholdDays')) {
    throw validationFailed('expiryThresholdDays is owned by Inventory/Alerts', [
      { field: 'expiryThresholdDays', message: 'Expiry thresholds are not residual settings' },
    ]);
  }

  if (Object.keys(patch).length === 0) {
    throw validationFailed('At least one residual settings field is required');
  }

  return { expectedVersion, patch };
}

function toSettingsDto(record) {
  return {
    id: String(record['_id']),
    organizationId: String(record['organizationId']),
    tradingName: String(record['tradingName'] ?? ''),
    contactPhone: String(record['contactPhone'] ?? ''),
    contactEmail: String(record['contactEmail'] ?? ''),
    addressLine: String(record['addressLine'] ?? ''),
    documentFooterNote: String(record['documentFooterNote'] ?? ''),
    version: Number(record['version'] ?? 1),
  };
}

module.exports = {
  parseSettingsPatch,
  parseExpectedVersion,
  toSettingsDto,
  assertOptimisticVersion,
};
