const { validationFailed } = require('../../platform/errors/app-error');
const { parseDateOnly } = require('../../platform/primitives/money-and-time');
const {
  GROUP_BY_VALUES,
  KNOWN_FILTER_KEYS,
  PAYMENT_STATUS_VALUES,
  REPORT_BY_KEY,
} = require('./report-catalog');

function optionalTrimmed(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function parseReportKey(reportKey) {
  const key = optionalTrimmed(reportKey);
  if (key === null || REPORT_BY_KEY[key] === undefined) {
    throw validationFailed('Unknown report key', [
      { field: 'reportKey', message: 'reportKey is not a Release 1 fixed report' },
    ]);
  }
  return key;
}

function parseReportFilters(reportKey, raw = {}) {
  const definition = REPORT_BY_KEY[reportKey];
  const source = raw === null || typeof raw !== 'object' || Array.isArray(raw) ? {} : raw;
  const allowed = new Set(definition.filters);
  const extras = [];
  for (const key of Object.keys(source)) {
    if (source[key] === undefined || source[key] === null || source[key] === '') {
      continue;
    }
    if (!KNOWN_FILTER_KEYS.includes(key) || !allowed.has(key)) {
      extras.push(key);
    }
  }
  if (extras.length > 0) {
    throw validationFailed('Unsupported report filter', [
      {
        field: extras[0],
        message: `Filter ${extras[0]} is not applicable to ${reportKey}`,
      },
    ]);
  }

  const filters = {};
  if (allowed.has('fromDate')) {
    filters.fromDate = parseOptionalDate(source.fromDate, 'fromDate');
  }
  if (allowed.has('toDate')) {
    filters.toDate = parseOptionalDate(source.toDate, 'toDate');
  }
  if (allowed.has('businessDate')) {
    filters.businessDate = parseOptionalDate(source.businessDate, 'businessDate');
  }
  if (allowed.has('dueDateFrom')) {
    filters.dueDateFrom = parseOptionalDate(source.dueDateFrom, 'dueDateFrom');
  }
  if (allowed.has('dueDateTo')) {
    filters.dueDateTo = parseOptionalDate(source.dueDateTo, 'dueDateTo');
  }
  if (filters.dueDateFrom && filters.dueDateTo && filters.dueDateFrom > filters.dueDateTo) {
    throw validationFailed('Due date range is invalid', [
      { field: 'dueDateFrom', message: 'dueDateFrom must be on or before dueDateTo' },
    ]);
  }
  if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) {
    throw validationFailed('Date range is invalid', [
      { field: 'fromDate', message: 'fromDate must be on or before toDate' },
    ]);
  }

  for (const field of [
    'branchId',
    'warehouseId',
    'customerId',
    'supplierId',
    'productId',
    'categoryId',
    'customerType',
    'priceTier',
    'paymentMethod',
    'employeeId',
    'accountId',
    'accountType',
    'sourceType',
    'direction',
    'search',
    'status',
  ]) {
    if (allowed.has(field)) {
      filters[field] = optionalTrimmed(source[field]);
    }
  }

  if (allowed.has('page')) {
    filters.page = parsePositiveInteger(source.page, 'page', 1, 1_000_000);
  }
  if (allowed.has('pageSize')) {
    filters.pageSize = parsePositiveInteger(source.pageSize, 'pageSize', 25, 100);
  }

  if (allowed.has('paymentStatus')) {
    const paymentStatus = optionalTrimmed(source.paymentStatus);
    if (paymentStatus !== null && !PAYMENT_STATUS_VALUES.includes(paymentStatus)) {
      throw validationFailed('paymentStatus is invalid', [
        { field: 'paymentStatus', message: `paymentStatus must be one of: ${PAYMENT_STATUS_VALUES.join(', ')}` },
      ]);
    }
    filters.paymentStatus = paymentStatus;
  }

  if (allowed.has('groupBy')) {
    const groupBy = optionalTrimmed(source.groupBy) ?? 'document';
    if (!GROUP_BY_VALUES.includes(groupBy)) {
      throw validationFailed('groupBy is invalid', [
        { field: 'groupBy', message: `groupBy must be one of: ${GROUP_BY_VALUES.join(', ')}` },
      ]);
    }
    filters.groupBy = groupBy;
  }

  for (const required of definition.required ?? []) {
    if (!filters[required]) {
      throw validationFailed(`${required} is required`, [
        { field: required, message: `${required} is required for ${reportKey}` },
      ]);
    }
  }

  return filters;
}

function parsePositiveInteger(value, field, fallback, maximum) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw validationFailed(`${field} is invalid`, [
      { field, message: `${field} must be an integer from 1 to ${maximum}` },
    ]);
  }
  return parsed;
}

function parseOptionalDate(value, field) {
  const raw = optionalTrimmed(value);
  if (raw === null) {
    return null;
  }
  try {
    return parseDateOnly(raw);
  } catch {
    throw validationFailed(`${field} must be YYYY-MM-DD`, [
      { field, message: 'expected YYYY-MM-DD' },
    ]);
  }
}

function inDateRange(dateValue, fromDate, toDate) {
  if (!dateValue) {
    return fromDate === null && toDate === null;
  }
  const day = String(dateValue).slice(0, 10);
  if (fromDate && day < fromDate) {
    return false;
  }
  if (toDate && day > toDate) {
    return false;
  }
  return true;
}

function deriveDocumentPaymentStatus(paidMinor, outstandingMinor) {
  const paid = BigInt(String(paidMinor ?? '0'));
  const outstanding = BigInt(String(outstandingMinor ?? '0'));
  if (outstanding === 0n) {
    return 'paid';
  }
  if (paid === 0n) {
    return 'unpaid';
  }
  return 'partial';
}

module.exports = {
  deriveDocumentPaymentStatus,
  inDateRange,
  parseReportFilters,
  parseReportKey,
};
