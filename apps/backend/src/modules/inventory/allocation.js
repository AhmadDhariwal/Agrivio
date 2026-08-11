/**
 * FEFO/FIFO batch allocation (BR-BATCH-009..011). Pure logic — no stock mutation.
 */

function compareDateOnly(left, right) {
  return String(left).localeCompare(String(right));
}

function firstReceivedMillis(value) {
  if (value instanceof Date) {
    return value.getTime();
  }
  return new Date(value).getTime();
}

function compareFirstReceived(left, right) {
  const leftTime = firstReceivedMillis(left.firstReceivedAt);
  const rightTime = firstReceivedMillis(right.firstReceivedAt);
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  const leftBatch = left.batchId === null || left.batchId === undefined ? '' : String(left.batchId);
  const rightBatch =
    right.batchId === null || right.batchId === undefined ? '' : String(right.batchId);
  return leftBatch.localeCompare(rightBatch);
}

function sortFefoCandidates(candidates) {
  return [...candidates].sort((left, right) => {
    const expiryCompare = compareDateOnly(left.expiryDate, right.expiryDate);
    if (expiryCompare !== 0) {
      return expiryCompare;
    }
    return compareFirstReceived(left, right);
  });
}

function sortFifoCandidates(candidates) {
  return [...candidates].sort(compareFirstReceived);
}

function isExpiredOnBusinessDate(expiryDate, businessDate) {
  if (expiryDate === null || expiryDate === undefined || expiryDate === '') {
    return false;
  }
  return compareDateOnly(expiryDate, businessDate) < 0;
}

function filterEligibleCandidates(candidates, excludeExpired, businessDate) {
  return candidates.filter((candidate) => {
    const quantity = BigInt(String(candidate.quantityBaseMinorUnits ?? '0'));
    if (quantity <= 0n) {
      return false;
    }
    if (excludeExpired && isExpiredOnBusinessDate(candidate.expiryDate, businessDate)) {
      return false;
    }
    return true;
  });
}

/**
 * @param {object} input
 * @param {'none'|'batch'|'batch_expiry'} input.trackingMode
 * @param {bigint} input.requestedQuantityMinorUnits
 * @param {readonly object[]} input.candidates batch balance rows with quantity + ordering facts
 * @param {boolean} input.excludeExpired
 * @param {string} input.businessDate YYYY-MM-DD
 */
function allocateStock(input) {
  const requested = input.requestedQuantityMinorUnits;
  if (requested <= 0n) {
    throw new Error('Allocation quantity must be positive');
  }

  const eligible = filterEligibleCandidates(
    input.candidates,
    input.excludeExpired,
    input.businessDate,
  );

  const sorted =
    input.trackingMode === 'batch_expiry'
      ? sortFefoCandidates(eligible)
      : sortFifoCandidates(eligible);

  let remaining = requested;
  const allocations = [];

  for (const candidate of sorted) {
    if (remaining <= 0n) {
      break;
    }
    const available = BigInt(String(candidate.quantityBaseMinorUnits));
    if (available <= 0n) {
      continue;
    }
    const allocated = available >= remaining ? remaining : available;
    allocations.push({
      batchId: candidate.batchId ?? null,
      batchNumber: candidate.batchNumber ?? null,
      expiryDate: candidate.expiryDate ?? null,
      quantityBaseMinorUnits: allocated.toString(),
      firstReceivedAt: candidate.firstReceivedAt,
    });
    remaining -= allocated;
  }

  if (remaining > 0n) {
    return { ok: false, code: 'INSUFFICIENT_STOCK', allocations: [] };
  }

  const allocatedTotal = allocations.reduce(
    (sum, row) => sum + BigInt(row.quantityBaseMinorUnits),
    0n,
  );
  if (allocatedTotal !== requested) {
    throw new Error('Allocation total must reconcile exactly with requested quantity');
  }

  return { ok: true, allocations };
}

module.exports = {
  allocateStock,
  sortFefoCandidates,
  sortFifoCandidates,
  isExpiredOnBusinessDate,
};
