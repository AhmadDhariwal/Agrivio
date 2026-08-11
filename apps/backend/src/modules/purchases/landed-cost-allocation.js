const { validationFailed } = require('../../platform/errors/app-error');
const { divRoundHalfUp } = require('../../platform/primitives/money-and-time');

/**
 * BR-COST-014/015: allocate landed cost proportionally by purchase-line product value.
 * Remainder is applied to the last eligible line so the sum exactly equals the total.
 */
function allocateLandedCosts(lines, landedCostTotalMinorUnits) {
  const totalLanded = BigInt(String(landedCostTotalMinorUnits ?? '0'));
  if (totalLanded < 0n) {
    throw validationFailed('Landed cost total cannot be negative', [
      { field: 'landedCosts', message: 'landed cost total cannot be negative' },
    ]);
  }

  if (!Array.isArray(lines) || lines.length === 0) {
    throw validationFailed('Purchase lines are required for landed-cost allocation', [
      { field: 'lines', message: 'at least one line is required' },
    ]);
  }

  const values = lines.map((line) => BigInt(String(line.lineProductAmountMinorUnits ?? '0')));
  const totalValue = values.reduce((sum, value) => sum + value, 0n);

  if (totalLanded > 0n && totalValue === 0n) {
    throw validationFailed(
      'Cannot allocate landed cost when all purchase-line product values are zero',
      [{ field: 'landedCosts', message: 'manual correction required before posting' }],
    );
  }

  if (totalLanded === 0n || totalValue === 0n) {
    return lines.map(() => '0');
  }

  const allocations = [];
  let allocated = 0n;
  for (let index = 0; index < values.length; index += 1) {
    if (index === values.length - 1) {
      allocations.push((totalLanded - allocated).toString());
      break;
    }
    const share = divRoundHalfUp(totalLanded * values[index], totalValue);
    allocations.push(share.toString());
    allocated += share;
  }

  const sum = allocations.reduce((acc, value) => acc + BigInt(value), 0n);
  if (sum !== totalLanded) {
    throw validationFailed('Landed-cost allocation failed to reconcile', [
      { field: 'landedCosts', message: 'allocation total must equal landed cost total' },
    ]);
  }

  return allocations;
}

function sumLandedCostComponents(landedCosts) {
  const freight = BigInt(String(landedCosts?.freightMinorUnits ?? '0'));
  const loading = BigInt(String(landedCosts?.loadingMinorUnits ?? '0'));
  const transport = BigInt(String(landedCosts?.transportMinorUnits ?? '0'));
  const other = BigInt(String(landedCosts?.otherMinorUnits ?? '0'));
  return (freight + loading + transport + other).toString();
}

module.exports = {
  allocateLandedCosts,
  sumLandedCostComponents,
};
