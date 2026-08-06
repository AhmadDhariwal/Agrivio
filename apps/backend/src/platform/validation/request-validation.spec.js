import { describe, expect, it } from 'vitest';
import { ApiTransportErrorCode } from '@agrivio/api-contracts';
import { AppError } from '../errors/app-error.js';
import { assertOptimisticVersion, validateRequestFields } from './request-validation.js';

describe('request validation helpers', () => {
  it('maps validation failures to transport validation errors', () => {
    expect(() => validateRequestFields([{ field: 'name', required: true }], {})).toThrow(AppError);

    try {
      validateRequestFields([{ field: 'name', required: true }], {});
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe(ApiTransportErrorCode.ValidationFailed);
    }
  });

  it('maps stale versions to version conflict responses', () => {
    expect(() => assertOptimisticVersion({ version: 2 }, 1)).toThrow(AppError);

    try {
      assertOptimisticVersion({ version: 2 }, 1);
    } catch (error) {
      expect(error.code).toBe(ApiTransportErrorCode.VersionConflict);
    }
  });
});
