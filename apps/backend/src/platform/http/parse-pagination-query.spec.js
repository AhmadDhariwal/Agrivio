import { describe, it, expect } from 'vitest';
import { parsePaginationQuery } from './parse-pagination-query';

describe('parsePaginationQuery', () => {
  describe('defaults', () => {
    it('uses page=1 and pageSize=25 when both are missing', () => {
      const result = parsePaginationQuery({});
      expect(result).toEqual({ page: 1, pageSize: 25, skip: 0 });
    });

    it('uses defaults when query is undefined', () => {
      const result = parsePaginationQuery(undefined);
      expect(result).toEqual({ page: 1, pageSize: 25, skip: 0 });
    });

    it('uses defaults for empty string values', () => {
      const result = parsePaginationQuery({ page: '', pageSize: '' });
      expect(result).toEqual({ page: 1, pageSize: 25, skip: 0 });
    });
  });

  describe('valid values', () => {
    it('parses page=2 correctly', () => {
      const result = parsePaginationQuery({ page: '2', pageSize: '25' });
      expect(result).toEqual({ page: 2, pageSize: 25, skip: 25 });
    });

    it('computes skip correctly for page 3 pageSize 10', () => {
      const result = parsePaginationQuery({ page: '3', pageSize: '10' });
      expect(result).toEqual({ page: 3, pageSize: 10, skip: 20 });
    });

    it('accepts pageSize=100', () => {
      const result = parsePaginationQuery({ pageSize: '100' });
      expect(result.pageSize).toBe(100);
    });

    it('accepts pageSize=10', () => {
      const result = parsePaginationQuery({ pageSize: '10' });
      expect(result.pageSize).toBe(10);
    });

    it('accepts pageSize=50', () => {
      const result = parsePaginationQuery({ pageSize: '50' });
      expect(result.pageSize).toBe(50);
    });
  });

  describe('invalid page values', () => {
    it('throws VALIDATION_FAILED for page=0', () => {
      expect(() => parsePaginationQuery({ page: '0' })).toThrow();
      try {
        parsePaginationQuery({ page: '0' });
      } catch (e) {
        expect(e.code).toBe('VALIDATION_FAILED');
        expect(e.statusCode).toBe(400);
        expect(e.details).toEqual([{ field: 'page', message: 'page must be a positive integer' }]);
      }
    });

    it('throws VALIDATION_FAILED for page=-1', () => {
      expect(() => parsePaginationQuery({ page: '-1' })).toThrow();
    });

    it('throws VALIDATION_FAILED for non-integer page', () => {
      expect(() => parsePaginationQuery({ page: '1.5' })).toThrow();
    });

    it('throws VALIDATION_FAILED for alphabetic page', () => {
      expect(() => parsePaginationQuery({ page: 'abc' })).toThrow();
    });
  });

  describe('invalid pageSize values', () => {
    it('throws VALIDATION_FAILED for pageSize=0', () => {
      expect(() => parsePaginationQuery({ pageSize: '0' })).toThrow();
      try {
        parsePaginationQuery({ pageSize: '0' });
      } catch (e) {
        expect(e.code).toBe('VALIDATION_FAILED');
        expect(e.statusCode).toBe(400);
        expect(e.details).toEqual([
          { field: 'pageSize', message: 'pageSize must be a positive integer' },
        ]);
      }
    });

    it('throws VALIDATION_FAILED for pageSize=-5', () => {
      expect(() => parsePaginationQuery({ pageSize: '-5' })).toThrow();
    });

    it('throws VALIDATION_FAILED for pageSize=101', () => {
      expect(() => parsePaginationQuery({ pageSize: '101' })).toThrow();
      try {
        parsePaginationQuery({ pageSize: '101' });
      } catch (e) {
        expect(e.code).toBe('VALIDATION_FAILED');
        expect(e.statusCode).toBe(400);
        expect(e.details).toEqual([
          { field: 'pageSize', message: 'pageSize must not exceed 100' },
        ]);
      }
    });

    it('throws VALIDATION_FAILED for pageSize=1000', () => {
      expect(() => parsePaginationQuery({ pageSize: '1000' })).toThrow();
    });

    it('throws VALIDATION_FAILED for non-integer pageSize', () => {
      expect(() => parsePaginationQuery({ pageSize: '2.5' })).toThrow();
    });
  });

  describe('skip computation', () => {
    it('skip is 0 for page 1', () => {
      expect(parsePaginationQuery({ page: '1', pageSize: '25' }).skip).toBe(0);
    });

    it('skip is (page-1)*pageSize', () => {
      expect(parsePaginationQuery({ page: '5', pageSize: '50' }).skip).toBe(200);
    });
  });
});
