/**
 * Pure inventory reconciliation helpers over authoritative movement/balance/cost facts.
 * Does not mutate stock and does not invent a second stock truth.
 */

const {
  QUANTITY_MINOR_UNIT_FACTOR,
  divRoundHalfUp,
} = require('../../platform/primitives/money-and-time');

function signedMovementQuantity(direction, quantityBaseMinorUnits) {
  const qty = BigInt(String(quantityBaseMinorUnits ?? '0'));
  return direction === 'inbound' ? qty : -qty;
}

function balanceKey(warehouseId, productId, batchId) {
  const batch = batchId === null || batchId === undefined || batchId === '' ? 'null' : String(batchId);
  return `${String(warehouseId)}|${String(productId)}|${batch}`;
}

function costKey(warehouseId, productId) {
  return `${String(warehouseId)}|${String(productId)}`;
}

function isSellableMovement(movement) {
  return String(movement.stockCondition ?? 'sellable') !== 'unsellable';
}

function sumMovementsByBalanceScope(movements) {
  const totals = new Map();
  for (const movement of movements) {
    if (String(movement.status ?? 'posted') !== 'posted') {
      continue;
    }
    if (!isSellableMovement(movement)) {
      continue;
    }
    const key = balanceKey(movement.warehouseId, movement.productId, movement.batchId);
    const prior = totals.get(key) ?? 0n;
    totals.set(
      key,
      prior + signedMovementQuantity(movement.direction, movement.quantityBaseMinorUnits),
    );
  }
  return totals;
}

function sumUnsellableMovementsByBalanceScope(movements) {
  const totals = new Map();
  for (const movement of movements) {
    if (String(movement.status ?? 'posted') !== 'posted') {
      continue;
    }
    if (isSellableMovement(movement)) {
      continue;
    }
    const key = balanceKey(movement.warehouseId, movement.productId, movement.batchId);
    const prior = totals.get(key) ?? 0n;
    totals.set(
      key,
      prior + signedMovementQuantity(movement.direction, movement.quantityBaseMinorUnits),
    );
  }
  return totals;
}

function sumBalancesByCostScope(balances) {
  const totals = new Map();
  for (const balance of balances) {
    const key = costKey(balance.warehouseId, balance.productId);
    const prior = totals.get(key) ?? 0n;
    totals.set(key, prior + BigInt(String(balance.quantityBaseMinorUnits ?? '0')));
  }
  return totals;
}

/**
 * Compare authoritative inventory facts and return findings.
 * @returns {{ ok: boolean, findings: Array<object> }}
 */
function reconcileInventoryState({ movements, balances, costStates }) {
  const findings = [];
  const movementTotals = sumMovementsByBalanceScope(movements);
  const unsellableMovementTotals = sumUnsellableMovementsByBalanceScope(movements);
  const balanceByKey = new Map();

  for (const balance of balances) {
    const key = balanceKey(balance.warehouseId, balance.productId, balance.batchId);
    balanceByKey.set(key, balance);
    const movementQty = movementTotals.get(key) ?? 0n;
    const balanceQty = BigInt(String(balance.quantityBaseMinorUnits ?? '0'));
    if (movementQty !== balanceQty) {
      findings.push({
        code: 'MOVEMENT_BALANCE_QUANTITY_MISMATCH',
        warehouseId: String(balance.warehouseId),
        productId: String(balance.productId),
        batchId: balance.batchId ? String(balance.batchId) : null,
        movementQuantityBaseMinorUnits: movementQty.toString(),
        balanceQuantityBaseMinorUnits: balanceQty.toString(),
      });
    }
    const unsellableMovementQty = unsellableMovementTotals.get(key) ?? 0n;
    const unsellableBalanceQty = BigInt(String(balance.unsellableQuantityBaseMinorUnits ?? '0'));
    if (unsellableMovementQty !== unsellableBalanceQty) {
      findings.push({
        code: 'UNSELLABLE_MOVEMENT_BALANCE_QUANTITY_MISMATCH',
        warehouseId: String(balance.warehouseId),
        productId: String(balance.productId),
        batchId: balance.batchId ? String(balance.batchId) : null,
        movementQuantityBaseMinorUnits: unsellableMovementQty.toString(),
        balanceQuantityBaseMinorUnits: unsellableBalanceQty.toString(),
      });
    }
  }

  for (const [key, movementQty] of movementTotals.entries()) {
    if (balanceByKey.has(key)) {
      continue;
    }
    if (movementQty === 0n) {
      continue;
    }
    const [warehouseId, productId, batchToken] = key.split('|');
    findings.push({
      code: 'MOVEMENT_WITHOUT_BALANCE',
      warehouseId,
      productId,
      batchId: batchToken === 'null' ? null : batchToken,
      movementQuantityBaseMinorUnits: movementQty.toString(),
      balanceQuantityBaseMinorUnits: '0',
    });
  }

  for (const [key, movementQty] of unsellableMovementTotals.entries()) {
    if (balanceByKey.has(key)) {
      continue;
    }
    if (movementQty === 0n) {
      continue;
    }
    const [warehouseId, productId, batchToken] = key.split('|');
    findings.push({
      code: 'UNSELLABLE_MOVEMENT_WITHOUT_BALANCE',
      warehouseId,
      productId,
      batchId: batchToken === 'null' ? null : batchToken,
      movementQuantityBaseMinorUnits: movementQty.toString(),
      balanceQuantityBaseMinorUnits: '0',
    });
  }

  const balanceCostTotals = sumBalancesByCostScope(balances);
  const costByKey = new Map(
    costStates.map((row) => [costKey(row.warehouseId, row.productId), row]),
  );

  for (const [key, balanceQty] of balanceCostTotals.entries()) {
    const cost = costByKey.get(key);
    const [warehouseId, productId] = key.split('|');
    if (!cost) {
      if (balanceQty !== 0n) {
        findings.push({
          code: 'BALANCE_WITHOUT_COST_STATE',
          warehouseId,
          productId,
          balanceQuantityBaseMinorUnits: balanceQty.toString(),
        });
      }
      continue;
    }
    const costQty = BigInt(String(cost.quantityBaseMinorUnits ?? '0'));
    if (costQty !== balanceQty) {
      findings.push({
        code: 'COST_STATE_QUANTITY_MISMATCH',
        warehouseId,
        productId,
        costQuantityBaseMinorUnits: costQty.toString(),
        balanceQuantityBaseMinorUnits: balanceQty.toString(),
      });
    }
  }

  for (const [key, cost] of costByKey.entries()) {
    const [warehouseId, productId] = key.split('|');
    const costQty = BigInt(String(cost.quantityBaseMinorUnits ?? '0'));
    const costValue = BigInt(String(cost.inventoryValueMinorUnits ?? '0'));
    const wac = BigInt(String(cost.weightedAverageCostMinorUnits ?? '0'));
    if (costQty === 0n && costValue !== 0n) {
      findings.push({
        code: 'COST_STATE_VALUE_WITHOUT_QUANTITY',
        warehouseId,
        productId,
        costQuantityBaseMinorUnits: costQty.toString(),
        costInventoryValueMinorUnits: costValue.toString(),
      });
    }
    if (costValue < 0n) {
      findings.push({
        code: 'COST_STATE_NEGATIVE_VALUE',
        warehouseId,
        productId,
        costInventoryValueMinorUnits: costValue.toString(),
      });
    }
    if (costQty > 0n && wac >= 0n) {
      const expectedValue = divRoundHalfUp(wac * costQty, QUANTITY_MINOR_UNIT_FACTOR);
      const delta =
        expectedValue > costValue ? expectedValue - costValue : costValue - expectedValue;
      if (delta > 1n) {
        findings.push({
          code: 'COST_STATE_VALUATION_MISMATCH',
          warehouseId,
          productId,
          costQuantityBaseMinorUnits: costQty.toString(),
          costInventoryValueMinorUnits: costValue.toString(),
          expectedInventoryValueMinorUnits: expectedValue.toString(),
        });
      }
    }
  }

  return {
    ok: findings.length === 0,
    findings,
  };
}

module.exports = {
  balanceKey,
  costKey,
  reconcileInventoryState,
  signedMovementQuantity,
  sumBalancesByCostScope,
  sumMovementsByBalanceScope,
};
