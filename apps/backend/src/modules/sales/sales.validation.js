const { validationFailed } = require('../../platform/errors/app-error');
const {
  formatMoneyMinorUnits,
  parseMoneyMinorUnits,
  parseQuantityMinorUnits,
  formatQuantityMinorUnits,
  parseDateOnly,
  QUANTITY_MINOR_UNIT_FACTOR,
  multiplyMoneyMinorUnits,
} = require('../../platform/primitives/money-and-time');

function assertObjectBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw validationFailed('Request body must be an object');
  }
}

function requireIdString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw validationFailed(`${field} is required`, [{ field, message: `${field} is required` }]);
  }
  return value.trim();
}

function optionalIdString(value, field) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw validationFailed(`${field} must be a string`, [{ field, message: `${field} must be a string` }]);
  }
  return value.trim();
}

function optionalNotes(value) {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value !== 'string') {
    throw validationFailed('notes must be a string', [{ field: 'notes', message: 'notes must be a string' }]);
  }
  const trimmed = value.trim();
  if (trimmed.length > 1000) {
    throw validationFailed('notes exceeds maximum length', [
      { field: 'notes', message: 'notes must be at most 1000 characters' },
    ]);
  }
  return trimmed;
}

function parseDateOnlyRequired(value, field) {
  if (typeof value !== 'string') {
    throw validationFailed(`${field} is required`, [{ field, message: `${field} must be YYYY-MM-DD` }]);
  }
  try {
    return parseDateOnly(value);
  } catch {
    throw validationFailed(`${field} must be YYYY-MM-DD`, [{ field, message: 'expected YYYY-MM-DD' }]);
  }
}

function parsePositiveMoneyInput(value, field) {
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

function parseExpectedVersion(body) {
  const expectedVersion = body?.expectedVersion;
  if (typeof expectedVersion !== 'number' || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw validationFailed('expectedVersion must be a positive integer', [
      { field: 'expectedVersion', message: 'expectedVersion must be a positive integer' },
    ]);
  }
  return expectedVersion;
}

function parseSaleLine(raw, index) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw validationFailed(`lines[${index}] must be an object`, [
      { field: `lines[${index}]`, message: 'line must be an object' },
    ]);
  }
  const productId = requireIdString(raw.productId, `lines[${index}].productId`);
  const packagingUnitId = optionalIdString(raw.packagingUnitId, `lines[${index}].packagingUnitId`);

  if (typeof raw.quantity !== 'string') {
    throw validationFailed(`lines[${index}].quantity must be a decimal string`, [
      { field: `lines[${index}].quantity`, message: 'quantity must be a decimal string' },
    ]);
  }
  let enteredQuantityMinorUnits;
  try {
    enteredQuantityMinorUnits = parseQuantityMinorUnits(raw.quantity);
  } catch (error) {
    throw validationFailed(`lines[${index}].quantity is invalid`, [
      { field: `lines[${index}].quantity`, message: error.message },
    ]);
  }
  if (enteredQuantityMinorUnits <= 0n) {
    throw validationFailed(`lines[${index}].quantity must be greater than zero`, [
      { field: `lines[${index}].quantity`, message: 'quantity must be greater than zero' },
    ]);
  }

  const unitPrice = parsePositiveMoneyInput(raw.unitPrice, `lines[${index}].unitPrice`);

  return {
    productId,
    packagingUnitId,
    enteredQuantityMinorUnits: enteredQuantityMinorUnits.toString(),
    unitPriceMinorUnits: unitPrice.amountMinorUnits,
  };
}

function parseSaleDraft(body, options = {}) {
  const partial = options.partial === true;
  assertObjectBody(body);
  const result = {};

  if (!partial || body.branchId !== undefined) {
    result.branchId = requireIdString(body.branchId, 'branchId');
  }
  if (!partial || body.warehouseId !== undefined) {
    result.warehouseId = requireIdString(body.warehouseId, 'warehouseId');
  }
  if (!partial || body.customerId !== undefined) {
    result.customerId = optionalIdString(body.customerId, 'customerId');
  }
  if (!partial || body.saleDate !== undefined) {
    result.saleDate = parseDateOnlyRequired(body.saleDate, 'saleDate');
  }
  if (!partial || body.notes !== undefined) {
    result.notes = optionalNotes(body.notes);
  }
  if (!partial || body.lines !== undefined) {
    if (!Array.isArray(body.lines) || body.lines.length === 0) {
      throw validationFailed('lines must be a non-empty array', [
        { field: 'lines', message: 'at least one sale line is required' },
      ]);
    }
    result.lines = body.lines.map((line, index) => parseSaleLine(line, index));
  }
  if (partial) {
    result.expectedVersion = parseExpectedVersion(body);
  }
  return result;
}

function computeLineProductAmount(enteredQuantityMinorUnits, unitPriceMinorUnits, conversionFactorSnapshot) {
  const enteredQty = BigInt(enteredQuantityMinorUnits);
  const unitPrice = BigInt(unitPriceMinorUnits);
  return multiplyMoneyMinorUnits(unitPrice, enteredQty, QUANTITY_MINOR_UNIT_FACTOR).toString();
}

function toMoneyDto(amountMinorUnits) {
  return {
    amount: formatMoneyMinorUnits(BigInt(String(amountMinorUnits ?? '0'))),
    currency: 'PKR',
  };
}

function parseApprovalReason(raw, field) {
  if (raw === undefined || raw === null) {
    return null;
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw validationFailed(`${field} must be an object`, [
      { field, message: `${field} must be an object with reason` },
    ]);
  }
  if (typeof raw.reason !== 'string' || raw.reason.trim() === '') {
    throw validationFailed(`${field}.reason is required`, [
      { field: `${field}.reason`, message: 'reason is required' },
    ]);
  }
  const reason = raw.reason.trim();
  if (reason.length > 1000) {
    throw validationFailed(`${field}.reason exceeds maximum length`, [
      { field: `${field}.reason`, message: 'reason must be at most 1000 characters' },
    ]);
  }
  return { reason };
}

function parseSalePost(body) {
  assertObjectBody(body);
  const expectedVersion = parseExpectedVersion(body);
  const paymentsRaw = body.payments === undefined || body.payments === null ? [] : body.payments;
  if (!Array.isArray(paymentsRaw)) {
    throw validationFailed('payments must be an array', [
      { field: 'payments', message: 'payments must be an array' },
    ]);
  }

  const payments = paymentsRaw.map((item, index) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw validationFailed(`payments[${index}] must be an object`, [
        { field: `payments[${index}]`, message: 'payment line must be an object' },
      ]);
    }
    const accountId = requireIdString(item.accountId, `payments[${index}].accountId`);
    const amount = parsePositiveMoneyInput(item.amount, `payments[${index}].amount`);
    return {
      accountId,
      amountMinorUnits: amount.amountMinorUnits,
    };
  });

  const linePriceOverridesRaw =
    body.linePriceOverrides === undefined || body.linePriceOverrides === null
      ? []
      : body.linePriceOverrides;
  if (!Array.isArray(linePriceOverridesRaw)) {
    throw validationFailed('linePriceOverrides must be an array', [
      { field: 'linePriceOverrides', message: 'linePriceOverrides must be an array' },
    ]);
  }

  const linePriceOverrides = linePriceOverridesRaw.map((item, index) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw validationFailed(`linePriceOverrides[${index}] must be an object`, [
        { field: `linePriceOverrides[${index}]`, message: 'override entry must be an object' },
      ]);
    }
    const lineIndex = item.lineIndex;
    if (typeof lineIndex !== 'number' || !Number.isInteger(lineIndex) || lineIndex < 0) {
      throw validationFailed(`linePriceOverrides[${index}].lineIndex must be a non-negative integer`, [
        { field: `linePriceOverrides[${index}].lineIndex`, message: 'lineIndex must be a non-negative integer' },
      ]);
    }
    if (typeof item.reason !== 'string' || item.reason.trim() === '') {
      throw validationFailed(`linePriceOverrides[${index}].reason is required`, [
        { field: `linePriceOverrides[${index}].reason`, message: 'reason is required' },
      ]);
    }
    const reason = item.reason.trim();
    if (reason.length > 1000) {
      throw validationFailed(`linePriceOverrides[${index}].reason exceeds maximum length`, [
        { field: `linePriceOverrides[${index}].reason`, message: 'reason must be at most 1000 characters' },
      ]);
    }
    return { lineIndex, reason };
  });

  const approvalsRaw =
    body.approvals === undefined || body.approvals === null ? {} : body.approvals;
  if (approvalsRaw === null || typeof approvalsRaw !== 'object' || Array.isArray(approvalsRaw)) {
    throw validationFailed('approvals must be an object', [
      { field: 'approvals', message: 'approvals must be an object' },
    ]);
  }

  const approvals = {
    creditLimit: parseApprovalReason(approvalsRaw.creditLimit, 'approvals.creditLimit'),
    expiredStock: parseApprovalReason(approvalsRaw.expiredStock, 'approvals.expiredStock'),
    negativeStock: parseApprovalReason(approvalsRaw.negativeStock, 'approvals.negativeStock'),
  };

  return { expectedVersion, payments, linePriceOverrides, approvals };
}

function parseSaleCancel(body) {
  assertObjectBody(body);
  const expectedVersion = parseExpectedVersion(body);
  if (typeof body.reason !== 'string' || body.reason.trim() === '') {
    throw validationFailed('reason is required', [{ field: 'reason', message: 'reason is required' }]);
  }
  const reason = body.reason.trim();
  if (reason.length > 1000) {
    throw validationFailed('reason exceeds maximum length', [
      { field: 'reason', message: 'reason must be at most 1000 characters' },
    ]);
  }
  return { expectedVersion, reason };
}

function toApprovalDto(record) {
  if (!record) {
    return null;
  }
  return {
    reason: String(record.reason),
    approvedBy: String(record.approvedBy),
    approvedAt:
      record.approvedAt instanceof Date
        ? record.approvedAt.toISOString()
        : record.approvedAt
          ? String(record.approvedAt)
          : null,
  };
}

function toSaleDto(record) {
  const lines = (record.lines ?? []).map((line) => ({
    productId: String(line.productId),
    productNameSnapshot: String(line.productNameSnapshot),
    packagingUnitId: line.packagingUnitId ? String(line.packagingUnitId) : null,
    unitCodeSnapshot: String(line.unitCodeSnapshot),
    conversionFactorSnapshot: String(line.conversionFactorSnapshot),
    quantity: formatQuantityMinorUnits(BigInt(String(line.enteredQuantityMinorUnits))),
    quantityBase: formatQuantityMinorUnits(BigInt(String(line.quantityBaseMinorUnits))),
    unitPrice: toMoneyDto(line.unitPriceMinorUnits),
    lineProductAmount: toMoneyDto(line.lineProductAmountMinorUnits),
    priceTierSnapshot: line.priceTierSnapshot ? String(line.priceTierSnapshot) : null,
    catalogPrice:
      line.catalogPriceMinorUnits === null || line.catalogPriceMinorUnits === undefined
        ? null
        : toMoneyDto(line.catalogPriceMinorUnits),
    priceOverrideReason: line.priceOverrideReason ? String(line.priceOverrideReason) : null,
    cogsTotal:
      line.cogsTotalMinorUnits === null || line.cogsTotalMinorUnits === undefined
        ? null
        : toMoneyDto(line.cogsTotalMinorUnits),
    stockAllocations: (line.stockAllocations ?? []).map((allocation) => ({
      batchId: allocation.batchId ? String(allocation.batchId) : null,
      batchNumber: allocation.batchNumber ? String(allocation.batchNumber) : null,
      expiryDate: allocation.expiryDate ? String(allocation.expiryDate) : null,
      quantityBase: formatQuantityMinorUnits(BigInt(String(allocation.quantityBaseMinorUnits))),
      cogs: toMoneyDto(allocation.cogsMinorUnits),
    })),
  }));

  const paymentSnapshots = (record.paymentSnapshots ?? []).map((payment) => ({
    accountId: String(payment.accountId),
    accountNameSnapshot: String(payment.accountNameSnapshot),
    accountTypeSnapshot: String(payment.accountTypeSnapshot),
    amount: toMoneyDto(payment.amountMinorUnits),
    paymentId: payment.paymentId ? String(payment.paymentId) : null,
  }));

  return {
    id: String(record['_id']),
    organizationId: String(record['organizationId']),
    branchId: String(record['branchId']),
    branchNameSnapshot: record['branchNameSnapshot'] ? String(record['branchNameSnapshot']) : null,
    warehouseId: String(record['warehouseId']),
    warehouseNameSnapshot: record['warehouseNameSnapshot']
      ? String(record['warehouseNameSnapshot'])
      : null,
    customerId: record['customerId'] ? String(record['customerId']) : null,
    customerNameSnapshot: record['customerNameSnapshot'] ? String(record['customerNameSnapshot']) : null,
    priceTierSnapshot: record['priceTierSnapshot'] ? String(record['priceTierSnapshot']) : null,
    saleDate: String(record['saleDate']),
    notes: String(record['notes'] ?? ''),
    status: String(record['status']),
    invoiceNumber: record['invoiceNumber'] ? String(record['invoiceNumber']) : null,
    saleTotal:
      record['saleTotalMinorUnits'] === null || record['saleTotalMinorUnits'] === undefined
        ? null
        : toMoneyDto(record['saleTotalMinorUnits']),
    paidTotal:
      record['paidTotalMinorUnits'] === null || record['paidTotalMinorUnits'] === undefined
        ? null
        : toMoneyDto(record['paidTotalMinorUnits']),
    receivableTotal:
      record['receivableTotalMinorUnits'] === null || record['receivableTotalMinorUnits'] === undefined
        ? null
        : toMoneyDto(record['receivableTotalMinorUnits']),
    cogsTotal:
      record['cogsTotalMinorUnits'] === null || record['cogsTotalMinorUnits'] === undefined
        ? null
        : toMoneyDto(record['cogsTotalMinorUnits']),
    payments: paymentSnapshots,
    lines,
    creditLimitApproval: toApprovalDto(record['creditLimitApproval']),
    expiredStockApproval: toApprovalDto(record['expiredStockApproval']),
    negativeStockOverride: toApprovalDto(record['negativeStockOverride']),
    cancellationReason: record['cancellationReason'] ? String(record['cancellationReason']) : null,
    cancelledAt:
      record['cancelledAt'] instanceof Date
        ? record['cancelledAt'].toISOString()
        : record['cancelledAt']
          ? String(record['cancelledAt'])
          : null,
    cancelledBy: record['cancelledBy'] ? String(record['cancelledBy']) : null,
    version: Number(record['version']),
    postedAt:
      record['postedAt'] instanceof Date
        ? record['postedAt'].toISOString()
        : record['postedAt']
          ? String(record['postedAt'])
          : null,
    createdAt:
      record['createdAt'] instanceof Date
        ? record['createdAt'].toISOString()
        : String(record['createdAt'] ?? ''),
    updatedAt:
      record['updatedAt'] instanceof Date
        ? record['updatedAt'].toISOString()
        : String(record['updatedAt'] ?? ''),
  };
}

module.exports = {
  parseSaleDraft,
  parseSalePost,
  parseSaleCancel,
  computeLineProductAmount,
  toSaleDto,
};
