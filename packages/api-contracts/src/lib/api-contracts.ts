/**
 * Stable transport-level API path prefix for Release 1 REST surfaces.
 * Business endpoint contracts are added in later stages.
 */
export const API_V1_PREFIX = '/api/v1' as const;

/** HTTP header used to propagate opaque request correlation identifiers. */
export const API_REQUEST_ID_HEADER = 'X-Request-Id' as const;

/** Public liveness probe — must not expose dependency internals. */
export const API_HEALTH_LIVENESS_PATH = `${API_V1_PREFIX}/health` as const;

/** Private operational readiness probe — reflects dependency availability without leaking secrets. */
export const API_OPERATIONS_READINESS_PATH =
  `${API_V1_PREFIX}/platform/operations/readiness` as const;

/** Public organization activation request intake (R1-F02-005). */
export const API_ORGANIZATION_ACTIVATION_REQUESTS_PATH =
  `${API_V1_PREFIX}/organization-activation-requests` as const;

/** Owner account activation (R1-F02-006). */
export const API_AUTH_ACTIVATE_PATH = `${API_V1_PREFIX}/auth/activate` as const;

/** Issue/refresh CSRF binding (R1-F02-003). */
export const API_AUTH_CSRF_PATH = `${API_V1_PREFIX}/auth/csrf` as const;

/** Browser sign-in (R1-F02-003). */
export const API_AUTH_LOGIN_PATH = `${API_V1_PREFIX}/auth/login` as const;

/** Browser sign-out (R1-F02-003). */
export const API_AUTH_LOGOUT_PATH = `${API_V1_PREFIX}/auth/logout` as const;

/** Current authenticated session snapshot (R1-F02-003). */
export const API_AUTH_SESSION_PATH = `${API_V1_PREFIX}/auth/session` as const;

/** Select authorized active context; rotates session id and CSRF (R1-F02-003/007). */
export const API_AUTH_SESSION_CONTEXT_PATH = `${API_V1_PREFIX}/auth/session/context` as const;

/** Password reset request (R1-F02-004). */
export const API_AUTH_PASSWORD_RESET_REQUEST_PATH =
  `${API_V1_PREFIX}/auth/password-reset/request` as const;

/** Password reset confirmation (R1-F02-004). */
export const API_AUTH_PASSWORD_RESET_CONFIRM_PATH =
  `${API_V1_PREFIX}/auth/password-reset/confirm` as const;

/** Platform organization list/detail base path. */
export const API_PLATFORM_ORGANIZATIONS_PATH =
  `${API_V1_PREFIX}/platform/organizations` as const;

/** Development-only Super Admin actor header. Must never authorize production traffic. */
export const API_PLATFORM_ACTOR_HEADER = 'X-Platform-Actor' as const;

/** CSRF token header for browser-originated state-changing requests. */
export const API_CSRF_HEADER = 'X-CSRF-Token' as const;

/** Opaque HttpOnly session cookie name. Frontend must never read this value. */
export const API_SESSION_COOKIE_NAME = 'agrivio_session' as const;

/**
 * Transport-level health payload used by public liveness checks.
 * Must not expose topology, secrets, or environment configuration.
 */
export type ApiHealthStatus = 'ok';

export interface ApiHealthResponse {
  readonly status: ApiHealthStatus;
}

export type ApiReadinessStatus = 'ready' | 'not_ready';

export interface ApiReadinessResponse {
  readonly status: ApiReadinessStatus;
}

/**
 * Stable transport-level error codes shared across API clients.
 * Domain/business error details remain owned by backend modules.
 */
export const ApiTransportErrorCode = {
  ValidationFailed: 'VALIDATION_FAILED',
  Unauthorized: 'UNAUTHORIZED',
  Forbidden: 'FORBIDDEN',
  NotFound: 'NOT_FOUND',
  Conflict: 'CONFLICT',
  VersionConflict: 'VERSION_CONFLICT',
  IdempotencyConflict: 'IDEMPOTENCY_CONFLICT',
  InternalError: 'INTERNAL_ERROR',
} as const;

/** HTTP header for idempotent mutating requests (API_DESIGN.md §8). */
export const API_IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key' as const;

/** Field-level validation detail returned with `VALIDATION_FAILED`. */
export interface ApiValidationErrorDetail {
  readonly field: string;
  readonly message: string;
}

/** Optimistic concurrency conflict detail returned with `VERSION_CONFLICT`. */
export interface ApiVersionConflictDetail {
  readonly expectedVersion: number;
  readonly actualVersion?: number;
}

export type ApiTransportErrorCode =
  (typeof ApiTransportErrorCode)[keyof typeof ApiTransportErrorCode];

export interface ApiErrorBody {
  readonly code: ApiTransportErrorCode;
  readonly message: string;
  readonly details?: readonly unknown[];
}

/** Frozen error response envelope (API_DESIGN.md §3.3). */
export interface ApiErrorEnvelope {
  readonly error: ApiErrorBody;
  readonly requestId: string;
}

/** Frozen successful response envelope (API_DESIGN.md §3.1). */
export interface ApiSuccessEnvelope<TData> {
  readonly data: TData;
  readonly meta?: Record<string, unknown>;
  readonly requestId: string;
}

/**
 * Builds a transport-level error envelope for HTTP responses.
 */
export function createApiErrorEnvelope(requestId: string, error: ApiErrorBody): ApiErrorEnvelope {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
    },
    requestId,
  };
}

/**
 * Builds a transport-level success envelope for HTTP responses.
 */
export function createApiSuccessEnvelope<TData>(
  requestId: string,
  data: TData,
  meta?: Record<string, unknown>,
): ApiSuccessEnvelope<TData> {
  return meta === undefined ? { data, requestId } : { data, meta, requestId };
}
