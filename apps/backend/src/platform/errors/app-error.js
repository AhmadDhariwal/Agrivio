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

function recordInUse(message = 'Record is in use', details) {
  return new AppError(ApiTransportErrorCode.RecordInUse ?? 'RECORD_IN_USE', message, 409, details);
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

function orgCapabilityDisabled(
  message = 'This feature is not enabled for your organization',
  details,
) {
  return new AppError(ApiTransportErrorCode.OrgCapabilityDisabled, message, 403, details);
}

function orgActionNotAllowed(
  message = 'This action is not allowed for your organization',
  details,
) {
  return new AppError(ApiTransportErrorCode.OrgActionNotAllowed, message, 403, details);
}

function orgFieldNotEditable(message = 'This field is read-only for your organization', details) {
  return new AppError(ApiTransportErrorCode.OrgFieldNotEditable, message, 403, details);
}

function authRequired(message = 'Authentication required') {
  return new AppError(ApiTransportErrorCode.AuthRequired, message, 401);
}

function contextRequired(message = 'Organization context is required') {
  return new AppError(ApiTransportErrorCode.ContextRequired, message, 403);
}

function permissionDenied(message = "You don't have permission to access this area.", details) {
  return new AppError(ApiTransportErrorCode.PermissionDenied, message, 403, details);
}

function assignmentScopeDenied(
  message = "You don't have access to this branch or warehouse.",
  details,
) {
  return new AppError(ApiTransportErrorCode.AssignmentScopeDenied, message, 403, details);
}

function roleHierarchyDenied(
  message = 'This action is not allowed for your organization role.',
  details,
) {
  return new AppError(ApiTransportErrorCode.RoleHierarchyDenied, message, 403, details);
}

function tenantAccessDenied(message = 'Access to this resource is denied.', details) {
  return new AppError(ApiTransportErrorCode.TenantAccessDenied, message, 403, details);
}

function lastOwnerProtected(
  message = 'Every active organization must retain at least one active Owner',
) {
  return new AppError(ApiTransportErrorCode.LastOwnerProtected, message, 409);
}

function subscriptionAccessDenied(message = 'Subscription access is not available.', details) {
  return new AppError(ApiTransportErrorCode.SubscriptionAccessDenied, message, 403, details);
}

module.exports = {
  validationFailed,
  notFound,
  unauthorized,
  forbidden,
  conflict,
  recordInUse,
  versionConflict,
  idempotencyConflict,
  insufficientStock,
  orgCapabilityDisabled,
  orgActionNotAllowed,
  orgFieldNotEditable,
  authRequired,
  contextRequired,
  permissionDenied,
  assignmentScopeDenied,
  roleHierarchyDenied,
  tenantAccessDenied,
  lastOwnerProtected,
  subscriptionAccessDenied,
  AppError,
};
