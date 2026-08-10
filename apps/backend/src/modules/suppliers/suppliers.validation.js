const { validationFailed } = require('../../platform/errors/app-error');

const MAX_NAME = 160;
const MAX_PHONE = 32;
const MAX_CONTACT = 120;
const MAX_EMAIL = 160;
const STATUSES = new Set(['active', 'inactive']);

function parseExpectedVersion(body) {
  const expectedVersion = body?.expectedVersion;
  if (typeof expectedVersion !== 'number' || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw validationFailed('expectedVersion must be a positive integer', [
      { field: 'expectedVersion', message: 'expectedVersion must be a positive integer' },
    ]);
  }
  return expectedVersion;
}

function requireTrimmedString(value, field, maxLength) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw validationFailed(`${field} is required`, [{ field, message: `${field} is required` }]);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw validationFailed(`${field} exceeds maximum length`, [
      { field, message: `${field} must be at most ${maxLength} characters` },
    ]);
  }
  return trimmed;
}

function optionalTrimmedString(value, field, maxLength) {
  if (value === undefined || value === null) {
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

function normalizeName(value) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizePhone(value) {
  return value.replace(/[^\d+]/g, '');
}

function assertObjectBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw validationFailed('Request body must be an object');
  }
}

function parseSupplierCreate(body) {
  assertObjectBody(body);
  const name = requireTrimmedString(body.name, 'name', MAX_NAME);
  const phone = optionalTrimmedString(body.phone, 'phone', MAX_PHONE);
  return {
    name,
    nameNormalized: normalizeName(name),
    phone,
    phoneNormalized: phone === '' ? '' : normalizePhone(phone),
    contactName: optionalTrimmedString(body.contactName, 'contactName', MAX_CONTACT),
    email: optionalTrimmedString(body.email, 'email', MAX_EMAIL),
    status: 'active',
  };
}

function parseSupplierPatch(body) {
  assertObjectBody(body);
  const expectedVersion = parseExpectedVersion(body);
  const patch = {};
  if (body.name !== undefined) {
    const name = requireTrimmedString(body.name, 'name', MAX_NAME);
    patch.name = name;
    patch.nameNormalized = normalizeName(name);
  }
  if (body.phone !== undefined) {
    const phone = optionalTrimmedString(body.phone, 'phone', MAX_PHONE);
    patch.phone = phone;
    patch.phoneNormalized = phone === '' ? '' : normalizePhone(phone);
  }
  if (body.contactName !== undefined) {
    patch.contactName = optionalTrimmedString(body.contactName, 'contactName', MAX_CONTACT);
  }
  if (body.email !== undefined) {
    patch.email = optionalTrimmedString(body.email, 'email', MAX_EMAIL);
  }
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !STATUSES.has(body.status)) {
      throw validationFailed('status must be active or inactive', [
        { field: 'status', message: 'status must be active or inactive' },
      ]);
    }
    patch.status = body.status;
  }
  if (Object.keys(patch).length === 0) {
    throw validationFailed('At least one supplier field is required');
  }
  return { expectedVersion, patch };
}

function toSupplierDto(record) {
  return {
    id: String(record['_id']),
    organizationId: String(record['organizationId']),
    name: String(record['name']),
    phone: String(record['phone'] ?? ''),
    contactName: String(record['contactName'] ?? ''),
    email: String(record['email'] ?? ''),
    status: String(record['status']),
    version: Number(record['version'] ?? 1),
  };
}

module.exports = {
  parseExpectedVersion,
  parseSupplierCreate,
  parseSupplierPatch,
  toSupplierDto,
};
