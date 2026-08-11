const {
  QUANTITY_MINOR_UNIT_FACTOR,
  computeUnitCostMinorUnits,
  divRoundHalfUp,
} = require('../../platform/primitives/money-and-time');

/**
 * Apply a positive inbound receipt to warehouse-product WAC state (BR-COST).
 * Quantities and money values are minor-unit bigints.
 */
function applyInboundWac(existing, receipt) {
  const existingQty = existing.quantityBaseMinorUnits;
  const existingValue = existing.inventoryValueMinorUnits;
  const receivedQty = receipt.quantityBaseMinorUnits;
  const receiptValue = receipt.inventoryValueMinorUnits;

  if (receivedQty <= 0n) {
    throw new Error('Inbound receipt quantity must be positive');
  }
  if (receiptValue < 0n) {
    throw new Error('Inbound receipt value cannot be negative');
  }

  const receiptUnitCost = computeUnitCostMinorUnits(receiptValue, receivedQty);
  const nextQty = existingQty + receivedQty;
  let nextValue;
  let nextWac;

  if (existingQty > 0n) {
    nextValue = existingValue + receiptValue;
    nextWac = divRoundHalfUp(nextValue * QUANTITY_MINOR_UNIT_FACTOR, nextQty);
  } else {
    nextWac = receiptUnitCost;
    if (nextQty <= 0n) {
      nextValue = 0n;
    } else if (existingQty === 0n) {
      nextValue = receiptValue;
    } else {
      nextValue = divRoundHalfUp(nextWac * nextQty, QUANTITY_MINOR_UNIT_FACTOR);
    }
  }

  if (nextQty === 0n) {
    return {
      quantityBaseMinorUnits: 0n,
      inventoryValueMinorUnits: 0n,
      weightedAverageCostMinorUnits: nextWac,
      lastWeightedAverageCostMinorUnits: nextWac,
      receiptUnitCostMinorUnits: receiptUnitCost,
    };
  }

  return {
    quantityBaseMinorUnits: nextQty,
    inventoryValueMinorUnits: nextValue,
    weightedAverageCostMinorUnits: nextWac,
    lastWeightedAverageCostMinorUnits: nextWac,
    receiptUnitCostMinorUnits: receiptUnitCost,
  };
}

module.exports = {
  applyInboundWac,
};
