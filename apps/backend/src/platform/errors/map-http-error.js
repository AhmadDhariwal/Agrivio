// @ts-check
const { ApiTransportErrorCode } = require('@agrivio/api-contracts');

const GENERIC_INTERNAL_MESSAGE = 'An unexpected error occurred';

/**
 * Duck-type AppError so mapping remains correct across CJS/ESM module boundaries.
 * @param {unknown} error
 * @returns {error is import('./app-error').AppError}
 */
function isAppError(error) {
  return (
    error instanceof Error &&
    error.name === 'AppError' &&
    typeof (/** @type {{ statusCode?: unknown }} */ (error).statusCode) === 'number' &&
    typeof (/** @type {{ code?: unknown }} */ (error).code) === 'string'
  );
}

/**
 * @param {unknown} error
 * @param {'development' | 'test' | 'production'} nodeEnv
 * @returns {{ statusCode: number; body: import('@agrivio/api-contracts').ApiErrorBody }}
 */
function mapErrorToHttpResponse(error, nodeEnv) {
  if (isAppError(error)) {
    return {
      statusCode: error.statusCode,
      body: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
    };
  }

  if (error instanceof Error) {
    if (error.name === 'IdempotencyConflictError') {
      return {
        statusCode: 409,
        body: {
          code: ApiTransportErrorCode.IdempotencyConflict,
          message: error.message,
        },
      };
    }

    if (error.name === 'TenantScopeError') {
      return {
        statusCode: 403,
        body: {
          code: ApiTransportErrorCode.Forbidden,
          message: error.message,
        },
      };
    }
  }

  const exposeInternalMessage = nodeEnv === 'development' || nodeEnv === 'test';
  const message =
    exposeInternalMessage && error instanceof Error ? error.message : GENERIC_INTERNAL_MESSAGE;

  return {
    statusCode: 500,
    body: {
      code: ApiTransportErrorCode.InternalError,
      message,
    },
  };
}

module.exports = {
  mapErrorToHttpResponse,
};
