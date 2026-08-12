/**
 * Pure general customer payment allocation (BR-PAYMENT-004).
 *
 * unpaidSales items must provide:
 * - id
 * - outstandingMinorUnits (positive bigint or decimal string)
 * - dueDate (YYYY-MM-DD | null)
 * - invoiceDate (YYYY-MM-DD)
 * - sequence (number | string comparable)
 *
 * Does not invent sales; callers supply fixture or posted unpaid rows.
 */

function toBigInt(value) {
  return BigInt(String(value ?? '0'));
}

function compareUnpaidSales(left, right) {
  const leftDue = left.dueDate ?? left.invoiceDate ?? '';
  const rightDue = right.dueDate ?? right.invoiceDate ?? '';
  if (leftDue !== rightDue) {
    return leftDue < rightDue ? -1 : 1;
  }

  const leftInvoiceDate = left.invoiceDate ?? '';
  const rightInvoiceDate = right.invoiceDate ?? '';
  if (leftInvoiceDate !== rightInvoiceDate) {
    return leftInvoiceDate < rightInvoiceDate ? -1 : 1;
  }

  const leftSequence = String(left.sequence ?? left.id ?? '');
  const rightSequence = String(right.sequence ?? right.id ?? '');
  if (leftSequence === rightSequence) {
    return 0;
  }
  return leftSequence < rightSequence ? -1 : 1;
}

function allocateGeneralCustomerPayment(unpaidSales, paymentAmountMinorUnits) {
  let remaining = toBigInt(paymentAmountMinorUnits);
  if (remaining < 0n) {
    throw new Error('Payment amount cannot be negative');
  }

  const ordered = [...(unpaidSales ?? [])]
    .filter((item) => toBigInt(item.outstandingMinorUnits) > 0n)
    .sort(compareUnpaidSales);

  const allocations = [];
  for (const sale of ordered) {
    if (remaining === 0n) {
      break;
    }
    const outstanding = toBigInt(sale.outstandingMinorUnits);
    const allocated = outstanding < remaining ? outstanding : remaining;
    if (allocated <= 0n) {
      continue;
    }
    allocations.push({
      saleId: String(sale.id),
      allocatedAmountMinorUnits: allocated.toString(),
    });
    remaining -= allocated;
  }

  return {
    allocations,
    advanceAmountMinorUnits: remaining.toString(),
  };
}

module.exports = {
  allocateGeneralCustomerPayment,
  compareUnpaidSales,
};
