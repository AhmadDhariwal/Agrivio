const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Money is stored as integer minor units (paisa) for PKR (2 decimal places).
 */
const MONEY_MINOR_UNIT_SCALE = 2n;
const MONEY_MINOR_UNIT_FACTOR = 100n;

/**
 * Quantity minor scale supports four decimal places (BR-COMMON-017/025).
 */
const QUANTITY_MINOR_UNIT_SCALE = 4n;
const QUANTITY_MINOR_UNIT_FACTOR = 10000n;

function divRoundHalfUp(numerator, denominator) {
  const sign = numerator < 0n !== denominator < 0n ? -1n : 1n;
  const absNumerator = numerator < 0n ? -numerator : numerator;
  const absDenominator = denominator < 0n ? -denominator : denominator;
  const doubled = absNumerator * 2n;
  const quotient = doubled / absDenominator;
  const rounded = (quotient + 1n) / 2n;
  return rounded * sign;
}

function parseMoneyMinorUnits(raw) {
  const value = raw.trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(value)) {
    throw new Error('Invalid monetary value');
  }

  const negative = value.startsWith('-');
  const normalized = negative ? value.slice(1) : value;
  const [wholePart, fractionPart = ''] = normalized.split('.');
  if (wholePart === undefined || wholePart.length === 0) {
    throw new Error('Invalid monetary value');
  }
  const fractionPadded = `${fractionPart}00`.slice(0, 2);
  const minor = BigInt(wholePart) * MONEY_MINOR_UNIT_FACTOR + BigInt(fractionPadded);
  return negative ? -minor : minor;
}

function formatMoneyMinorUnits(minorUnits) {
  const negative = minorUnits < 0n;
  const absolute = negative ? -minorUnits : minorUnits;
  const whole = absolute / MONEY_MINOR_UNIT_FACTOR;
  const fraction = absolute % MONEY_MINOR_UNIT_FACTOR;
  const fractionText = fraction.toString().padStart(Number(MONEY_MINOR_UNIT_SCALE), '0');
  return `${negative ? '-' : ''}${whole.toString()}.${fractionText}`;
}

function addMoneyMinorUnits(left, right) {
  return left + right;
}

function multiplyMoneyMinorUnits(value, multiplier, divisor) {
  return divRoundHalfUp(value * multiplier, divisor);
}

function parseQuantityMinorUnits(raw) {
  const value = raw.trim();
  if (!/^-?\d+(\.\d{1,4})?$/.test(value)) {
    throw new Error('Invalid quantity value');
  }

  if (value.startsWith('-')) {
    throw new Error('Quantities cannot be negative in user-entered values');
  }

  const [wholePart, fractionPart = ''] = value.split('.');
  if (wholePart === undefined || wholePart.length === 0) {
    throw new Error('Invalid quantity value');
  }
  const fractionPadded = `${fractionPart}0000`.slice(0, 4);
  const minor = BigInt(wholePart) * QUANTITY_MINOR_UNIT_FACTOR + BigInt(fractionPadded);
  if (minor === 0n && wholePart === '0' && fractionPart.length > 0) {
    throw new Error('Non-zero entered quantity cannot round to zero base quantity');
  }
  return minor;
}

function formatQuantityMinorUnits(minorUnits) {
  const negative = minorUnits < 0n;
  const absolute = negative ? -minorUnits : minorUnits;
  const whole = absolute / QUANTITY_MINOR_UNIT_FACTOR;
  const fraction = absolute % QUANTITY_MINOR_UNIT_FACTOR;
  const fractionText = fraction.toString().padStart(Number(QUANTITY_MINOR_UNIT_SCALE), '0');
  return `${negative ? '-' : ''}${whole.toString()}.${fractionText}`;
}

/**
 * Convert entered packaging quantity to base quantity using a conversion-factor snapshot.
 * Intermediate precision is retained; final base quantity is round-half-up to 4 decimals.
 */
function convertEnteredQuantityToBaseMinorUnits(enteredQuantityMinorUnits, conversionFactor) {
  const factorText = String(conversionFactor).trim();
  if (!/^\d+(\.\d{1,6})?$/.test(factorText) || /^0+(\.0+)?$/.test(factorText)) {
    throw new Error('Invalid conversion factor');
  }
  const [whole, fraction = ''] = factorText.split('.');
  const scale = BigInt(fraction.length);
  const factorNumerator = BigInt(whole + fraction);
  const factorDenominator = 10n ** scale;
  const product = enteredQuantityMinorUnits * factorNumerator;
  const baseMinor = divRoundHalfUp(product, factorDenominator);
  if (enteredQuantityMinorUnits > 0n && baseMinor === 0n) {
    throw new Error('Non-zero entered quantity cannot round to zero base quantity');
  }
  return baseMinor;
}

/**
 * Unit cost (money minor units per base unit) from inventory value and base quantity.
 * Uses unrounded intermediate ratio then round-half-up to money scale (BR-COST-005/012).
 */
function computeUnitCostMinorUnits(inventoryValueMinorUnits, quantityBaseMinorUnits) {
  if (quantityBaseMinorUnits <= 0n) {
    throw new Error('Cannot compute unit cost with non-positive quantity');
  }
  return divRoundHalfUp(
    inventoryValueMinorUnits * QUANTITY_MINOR_UNIT_FACTOR,
    quantityBaseMinorUnits,
  );
}

function isValidDateOnlyString(raw) {
  if (!DATE_ONLY_PATTERN.test(raw)) {
    return false;
  }

  const [yearText, monthText, dayText] = raw.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function parseDateOnly(raw) {
  const value = raw.trim();
  if (!isValidDateOnlyString(value)) {
    throw new Error('Invalid date-only value; expected YYYY-MM-DD');
  }
  return value;
}

function parseUtcTimestamp(raw) {
  const value = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
    throw new Error('Timestamps must be ISO 8601 UTC');
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid UTC timestamp');
  }

  return date;
}

module.exports = {
  MONEY_MINOR_UNIT_SCALE,
  MONEY_MINOR_UNIT_FACTOR,
  QUANTITY_MINOR_UNIT_SCALE,
  QUANTITY_MINOR_UNIT_FACTOR,
  parseMoneyMinorUnits,
  formatMoneyMinorUnits,
  addMoneyMinorUnits,
  multiplyMoneyMinorUnits,
  parseQuantityMinorUnits,
  formatQuantityMinorUnits,
  convertEnteredQuantityToBaseMinorUnits,
  computeUnitCostMinorUnits,
  divRoundHalfUp,
  isValidDateOnlyString,
  parseDateOnly,
  parseUtcTimestamp,
};
