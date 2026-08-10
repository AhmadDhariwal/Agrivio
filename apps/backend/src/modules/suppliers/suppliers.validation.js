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

function toSupplierDto(record, derivedBalances) {
  const opening = record['openingBalance'];
  const dto = {
    id: String(record['_id']),
    organizationId: String(record['organizationId']),
    name: String(record['name']),
    phone: String(record['phone'] ?? ''),
    contactName: String(record['contactName'] ?? ''),
    email: String(record['email'] ?? ''),
    status: String(record['status']),
    version: Number(record['version'] ?? 1),
  };
  if (opening && opening.status === 'posted') {
    dto.openingBalance = {
      kind: String(opening.kind),
      amount: {
        amount: require('../../platform/primitives/money-and-time').formatMoneyMinorUnits(
          BigInt(String(opening.amountMinorUnits ?? '0')),
        ),
        currency: String(opening.currency ?? 'PKR'),
      },
      postedAt:
        opening.postedAt instanceof Date
          ? opening.postedAt.toISOString()
          : String(opening.postedAt),
      postedBy: String(opening.postedBy),
      ledgerEffectId: String(opening.ledgerEffectId),
      status: 'posted',
    };
  }
  if (derivedBalances !== undefined) {
    dto.derivedBalances = derivedBalances;
  }
  return dto;
}

function parsePositiveMoneyInput(value, field) {
  const {
    parseMoneyMinorUnits,
  } = require('../../platform/primitives/money-and-time');
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw validationFailed(`${field} must be a money object`, [
      { field, message: `${field} must be { amount, currency }` },
    ]);
  }
  if (typeof value.amount !== 'string') {
    throw validationFailed(`${field}.amount must be a decimal string`, [
      { field: `${field}.amount`, message: 'amount must be a decimal string' },
    ]);
  }
  const currency = value.currency === undefined ? 'PKR' : value.currency;
  if (currency !== 'PKR') {
    throw validationFailed('Only PKR is supported in Release 1', [
      { field: `${field}.currency`, message: 'currency must be PKR' },
    ]);
  }
  let minor;
  try {
    minor = parseMoneyMinorUnits(value.amount);
  } catch {
    throw validationFailed(`${field}.amount is invalid`, [
      { field: `${field}.amount`, message: 'amount must have up to two decimal places' },
    ]);
  }
  if (minor <= 0n) {
    throw validationFailed(`${field}.amount must be greater than zero`, [
      { field: `${field}.amount`, message: 'amount must be greater than zero' },
    ]);
  }
  return { amountMinorUnits: minor.toString(), currency: 'PKR' };
}

function parseSupplierOpeningBalance(body) {
  assertObjectBody(body);
  const kind = body.kind;
  if (kind !== 'payable' && kind !== 'advance') {
    throw validationFailed('kind must be payable or advance', [
      { field: 'kind', message: 'kind must be payable or advance' },
    ]);
  }
  const money = parsePositiveMoneyInput(body.amount, 'amount');
  return {
    kind,
    amountMinorUnits: money.amountMinorUnits,
    currency: money.currency,
  };
}

module.exports = {
  parseExpectedVersion,
  parseSupplierCreate,
  parseSupplierPatch,
  parseSupplierOpeningBalance,
  toSupplierDto,
};
