// @ts-check
const { ApiTransportErrorCode } = require('@agrivio/api-contracts');
class AppError extends Error {
  /**
   * @param {import('@agrivio/api-contracts').ApiTransportErrorCode} code
   * @param {string} message
   * @param {number} statusCode
   * @param {readonly unknown[]} [details]
   */
  constructor(code, message, statusCode, details) {
    super(message);
    this.name = 'AppError';
    /** @type {import('@agrivio/api-contracts').ApiTransportErrorCode} */
    this.code = code;
    /** @type {number} */
    this.statusCode = statusCode;
    /** @type {readonly unknown[] | undefined} */
    this.details = details;
  }
}

/**
 * @param {string} message
 * @param {readonly unknown[]} [details]
 */
function validationFailed(message, details) {
  return new AppError(ApiTransportErrorCode.ValidationFailed, message, 400, details);
}

/** @param {string} [message] */
function notFound(message = 'Resource not found') {
  return new AppError(ApiTransportErrorCode.NotFound, message, 404);
}

/** @param {string} [message] */
function unauthorized(message = 'Unauthorized') {
  return new AppError(ApiTransportErrorCode.Unauthorized, message, 401);
}

/** @param {string} [message] */
function forbidden(message = 'Forbidden') {
  return new AppError(ApiTransportErrorCode.Forbidden, message, 403);
}

/** @param {string} [message] */
function conflict(message = 'Conflict') {
  return new AppError(ApiTransportErrorCode.Conflict, message, 409);
}

/**
 * @param {string} [message]
 * @param {import('@agrivio/api-contracts').ApiVersionConflictDetail[]} [details]
 */
function versionConflict(message = 'Version conflict', details) {
  return new AppError(ApiTransportErrorCode.VersionConflict, message, 409, details);
}

/**
 * @param {string} [message]
 * @param {readonly unknown[]} [details]
 */
function idempotencyConflict(message = 'Idempotency key conflict', details) {
  return new AppError(ApiTransportErrorCode.IdempotencyConflict, message, 409, details);
}

module.exports = {
  validationFailed,
  notFound,
  unauthorized,
  forbidden,
  conflict,
  versionConflict,
  idempotencyConflict,
  AppError,
};
