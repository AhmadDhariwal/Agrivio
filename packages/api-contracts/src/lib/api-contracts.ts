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

/** Reissue Owner activation token for approved org without usable credentials. */
export const API_PLATFORM_ORGANIZATION_REISSUE_ACTIVATION_SUFFIX =
  'reissue-activation' as const;

/** Current organization profile for the authenticated membership context (R1-F02-008 sample). */
export const API_ORGANIZATION_PATH = `${API_V1_PREFIX}/organization` as const;

/** Residual organization settings (R1-F03-001). */
export const API_SETTINGS_PATH = `${API_V1_PREFIX}/settings` as const;

/** Organization branches (R1-F03-002). */
export const API_BRANCHES_PATH = `${API_V1_PREFIX}/branches` as const;

/** Organization warehouses (R1-F03-003). */
export const API_WAREHOUSES_PATH = `${API_V1_PREFIX}/warehouses` as const;

/** Organization employees / memberships (R1-F03-004). */
export const API_USERS_PATH = `${API_V1_PREFIX}/users` as const;

/** Product categories (R1-F03-005). */
export const API_PRODUCT_CATEGORIES_PATH = `${API_V1_PREFIX}/product-categories` as const;

/** Products (R1-F03-005/006/007). */
export const API_PRODUCTS_PATH = `${API_V1_PREFIX}/products` as const;

/** Customers (R1-F03-008). */
export const API_CUSTOMERS_PATH = `${API_V1_PREFIX}/customers` as const;

/** Suppliers (R1-F03-009). */
export const API_SUPPLIERS_PATH = `${API_V1_PREFIX}/suppliers` as const;

/** Accounts master data (R1-F03-010). */
export const API_ACCOUNTS_PATH = `${API_V1_PREFIX}/accounts` as const;

/** Manual account inflow/outflow posting (R1-F07-006/007). */
export const API_ACCOUNT_TRANSACTIONS_PATH = `${API_V1_PREFIX}/account-transactions` as const;

/** Account-to-account transfers (R1-F07-006/007). */
export const API_ACCOUNT_TRANSFERS_PATH = `${API_V1_PREFIX}/account-transfers` as const;

/** Expense categories (R1-F07-008). */
export const API_EXPENSE_CATEGORIES_PATH = `${API_V1_PREFIX}/expense-categories` as const;

/** Expenses (R1-F07-008). */
export const API_EXPENSES_PATH = `${API_V1_PREFIX}/expenses` as const;

/** Supplier payments (R1-F05-001). */
export const API_SUPPLIER_PAYMENTS_PATH = `${API_V1_PREFIX}/supplier-payments` as const;

/** Purchase drafts and posted purchases (R1-F05-003+). */
export const API_PURCHASES_PATH = `${API_V1_PREFIX}/purchases` as const;

/** Sale drafts and posted sales (R1-F06-002+). */
export const API_SALES_PATH = `${API_V1_PREFIX}/sales` as const;

/** Customer payments (R1-F06-001). */
export const API_CUSTOMER_PAYMENTS_PATH = `${API_V1_PREFIX}/customer-payments` as const;

/** Purchase returns and corrections (R1-F05-006+). */
export const API_RETURNS_PATH = `${API_V1_PREFIX}/returns` as const;

/** Inventory balances inquiry (R1-F04-003). */
export const API_INVENTORY_BALANCES_PATH = `${API_V1_PREFIX}/inventory/balances` as const;

/** Inventory stock movements inquiry (R1-F04-003). */
export const API_INVENTORY_MOVEMENTS_PATH = `${API_V1_PREFIX}/inventory/movements` as const;

/** Product batch inquiry (R1-F04-001). */
export const API_INVENTORY_BATCHES_PATH = `${API_V1_PREFIX}/inventory/batches` as const;

/** Opening stock posting (R1-F04-002). */
export const API_INVENTORY_OPENING_STOCK_PATH =
  `${API_V1_PREFIX}/inventory/opening-stock` as const;

/** Expiry-oriented inventory query (R1-F04-006). */
export const API_INVENTORY_EXPIRY_PATH = `${API_V1_PREFIX}/inventory/expiry` as const;

/** Stock adjustments (R1-F04-008). */
export const API_STOCK_ADJUSTMENTS_PATH = `${API_V1_PREFIX}/stock-adjustments` as const;

/** Warehouse transfers (R1-F04-009). */
export const API_WAREHOUSE_TRANSFERS_PATH = `${API_V1_PREFIX}/warehouse-transfers` as const;

/** Inventory reconciliation inquiry (R1-F04-010). */
export const API_INVENTORY_RECONCILIATION_PATH =
  `${API_V1_PREFIX}/inventory/reconciliation` as const;

/** Alert query results (R1-F08-001 / R1-F08-002). */
export const API_ALERTS_PATH = `${API_V1_PREFIX}/alerts` as const;

/** In-app notification presentation items (R1-F08-001). */
export const API_NOTIFICATIONS_PATH = `${API_V1_PREFIX}/notifications` as const;

/** Operational dashboard composition (R1-F08-003). */
export const API_DASHBOARD_PATH = `${API_V1_PREFIX}/dashboard` as const;

/** Fixed report query (R1-F08-004). */
export const API_REPORTS_PATH = `${API_V1_PREFIX}/reports` as const;

/** Excel import jobs (R1-F08-006). */
export const API_IMPORTS_PATH = `${API_V1_PREFIX}/imports` as const;

/** Organization audit-event inquiry (R1-F08-007). */
export const API_AUDIT_EVENTS_PATH = `${API_V1_PREFIX}/audit-events` as const;

/** Platform audit-event inquiry (R1-F08-007). */
export const API_PLATFORM_AUDIT_EVENTS_PATH = `${API_V1_PREFIX}/platform/audit-events` as const;

/** Platform backup status (R1-F08-008). */
export const API_PLATFORM_OPERATIONS_BACKUPS_PATH =
  `${API_V1_PREFIX}/platform/operations/backups` as const;

/** Platform restore coordination (R1-F08-008). */
export const API_PLATFORM_OPERATIONS_RESTORES_PATH =
  `${API_V1_PREFIX}/platform/operations/restores` as const;

/** Guided organization setup progress (R1-F03-013). */
export const API_ORGANIZATION_SETUP_PROGRESS_PATH =
  `${API_V1_PREFIX}/organization/setup-progress` as const;

/** Organization subscription status and entitlements (R1-F02-010/011). */
export const API_SUBSCRIPTION_PATH = `${API_V1_PREFIX}/subscription` as const;

/** Selectable active plan versions for organizations. */
export const API_SUBSCRIPTION_PLANS_PATH = `${API_V1_PREFIX}/subscription/plans` as const;

/** Organization billing evidence submission and listing. */
export const API_SUBSCRIPTION_BILLING_RECORDS_PATH =
  `${API_V1_PREFIX}/subscription/billing-records` as const;

/** Platform subscription overview and lifecycle actions. */
export const API_PLATFORM_SUBSCRIPTIONS_PATH =
  `${API_V1_PREFIX}/platform/subscriptions` as const;

/** Platform plan definition versioning. */
export const API_PLATFORM_SUBSCRIPTION_PLANS_PATH =
  `${API_V1_PREFIX}/platform/subscription-plans` as const;

/** Platform billing evidence review queue. */
export const API_PLATFORM_BILLING_RECORDS_PATH =
  `${API_V1_PREFIX}/platform/billing-records` as const;

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
