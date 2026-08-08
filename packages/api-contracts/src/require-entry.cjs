'use strict';

const API_V1_PREFIX = '/api/v1';
const API_REQUEST_ID_HEADER = 'X-Request-Id';
const API_HEALTH_LIVENESS_PATH = `${API_V1_PREFIX}/health`;
const API_OPERATIONS_READINESS_PATH = `${API_V1_PREFIX}/platform/operations/readiness`;
const API_ORGANIZATION_ACTIVATION_REQUESTS_PATH = `${API_V1_PREFIX}/organization-activation-requests`;
const API_AUTH_ACTIVATE_PATH = `${API_V1_PREFIX}/auth/activate`;
const API_AUTH_CSRF_PATH = `${API_V1_PREFIX}/auth/csrf`;
const API_AUTH_LOGIN_PATH = `${API_V1_PREFIX}/auth/login`;
const API_AUTH_LOGOUT_PATH = `${API_V1_PREFIX}/auth/logout`;
const API_AUTH_SESSION_PATH = `${API_V1_PREFIX}/auth/session`;
const API_AUTH_SESSION_CONTEXT_PATH = `${API_V1_PREFIX}/auth/session/context`;
const API_AUTH_PASSWORD_RESET_REQUEST_PATH = `${API_V1_PREFIX}/auth/password-reset/request`;
const API_AUTH_PASSWORD_RESET_CONFIRM_PATH = `${API_V1_PREFIX}/auth/password-reset/confirm`;
const API_PLATFORM_ORGANIZATIONS_PATH = `${API_V1_PREFIX}/platform/organizations`;
const API_ORGANIZATION_PATH = `${API_V1_PREFIX}/organization`;
const API_PLATFORM_ACTOR_HEADER = 'X-Platform-Actor';
const API_CSRF_HEADER = 'X-CSRF-Token';
const API_SESSION_COOKIE_NAME = 'agrivio_session';
const API_IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

const ApiTransportErrorCode = {
  ValidationFailed: 'VALIDATION_FAILED',
  Unauthorized: 'UNAUTHORIZED',
  Forbidden: 'FORBIDDEN',
  NotFound: 'NOT_FOUND',
  Conflict: 'CONFLICT',
  VersionConflict: 'VERSION_CONFLICT',
  IdempotencyConflict: 'IDEMPOTENCY_CONFLICT',
  InternalError: 'INTERNAL_ERROR',
};

/**
 * CommonJS require entry for Node consumers.
 * Source of truth for types and ESM remains `src/lib/api-contracts.ts`.
 * Keep runtime values aligned with that TypeScript module.
 */
function createApiErrorEnvelope(requestId, error) {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
    },
    requestId,
  };
}

function createApiSuccessEnvelope(requestId, data, meta) {
  return meta === undefined ? { data, requestId } : { data, meta, requestId };
}

module.exports = {
  API_V1_PREFIX,
  API_REQUEST_ID_HEADER,
  API_HEALTH_LIVENESS_PATH,
  API_OPERATIONS_READINESS_PATH,
  API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
  API_AUTH_ACTIVATE_PATH,
  API_AUTH_CSRF_PATH,
  API_AUTH_LOGIN_PATH,
  API_AUTH_LOGOUT_PATH,
  API_AUTH_SESSION_PATH,
  API_AUTH_SESSION_CONTEXT_PATH,
  API_AUTH_PASSWORD_RESET_REQUEST_PATH,
  API_AUTH_PASSWORD_RESET_CONFIRM_PATH,
  API_PLATFORM_ORGANIZATIONS_PATH,
  API_ORGANIZATION_PATH,
  API_PLATFORM_ACTOR_HEADER,
  API_CSRF_HEADER,
  API_SESSION_COOKIE_NAME,
  API_IDEMPOTENCY_KEY_HEADER,
  ApiTransportErrorCode,
  createApiErrorEnvelope,
  createApiSuccessEnvelope,
};
