const { validationFailed } = require('../../platform/errors/app-error');
const {
  parseMoneyMinorUnits,
  formatMoneyMinorUnits,
} = require('../../platform/primitives/money-and-time');
const {
  CUSTOMER_TYPES,
  PRICE_TIERS,
  CREDIT_LIMIT_BEHAVIOURS,
} = require('./persistence/customer.model');

const MAX_NAME = 160;
const MAX_PHONE = 32;
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

function parseCustomerType(value) {
  if (typeof value !== 'string' || !CUSTOMER_TYPES.includes(value)) {
    throw validationFailed('customerType is invalid', [
      { field: 'customerType', message: `customerType must be one of: ${CUSTOMER_TYPES.join(', ')}` },
    ]);
  }
  return value;
}

function parsePriceTier(value) {
  if (typeof value !== 'string' || !PRICE_TIERS.includes(value)) {
    throw validationFailed('priceTier is invalid', [
      { field: 'priceTier', message: `priceTier must be one of: ${PRICE_TIERS.join(', ')}` },
    ]);
  }
  return value;
}

function parseCreditBehaviour(value) {
  if (typeof value !== 'string' || !CREDIT_LIMIT_BEHAVIOURS.includes(value)) {
    throw validationFailed('creditLimitBehaviour is invalid', [
      {
        field: 'creditLimitBehaviour',
        message: `creditLimitBehaviour must be one of: ${CREDIT_LIMIT_BEHAVIOURS.join(', ')}`,
      },
    ]);
  }
  return value;
}

function parseMoneyInput(value, field) {
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
  if (minor < 0n) {
    throw validationFailed(`${field}.amount must not be negative`, [
      { field: `${field}.amount`, message: 'amount must not be negative' },
    ]);
  }
  return { amountMinorUnits: minor.toString(), currency: 'PKR' };
}

function assertWalkInCreditPolicy(customerType, creditEnabled, name, phone) {
  if (customerType === 'walk_in' && creditEnabled === true) {
    if (!name || name.trim() === '' || !phone || phone.trim() === '') {
      throw validationFailed('Anonymous walk-in credit is prohibited', [
        {
          field: 'creditEnabled',
          message: 'Walk-in credit requires identifying name and phone',
        },
      ]);
    }
  }
}

function parseCustomerCreate(body) {
  assertObjectBody(body);
  const name = requireTrimmedString(body.name, 'name', MAX_NAME);
  const phone = optionalTrimmedString(body.phone, 'phone', MAX_PHONE);
  const customerType = parseCustomerType(body.customerType);
  const priceTier = body.priceTier === undefined ? 'retail' : parsePriceTier(body.priceTier);
  const creditEnabled = body.creditEnabled === true;
  const creditLimit =
    body.creditLimit === undefined
      ? { amountMinorUnits: '0', currency: 'PKR' }
      : parseMoneyInput(body.creditLimit, 'creditLimit');
  const creditLimitBehaviour =
    body.creditLimitBehaviour === undefined
      ? 'warning'
      : parseCreditBehaviour(body.creditLimitBehaviour);

  assertWalkInCreditPolicy(customerType, creditEnabled, name, phone);

  return {
    name,
    nameNormalized: normalizeName(name),
    phone,
    phoneNormalized: phone === '' ? '' : normalizePhone(phone),
    customerType,
    priceTier,
    creditEnabled,
    creditLimitAmountMinorUnits: creditLimit.amountMinorUnits,
    creditLimitCurrency: creditLimit.currency,
    creditLimitBehaviour,
    status: 'active',
  };
}

function parseCustomerPatch(body) {
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
  if (body.customerType !== undefined) {
    patch.customerType = parseCustomerType(body.customerType);
  }
  if (body.priceTier !== undefined) {
    patch.priceTier = parsePriceTier(body.priceTier);
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
    throw validationFailed('At least one customer field is required');
  }
  return { expectedVersion, patch };
}

function parseCreditPolicyPatch(body) {
  assertObjectBody(body);
  const expectedVersion = parseExpectedVersion(body);
  const patch = {};
  if (body.creditEnabled !== undefined) {
    if (typeof body.creditEnabled !== 'boolean') {
      throw validationFailed('creditEnabled must be a boolean', [
        { field: 'creditEnabled', message: 'creditEnabled must be a boolean' },
      ]);
    }
    patch.creditEnabled = body.creditEnabled;
  }
  if (body.creditLimit !== undefined) {
    const money = parseMoneyInput(body.creditLimit, 'creditLimit');
    patch.creditLimitAmountMinorUnits = money.amountMinorUnits;
    patch.creditLimitCurrency = money.currency;
  }
  if (body.creditLimitBehaviour !== undefined) {
    patch.creditLimitBehaviour = parseCreditBehaviour(body.creditLimitBehaviour);
  }
  if (Object.keys(patch).length === 0) {
    throw validationFailed('At least one credit-policy field is required');
  }
  return { expectedVersion, patch };
}

function toCustomerDto(record) {
  return {
    id: String(record['_id']),
    organizationId: String(record['organizationId']),
    name: String(record['name']),
    phone: String(record['phone'] ?? ''),
    customerType: String(record['customerType']),
    priceTier: String(record['priceTier']),
    creditEnabled: Boolean(record['creditEnabled']),
    creditLimit: {
      amount: formatMoneyMinorUnits(BigInt(String(record['creditLimitAmountMinorUnits'] ?? '0'))),
      currency: String(record['creditLimitCurrency'] ?? 'PKR'),
    },
    creditLimitBehaviour: String(record['creditLimitBehaviour']),
    status: String(record['status']),
    version: Number(record['version'] ?? 1),
  };
}

module.exports = {
  parseExpectedVersion,
  parseCustomerCreate,
  parseCustomerPatch,
  parseCreditPolicyPatch,
  assertWalkInCreditPolicy,
  toCustomerDto,
  CUSTOMER_TYPES,
  PRICE_TIERS,
  CREDIT_LIMIT_BEHAVIOURS,
};
