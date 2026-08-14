const {
  parseDateOnly,
  parseQuantityMinorUnits,
  formatQuantityMinorUnits,
} = require('../../platform/primitives/money-and-time');

/**
 * BR-ALERT-002: sellable on-hand <= configured product-and-warehouse threshold.
 */
function isLowStock({ sellableQuantityBaseMinorUnits, thresholdQuantityBaseMinorUnits }) {
  const sellable = BigInt(String(sellableQuantityBaseMinorUnits ?? '0'));
  const threshold = BigInt(String(thresholdQuantityBaseMinorUnits ?? '0'));
  return sellable <= threshold;
}

/**
 * BR-ALERT-005: sellable on-hand > 0 and no posted non-reversed sale in inactivity window.
 */
function isDeadStock({ sellableQuantityBaseMinorUnits, hadSaleInInactivityPeriod }) {
  const sellable = BigInt(String(sellableQuantityBaseMinorUnits ?? '0'));
  return sellable > 0n && hadSaleInInactivityPeriod !== true;
}

/**
 * Inclusive inactivity window start date (YYYY-MM-DD) for dead-stock evaluation.
 * Period of N days ending on businessDate uses N calendar days back inclusive of businessDate.
 */
function inactivityWindowStart(businessDate, inactivityDays) {
  const days = Number(inactivityDays);
  if (!Number.isInteger(days) || days < 1) {
    throw new Error('deadStockInactivityDays must be a positive integer');
  }
  const business = parseDateOnly(businessDate);
  const [yearText, monthText, dayText] = business.split('-');
  const utc = Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText));
  const start = new Date(utc - (days - 1) * 86_400_000);
  const y = start.getUTCFullYear();
  const m = String(start.getUTCMonth() + 1).padStart(2, '0');
  const d = String(start.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function sumSellableByProductWarehouse(balanceItems) {
  const totals = new Map();
  for (const item of balanceItems) {
    const key = `${item.productId}::${item.warehouseId}`;
    const current = totals.get(key) ?? 0n;
    const qty = parseQuantityMinorUnits(String(item.quantityBase ?? '0'));
    totals.set(key, current + qty);
  }
  return totals;
}

function sumSellableByProduct(balanceItems) {
  const totals = new Map();
  for (const item of balanceItems) {
    const productId = String(item.productId);
    const current = totals.get(productId) ?? 0n;
    const qty = parseQuantityMinorUnits(String(item.quantityBase ?? '0'));
    totals.set(productId, current + qty);
  }
  return totals;
}

function formatQty(minorUnits) {
  return formatQuantityMinorUnits(BigInt(String(minorUnits ?? '0')));
}

module.exports = {
  formatQty,
  inactivityWindowStart,
  isDeadStock,
  isLowStock,
  sumSellableByProduct,
  sumSellableByProductWarehouse,
};
