const { validationFailed } = require('../../platform/errors/app-error');
const {
  parseMoneyMinorUnits,
  formatMoneyMinorUnits,
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

function optionalReference(value) {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value !== 'string') {
    throw validationFailed('supplierInvoiceReference must be a string', [
      { field: 'supplierInvoiceReference', message: 'must be a string' },
    ]);
  }
  const trimmed = value.trim();
  if (trimmed.length > 120) {
    throw validationFailed('supplierInvoiceReference exceeds maximum length', [
      { field: 'supplierInvoiceReference', message: 'must be at most 120 characters' },
    ]);
  }
  return trimmed;
}

function normalizeSupplierReference(value) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
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

function optionalDateOnly(value, field) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw validationFailed(`${field} must be a date-only string`, [
      { field, message: 'expected YYYY-MM-DD' },
    ]);
  }
  try {
    return parseDateOnly(value);
  } catch {
    throw validationFailed(`${field} must be YYYY-MM-DD`, [{ field, message: 'expected YYYY-MM-DD' }]);
  }
}

function parseNonNegativeMoneyInput(value, field) {
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
    throw validationFailed(`${field}.amount cannot be negative`, [
      { field: `${field}.amount`, message: 'amount cannot be negative' },
    ]);
  }
  return { amountMinorUnits: minor.toString(), currency: 'PKR' };
}

function parsePositiveMoneyInput(value, field) {
  const money = parseNonNegativeMoneyInput(value, field);
  if (BigInt(money.amountMinorUnits) <= 0n) {
    throw validationFailed(`${field}.amount must be greater than zero`, [
      { field: `${field}.amount`, message: 'amount must be greater than zero' },
    ]);
  }
  return money;
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

function parseLandedCosts(value) {
  if (value === undefined || value === null) {
    return {
      freightMinorUnits: '0',
      loadingMinorUnits: '0',
      transportMinorUnits: '0',
      otherMinorUnits: '0',
    };
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw validationFailed('landedCosts must be an object', [
      { field: 'landedCosts', message: 'landedCosts must be an object' },
    ]);
  }
  return {
    freightMinorUnits: parseNonNegativeMoneyInput(value.freight ?? { amount: '0.00', currency: 'PKR' }, 'landedCosts.freight')
      .amountMinorUnits,
    loadingMinorUnits: parseNonNegativeMoneyInput(value.loading ?? { amount: '0.00', currency: 'PKR' }, 'landedCosts.loading')
      .amountMinorUnits,
    transportMinorUnits: parseNonNegativeMoneyInput(
      value.transport ?? { amount: '0.00', currency: 'PKR' },
      'landedCosts.transport',
    ).amountMinorUnits,
    otherMinorUnits: parseNonNegativeMoneyInput(value.other ?? { amount: '0.00', currency: 'PKR' }, 'landedCosts.other')
      .amountMinorUnits,
  };
}

function parsePurchaseLine(raw, index) {
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

  const unitCost = parsePositiveMoneyInput(raw.unitCost, `lines[${index}].unitCost`);
  const batchNumber =
    raw.batchNumber === undefined || raw.batchNumber === null || raw.batchNumber === ''
      ? null
      : String(raw.batchNumber).trim();
  if (batchNumber !== null && batchNumber.length > 80) {
    throw validationFailed(`lines[${index}].batchNumber exceeds maximum length`, [
      { field: `lines[${index}].batchNumber`, message: 'must be at most 80 characters' },
    ]);
  }

  return {
    productId,
    packagingUnitId,
    enteredQuantityMinorUnits: enteredQuantityMinorUnits.toString(),
    unitCostMinorUnits: unitCost.amountMinorUnits,
    batchNumber,
    manufacturingDate: optionalDateOnly(raw.manufacturingDate, `lines[${index}].manufacturingDate`),
    expiryDate: optionalDateOnly(raw.expiryDate, `lines[${index}].expiryDate`),
  };
}

function parsePurchaseDraft(body, options = {}) {
  assertObjectBody(body);
  const partial = options.partial === true;

  const result = {};
  if (!partial || body.warehouseId !== undefined) {
    result.warehouseId = requireIdString(body.warehouseId, 'warehouseId');
  }
  if (!partial || body.supplierId !== undefined) {
    result.supplierId = requireIdString(body.supplierId, 'supplierId');
  }
  if (!partial || body.branchId !== undefined) {
    result.branchId = optionalIdString(body.branchId, 'branchId');
  }
  if (!partial || body.purchaseDate !== undefined) {
    result.purchaseDate = parseDateOnlyRequired(body.purchaseDate, 'purchaseDate');
  }
  if (!partial || body.supplierInvoiceReference !== undefined) {
    result.supplierInvoiceReference = optionalReference(body.supplierInvoiceReference);
    result.supplierInvoiceReferenceNormalized = normalizeSupplierReference(
      result.supplierInvoiceReference,
    );
  }
  if (!partial || body.notes !== undefined) {
    result.notes = optionalNotes(body.notes);
  }
  if (!partial || body.landedCosts !== undefined) {
    result.landedCosts = parseLandedCosts(body.landedCosts);
  }
  if (!partial || body.lines !== undefined) {
    if (!Array.isArray(body.lines) || body.lines.length === 0) {
      throw validationFailed('lines must be a non-empty array', [
        { field: 'lines', message: 'at least one purchase line is required' },
      ]);
    }
    result.lines = body.lines.map((line, index) => parsePurchaseLine(line, index));
  }
  if (partial) {
    result.expectedVersion = parseExpectedVersion(body);
  }
  return result;
}

function computeLineProductAmount(enteredQuantityMinorUnits, unitCostMinorUnits, conversionFactorSnapshot) {
  const enteredQty = BigInt(enteredQuantityMinorUnits);
  const unitCost = BigInt(unitCostMinorUnits);
  // unitCost is per entered packaging unit; line total = qty * unitCost (money minor * qty major scale)
  // enteredQuantityMinorUnits uses 4 decimal places; money uses 2.
  // line = round-half-up(enteredQty * unitCost / QUANTITY_MINOR_UNIT_FACTOR)
  return multiplyMoneyMinorUnits(unitCost, enteredQty, QUANTITY_MINOR_UNIT_FACTOR).toString();
}

function toMoneyDto(amountMinorUnits) {
  return {
    amount: formatMoneyMinorUnits(BigInt(String(amountMinorUnits ?? '0'))),
    currency: 'PKR',
  };
}

function toPurchaseDto(record) {
  const lines = (record.lines ?? []).map((line) => ({
    productId: String(line.productId),
    productNameSnapshot: String(line.productNameSnapshot),
    trackingModeSnapshot: String(line.trackingModeSnapshot),
    packagingUnitId: line.packagingUnitId ? String(line.packagingUnitId) : null,
    unitCodeSnapshot: String(line.unitCodeSnapshot),
    conversionFactorSnapshot: String(line.conversionFactorSnapshot),
    quantity: formatQuantityMinorUnits(BigInt(String(line.enteredQuantityMinorUnits))),
    quantityBase: formatQuantityMinorUnits(BigInt(String(line.quantityBaseMinorUnits))),
    unitCost: toMoneyDto(line.unitCostMinorUnits),
    lineProductAmount: toMoneyDto(line.lineProductAmountMinorUnits),
    batchNumber: line.batchNumber ?? null,
    manufacturingDate: line.manufacturingDate ?? null,
    expiryDate: line.expiryDate ?? null,
  }));

  const landed = record.landedCosts ?? {};
  return {
    id: String(record['_id']),
    organizationId: String(record['organizationId']),
    branchId: record['branchId'] ? String(record['branchId']) : null,
    warehouseId: String(record['warehouseId']),
    supplierId: String(record['supplierId']),
    supplierNameSnapshot: String(record['supplierNameSnapshot']),
    supplierInvoiceReference: String(record['supplierInvoiceReference'] ?? ''),
    purchaseDate: String(record['purchaseDate']),
    notes: String(record['notes'] ?? ''),
    status: String(record['status']),
    lines,
    landedCosts: {
      freight: toMoneyDto(landed.freightMinorUnits ?? '0'),
      loading: toMoneyDto(landed.loadingMinorUnits ?? '0'),
      transport: toMoneyDto(landed.transportMinorUnits ?? '0'),
      other: toMoneyDto(landed.otherMinorUnits ?? '0'),
    },
    version: Number(record['version']),
    createdBy: String(record['createdBy']),
    createdAt:
      record['createdAt'] instanceof Date
        ? record['createdAt'].toISOString()
        : record['createdAt']
          ? String(record['createdAt'])
          : null,
    updatedAt:
      record['updatedAt'] instanceof Date
        ? record['updatedAt'].toISOString()
        : record['updatedAt']
          ? String(record['updatedAt'])
          : null,
    postedAt: record['postedAt']
      ? record['postedAt'] instanceof Date
        ? record['postedAt'].toISOString()
        : String(record['postedAt'])
      : null,
  };
}

module.exports = {
  parsePurchaseDraft,
  parseExpectedVersion,
  computeLineProductAmount,
  toPurchaseDto,
  normalizeSupplierReference,
};
