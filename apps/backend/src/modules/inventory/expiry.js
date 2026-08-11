const { parseDateOnly } = require('../../platform/primitives/money-and-time');

const DEFAULT_EXPIRY_THRESHOLD_DAYS = 30;

function parseBusinessDateOnly(value) {
  return parseDateOnly(value);
}

function dateOnlyToUtcMillis(value) {
  const [yearText, monthText, dayText] = value.split('-');
  return Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText));
}

function daysBetweenDateOnly(fromDate, toDate) {
  const fromMillis = dateOnlyToUtcMillis(fromDate);
  const toMillis = dateOnlyToUtcMillis(toDate);
  return Math.round((toMillis - fromMillis) / 86_400_000);
}

/**
 * Resolve organization business date (YYYY-MM-DD) from timezone and clock.
 */
function resolveBusinessDate(timezone, at = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(at);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return parseBusinessDateOnly(`${year}-${month}-${day}`);
}

/**
 * Classify batch expiry relative to business date and threshold (BR-BATCH-012, BR-ALERT-003/004).
 * Returns: expired | upcoming | normal | not_applicable
 */
function classifyExpiry({ expiryDate, businessDate, thresholdDays = DEFAULT_EXPIRY_THRESHOLD_DAYS }) {
  if (expiryDate === null || expiryDate === undefined || expiryDate === '') {
    return 'not_applicable';
  }
  const expiry = parseBusinessDateOnly(expiryDate);
  const business = parseBusinessDateOnly(businessDate);
  if (expiry < business) {
    return 'expired';
  }
  const daysUntilExpiry = daysBetweenDateOnly(business, expiry);
  if (daysUntilExpiry >= 0 && daysUntilExpiry <= thresholdDays) {
    return 'upcoming';
  }
  return 'normal';
}

function normalizeExpiryThresholdDays(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('Expiry threshold days must be a non-negative integer');
  }
  return parsed;
}

module.exports = {
  DEFAULT_EXPIRY_THRESHOLD_DAYS,
  classifyExpiry,
  daysBetweenDateOnly,
  normalizeExpiryThresholdDays,
  parseBusinessDateOnly,
  resolveBusinessDate,
};
