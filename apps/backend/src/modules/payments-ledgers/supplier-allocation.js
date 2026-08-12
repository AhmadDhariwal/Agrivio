/**
 * Pure general supplier payment allocation (BR-PAYMENT-008).
 *
 * unpaidPurchases items must provide:
 * - id
 * - outstandingMinorUnits (positive bigint or decimal string)
 * - dueDate (YYYY-MM-DD | null)
 * - purchaseDate (YYYY-MM-DD)
 * - sequence (number | string comparable)
 *
 * Does not invent purchases; callers supply fixture or posted unpaid rows.
 */

function toBigInt(value) {
  return BigInt(String(value ?? '0'));
}

function compareUnpaidPurchases(left, right) {
  const leftDue = left.dueDate ?? left.purchaseDate ?? '';
  const rightDue = right.dueDate ?? right.purchaseDate ?? '';
  if (leftDue !== rightDue) {
    return leftDue < rightDue ? -1 : 1;
  }

  const leftPurchaseDate = left.purchaseDate ?? '';
  const rightPurchaseDate = right.purchaseDate ?? '';
  if (leftPurchaseDate !== rightPurchaseDate) {
    return leftPurchaseDate < rightPurchaseDate ? -1 : 1;
  }

  const leftSequence = String(left.sequence ?? left.id ?? '');
  const rightSequence = String(right.sequence ?? right.id ?? '');
  if (leftSequence === rightSequence) {
    return 0;
  }
  return leftSequence < rightSequence ? -1 : 1;
}

/**
 * @param {Array<object>} unpaidPurchases
 * @param {bigint|string|number} paymentAmountMinorUnits
 * @returns {{ allocations: Array<{ purchaseId: string, allocatedAmountMinorUnits: string }>, advanceAmountMinorUnits: string }}
 */
function allocateGeneralSupplierPayment(unpaidPurchases, paymentAmountMinorUnits) {
  let remaining = toBigInt(paymentAmountMinorUnits);
  if (remaining < 0n) {
    throw new Error('Payment amount cannot be negative');
  }

  const ordered = [...(unpaidPurchases ?? [])]
    .filter((item) => toBigInt(item.outstandingMinorUnits) > 0n)
    .sort(compareUnpaidPurchases);

  const allocations = [];
  for (const purchase of ordered) {
    if (remaining === 0n) {
      break;
    }
    const outstanding = toBigInt(purchase.outstandingMinorUnits);
    const allocated = outstanding < remaining ? outstanding : remaining;
    if (allocated <= 0n) {
      continue;
    }
    allocations.push({
      purchaseId: String(purchase.id),
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
  allocateGeneralSupplierPayment,
  compareUnpaidPurchases,
};
