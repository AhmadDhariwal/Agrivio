const { formatMoneyMinorUnits, parseMoneyMinorUnits } = require('../../platform/primitives/money-and-time');

function toMoneyDto(amountMinorUnits) {
  return {
    amount: formatMoneyMinorUnits(BigInt(String(amountMinorUnits ?? '0'))),
    currency: 'PKR',
  };
}

function moneyAmountToMinor(money) {
  if (money === null || money === undefined) {
    return 0n;
  }
  if (typeof money === 'object' && typeof money.amount === 'string') {
    return parseMoneyMinorUnits(money.amount);
  }
  return BigInt(String(money));
}

/**
 * BR-REPORT-001/004/005 shared calculation for dashboard and fixed reports.
 * effects: [{ signedRevenueMinorUnits, signedCogsMinorUnits }]
 */
function computeGrossProfitFromEffects(effects) {
  let netSalesRevenueMinorUnits = 0n;
  let netCogsMinorUnits = 0n;
  for (const effect of effects) {
    netSalesRevenueMinorUnits += BigInt(String(effect.signedRevenueMinorUnits ?? '0'));
    netCogsMinorUnits += BigInt(String(effect.signedCogsMinorUnits ?? '0'));
  }
  const grossProfitMinorUnits = netSalesRevenueMinorUnits - netCogsMinorUnits;
  return {
    netSalesRevenueMinorUnits: netSalesRevenueMinorUnits.toString(),
    netCogsMinorUnits: netCogsMinorUnits.toString(),
    grossProfitMinorUnits: grossProfitMinorUnits.toString(),
    netSalesRevenue: toMoneyDto(netSalesRevenueMinorUnits),
    netCogs: toMoneyDto(netCogsMinorUnits),
    grossProfit: toMoneyDto(grossProfitMinorUnits),
  };
}

function saleToGrossProfitEffect(sale) {
  if (sale.status !== 'posted') {
    return null;
  }
  return {
    signedRevenueMinorUnits: moneyAmountToMinor(sale.saleTotal).toString(),
    signedCogsMinorUnits: moneyAmountToMinor(sale.cogsTotal).toString(),
  };
}

function salesReturnToGrossProfitEffect(returnRecord) {
  if (returnRecord.status !== 'posted') {
    return null;
  }
  if (returnRecord.returnType !== 'sales' && returnRecord.returnType !== 'sales_without_invoice') {
    return null;
  }
  const revenue = moneyAmountToMinor(returnRecord.returnTotal);
  let cogs = 0n;
  for (const line of returnRecord.lines ?? []) {
    if (line.returnInventoryValue) {
      cogs += moneyAmountToMinor(line.returnInventoryValue);
    }
  }
  return {
    signedRevenueMinorUnits: (-revenue).toString(),
    signedCogsMinorUnits: (-cogs).toString(),
  };
}

module.exports = {
  computeGrossProfitFromEffects,
  moneyAmountToMinor,
  saleToGrossProfitEffect,
  salesReturnToGrossProfitEffect,
  toMoneyDto,
};
