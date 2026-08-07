// @ts-check

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Money is stored as integer minor units (paisa) for PKR (2 decimal places). */
const MONEY_MINOR_UNIT_SCALE = 2n;
const MONEY_MINOR_UNIT_FACTOR = 100n;

/** Quantity minor scale supports four decimal places (BR-COMMON-017/025). */
const QUANTITY_MINOR_UNIT_SCALE = 4n;
const QUANTITY_MINOR_UNIT_FACTOR = 10000n;

/**
 * @param {bigint} numerator
 * @param {bigint} denominator
 */
function divRoundHalfUp(numerator, denominator) {
  const sign = numerator < 0n !== denominator < 0n ? -1n : 1n;
  const absNumerator = numerator < 0n ? -numerator : numerator;
  const absDenominator = denominator < 0n ? -denominator : denominator;
  const doubled = absNumerator * 2n;
  const quotient = doubled / absDenominator;
  const rounded = (quotient + 1n) / 2n;
  return rounded * sign;
}

/**
 * @param {string} raw
 * @returns {bigint}
 */
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

/**
 * @param {bigint} minorUnits
 * @returns {string}
 */
function formatMoneyMinorUnits(minorUnits) {
  const negative = minorUnits < 0n;
  const absolute = negative ? -minorUnits : minorUnits;
  const whole = absolute / MONEY_MINOR_UNIT_FACTOR;
  const fraction = absolute % MONEY_MINOR_UNIT_FACTOR;
  const fractionText = fraction.toString().padStart(Number(MONEY_MINOR_UNIT_SCALE), '0');
  return `${negative ? '-' : ''}${whole.toString()}.${fractionText}`;
}

/**
 * @param {bigint} left
 * @param {bigint} right
 */
function addMoneyMinorUnits(left, right) {
  return left + right;
}

/**
 * @param {bigint} value
 * @param {bigint} multiplier
 * @param {bigint} divisor
 */
function multiplyMoneyMinorUnits(value, multiplier, divisor) {
  return divRoundHalfUp(value * multiplier, divisor);
}

/**
 * @param {string} raw
 * @returns {bigint}
 */
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

/**
 * @param {string} raw
 * @returns {boolean}
 */
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

/**
 * @param {string} raw
 * @returns {string}
 */
function parseDateOnly(raw) {
  const value = raw.trim();
  if (!isValidDateOnlyString(value)) {
    throw new Error('Invalid date-only value; expected YYYY-MM-DD');
  }
  return value;
}

/**
 * @param {string} raw
 * @returns {Date}
 */
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
  isValidDateOnlyString,
  parseDateOnly,
  parseUtcTimestamp,
};
