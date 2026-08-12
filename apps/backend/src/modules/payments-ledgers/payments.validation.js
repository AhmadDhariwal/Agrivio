const { validationFailed } = require('../../platform/errors/app-error');
const {
  parseMoneyMinorUnits,
  formatMoneyMinorUnits,
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

function optionalNotes(value) {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value !== 'string') {
    throw validationFailed('notes must be a string', [{ field: 'notes', message: 'notes must be a string' }]);
  }
  const trimmed = value.trim();
  if (trimmed.length > 500) {
    throw validationFailed('notes exceeds maximum length', [
      { field: 'notes', message: 'notes must be at most 500 characters' },
    ]);
  }
  return trimmed;
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

function parseSupplierPayment(body) {
  assertObjectBody(body);
  const supplierId = requireIdString(body.supplierId, 'supplierId');
  const accountId = requireIdString(body.accountId, 'accountId');
  const money = parsePositiveMoneyInput(body.amount, 'amount');

  if (typeof body.paymentDate !== 'string') {
    throw validationFailed('paymentDate is required', [
      { field: 'paymentDate', message: 'paymentDate must be YYYY-MM-DD' },
    ]);
  }
  let paymentDate;
  try {
    paymentDate = parseDateOnly(body.paymentDate);
  } catch {
    throw validationFailed('paymentDate must be YYYY-MM-DD', [
      { field: 'paymentDate', message: 'expected YYYY-MM-DD' },
    ]);
  }

  const allocationMode = body.allocationMode;
  if (allocationMode !== 'general' && allocationMode !== 'invoice_specific') {
    throw validationFailed('allocationMode is invalid', [
      {
        field: 'allocationMode',
        message: 'allocationMode must be general or invoice_specific',
      },
    ]);
  }

  let invoiceAllocations = [];
  if (allocationMode === 'invoice_specific') {
    if (!Array.isArray(body.allocations) || body.allocations.length === 0) {
      throw validationFailed('allocations are required for invoice-specific payments', [
        { field: 'allocations', message: 'allocations must be a non-empty array' },
      ]);
    }
    invoiceAllocations = body.allocations.map((item, index) => {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        throw validationFailed(`allocations[${index}] must be an object`, [
          { field: `allocations[${index}]`, message: 'allocation must be an object' },
        ]);
      }
      const purchaseId = requireIdString(item.purchaseId, `allocations[${index}].purchaseId`);
      const allocated = parsePositiveMoneyInput(item.amount, `allocations[${index}].amount`);
      return {
        purchaseId,
        allocatedAmountMinorUnits: allocated.amountMinorUnits,
      };
    });
  }

  return {
    supplierId,
    accountId,
    amountMinorUnits: money.amountMinorUnits,
    currency: money.currency,
    paymentDate,
    allocationMode,
    invoiceAllocations,
    notes: optionalNotes(body.notes),
  };
}

function toMoneyDto(amountMinorUnits) {
  return {
    amount: formatMoneyMinorUnits(BigInt(String(amountMinorUnits ?? '0'))),
    currency: 'PKR',
  };
}

function toPaymentDto(record, allocations = []) {
  return {
    id: String(record['_id']),
    organizationId: String(record['organizationId']),
    partyType: String(record['partyType']),
    supplierId: record['supplierId'] ? String(record['supplierId']) : null,
    customerId: record['customerId'] ? String(record['customerId']) : null,
    accountId: String(record['accountId']),
    allocationMode: String(record['allocationMode']),
    amount: toMoneyDto(record['amountMinorUnits']),
    paymentDate: String(record['paymentDate']),
    notes: String(record['notes'] ?? ''),
    status: String(record['status']),
    postedAt:
      record['postedAt'] instanceof Date
        ? record['postedAt'].toISOString()
        : String(record['postedAt']),
    postedBy: String(record['postedBy']),
    allocations: allocations.map((item) => ({
      id: String(item['_id']),
      targetType: String(item['targetType']),
      targetId: String(item['targetId']),
      allocatedAmount: toMoneyDto(item['allocatedAmountMinorUnits']),
      status: String(item['status']),
    })),
  };
}

function parseCustomerPayment(body) {
  assertObjectBody(body);
  const customerId = requireIdString(body.customerId, 'customerId');
  const accountId = requireIdString(body.accountId, 'accountId');
  const money = parsePositiveMoneyInput(body.amount, 'amount');

  if (typeof body.paymentDate !== 'string') {
    throw validationFailed('paymentDate is required', [
      { field: 'paymentDate', message: 'paymentDate must be YYYY-MM-DD' },
    ]);
  }
  let paymentDate;
  try {
    paymentDate = parseDateOnly(body.paymentDate);
  } catch {
    throw validationFailed('paymentDate must be YYYY-MM-DD', [
      { field: 'paymentDate', message: 'expected YYYY-MM-DD' },
    ]);
  }

  const allocationMode = body.allocationMode;
  if (allocationMode !== 'general' && allocationMode !== 'invoice_specific') {
    throw validationFailed('allocationMode is invalid', [
      {
        field: 'allocationMode',
        message: 'allocationMode must be general or invoice_specific',
      },
    ]);
  }

  let invoiceAllocations = [];
  if (allocationMode === 'invoice_specific') {
    if (!Array.isArray(body.allocations) || body.allocations.length === 0) {
      throw validationFailed('allocations are required for invoice-specific payments', [
        { field: 'allocations', message: 'allocations must be a non-empty array' },
      ]);
    }
    invoiceAllocations = body.allocations.map((item, index) => {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        throw validationFailed(`allocations[${index}] must be an object`, [
          { field: `allocations[${index}]`, message: 'allocation must be an object' },
        ]);
      }
      const saleId = requireIdString(item.saleId, `allocations[${index}].saleId`);
      const allocated = parsePositiveMoneyInput(item.amount, `allocations[${index}].amount`);
      return {
        saleId,
        allocatedAmountMinorUnits: allocated.amountMinorUnits,
      };
    });
  }

  return {
    customerId,
    accountId,
    amountMinorUnits: money.amountMinorUnits,
    currency: money.currency,
    paymentDate,
    allocationMode,
    invoiceAllocations,
    notes: optionalNotes(body.notes),
  };
}

module.exports = {
  parseSupplierPayment,
  parseCustomerPayment,
  toPaymentDto,
  toMoneyDto,
};
