/**
 * Pure supplier ledger reconciliation over authoritative signed effects.
 * Does not mutate data and does not invent a mutable supplier.balance.
 */

function toBigInt(value) {
  return BigInt(String(value ?? '0'));
}

function sumByEffectKind(effects, effectKind) {
  let total = 0n;
  for (const effect of effects) {
    if (String(effect.status ?? 'posted') !== 'posted') {
      continue;
    }
    if (String(effect.effectKind) !== effectKind) {
      continue;
    }
    total += toBigInt(effect.signedAmountMinorUnits ?? effect.signedAmount?.amountMinorUnits ?? '0');
  }
  return total;
}

function sumAllocations(allocations) {
  let total = 0n;
  for (const item of allocations ?? []) {
    if (String(item.status ?? 'posted') !== 'posted') {
      continue;
    }
    if (String(item.targetType) !== 'purchase') {
      continue;
    }
    total += toBigInt(item.allocatedAmountMinorUnits);
  }
  return total;
}

function sumAccountMovements(movements) {
  let total = 0n;
  for (const item of movements ?? []) {
    if (String(item.status ?? 'posted') !== 'posted') {
      continue;
    }
    total += toBigInt(item.signedAmountMinorUnits);
  }
  return total;
}

/**
 * Reconcile supplier financial position components.
 * expectedPayableMinorUnits / expectedAdvanceMinorUnits are optional fixtures for tests.
 */
function reconcileSupplierLedgerState(input) {
  const findings = [];
  const effects = input.effects ?? [];
  const allocations = input.allocations ?? [];
  const accountMovements = input.accountMovements ?? [];

  const payableSum = sumByEffectKind(effects, 'payable');
  const advanceSum = sumByEffectKind(effects, 'supplier_advance');
  const allocationSum = sumAllocations(allocations);
  const accountMovementSum = sumAccountMovements(accountMovements);

  if (
    input.expectedPayableMinorUnits !== undefined &&
    input.expectedPayableMinorUnits !== null &&
    payableSum !== toBigInt(input.expectedPayableMinorUnits)
  ) {
    findings.push({
      code: 'SUPPLIER_PAYABLE_MISMATCH',
      expectedMinorUnits: String(input.expectedPayableMinorUnits),
      actualMinorUnits: payableSum.toString(),
    });
  }

  if (
    input.expectedAdvanceMinorUnits !== undefined &&
    input.expectedAdvanceMinorUnits !== null &&
    advanceSum !== toBigInt(input.expectedAdvanceMinorUnits)
  ) {
    findings.push({
      code: 'SUPPLIER_ADVANCE_MISMATCH',
      expectedMinorUnits: String(input.expectedAdvanceMinorUnits),
      actualMinorUnits: advanceSum.toString(),
    });
  }

  if (
    input.expectedAllocationTotalMinorUnits !== undefined &&
    input.expectedAllocationTotalMinorUnits !== null &&
    allocationSum !== toBigInt(input.expectedAllocationTotalMinorUnits)
  ) {
    findings.push({
      code: 'SUPPLIER_ALLOCATION_MISMATCH',
      expectedMinorUnits: String(input.expectedAllocationTotalMinorUnits),
      actualMinorUnits: allocationSum.toString(),
    });
  }

  if (
    input.expectedAccountMovementTotalMinorUnits !== undefined &&
    input.expectedAccountMovementTotalMinorUnits !== null &&
    accountMovementSum !== toBigInt(input.expectedAccountMovementTotalMinorUnits)
  ) {
    findings.push({
      code: 'SUPPLIER_ACCOUNT_MOVEMENT_MISMATCH',
      expectedMinorUnits: String(input.expectedAccountMovementTotalMinorUnits),
      actualMinorUnits: accountMovementSum.toString(),
    });
  }

  if (input.detectInternalInconsistency === true) {
    const allocationEffects = effects.filter(
      (item) =>
        String(item.status ?? 'posted') === 'posted' &&
        String(item.sourceType) === 'supplier_payment_allocation',
    );
    let allocationEffectSum = 0n;
    for (const effect of allocationEffects) {
      allocationEffectSum += toBigInt(effect.signedAmountMinorUnits);
    }
    // Allocation ledger effects are negative; compare absolute totals.
    if (allocationEffectSum * -1n !== allocationSum) {
      findings.push({
        code: 'ALLOCATION_LEDGER_INCONSISTENCY',
        allocationTotalMinorUnits: allocationSum.toString(),
        allocationEffectTotalMinorUnits: allocationEffectSum.toString(),
      });
    }
  }

  return {
    ok: findings.length === 0,
    payableMinorUnits: payableSum.toString(),
    advanceMinorUnits: advanceSum.toString(),
    allocationTotalMinorUnits: allocationSum.toString(),
    accountMovementTotalMinorUnits: accountMovementSum.toString(),
    findings,
  };
}

module.exports = {
  reconcileSupplierLedgerState,
  sumByEffectKind,
  sumAllocations,
};
