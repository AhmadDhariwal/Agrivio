/**
 * Deterministic calendar billing-period helpers (SUBSCRIPTION_AND_BILLING §5.1).
 * Coverage dates are UTC instants. End-of-month dates clamp to the last valid day.
 */

function utcParts(date) {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
    hours: date.getUTCHours(),
    minutes: date.getUTCMinutes(),
    seconds: date.getUTCSeconds(),
    ms: date.getUTCMilliseconds(),
  };
}

function daysInUtcMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function clampUtcDate(year, monthIndex, day, hours, minutes, seconds, ms) {
  const maxDay = daysInUtcMonth(year, monthIndex);
  const clampedDay = Math.min(day, maxDay);
  return new Date(Date.UTC(year, monthIndex, clampedDay, hours, minutes, seconds, ms));
}

function addCalendarMonthsUtc(start, months) {
  const parts = utcParts(start);
  const totalMonths = parts.month + months;
  const year = parts.year + Math.floor(totalMonths / 12);
  const monthIndex = ((totalMonths % 12) + 12) % 12;
  return clampUtcDate(
    year,
    monthIndex,
    parts.day,
    parts.hours,
    parts.minutes,
    parts.seconds,
    parts.ms,
  );
}

function addCalendarYearsUtc(start, years) {
  return addCalendarMonthsUtc(start, years * 12);
}

function computeCoverageWindow(options) {
  const billingPeriod = options.billingPeriod;
  const at = options.at;
  const existingPeriodEnd = options.existingPeriodEnd
    ? new Date(options.existingPeriodEnd)
    : null;
  const subscriptionStatus = options.subscriptionStatus;
  const explicitCoverageStart = options.explicitCoverageStart
    ? new Date(options.explicitCoverageStart)
    : null;

  let coverageStart;
  if (explicitCoverageStart !== null) {
    coverageStart = explicitCoverageStart;
  } else if (
    (subscriptionStatus === 'active' || subscriptionStatus === 'grace') &&
    existingPeriodEnd !== null
  ) {
    coverageStart = existingPeriodEnd;
  } else {
    // Reactivation after suspension starts from approval time unless explicit coverage provided.
    coverageStart = at;
  }

  const coverageEnd =
    billingPeriod === 'annual'
      ? addCalendarYearsUtc(coverageStart, 1)
      : addCalendarMonthsUtc(coverageStart, 1);

  return { coverageStart, coverageEnd };
}

function coverageIsCurrent(coverage, at) {
  return coverage.coverageEnd instanceof Date && coverage.coverageEnd.getTime() > at.getTime();
}

module.exports = {
  daysInUtcMonth,
  addCalendarMonthsUtc,
  addCalendarYearsUtc,
  computeCoverageWindow,
  coverageIsCurrent,
};
