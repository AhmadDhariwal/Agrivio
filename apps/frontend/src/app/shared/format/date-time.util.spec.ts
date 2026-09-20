import { describe, expect, it } from 'vitest';
import {
  formatAppDate,
  formatAppTime,
  formatAppDateTime,
  formatAppDateTimeParts,
} from './date-time.util';

describe('DateTime Formatting Utility', () => {
  describe('formatAppDate', () => {
    it('formats calendar dates (YYYY-MM-DD) without timezone conversion', () => {
      expect(formatAppDate('2026-09-20')).toBe('20 Sep 2026');
      expect(formatAppDate('2026-08-24')).toBe('24 Aug 2026');
      expect(formatAppDate('2027-09-21')).toBe('21 Sep 2027');
      expect(formatAppDate('2026-01-05')).toBe('05 Jan 2026');
      expect(formatAppDate('2026-12-31')).toBe('31 Dec 2026');
    });

    it('formats ISO timestamps converting to user local timezone date', () => {
      const date = new Date('2026-09-20T15:56:48.000Z');
      const expectedDay = String(date.getDate()).padStart(2, '0');
      const expectedYear = date.getFullYear();
      const formatted = formatAppDate('2026-09-20T15:56:48.000Z');
      expect(formatted).toContain(expectedDay);
      expect(formatted).toContain(String(expectedYear));
    });

    it('handles Date objects', () => {
      const d = new Date(2026, 8, 20); // 20 Sep 2026 local
      expect(formatAppDate(d)).toBe('20 Sep 2026');
    });

    it('returns "—" for null, undefined, or empty strings', () => {
      expect(formatAppDate(null)).toBe('—');
      expect(formatAppDate(undefined)).toBe('—');
      expect(formatAppDate('')).toBe('—');
      expect(formatAppDate('   ')).toBe('—');
    });

    it('returns raw string for invalid dates', () => {
      expect(formatAppDate('not-a-date')).toBe('not-a-date');
    });
  });

  describe('formatAppTime', () => {
    it('returns "—" for calendar date strings without time', () => {
      expect(formatAppTime('2026-09-20')).toBe('—');
    });

    it('formats time component with hh:mm A pattern in user local timezone', () => {
      const formatted = formatAppTime('2026-09-20T15:56:48.000Z');
      expect(formatted).toMatch(/^(0[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/);
    });

    it('returns "—" for null or undefined', () => {
      expect(formatAppTime(null)).toBe('—');
      expect(formatAppTime(undefined)).toBe('—');
      expect(formatAppTime('')).toBe('—');
    });
  });

  describe('formatAppDateTime', () => {
    it('formats calendar dates as date only', () => {
      expect(formatAppDateTime('2026-09-20')).toBe('20 Sep 2026');
    });

    it('formats ISO timestamps with date and time in local timezone', () => {
      const formatted = formatAppDateTime('2026-09-20T15:56:48.000Z');
      expect(formatted).toMatch(/^\d{2} [A-Z][a-z]{2} \d{4}, (0[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/);
    });

    it('returns "—" for null or undefined', () => {
      expect(formatAppDateTime(null)).toBe('—');
      expect(formatAppDateTime(undefined)).toBe('—');
    });
  });

  describe('formatAppDateTimeParts', () => {
    it('returns separate date and time parts', () => {
      const parts = formatAppDateTimeParts('2026-09-20T15:56:48.000Z');
      expect(parts.date).toMatch(/^\d{2} [A-Z][a-z]{2} \d{4}$/);
      expect(parts.time).toMatch(/^(0[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/);
    });
  });
});
