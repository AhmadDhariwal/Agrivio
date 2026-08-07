import { describe, expect, it } from 'vitest';
import { ApiTransportErrorCode } from '@agrivio/api-contracts';
import { AppError } from '../errors/app-error';
import { assertOptimisticVersion, validateRequestFields } from './request-validation';
describe('request validation helpers', () => {
  it('maps validation failures to transport validation errors', () => {
    expect(() => validateRequestFields([{ field: 'name', required: true }], {})).toThrow(
      /Validation failed/,
    );

    try {
      validateRequestFields([{ field: 'name', required: true }], {});
    } catch (error) {
      expect(error).toMatchObject({
        name: AppError.name,
        code: ApiTransportErrorCode.ValidationFailed,
      });
    }
  });

  it('maps stale versions to version conflict responses', () => {
    expect(() => assertOptimisticVersion({ version: 2 }, 1)).toThrow(/Version conflict/);

    try {
      assertOptimisticVersion({ version: 2 }, 1);
    } catch (error) {
      expect(error).toMatchObject({
        name: AppError.name,
        code: ApiTransportErrorCode.VersionConflict,
      });
    }
  });
});
