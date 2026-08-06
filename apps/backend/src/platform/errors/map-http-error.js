// @ts-check
import { ApiTransportErrorCode } from '@agrivio/api-contracts';
import { AppError } from './app-error.js';

const GENERIC_INTERNAL_MESSAGE = 'An unexpected error occurred';

/**
 * @param {unknown} error
 * @param {'development' | 'test' | 'production'} nodeEnv
 * @returns {{ statusCode: number; body: import('@agrivio/api-contracts').ApiErrorBody }}
 */
export function mapErrorToHttpResponse(error, nodeEnv) {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      body: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
    };
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
