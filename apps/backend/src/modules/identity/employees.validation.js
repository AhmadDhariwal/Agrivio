const { validationFailed, forbidden } = require('../../platform/errors/app-error');

const ALLOWED_ROLES = new Set(['Owner', 'Manager', 'Cashier', 'StoreKeeper']);
const MAX_NAME = 120;
const MAX_EMAIL = 254;

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

function parseEmployeeCreate(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw validationFailed('Request body must be an object');
  }

  if (Object.prototype.hasOwnProperty.call(body, 'platformAccess')) {
    throw forbidden('Organization users cannot be granted platform Super Admin access');
  }
  if (body.role === 'Super Admin' || body.role === 'SuperAdmin') {
    throw forbidden('Organization users cannot be granted platform Super Admin access');
  }

  const email = requireTrimmedString(body.email, 'email', MAX_EMAIL).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw validationFailed('email is invalid', [{ field: 'email', message: 'email is invalid' }]);
  }
  const displayName = requireTrimmedString(body.displayName, 'displayName', MAX_NAME);
  const role = body.role;
  if (typeof role !== 'string' || !ALLOWED_ROLES.has(role)) {
    throw validationFailed('role must be Owner, Manager, Cashier, or StoreKeeper', [
      { field: 'role', message: 'role must be Owner, Manager, Cashier, or StoreKeeper' },
    ]);
  }

  return { email, displayName, role };
}

function parseEmployeePatch(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw validationFailed('Request body must be an object');
  }
  if (Object.prototype.hasOwnProperty.call(body, 'platformAccess')) {
    throw forbidden('Organization users cannot be granted platform Super Admin access');
  }
  if (body.role === 'Super Admin' || body.role === 'SuperAdmin') {
    throw forbidden('Organization users cannot be granted platform Super Admin access');
  }

  const expectedVersion = parseExpectedVersion(body);
  const patch = {};

  if (body.displayName !== undefined) {
    patch.displayName = requireTrimmedString(body.displayName, 'displayName', MAX_NAME);
  }
  if (body.role !== undefined) {
    if (typeof body.role !== 'string' || !ALLOWED_ROLES.has(body.role)) {
      throw validationFailed('role must be Owner, Manager, Cashier, or StoreKeeper', [
        { field: 'role', message: 'role must be Owner, Manager, Cashier, or StoreKeeper' },
      ]);
    }
    patch.role = body.role;
  }
  if (body.status !== undefined) {
    throw validationFailed('Use deactivate endpoint to change membership status', [
      { field: 'status', message: 'Use POST /users/:id/deactivate' },
    ]);
  }

  if (Object.keys(patch).length === 0) {
    throw validationFailed('At least one user field is required');
  }
  return { expectedVersion, patch };
}

module.exports = {
  parseEmployeeCreate,
  parseEmployeePatch,
  parseExpectedVersion,
  ALLOWED_ROLES,
};
