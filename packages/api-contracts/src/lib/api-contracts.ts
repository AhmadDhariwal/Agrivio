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

/** Public endpoint: submit organization activation request. */
export const API_ONBOARDING_REQUEST_PATH =
  `${API_V1_PREFIX}/organization-activation-requests` as const;

/** Public endpoint: consume one-time activation token and set initial password. */
export const API_AUTH_ACTIVATE_PATH = `${API_V1_PREFIX}/auth/activate` as const;

/** Platform endpoint: list / create / view organizations. */
export const API_PLATFORM_ORGANIZATIONS_PATH = `${API_V1_PREFIX}/platform/organizations` as const;

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
  /** Activation token has passed its expiry date. */
  TokenExpired: 'TOKEN_EXPIRED',
  /** Activation token has already been consumed. */
  TokenAlreadyUsed: 'TOKEN_ALREADY_USED',
  /** A pending or active request already exists for this applicant. */
  DuplicateRequest: 'DUPLICATE_REQUEST',
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
