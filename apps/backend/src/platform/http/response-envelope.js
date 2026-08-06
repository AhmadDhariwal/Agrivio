// @ts-check
import { createApiErrorEnvelope, createApiSuccessEnvelope } from '@agrivio/api-contracts';
import { requireRequestIdFromContext } from './request-id.middleware.js';

/**
 * @template TData
 * @param {import('express').Response} res
 * @param {number} statusCode
 * @param {TData} data
 * @param {Record<string, unknown>} [meta]
 */
export function sendSuccessEnvelope(res, statusCode, data, meta) {
  const requestId = requireRequestIdFromContext(res);
  const body = createApiSuccessEnvelope(requestId, data, meta);
  res.status(statusCode).json(body);
}

/**
 * @param {import('express').Response} res
 * @param {number} statusCode
 * @param {import('@agrivio/api-contracts').ApiErrorBody} error
 */
export function sendErrorEnvelope(res, statusCode, error) {
  const requestId = requireRequestIdFromContext(res);
  const body = createApiErrorEnvelope(requestId, error);
  res.status(statusCode).json(body);
}
