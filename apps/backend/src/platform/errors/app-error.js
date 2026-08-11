const { ApiTransportErrorCode } = require('@agrivio/api-contracts');
class AppError extends Error {
  constructor(code, message, statusCode, details) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

function validationFailed(message, details) {
  return new AppError(ApiTransportErrorCode.ValidationFailed, message, 400, details);
}

function notFound(message = 'Resource not found') {
  return new AppError(ApiTransportErrorCode.NotFound, message, 404);
}

function unauthorized(message = 'Unauthorized') {
  return new AppError(ApiTransportErrorCode.Unauthorized, message, 401);
}

function forbidden(message = 'Forbidden', details) {
  return new AppError(ApiTransportErrorCode.Forbidden, message, 403, details);
}

function conflict(message = 'Conflict') {
  return new AppError(ApiTransportErrorCode.Conflict, message, 409);
}

function versionConflict(message = 'Version conflict', details) {
  return new AppError(ApiTransportErrorCode.VersionConflict, message, 409, details);
}

function idempotencyConflict(message = 'Idempotency key conflict', details) {
  return new AppError(ApiTransportErrorCode.IdempotencyConflict, message, 409, details);
}

function insufficientStock(message = 'Insufficient stock available', details) {
  return new AppError(ApiTransportErrorCode.Conflict, message, 409, details);
}

module.exports = {
  validationFailed,
  notFound,
  unauthorized,
  forbidden,
  conflict,
  versionConflict,
  idempotencyConflict,
  insufficientStock,
  AppError,
};
