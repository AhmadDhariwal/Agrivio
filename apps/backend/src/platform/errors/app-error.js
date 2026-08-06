// @ts-check
import { ApiTransportErrorCode } from '@agrivio/api-contracts';

export class AppError extends Error {
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
export function validationFailed(message, details) {
  return new AppError(ApiTransportErrorCode.ValidationFailed, message, 400, details);
}

/** @param {string} [message] */
export function notFound(message = 'Resource not found') {
  return new AppError(ApiTransportErrorCode.NotFound, message, 404);
}

/** @param {string} [message] */
export function unauthorized(message = 'Unauthorized') {
  return new AppError(ApiTransportErrorCode.Unauthorized, message, 401);
}

/** @param {string} [message] */
export function forbidden(message = 'Forbidden') {
  return new AppError(ApiTransportErrorCode.Forbidden, message, 403);
}

/** @param {string} [message] */
export function conflict(message = 'Conflict') {
  return new AppError(ApiTransportErrorCode.Conflict, message, 409);
}
