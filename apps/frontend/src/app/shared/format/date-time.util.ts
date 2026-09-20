const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const CALENDAR_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Formats a date value (calendar date or timestamp) into a human-readable string.
 *
 * Rules:
 * - Date-only values ('YYYY-MM-DD') are formatted strictly without timezone conversion (calendar invariance).
 * - ISO timestamps are converted automatically to the user's local timezone.
 * - Format: 'DD MMM YYYY' (e.g. '20 Sep 2026').
 * - Fallback for null/undefined/empty: '—'.
 */
export function formatAppDate(value: string | Date | null | undefined): string {
  if (value === null || value === undefined) {
    return '—';
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return '—';
    }

    const match = CALENDAR_DATE_REGEX.exec(trimmed);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const monthName = MONTH_NAMES[month - 1];
        const dayPadded = String(day).padStart(2, '0');
        return `${dayPadded} ${monthName} ${year}`;
      }
    }
  }

  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  const day = String(date.getDate()).padStart(2, '0');
  const monthName = MONTH_NAMES[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${monthName} ${year}`;
}

/**
 * Formats the time component of a timestamp in the user's local timezone.
 *
 * Rules:
 * - Pure calendar dates ('YYYY-MM-DD') have no time component and return '—'.
 * - Format: 'hh:mm A' with leading zero (e.g. '08:56 PM').
 * - Fallback for null/undefined/empty/invalid: '—'.
 */
export function formatAppTime(value: string | Date | null | undefined): string {
  if (value === null || value === undefined) {
    return '—';
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || CALENDAR_DATE_REGEX.test(trimmed)) {
      return '—';
    }
  }

  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h12 = String(hours % 12 || 12).padStart(2, '0');
  return `${h12}:${minutes} ${ampm}`;
}

/**
 * Formats a timestamp into combined date and time in the user's local timezone.
 *
 * Examples:
 * - '2026-09-20T15:56:48.000Z' in +05:00 -> '20 Sep 2026, 08:56 PM'
 * - '2026-09-20' -> '20 Sep 2026'
 */
export function formatAppDateTime(value: string | Date | null | undefined): string {
  if (value === null || value === undefined) {
    return '—';
  }

  if (typeof value === 'string' && CALENDAR_DATE_REGEX.test(value.trim())) {
    return formatAppDate(value);
  }

  const datePart = formatAppDate(value);
  const timePart = formatAppTime(value);

  if (datePart === '—') return '—';
  if (timePart === '—') return datePart;
  return `${datePart}, ${timePart}`;
}

/**
 * Returns structured date and time parts for UI layouts requiring stacked presentation.
 */
export function formatAppDateTimeParts(value: string | Date | null | undefined): {
  date: string;
  time: string;
} {
  return {
    date: formatAppDate(value),
    time: formatAppTime(value),
  };
}
