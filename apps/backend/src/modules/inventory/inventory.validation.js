const { validationFailed } = require('../../platform/errors/app-error');
const {
  parseMoneyMinorUnits,
  formatMoneyMinorUnits,
  parseQuantityMinorUnits,
  formatQuantityMinorUnits,
  parseDateOnly,
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
    throw validationFailed(`${field} must be YYYY-MM-DD`, [
      { field, message: 'expected YYYY-MM-DD' },
    ]);
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

function parseOpeningStock(body) {
  assertObjectBody(body);
  const warehouseId = requireIdString(body.warehouseId, 'warehouseId');
  const productId = requireIdString(body.productId, 'productId');

  if (typeof body.quantity !== 'string') {
    throw validationFailed('quantity must be a decimal string', [
      { field: 'quantity', message: 'quantity must be a decimal string' },
    ]);
  }
  let enteredQuantityMinorUnits;
  try {
    enteredQuantityMinorUnits = parseQuantityMinorUnits(body.quantity);
  } catch (error) {
    throw validationFailed(error.message || 'quantity is invalid', [
      { field: 'quantity', message: error.message || 'quantity is invalid' },
    ]);
  }
  if (enteredQuantityMinorUnits <= 0n) {
    throw validationFailed('quantity must be greater than zero', [
      { field: 'quantity', message: 'quantity must be greater than zero' },
    ]);
  }

  const packagingUnitId =
    body.packagingUnitId === undefined || body.packagingUnitId === null || body.packagingUnitId === ''
      ? null
      : requireIdString(body.packagingUnitId, 'packagingUnitId');

  const batchNumber =
    body.batchNumber === undefined || body.batchNumber === null
      ? null
      : typeof body.batchNumber === 'string'
        ? body.batchNumber.trim()
        : null;
  if (body.batchNumber !== undefined && body.batchNumber !== null && typeof body.batchNumber !== 'string') {
    throw validationFailed('batchNumber must be a string', [
      { field: 'batchNumber', message: 'batchNumber must be a string' },
    ]);
  }
  if (batchNumber === '') {
    throw validationFailed('batchNumber cannot be empty', [
      { field: 'batchNumber', message: 'batchNumber cannot be empty' },
    ]);
  }

  const manufacturingDate = optionalDateOnly(body.manufacturingDate, 'manufacturingDate');
  const expiryDate = optionalDateOnly(body.expiryDate, 'expiryDate');
  const inventoryValue = parseNonNegativeMoneyInput(body.inventoryValue, 'inventoryValue');

  return {
    warehouseId,
    productId,
    enteredQuantityMinorUnits: enteredQuantityMinorUnits.toString(),
    packagingUnitId,
    batchNumber,
    manufacturingDate,
    expiryDate,
    inventoryValueMinorUnits: inventoryValue.amountMinorUnits,
    currency: inventoryValue.currency,
  };
}

function moneyDto(minorUnits) {
  return {
    amount: formatMoneyMinorUnits(BigInt(String(minorUnits ?? '0'))),
    currency: 'PKR',
  };
}

function quantityDto(minorUnits) {
  return formatQuantityMinorUnits(BigInt(String(minorUnits ?? '0')));
}

function toBatchDto(record) {
  return {
    id: String(record['_id']),
    organizationId: String(record['organizationId']),
    productId: String(record['productId']),
    batchNumber: String(record['batchNumber']),
    manufacturingDate: record['manufacturingDate'] ?? null,
    expiryDate: record['expiryDate'] ?? null,
    firstReceivedAt:
      record['firstReceivedAt'] instanceof Date
        ? record['firstReceivedAt'].toISOString()
        : String(record['firstReceivedAt']),
  };
}

function toMovementDto(record) {
  return {
    id: String(record['_id']),
    organizationId: String(record['organizationId']),
    warehouseId: String(record['warehouseId']),
    productId: String(record['productId']),
    batchId: record['batchId'] ? String(record['batchId']) : null,
    direction: String(record['direction']),
    quantityBase: quantityDto(record['quantityBaseMinorUnits']),
    enteredQuantity: quantityDto(record['enteredQuantityMinorUnits']),
    unitCode: String(record['unitCode']),
    conversionFactorSnapshot: String(record['conversionFactorSnapshot']),
    packagingUnitId: record['packagingUnitId'] ? String(record['packagingUnitId']) : null,
    inventoryValue:
      record['inventoryValueMinorUnits'] === null || record['inventoryValueMinorUnits'] === undefined
        ? null
        : moneyDto(record['inventoryValueMinorUnits']),
    unitCost:
      record['unitCostMinorUnits'] === null || record['unitCostMinorUnits'] === undefined
        ? null
        : moneyDto(record['unitCostMinorUnits']),
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

function toBalanceDto(record, valuation) {
  const dto = {
    id: String(record['_id']),
    organizationId: String(record['organizationId']),
    warehouseId: String(record['warehouseId']),
    productId: String(record['productId']),
    batchId: record['batchId'] ? String(record['batchId']) : null,
    quantityBase: quantityDto(record['quantityBaseMinorUnits']),
    version: Number(record['version'] ?? 1),
  };
  if (valuation !== undefined) {
    dto.valuation = valuation;
  }
  return dto;
}

function toCostStateDto(record) {
  const qty = BigInt(String(record['quantityBaseMinorUnits'] ?? '0'));
  return {
    organizationId: String(record['organizationId']),
    warehouseId: String(record['warehouseId']),
    productId: String(record['productId']),
    quantityBase: quantityDto(record['quantityBaseMinorUnits']),
    inventoryValue: moneyDto(record['inventoryValueMinorUnits']),
    weightedAverageCost: moneyDto(record['weightedAverageCostMinorUnits']),
    lastWeightedAverageCost: moneyDto(record['lastWeightedAverageCostMinorUnits']),
    currentInventoryValue: qty === 0n ? moneyDto(0) : moneyDto(record['inventoryValueMinorUnits']),
    version: Number(record['version'] ?? 1),
  };
}

function toOpeningStockResultDto({ movement, batch, balance, costState }) {
  return {
    movement: toMovementDto(movement),
    batch: batch ? toBatchDto(batch) : null,
    balance: toBalanceDto(balance),
    costState: toCostStateDto(costState),
  };
}

module.exports = {
  parseOpeningStock,
  toBatchDto,
  toMovementDto,
  toBalanceDto,
  toCostStateDto,
  toOpeningStockResultDto,
};
