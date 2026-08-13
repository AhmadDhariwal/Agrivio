const { validationFailed } = require('../../platform/errors/app-error');
const {
  formatMoneyMinorUnits,
  formatQuantityMinorUnits,
  parseMoneyMinorUnits,
} = require('../../platform/primitives/money-and-time');

const STOCK_CONDITIONS = ['sellable', 'unsellable'];
const UNSELLABLE_REASONS = ['expired', 'damaged', 'opened', 'contaminated', 'other'];
const SUPPORTED_REFUND_ACCOUNT_TYPES = ['cash', 'bank', 'jazzcash', 'easypaisa'];

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

function optionalText(value, field, maxLength = 200) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw validationFailed(`${field} must be a string`, [
      { field, message: `${field} must be a string` },
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

function parseStockCondition(raw, field) {
  if (raw === undefined || raw === null || raw === '') {
    return null;
  }
  if (!STOCK_CONDITIONS.includes(raw)) {
    throw validationFailed(`${field} must be sellable or unsellable`, [
      { field, message: 'stockCondition must be sellable or unsellable' },
    ]);
  }
  return raw;
}

function parseUnsellableReason(raw, field) {
  if (raw === undefined || raw === null || raw === '') {
    return null;
  }
  if (!UNSELLABLE_REASONS.includes(raw)) {
    throw validationFailed(
      `${field} must be expired, damaged, opened, contaminated, or other`,
      [{ field, message: 'invalid unsellableReason' }],
    );
  }
  return raw;
}

function parseOptionalMoney(value, field) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw validationFailed(`${field} must be a money object`, [
      { field, message: `${field} must be { amount, currency }` },
    ]);
  }
  if (typeof value.amount !== 'string' || value.amount.trim() === '') {
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
  try {
    const minor = parseMoneyMinorUnits(value.amount);
    if (minor < 0n) {
      throw validationFailed(`${field}.amount cannot be negative`, [
        { field: `${field}.amount`, message: 'amount cannot be negative' },
      ]);
    }
    return minor.toString();
  } catch (error) {
    if (error && error.code) {
      throw error;
    }
    throw validationFailed(`${field}.amount is invalid`, [
      { field: `${field}.amount`, message: 'amount must have up to two decimal places' },
    ]);
  }
}

function parseLinkedReturnLine(raw, index) {
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
    batchId: optionalIdString(raw.batchId, `lines[${index}].batchId`),
    stockCondition: parseStockCondition(raw.stockCondition, `lines[${index}].stockCondition`),
    unsellableReason: parseUnsellableReason(
      raw.unsellableReason,
      `lines[${index}].unsellableReason`,
    ),
  };
}

function parseReturnLine(raw, index) {
  const parsed = parseLinkedReturnLine(raw, index);
  return {
    originalLineIndex: parsed.originalLineIndex,
    quantity: parsed.quantity,
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

function parseSalesReturnDraft(body) {
  assertObjectBody(body);
  const saleId = requireIdString(body.saleId, 'saleId');
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    throw validationFailed('lines must be a non-empty array', [
      { field: 'lines', message: 'at least one return line is required' },
    ]);
  }
  return {
    saleId,
    lines: body.lines.map((line, index) => parseLinkedReturnLine(line, index)),
  };
}

function parseWithoutInvoiceLine(raw, index) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw validationFailed(`lines[${index}] must be an object`, [
      { field: `lines[${index}]`, message: 'line must be an object' },
    ]);
  }
  const productId = requireIdString(raw.productId, `lines[${index}].productId`);
  if (typeof raw.quantity !== 'string' || raw.quantity.trim() === '') {
    throw validationFailed(`lines[${index}].quantity must be a decimal string`, [
      { field: `lines[${index}].quantity`, message: 'quantity must be a decimal string' },
    ]);
  }
  return {
    productId,
    quantity: raw.quantity.trim(),
    packagingUnitId: optionalIdString(raw.packagingUnitId, `lines[${index}].packagingUnitId`),
    batchId: optionalIdString(raw.batchId, `lines[${index}].batchId`),
    stockCondition: parseStockCondition(raw.stockCondition, `lines[${index}].stockCondition`),
    unsellableReason: parseUnsellableReason(
      raw.unsellableReason,
      `lines[${index}].unsellableReason`,
    ),
    documentedUnitCostMinorUnits: parseOptionalMoney(
      raw.documentedUnitCost,
      `lines[${index}].documentedUnitCost`,
    ),
  };
}

function parseWithoutInvoiceDraft(body) {
  assertObjectBody(body);
  const warehouseId = requireIdString(body.warehouseId, 'warehouseId');
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    throw validationFailed('lines must be a non-empty array', [
      { field: 'lines', message: 'at least one return line is required' },
    ]);
  }

  const customerId = optionalIdString(body.customerId, 'customerId');
  const customerIdentifyingName = optionalText(body.customerIdentifyingName, 'customerIdentifyingName', 200);
  const customerIdentifyingPhone = optionalText(
    body.customerIdentifyingPhone,
    'customerIdentifyingPhone',
    40,
  );
  if (!customerId && !customerIdentifyingName && !customerIdentifyingPhone) {
    throw validationFailed(
      'customerId or customer identifying name/phone is required for a return without invoice',
      [
        {
          field: 'customerId',
          message: 'customer lookup or identifying information is required',
        },
      ],
    );
  }

  return {
    warehouseId,
    customerId,
    customerIdentifyingName,
    customerIdentifyingPhone,
    lines: body.lines.map((line, index) => parseWithoutInvoiceLine(line, index)),
  };
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

  const lineOverrides = [];
  if (body.lines !== undefined) {
    if (!Array.isArray(body.lines)) {
      throw validationFailed('lines must be an array', [
        { field: 'lines', message: 'lines must be an array' },
      ]);
    }
    for (let index = 0; index < body.lines.length; index += 1) {
      const raw = body.lines[index];
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        throw validationFailed(`lines[${index}] must be an object`, [
          { field: `lines[${index}]`, message: 'line must be an object' },
        ]);
      }
      lineOverrides.push({
        originalLineIndex:
          typeof raw.originalLineIndex === 'number' ? raw.originalLineIndex : index,
        stockCondition: parseStockCondition(raw.stockCondition, `lines[${index}].stockCondition`),
        unsellableReason: parseUnsellableReason(
          raw.unsellableReason,
          `lines[${index}].unsellableReason`,
        ),
        documentedUnitCostMinorUnits: parseOptionalMoney(
          raw.documentedUnitCost,
          `lines[${index}].documentedUnitCost`,
        ),
      });
    }
  }

  return {
    expectedVersion,
    reason,
    resolution,
    refundAccountId,
    approvedReturnValueMinorUnits: parseOptionalMoney(body.approvedReturnValue, 'approvedReturnValue'),
    lineOverrides,
  };
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
    originalLineIndex:
      line.originalLineIndex === null || line.originalLineIndex === undefined
        ? null
        : Number(line.originalLineIndex),
    stockCondition: line.stockCondition ?? null,
    unsellableReason: line.unsellableReason ?? null,
    returnInventoryValue:
      line.returnInventoryValueMinorUnits === null ||
      line.returnInventoryValueMinorUnits === undefined
        ? null
        : toMoneyDto(line.returnInventoryValueMinorUnits),
    receiptUnitCost:
      line.receiptUnitCostMinorUnits === null || line.receiptUnitCostMinorUnits === undefined
        ? null
        : toMoneyDto(line.receiptUnitCostMinorUnits),
    returnRevenue:
      line.returnRevenueMinorUnits === null || line.returnRevenueMinorUnits === undefined
        ? null
        : toMoneyDto(line.returnRevenueMinorUnits),
  }));

  const approval = record['withoutInvoiceApproval'];

  return {
    id: String(record['_id']),
    organizationId: String(record['organizationId']),
    returnType: String(record['returnType']),
    purchaseId: record['purchaseId'] ? String(record['purchaseId']) : null,
    saleId: record['saleId'] ? String(record['saleId']) : null,
    supplierId: record['supplierId'] ? String(record['supplierId']) : null,
    customerId: record['customerId'] ? String(record['customerId']) : null,
    customerIdentifyingName: record['customerIdentifyingName'] ?? null,
    customerIdentifyingPhone: record['customerIdentifyingPhone'] ?? null,
    warehouseId: String(record['warehouseId']),
    reason: String(record['reason'] ?? ''),
    resolution: String(record['resolution']),
    refundAccountId: record['refundAccountId'] ? String(record['refundAccountId']) : null,
    approvedReturnValue:
      record['approvedReturnValueMinorUnits'] === null ||
      record['approvedReturnValueMinorUnits'] === undefined
        ? null
        : toMoneyDto(record['approvedReturnValueMinorUnits']),
    withoutInvoiceApproval: approval
      ? {
          approvedBy: String(approval.approvedBy),
          approvedAt:
            approval.approvedAt instanceof Date
              ? approval.approvedAt.toISOString()
              : String(approval.approvedAt),
          reason: String(approval.reason),
        }
      : null,
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
  parseSalesReturnDraft,
  parseWithoutInvoiceDraft,
  parseReturnPost,
  parseExpectedVersion,
  toReturnDto,
  STOCK_CONDITIONS,
  UNSELLABLE_REASONS,
  SUPPORTED_REFUND_ACCOUNT_TYPES,
};
