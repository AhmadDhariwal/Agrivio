const { validationFailed } = require('../../platform/errors/app-error');
const { ACCOUNT_TYPES } = require('./persistence/account.model');

const MAX_NAME = 160;
const MAX_BANK = 120;
const MAX_MASKED = 64;
const MAX_WALLET = 64;
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

function assertObjectBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw validationFailed('Request body must be an object');
  }
}

function parseAccountType(value) {
  if (typeof value !== 'string' || !ACCOUNT_TYPES.includes(value)) {
    throw validationFailed('accountType is invalid', [
      { field: 'accountType', message: `accountType must be one of: ${ACCOUNT_TYPES.join(', ')}` },
    ]);
  }
  return value;
}

function typeSpecificFields(accountType, body) {
  if (accountType === 'bank') {
    return {
      bankName: requireTrimmedString(body.bankName, 'bankName', MAX_BANK),
      accountNumberMasked: optionalTrimmedString(
        body.accountNumberMasked,
        'accountNumberMasked',
        MAX_MASKED,
      ),
      walletIdentifier: '',
    };
  }
  if (accountType === 'jazzcash' || accountType === 'easypaisa') {
    return {
      bankName: '',
      accountNumberMasked: '',
      walletIdentifier: requireTrimmedString(body.walletIdentifier, 'walletIdentifier', MAX_WALLET),
    };
  }
  return {
    bankName: '',
    accountNumberMasked: '',
    walletIdentifier: '',
  };
}

function parseAccountCreate(body) {
  assertObjectBody(body);
  const name = requireTrimmedString(body.name, 'name', MAX_NAME);
  const accountType = parseAccountType(body.accountType);
  return {
    name,
    nameNormalized: normalizeName(name),
    accountType,
    ...typeSpecificFields(accountType, body),
    status: 'active',
  };
}

function parseAccountPatch(body) {
  assertObjectBody(body);
  const expectedVersion = parseExpectedVersion(body);
  const patch = {};
  if (body.name !== undefined) {
    const name = requireTrimmedString(body.name, 'name', MAX_NAME);
    patch.name = name;
    patch.nameNormalized = normalizeName(name);
  }
  if (body.bankName !== undefined) {
    patch.bankName = optionalTrimmedString(body.bankName, 'bankName', MAX_BANK);
  }
  if (body.accountNumberMasked !== undefined) {
    patch.accountNumberMasked = optionalTrimmedString(
      body.accountNumberMasked,
      'accountNumberMasked',
      MAX_MASKED,
    );
  }
  if (body.walletIdentifier !== undefined) {
    patch.walletIdentifier = optionalTrimmedString(
      body.walletIdentifier,
      'walletIdentifier',
      MAX_WALLET,
    );
  }
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !STATUSES.has(body.status)) {
      throw validationFailed('status must be active or inactive', [
        { field: 'status', message: 'status must be active or inactive' },
      ]);
    }
    patch.status = body.status;
  }
  if (body.accountType !== undefined) {
    throw validationFailed('accountType cannot be changed after create', [
      { field: 'accountType', message: 'accountType is immutable' },
    ]);
  }
  if (Object.keys(patch).length === 0) {
    throw validationFailed('At least one account field is required');
  }
  return { expectedVersion, patch };
}

function toAccountDto(record, derivedBalances) {
  const opening = record['openingBalance'];
  const dto = {
    id: String(record['_id']),
    organizationId: String(record['organizationId']),
    accountType: String(record['accountType']),
    name: String(record['name']),
    bankName: String(record['bankName'] ?? ''),
    accountNumberMasked: String(record['accountNumberMasked'] ?? ''),
    walletIdentifier: String(record['walletIdentifier'] ?? ''),
    status: String(record['status']),
    version: Number(record['version'] ?? 1),
  };
  if (opening && opening.status === 'posted') {
    dto.openingBalance = {
      kind: String(opening.kind ?? 'balance'),
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
      accountMovementId: String(opening.accountMovementId),
      status: 'posted',
    };
  }
  if (derivedBalances !== undefined) {
    dto.derivedBalances = derivedBalances;
  }
  return dto;
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

function parseAccountOpeningBalance(body) {
  assertObjectBody(body);
  const money = parsePositiveMoneyInput(body.amount, 'amount');
  return {
    amountMinorUnits: money.amountMinorUnits,
    currency: money.currency,
  };
}

function toAccountMovementDto(record) {
  return {
    id: String(record['_id']),
    organizationId: String(record['organizationId']),
    accountId: String(record['accountId']),
    signedAmount: {
      amount: require('../../platform/primitives/money-and-time').formatMoneyMinorUnits(
        BigInt(String(record['signedAmountMinorUnits'] ?? '0')),
      ),
      currency: String(record['currency'] ?? 'PKR'),
    },
    sourceType: String(record['sourceType']),
    sourceId: String(record['sourceId']),
    status: String(record['status']),
    postedAt:
      record['postedAt'] instanceof Date
        ? record['postedAt'].toISOString()
        : String(record['postedAt']),
    postedBy: String(record['postedBy']),
  };
}

module.exports = {
  parseExpectedVersion,
  parseAccountCreate,
  parseAccountPatch,
  parseAccountOpeningBalance,
  toAccountDto,
  toAccountMovementDto,
  ACCOUNT_TYPES,
};
