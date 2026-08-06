// @ts-check
import { createApiErrorEnvelope } from '@agrivio/api-contracts';
import { mapErrorToHttpResponse } from './map-http-error.js';
import { AppError, notFound } from './app-error.js';

/**
 * @param {import('../config/runtime-config.js').ApiNodeEnv} nodeEnv
 * @param {import('../logging/structured-logger.js').StructuredLogger} logger
 * @returns {import('express').ErrorRequestHandler}
 */
export function createErrorHandlerMiddleware(nodeEnv, logger) {
  return (error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    const requestId = resolveRequestIdFromRequest(req, res);
    const mapped = mapErrorToHttpResponse(error, nodeEnv);

    logger('error', 'request failed', {
      requestId,
      errorCode: mapped.body.code,
      statusCode: mapped.statusCode,
      ...(error instanceof Error ? { errorName: error.name } : {}),
    });

    res.status(mapped.statusCode).json(createApiErrorEnvelope(requestId, mapped.body));
  };
}

/**
 * @param {import('../config/runtime-config.js').ApiNodeEnv} nodeEnv
 * @returns {import('express').RequestHandler}
 */
export function createNotFoundMiddleware(nodeEnv) {
  return (req, res) => {
    const requestId = resolveRequestIdFromRequest(req, res);
    const appError = notFound();
    const mapped = mapErrorToHttpResponse(appError, nodeEnv);
    res.status(mapped.statusCode).json(createApiErrorEnvelope(requestId, mapped.body));
  };
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {string}
 */
function resolveRequestIdFromRequest(req, res) {
  const fromLocals = res.locals['requestId'];
  if (typeof fromLocals === 'string' && fromLocals.length > 0) {
    return fromLocals;
  }

  const fromRequest = /** @type {{ requestId?: string }} */ (req).requestId;
  if (typeof fromRequest === 'string' && fromRequest.length > 0) {
    return fromRequest;
  }

  return 'unknown-request-id';
}

export { AppError };
