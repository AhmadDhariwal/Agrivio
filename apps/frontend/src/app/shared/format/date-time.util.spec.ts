import { describe, expect, it } from 'vitest';
import {
  formatAppDate,
  formatAppTime,
  formatAppDateTime,
  formatAppDateTimeParts,
} from './date-time.util';

describe('DateTime Formatting Utility', () => {
  describe('formatAppDate - Date-Only Safety & Calendar Invariance', () => {
    it('formats calendar dates (YYYY-MM-DD) without timezone day-shift', () => {
      // Regardless of client browser timezone (UTC+5, UTC, UTC-8), calendar dates must stay fixed
      expect(formatAppDate('2026-09-20')).toBe('20 Sep 2026');
      expect(formatAppDate('2026-08-24')).toBe('24 Aug 2026');
      expect(formatAppDate('2027-09-21')).toBe('21 Sep 2027');
      expect(formatAppDate('2026-01-01')).toBe('01 Jan 2026');
      expect(formatAppDate('2026-01-05')).toBe('05 Jan 2026');
      expect(formatAppDate('2026-02-28')).toBe('28 Feb 2026');
      expect(formatAppDate('2026-12-31')).toBe('31 Dec 2026');
    });

    it('proves calendar invariance avoids the new Date(YYYY-MM-DD) day-shift flaw', () => {
      // In UTC-8 (e.g. Pacific Time), new Date('2026-09-20') parses as UTC midnight:
      // 2026-09-20T00:00:00Z -> 2026-09-19 16:00:00 local (day-shift from 20 to 19).
      // formatAppDate uses regex parsing directly and never instantiates UTC midnight Date.
      const calendarInput = '2026-09-20';
      const formatted = formatAppDate(calendarInput);
      expect(formatted).toBe('20 Sep 2026');
      expect(formatted.startsWith('20')).toBe(true);
    });

    it('formats ISO timestamps converting to user local timezone date', () => {
      const date = new Date('2026-09-20T15:56:48.000Z');
      const expectedDay = String(date.getDate()).padStart(2, '0');
      const expectedYear = date.getFullYear();
      const formatted = formatAppDate('2026-09-20T15:56:48.000Z');
      expect(formatted).toContain(expectedDay);
      expect(formatted).toContain(String(expectedYear));
    });

    it('handles Date objects safely', () => {
      const d = new Date(2026, 8, 20); // 20 Sep 2026 local
      expect(formatAppDate(d)).toBe('20 Sep 2026');
    });

    it('returns "—" for null, undefined, empty strings, and whitespace', () => {
      expect(formatAppDate(null)).toBe('—');
      expect(formatAppDate(undefined)).toBe('—');
      expect(formatAppDate('')).toBe('—');
      expect(formatAppDate('   ')).toBe('—');
    });

    it('returns "—" safely for invalid strings and invalid Date instances without throwing', () => {
      expect(formatAppDate('not-a-date')).toBe('—');
      expect(formatAppDate('2026-13-45')).toBe('—');
      expect(formatAppDate('invalid-iso-string')).toBe('—');
      expect(formatAppDate(new Date(NaN))).toBe('—');
    });
  });

  describe('formatAppTime - Local Timezone Conversion', () => {
    it('returns "—" for calendar date strings without time', () => {
      expect(formatAppTime('2026-09-20')).toBe('—');
    });

    it('formats time component with hh:mm A pattern in user local timezone', () => {
      const formatted = formatAppTime('2026-09-20T15:56:48.000Z');
      expect(formatted).toMatch(/^(0[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/);
    });

    it('converts instant deterministically matching local runtime wall clock', () => {
      const localDate = new Date(2026, 8, 20, 20, 56, 48); // 8:56 PM
      expect(formatAppTime(localDate)).toBe('08:56 PM');

      const morningDate = new Date(2026, 8, 20, 8, 5, 0); // 8:05 AM
      expect(formatAppTime(morningDate)).toBe('08:05 AM');

      const midnightDate = new Date(2026, 8, 20, 0, 0, 0); // 12:00 AM
      expect(formatAppTime(midnightDate)).toBe('12:00 AM');

      const noonDate = new Date(2026, 8, 20, 12, 0, 0); // 12:00 PM
      expect(formatAppTime(noonDate)).toBe('12:00 PM');
    });

    it('returns "—" for null, undefined, empty, or invalid inputs without throwing', () => {
      expect(formatAppTime(null)).toBe('—');
      expect(formatAppTime(undefined)).toBe('—');
      expect(formatAppTime('')).toBe('—');
      expect(formatAppTime('   ')).toBe('—');
      expect(formatAppTime('invalid')).toBe('—');
      expect(formatAppTime(new Date(NaN))).toBe('—');
    });
  });

  describe('formatAppDateTime - Combined Instant Presentation', () => {
    it('formats calendar dates as date only', () => {
      expect(formatAppDateTime('2026-09-20')).toBe('20 Sep 2026');
      expect(formatAppDateTime('2026-01-01')).toBe('01 Jan 2026');
    });

    it('formats ISO timestamps with date and time in local timezone', () => {
      const formatted = formatAppDateTime('2026-09-20T15:56:48.000Z');
      expect(formatted).toMatch(/^\d{2} [A-Z][a-z]{2} \d{4}, (0[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/);
    });

    it('converts Date instances deterministically', () => {
      const local = new Date(2026, 8, 20, 20, 56, 48);
      expect(formatAppDateTime(local)).toBe('20 Sep 2026, 08:56 PM');
    });

    it('returns "—" for null, undefined, empty, or invalid inputs without throwing', () => {
      expect(formatAppDateTime(null)).toBe('—');
      expect(formatAppDateTime(undefined)).toBe('—');
      expect(formatAppDateTime('')).toBe('—');
      expect(formatAppDateTime('   ')).toBe('—');
      expect(formatAppDateTime('not-a-date')).toBe('—');
      expect(formatAppDateTime(new Date(NaN))).toBe('—');
    });
  });

  describe('formatAppDateTimeParts - Stacked Presentation', () => {
    it('returns separate date and time parts for instant timestamps', () => {
      const parts = formatAppDateTimeParts('2026-09-20T15:56:48.000Z');
      expect(parts.date).toMatch(/^\d{2} [A-Z][a-z]{2} \d{4}$/);
      expect(parts.time).toMatch(/^(0[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/);
    });

    it('returns safe fallback parts for invalid inputs without throwing', () => {
      const partsNull = formatAppDateTimeParts(null);
      expect(partsNull).toEqual({ date: '—', time: '—' });

      const partsInvalid = formatAppDateTimeParts('invalid');
      expect(partsInvalid).toEqual({ date: '—', time: '—' });
    });
  });
});
