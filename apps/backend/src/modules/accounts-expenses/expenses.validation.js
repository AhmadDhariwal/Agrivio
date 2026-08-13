const { validationFailed } = require('../../platform/errors/app-error');
const { parseDateOnly, formatMoneyMinorUnits } = require('../../platform/primitives/money-and-time');

const MAX_NAME = 160;
const MAX_PURPOSE = 500;
const MAX_REFERENCE = 120;
const MAX_REASON = 1000;
const STATUSES = new Set(['active', 'inactive']);

function assertObjectBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw validationFailed('Request body must be an object');
  }
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
  if (value === undefined || value === null || value === '') {
    return null;
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
  return trimmed.length === 0 ? null : trimmed;
}

function normalizeName(value) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function parseExpectedVersion(body) {
  const expectedVersion = body?.expectedVersion;
  if (typeof expectedVersion !== 'number' || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw validationFailed('expectedVersion must be a positive integer', [
      { field: 'expectedVersion', message: 'expectedVersion must be a positive integer' },
    ]);
  }
  return expectedVersion;
}

function requireIdString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw validationFailed(`${field} is required`, [{ field, message: `${field} is required` }]);
  }
  return value.trim();
}

function parsePositiveMoneyInput(value, field) {
  const { parseMoneyMinorUnits } = require('../../platform/primitives/money-and-time');
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

function parseDateOnlyRequired(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw validationFailed(`${field} is required`, [{ field, message: `${field} is required` }]);
  }
  try {
    return parseDateOnly(value.trim());
  } catch {
    throw validationFailed(`${field} must be a valid YYYY-MM-DD date`, [
      { field, message: `${field} must be a valid YYYY-MM-DD date` },
    ]);
  }
}

function parseExpenseCategoryCreate(body) {
  assertObjectBody(body);
  const name = requireTrimmedString(body.name, 'name', MAX_NAME);
  return {
    name,
    nameNormalized: normalizeName(name),
    status: 'active',
  };
}

function parseExpenseCategoryPatch(body) {
  assertObjectBody(body);
  const expectedVersion = parseExpectedVersion(body);
  const patch = {};
  if (body.name !== undefined) {
    const name = requireTrimmedString(body.name, 'name', MAX_NAME);
    patch.name = name;
    patch.nameNormalized = normalizeName(name);
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
    throw validationFailed('At least one expense category field is required');
  }
  return { expectedVersion, patch };
}

function parseExpenseDraft(body, { partial = false } = {}) {
  assertObjectBody(body);
  const result = {};
  if (!partial || body.categoryId !== undefined) {
    result.categoryId = requireIdString(body.categoryId, 'categoryId');
  }
  if (!partial || body.accountId !== undefined) {
    result.accountId = requireIdString(body.accountId, 'accountId');
  }
  if (!partial || body.amount !== undefined) {
    const money = parsePositiveMoneyInput(body.amount, 'amount');
    result.amountMinorUnits = money.amountMinorUnits;
    result.currency = money.currency;
  }
  if (!partial || body.purpose !== undefined) {
    result.purpose = requireTrimmedString(body.purpose, 'purpose', MAX_PURPOSE);
  }
  if (!partial || body.expenseDate !== undefined) {
    result.expenseDate = parseDateOnlyRequired(body.expenseDate, 'expenseDate');
  }
  if (!partial || body.reference !== undefined) {
    result.reference = optionalTrimmedString(body.reference, 'reference', MAX_REFERENCE);
  }
  return result;
}

function parseExpenseDraftCreate(body) {
  return parseExpenseDraft(body, { partial: false });
}

function parseExpenseDraftPatch(body) {
  assertObjectBody(body);
  const expectedVersion = parseExpectedVersion(body);
  const patch = parseExpenseDraft(body, { partial: true });
  delete patch.currency;
  if (Object.keys(patch).length === 0) {
    throw validationFailed('At least one expense field is required');
  }
  return { expectedVersion, patch };
}

function parseExpensePost(body) {
  assertObjectBody(body);
  return { expectedVersion: parseExpectedVersion(body) };
}

function parseExpenseCorrect(body) {
  assertObjectBody(body);
  return {
    expectedVersion: parseExpectedVersion(body),
    reason: requireTrimmedString(body.reason, 'reason', MAX_REASON),
  };
}

function toExpenseCategoryDto(record) {
  return {
    id: String(record['_id']),
    organizationId: String(record['organizationId']),
    name: String(record['name']),
    status: String(record['status']),
    version: Number(record['version'] ?? 1),
  };
}

function toExpenseDto(record) {
  return {
    id: String(record['_id']),
    organizationId: String(record['organizationId']),
    categoryId: String(record['categoryId']),
    accountId: String(record['accountId']),
    amount: {
      amount: formatMoneyMinorUnits(BigInt(String(record['amountMinorUnits'] ?? '0'))),
      currency: String(record['currency'] ?? 'PKR'),
    },
    purpose: String(record['purpose']),
    expenseDate: String(record['expenseDate']),
    reference: record['reference'] ? String(record['reference']) : null,
    status: String(record['status']),
    postedAt:
      record['postedAt'] instanceof Date
        ? record['postedAt'].toISOString()
        : record['postedAt']
          ? String(record['postedAt'])
          : null,
    postedBy: record['postedBy'] ? String(record['postedBy']) : null,
    accountMovementId: record['accountMovementId'] ? String(record['accountMovementId']) : null,
    correctionOfId: record['correctionOfId'] ? String(record['correctionOfId']) : null,
    correctedByExpenseId: record['correctedByExpenseId']
      ? String(record['correctedByExpenseId'])
      : null,
    correctedAt:
      record['correctedAt'] instanceof Date
        ? record['correctedAt'].toISOString()
        : record['correctedAt']
          ? String(record['correctedAt'])
          : null,
    correctedBy: record['correctedBy'] ? String(record['correctedBy']) : null,
    reason: record['reason'] ? String(record['reason']) : null,
    version: Number(record['version'] ?? 1),
  };
}

module.exports = {
  parseExpectedVersion,
  parseExpenseCategoryCreate,
  parseExpenseCategoryPatch,
  parseExpenseDraftCreate,
  parseExpenseDraftPatch,
  parseExpensePost,
  parseExpenseCorrect,
  toExpenseCategoryDto,
  toExpenseDto,
};
