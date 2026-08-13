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
    purpose: record['purpose'] ? String(record['purpose']) : null,
    reference: record['reference'] ? String(record['reference']) : null,
    reversalOfId: record['reversalOfId'] ? String(record['reversalOfId']) : null,
    status: String(record['status']),
    postedAt:
      record['postedAt'] instanceof Date
        ? record['postedAt'].toISOString()
        : String(record['postedAt']),
    postedBy: String(record['postedBy']),
  };
}

const MANUAL_DIRECTIONS = ['inflow', 'outflow'];
const MAX_PURPOSE = 500;
const MAX_REFERENCE = 120;
const MAX_REASON = 1000;

function requireIdString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw validationFailed(`${field} is required`, [{ field, message: `${field} is required` }]);
  }
  return value.trim();
}

function parseRequiredText(value, field, maxLength) {
  const trimmed = requireTrimmedString(value, field, maxLength);
  return trimmed;
}

function parseOptionalText(value, field, maxLength) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return optionalTrimmedString(value, field, maxLength) || null;
}

function parseManualAccountTransaction(body) {
  assertObjectBody(body);
  const direction = body.direction;
  if (typeof direction !== 'string' || !MANUAL_DIRECTIONS.includes(direction)) {
    throw validationFailed('direction must be inflow or outflow', [
      { field: 'direction', message: 'direction must be inflow or outflow' },
    ]);
  }
  const money = parsePositiveMoneyInput(body.amount, 'amount');
  return {
    accountId: requireIdString(body.accountId, 'accountId'),
    direction,
    amountMinorUnits: money.amountMinorUnits,
    currency: money.currency,
    purpose: parseRequiredText(body.purpose, 'purpose', MAX_PURPOSE),
    reference: parseOptionalText(body.reference, 'reference', MAX_REFERENCE),
  };
}

function parseAccountTransfer(body) {
  assertObjectBody(body);
  const money = parsePositiveMoneyInput(body.amount, 'amount');
  const sourceAccountId = requireIdString(body.sourceAccountId, 'sourceAccountId');
  const destinationAccountId = requireIdString(body.destinationAccountId, 'destinationAccountId');
  if (sourceAccountId === destinationAccountId) {
    throw validationFailed('Source and destination account must differ', [
      { field: 'destinationAccountId', message: 'destination account must differ from source' },
    ]);
  }
  return {
    sourceAccountId,
    destinationAccountId,
    amountMinorUnits: money.amountMinorUnits,
    currency: money.currency,
    purpose: parseOptionalText(body.purpose, 'purpose', MAX_PURPOSE),
    reference: parseOptionalText(body.reference, 'reference', MAX_REFERENCE),
  };
}

function parseReversalReason(body) {
  assertObjectBody(body);
  return {
    reason: parseRequiredText(body.reason, 'reason', MAX_REASON),
  };
}

function toManualAccountTransactionDto(record, extras) {
  const signed = BigInt(String(record['signedAmountMinorUnits'] ?? '0'));
  const absolute = signed < 0n ? -signed : signed;
  const direction =
    extras?.direction ??
    (record['sourceType'] === 'manual_outflow' || record['sourceType'] === 'manual_outflow_reversal'
      ? 'outflow'
      : 'inflow');
  return {
    id: String(record['_id']),
    organizationId: String(record['organizationId']),
    accountId: String(record['accountId']),
    direction,
    amount: {
      amount: require('../../platform/primitives/money-and-time').formatMoneyMinorUnits(absolute),
      currency: String(record['currency'] ?? 'PKR'),
    },
    signedAmount: {
      amount: require('../../platform/primitives/money-and-time').formatMoneyMinorUnits(signed),
      currency: String(record['currency'] ?? 'PKR'),
    },
    purpose: record['purpose'] ? String(record['purpose']) : null,
    reference: record['reference'] ? String(record['reference']) : null,
    sourceType: String(record['sourceType']),
    sourceId: String(record['sourceId']),
    reversalOfId: record['reversalOfId'] ? String(record['reversalOfId']) : null,
    reversedByMovementId: extras?.reversedByMovementId ?? null,
    status: String(record['status']),
    postedAt:
      record['postedAt'] instanceof Date
        ? record['postedAt'].toISOString()
        : String(record['postedAt']),
    postedBy: String(record['postedBy']),
  };
}

function toAccountTransferDto(input) {
  const { formatMoneyMinorUnits } = require('../../platform/primitives/money-and-time');
  return {
    id: String(input.id),
    sourceAccountId: String(input.sourceAccountId),
    destinationAccountId: String(input.destinationAccountId),
    amount: {
      amount: formatMoneyMinorUnits(BigInt(String(input.amountMinorUnits))),
      currency: String(input.currency ?? 'PKR'),
    },
    purpose: input.purpose ?? null,
    reference: input.reference ?? null,
    outboundMovementId: String(input.outboundMovementId),
    inboundMovementId: String(input.inboundMovementId),
    reversalOutboundMovementId: input.reversalOutboundMovementId
      ? String(input.reversalOutboundMovementId)
      : null,
    reversalInboundMovementId: input.reversalInboundMovementId
      ? String(input.reversalInboundMovementId)
      : null,
    status: String(input.status ?? 'posted'),
    postedAt:
      input.postedAt instanceof Date ? input.postedAt.toISOString() : String(input.postedAt),
    postedBy: String(input.postedBy),
    reason: input.reason ?? null,
  };
}

module.exports = {
  parseExpectedVersion,
  parseAccountCreate,
  parseAccountPatch,
  parseAccountOpeningBalance,
  parseManualAccountTransaction,
  parseAccountTransfer,
  parseReversalReason,
  toAccountDto,
  toAccountMovementDto,
  toManualAccountTransactionDto,
  toAccountTransferDto,
  ACCOUNT_TYPES,
};
