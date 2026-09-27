const { validationFailed } = require('../../platform/errors/app-error');
const { parseMoneyMinorUnits } = require('../../platform/primitives/money-and-time');

function bodyObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw validationFailed('Request body must be an object');
  }
}

function string(value, field, required = false, max = 500) {
  if (value === undefined || value === null) {
    if (required) throw validationFailed(`${field} is required`, [{ field, message: `${field} is required` }]);
    return '';
  }
  if (typeof value !== 'string') throw validationFailed(`${field} must be a string`);
  const result = value.trim();
  if (required && !result) throw validationFailed(`${field} is required`, [{ field, message: `${field} is required` }]);
  if (result.length > max) throw validationFailed(`${field} is too long`);
  return result;
}

function date(value, field) {
  const result = string(value, field, true, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw validationFailed(`${field} must use YYYY-MM-DD`);
  return result;
}

function money(value, field, positive = false) {
  if (!value || typeof value !== 'object' || typeof value.amount !== 'string') {
    throw validationFailed(`${field} must be a money object`, [{ field, message: 'must be { amount, currency }' }]);
  }
  if (value.currency !== undefined && value.currency !== 'PKR') throw validationFailed('Only PKR is supported');
  let minor;
  try { minor = parseMoneyMinorUnits(value.amount); } catch { throw validationFailed(`${field}.amount is invalid`); }
  if (minor < 0n || (positive && minor === 0n)) throw validationFailed(`${field}.amount is invalid`);
  return minor;
}

function common(body) {
  return {
    businessDate: date(body.businessDate, 'businessDate'),
    reference: string(body.reference, 'reference', false, 160) || null,
    notes: string(body.notes, 'notes', false, 1000) || null,
  };
}

function parseRefund(body) {
  bodyObject(body);
  return {
    supplierId: string(body.supplierId, 'supplierId', true, 80),
    accountId: string(body.accountId, 'accountId', true, 80),
    amountMinorUnits: money(body.amount, 'amount', true).toString(),
    ...common(body),
  };
}

function parseAdjustment(body) {
  bodyObject(body);
  const balanceType = string(body.balanceType, 'balanceType', true, 40);
  if (!['supplier_payable', 'supplier_advance'].includes(balanceType)) {
    throw validationFailed('balanceType is invalid');
  }
  return {
    supplierId: string(body.supplierId, 'supplierId', true, 80),
    balanceType,
    expectedCurrentMinorUnits: money(body.expectedCurrentBalance, 'expectedCurrentBalance').toString(),
    desiredMinorUnits: money(body.desiredBalance, 'desiredBalance').toString(),
    reason: string(body.reason, 'reason', true, 500),
    category: string(body.category, 'category', true, 80),
    ...common(body),
  };
}

function parseReverse(body) {
  bodyObject(body);
  return { reason: string(body.reason, 'reason', true, 500) };
}

module.exports = { parseRefund, parseAdjustment, parseReverse };
