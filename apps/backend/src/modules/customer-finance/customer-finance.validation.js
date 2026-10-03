const { validationFailed } = require('../../platform/errors/app-error');
const { parseMoneyMinorUnits } = require('../../platform/primitives/money-and-time');

function bodyObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw validationFailed('Request body must be an object');
}
function string(value, field, required = false, max = 500) {
  if (value === undefined || value === null) {
    if (required) throw validationFailed(`${field} is required`, [{ field, message: `${field} is required` }]);
    return '';
  }
  if (typeof value !== 'string') throw validationFailed(`${field} must be a string`, [{ field, message: `${field} must be a string` }]);
  const result = value.trim();
  if (required && !result) throw validationFailed(`${field} is required`, [{ field, message: `${field} is required` }]);
  if (result.length > max) throw validationFailed(`${field} is too long`, [{ field, message: `${field} must be at most ${max} characters` }]);
  return result;
}
function date(value, field, required = true) {
  const result = string(value, field, required, 10);
  if (!result && !required) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw validationFailed(`${field} must use YYYY-MM-DD`, [{ field, message: 'must use YYYY-MM-DD' }]);
  return result;
}
function money(value, field, positive = false) {
  if (!value || typeof value !== 'object' || typeof value.amount !== 'string') throw validationFailed(`${field} must be a money object`, [{ field, message: 'must be { amount, currency }' }]);
  if (value.currency !== undefined && value.currency !== 'PKR') throw validationFailed('Only PKR is supported');
  let minor;
  try { minor = parseMoneyMinorUnits(value.amount); } catch { throw validationFailed(`${field}.amount is invalid`); }
  if (minor < 0n || (positive && minor === 0n)) throw validationFailed(`${field}.amount is invalid`, [{ field: `${field}.amount`, message: positive ? 'must be greater than zero' : 'must not be negative' }]);
  return minor;
}
function id(value, field) { return string(value, field, true, 80); }
function common(body) {
  return {
    businessDate: date(body.businessDate, 'businessDate'),
    reference: string(body.reference, 'reference', false, 160) || null,
    notes: string(body.notes, 'notes', false, 1000) || null,
  };
}
function parseLoan(body) {
  bodyObject(body);
  return { customerId: id(body.customerId, 'customerId'), accountId: id(body.disbursementAccountId ?? body.accountId, 'disbursementAccountId'), principalMinorUnits: money(body.principal ?? body.amount, 'principal', true).toString(), dueDate: date(body.dueDate, 'dueDate', false), ...common(body) };
}
function parseRepayment(body) {
  bodyObject(body);
  return { accountId: id(body.accountId, 'accountId'), amountMinorUnits: money(body.amount, 'amount', true).toString(), ...common(body) };
}
function parseReverse(body) { bodyObject(body); return { reason: string(body.reason, 'reason', true, 500) }; }
function parseAdjustment(body) {
  bodyObject(body);
  const balanceType = string(body.balanceType, 'balanceType', true, 40);
  if (!['trade_receivable', 'customer_advance', 'loan_receivable'].includes(balanceType)) throw validationFailed('balanceType is invalid');
  const loanId = balanceType === 'loan_receivable' ? id(body.loanId, 'loanId') : null;
  return { customerId: id(body.customerId, 'customerId'), balanceType, loanId, expectedCurrentMinorUnits: money(body.expectedCurrentBalance, 'expectedCurrentBalance').toString(), desiredMinorUnits: money(body.desiredBalance, 'desiredBalance').toString(), reason: string(body.reason, 'reason', true, 500), category: string(body.category, 'category', true, 80), ...common(body) };
}
module.exports = { parseLoan, parseRepayment, parseReverse, parseAdjustment };
