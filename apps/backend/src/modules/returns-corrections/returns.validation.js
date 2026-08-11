const { validationFailed } = require('../../platform/errors/app-error');
const {
  formatMoneyMinorUnits,
  formatQuantityMinorUnits,
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
    throw validationFailed(`${field} must be a string`, [
      { field, message: `${field} must be a string` },
    ]);
  }
  return value.trim();
}

function parseExpectedVersion(body) {
  const expectedVersion = body?.expectedVersion;
  if (
    typeof expectedVersion !== 'number' ||
    !Number.isInteger(expectedVersion) ||
    expectedVersion < 1
  ) {
    throw validationFailed('expectedVersion must be a positive integer', [
      { field: 'expectedVersion', message: 'expectedVersion must be a positive integer' },
    ]);
  }
  return expectedVersion;
}

function parseRequiredText(value, field, maxLength = 1000) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw validationFailed(`${field} is required`, [
      { field, message: `${field} is required` },
    ]);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw validationFailed(`${field} exceeds maximum length`, [
      { field, message: `${field} must be at most ${maxLength} characters` },
    ]);
  }
  return trimmed;
}

function parseReturnLine(raw, index) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw validationFailed(`lines[${index}] must be an object`, [
      { field: `lines[${index}]`, message: 'line must be an object' },
    ]);
  }

  const originalLineIndex = raw.originalLineIndex;
  if (
    typeof originalLineIndex !== 'number' ||
    !Number.isInteger(originalLineIndex) ||
    originalLineIndex < 0
  ) {
    throw validationFailed(`lines[${index}].originalLineIndex must be a non-negative integer`, [
      {
        field: `lines[${index}].originalLineIndex`,
        message: 'originalLineIndex must be a non-negative integer',
      },
    ]);
  }

  if (typeof raw.quantity !== 'string' || raw.quantity.trim() === '') {
    throw validationFailed(`lines[${index}].quantity must be a decimal string`, [
      { field: `lines[${index}].quantity`, message: 'quantity must be a decimal string' },
    ]);
  }

  return {
    originalLineIndex,
    quantity: raw.quantity.trim(),
  };
}

function parsePurchaseReturnDraft(body) {
  assertObjectBody(body);
  const purchaseId = requireIdString(body.purchaseId, 'purchaseId');

  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    throw validationFailed('lines must be a non-empty array', [
      { field: 'lines', message: 'at least one return line is required' },
    ]);
  }
  const lines = body.lines.map((line, index) => parseReturnLine(line, index));

  return { purchaseId, lines };
}

function parseReturnPost(body) {
  assertObjectBody(body);
  const expectedVersion = parseExpectedVersion(body);
  const reason = parseRequiredText(body.reason, 'reason', 1000);

  const resolution = body.resolution === undefined ? 'ledger_adjustment' : body.resolution;
  if (resolution !== 'ledger_adjustment' && resolution !== 'account_refund') {
    throw validationFailed('resolution must be ledger_adjustment or account_refund', [
      {
        field: 'resolution',
        message: 'resolution must be ledger_adjustment or account_refund',
      },
    ]);
  }

  let refundAccountId = null;
  if (resolution === 'account_refund') {
    refundAccountId = requireIdString(body.refundAccountId, 'refundAccountId');
  } else if (body.refundAccountId !== undefined) {
    refundAccountId = optionalIdString(body.refundAccountId, 'refundAccountId');
  }

  return { expectedVersion, reason, resolution, refundAccountId };
}

function toMoneyDto(amountMinorUnits) {
  return {
    amount: formatMoneyMinorUnits(BigInt(String(amountMinorUnits ?? '0'))),
    currency: 'PKR',
  };
}

function toReturnDto(record) {
  const lines = (record.lines ?? []).map((line) => ({
    productId: String(line.productId),
    productNameSnapshot: String(line.productNameSnapshot),
    packagingUnitId: line.packagingUnitId ? String(line.packagingUnitId) : null,
    unitCodeSnapshot: String(line.unitCodeSnapshot),
    conversionFactorSnapshot: String(line.conversionFactorSnapshot),
    quantity: formatQuantityMinorUnits(BigInt(String(line.enteredQuantityMinorUnits))),
    quantityBase: formatQuantityMinorUnits(BigInt(String(line.quantityBaseMinorUnits))),
    batchId: line.batchId ? String(line.batchId) : null,
    batchNumber: line.batchNumber ?? null,
    manufacturingDate: line.manufacturingDate ?? null,
    expiryDate: line.expiryDate ?? null,
    originalLineIndex: Number(line.originalLineIndex),
    returnInventoryValue:
      line.returnInventoryValueMinorUnits === null ||
      line.returnInventoryValueMinorUnits === undefined
        ? null
        : toMoneyDto(line.returnInventoryValueMinorUnits),
    receiptUnitCost:
      line.receiptUnitCostMinorUnits === null || line.receiptUnitCostMinorUnits === undefined
        ? null
        : toMoneyDto(line.receiptUnitCostMinorUnits),
  }));

  return {
    id: String(record['_id']),
    organizationId: String(record['organizationId']),
    returnType: String(record['returnType']),
    purchaseId: record['purchaseId'] ? String(record['purchaseId']) : null,
    supplierId: String(record['supplierId']),
    warehouseId: String(record['warehouseId']),
    reason: String(record['reason'] ?? ''),
    resolution: String(record['resolution']),
    refundAccountId: record['refundAccountId'] ? String(record['refundAccountId']) : null,
    status: String(record['status']),
    lines,
    returnTotal:
      record['returnTotalMinorUnits'] === null || record['returnTotalMinorUnits'] === undefined
        ? null
        : toMoneyDto(record['returnTotalMinorUnits']),
    currency: String(record['currency'] ?? 'PKR'),
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
    postedBy: record['postedBy'] ? String(record['postedBy']) : null,
  };
}

module.exports = {
  parsePurchaseReturnDraft,
  parseReturnPost,
  parseExpectedVersion,
  toReturnDto,
};
