// @ts-check
const { createApiErrorEnvelope, createApiSuccessEnvelope } = require('@agrivio/api-contracts');
const { requireRequestIdFromContext } = require('./request-id.middleware');
/**
 * @template TData
 * @param {import('express').Response} res
 * @param {number} statusCode
 * @param {TData} data
 * @param {Record<string, unknown>} [meta]
 */
function sendSuccessEnvelope(res, statusCode, data, meta) {
  const requestId = requireRequestIdFromContext(res);
  const body = createApiSuccessEnvelope(requestId, data, meta);
  res.status(statusCode).json(body);
}

/**
 * @param {import('express').Response} res
 * @param {number} statusCode
 * @param {import('@agrivio/api-contracts').ApiErrorBody} error
 */
function sendErrorEnvelope(res, statusCode, error) {
  const requestId = requireRequestIdFromContext(res);
  const body = createApiErrorEnvelope(requestId, error);
  res.status(statusCode).json(body);
}

module.exports = {
  sendSuccessEnvelope,
  sendErrorEnvelope,
};
