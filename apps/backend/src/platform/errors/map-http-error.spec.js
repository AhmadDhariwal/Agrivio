import { describe, expect, it } from 'vitest';
import { ApiTransportErrorCode } from '@agrivio/api-contracts';
import { AppError, notFound } from './app-error';
import { mapErrorToHttpResponse } from './map-http-error';
describe('mapErrorToHttpResponse', () => {
  it('maps application errors to frozen transport codes', () => {
    const mapped = mapErrorToHttpResponse(notFound('Missing route'), 'test');
    expect(mapped.statusCode).toBe(404);
    expect(mapped.body.code).toBe(ApiTransportErrorCode.NotFound);
  });

  it('sanitizes unknown errors in production', () => {
    const mapped = mapErrorToHttpResponse(new Error('database exploded'), 'production');
    expect(mapped.statusCode).toBe(500);
    expect(mapped.body.code).toBe(ApiTransportErrorCode.InternalError);
    expect(mapped.body.message).toBe('An unexpected error occurred');
  });

  it('exposes unknown error messages in development', () => {
    const mapped = mapErrorToHttpResponse(new Error('database exploded'), 'development');
    expect(mapped.body.message).toBe('database exploded');
  });

  it('preserves AppError details', () => {
    const error = new AppError(ApiTransportErrorCode.ValidationFailed, 'Invalid', 400, [
      { field: 'name' },
    ]);
    const mapped = mapErrorToHttpResponse(error, 'production');
    expect(mapped.body.details).toEqual([{ field: 'name' }]);
  });
});
