# API Design

Document status: Frozen for Release 1  
Current version: 1.0  
Last updated: 2026-08-04  
Approval status: Approved for implementation planning

## Document Authority

| Concern | Authoritative document |
| --- | --- |
| Product scope | Frozen [PRD.md](PRD.md) |
| Business behaviour | Frozen [BUSINESS_RULES.md](BUSINESS_RULES.md) |
| Module ownership | Frozen [MODULE_BOUNDARIES.md](MODULE_BOUNDARIES.md) |
| Data model | [DATA_MODEL.md](DATA_MODEL.md) |
| Permissions and sessions | [SECURITY_AUTHORIZATION.md](SECURITY_AUTHORIZATION.md) |
| Subscription entitlements | [SUBSCRIPTION_AND_BILLING.md](SUBSCRIPTION_AND_BILLING.md) |
| API conventions and endpoint inventory | This document |

Frozen requirements define product scope. Frozen Business Rules define calculations and behaviour. Frozen architecture defines module ownership and dependencies. P1-05 defines implementation-ready technical contracts. P1-05 does not create implementation or Express routes.

---

## 1. API Baseline

* Style: JSON over authenticated HTTP REST
* Base prefix: `/api/v1`
* Platform prefix: `/api/v1/platform`
* Character encoding: UTF-8
* Resource names: plural kebab-case
* Identifiers: opaque strings
* Timestamps: ISO 8601 UTC
* Money, quantities, and conversion factors: decimal strings
* No organization ID accepted as authoritative tenant context for normal organization users
* Normal organization APIs infer organization context from authenticated membership
* Platform APIs are separated under `/api/v1/platform`

---

## 2. Versioning

* Release 1 public API version is `v1`.
* Breaking changes require a new version prefix.
* Additive non-breaking fields may appear within `v1` under controlled review.
* Deprecation notices belong in later delivery documentation.

---

## 3. Response Envelopes

### 3.1 Successful response

```json
{
  "data": {},
  "meta": {},
  "requestId": "opaque-request-id"
}
```

Rules:

* `meta` is optional.
* `requestId` is always returned.
* Empty successful operations may return `data: null`.

### 3.2 List response

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 25,
    "total": 100
  },
  "requestId": "opaque-request-id"
}
```

### 3.3 Error response

```json
{
  "error": {
    "code": "BUSINESS_RULE_VIOLATION",
    "message": "Human-readable safe message",
    "details": []
  },
  "requestId": "opaque-request-id"
}
```

Do not expose stack traces, database errors, collection names, or secrets.

---

## 4. Error Codes

Stable categories:

```text
AUTHENTICATION_REQUIRED
INVALID_CREDENTIALS
SESSION_EXPIRED
AUTHORIZATION_DENIED
TENANT_SCOPE_VIOLATION
BRANCH_SCOPE_VIOLATION
WAREHOUSE_SCOPE_VIOLATION
SUBSCRIPTION_RESTRICTED
VALIDATION_FAILED
BUSINESS_RULE_VIOLATION
RESOURCE_NOT_FOUND
VERSION_CONFLICT
DUPLICATE_CONFLICT
IDEMPOTENCY_CONFLICT
TRANSACTION_FAILED
RATE_LIMITED
INTERNAL_ERROR
```

Module-specific error codes may extend these categories later.

HTTP status and internal error code must remain distinct.

---

## 5. Authentication Transport and Tenant Context

* Browser clients authenticate with server-managed opaque session cookies.
* Session design is defined in [SECURITY_AUTHORIZATION.md](SECURITY_AUTHORIZATION.md).
* Every authenticated session has exactly one explicit active context: `platform` or an organization membership.
* Session records store, where applicable, `activeContextType`, `activeMembershipId`, and `activeOrganizationId`.
* Organization APIs derive `organizationId` from the authenticated active membership context.
* Clients must not supply an authoritative alternate organization ID for normal membership APIs.
* Supplying an organization identifier on the session-context endpoint is only a context-selection request; the server verifies the corresponding active membership.
* Platform APIs require platform authorization and do not silently inherit organization Owner privileges.
* Platform context never silently grants organization access; organization context never grants platform access.
* Cross-tenant identifier lookups return safe not-found or scope-denied responses per security policy.

---

## 6. Pagination, Filtering, and Sorting

Default list pagination:

```text
page: 1
pageSize: 25
```

Maximum page size: `100`

Rules:

* Pagination is one-based.
* Every paginated list uses a stable deterministic sort.
* Default transactional sort is newest first.
* Supported filters must be explicitly documented per endpoint.
* Unknown filters are rejected.
* Sort fields use an allowlist.
* Search must remain organization scoped.
* Large-report streaming or asynchronous generation remains a later performance decision.

---

## 7. Date and Decimal Serialization

* Timestamps: ISO 8601 UTC strings (BSON dates stored in UTC).
* Date-only business values: validated `YYYY-MM-DD` strings (for example expiry dates).
* Organization timezone: IANA identifier used to derive business date; date-only values must not shift by timezone conversion.
* Money: decimal strings with two final posted places; currency `PKR`.
* Quantities: decimal strings; posted base quantities up to four decimal places.
* Conversion factors: decimal strings up to six decimal places.

---

## 8. Idempotency

Clients send `Idempotency-Key` for required mutating business actions listed in [DATA_MODEL.md](DATA_MODEL.md).

Scope:

```text
organization
authenticated actor
operation
idempotency key
```

Repeated equivalent requests return the original result. Conflicting reuse returns `IDEMPOTENCY_CONFLICT`.

---

## 9. Optimistic Concurrency

Mutable master-data updates require the expected `version`.

Stale updates return `VERSION_CONFLICT`.

Posted immutable records do not use normal PATCH.

---

## 10. Mutation Patterns

### 10.1 Master data

```text
POST   /resource
GET    /resource
GET    /resource/:id
PATCH  /resource/:id
```

Normal hard deletion is not required. Use archive/deactivate where business history requires references to remain valid.

### 10.2 Draft transactions

```text
POST   /sales
PATCH  /sales/:id
GET    /sales/:id
POST   /sales/:id/post
POST   /sales/:id/cancel
```

Equivalent patterns apply to purchases and appropriate transactions.

Rules:

* Action endpoints represent business transitions.
* Posted records do not use normal PATCH.
* Posted sales and purchases do not use DELETE.
* Reversal and correction endpoints require reason and authorization.
* Transaction action requests require idempotency.

### 10.3 Import workflow

```text
Create import job
→ upload/provide workbook
→ validate
→ retrieve preview and row errors
→ explicitly confirm
→ execute with idempotency
→ retrieve final result
```

Rules:

* Preview has no business posting effects.
* Execute invokes target-module services.
* Invalid rows are not silently skipped.
* Execution is logically all-or-nothing.
* Import APIs remain tenant scoped.
* Exact spreadsheet fields remain outside P1-05.

### 10.4 Reporting and export

* Report endpoints are read-only compositions owned by Reporting.
* Export endpoints require `reports.export`.
* Exports must remain tenant scoped and entitlement-checked.
* Asynchronous generation thresholds remain unresolved.

### 10.5 Platform API separation

Platform operations live under `/api/v1/platform/...` and use platform permissions only.

---

## 11. Subscription Requirement Labels

Used in the endpoint inventory:

| Label | Meaning |
| --- | --- |
| `none-public` | Unauthenticated or auth bootstrap; no subscription check |
| `none-auth` | Authenticated only; no organization subscription gate |
| `none-platform` | Platform authorization path; no org subscription gate |
| `billing-access` | Allowed in trial/active/grace/suspended for billing and status |
| `operational` | Requires trial, active, or grace entitlements |
| `operational+limit` | Operational plus applicable numeric plan-limit check |
| `entitlement:*` | Requires a named plan entitlement in addition to operational access |
| `suspended-read` | Historical view/export allowed under suspension policy where documented |

---

## 12. Endpoint Inventory

Each row: Method | Path | Purpose | Required permission | Tenant scope | Subscription | Idempotency | Transaction owner

Permission `—` means public or authentication-only with no action permission code. See [SECURITY_AUTHORIZATION.md](SECURITY_AUTHORIZATION.md).

### 12.1 Identity and Access

| Method | Path | Purpose | Required permission | Tenant scope | Subscription | Idempotency | Transaction owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/v1/auth/login` | Sign in | — | None | none-public | No | Identity and Access |
| POST | `/api/v1/auth/logout` | Sign out | — | Membership if present | none-auth | No | Identity and Access |
| GET | `/api/v1/auth/session` | Current session: active context, available contexts, effective role/permissions, branch/warehouse assignments, subscription access state | — | Membership-derived when org context | none-auth | No | Identity and Access |
| POST | `/api/v1/auth/session/context` | Select authorized active platform or organization membership context; rotates session id and CSRF | — | Verified membership or platform | none-auth | No | Identity and Access |
| POST | `/api/v1/auth/password-reset/request` | Request reset | — | None | none-public | No | Identity and Access |
| POST | `/api/v1/auth/password-reset/confirm` | Confirm reset | — | None | none-public | No | Identity and Access |
| POST | `/api/v1/auth/activate` | Consume one-time activation token; set initial password; activate eligible access | — | None | none-public | Yes | Identity and Access |
| POST | `/api/v1/auth/csrf` | Issue/refresh pre-auth or rotated CSRF token binding | — | None | none-public | No | Identity and Access |
| POST | `/api/v1/organization-activation-requests` | Submit public organization and initial Owner activation request | — | None | none-public | Yes | Platform coordinating Organizations, Identity and Access, Subscriptions, and Audit |

CSRF rules for browser-originated state-changing requests (including login, logout, account activation, password-reset confirmation, organization activation request, and all authenticated mutations):

* Pre-authentication CSRF context is issued before login or activation.
* CSRF token is rotated after login, activation, and context switch.
* Validate Origin or Referer on browser-originated state-changing requests.
* CSRF token and session cookie are separate values.
* Frontend JavaScript must never read the session cookie.
* Public activation and organization-request endpoints are rate limited.

### 12.2 Platform

| Method | Path | Purpose | Required permission | Tenant scope | Subscription | Idempotency | Transaction owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/platform/organizations` | List organizations | `platform.organizations.view` | Platform | none-platform | No | Platform |
| POST | `/api/v1/platform/organizations` | Create organization | `platform.organizations.create` | Platform | none-platform | Yes | Platform |
| GET | `/api/v1/platform/organizations/:id` | View organization | `platform.organizations.view` | Platform | none-platform | No | Platform |
| POST | `/api/v1/platform/organizations/:id/approve` | Approve organization/activation | `platform.organizations.approve` | Platform | none-platform | Yes | Platform |
| POST | `/api/v1/platform/organizations/:id/suspend` | Suspend organization access | `platform.organizations.suspend` | Platform | none-platform | Yes | Platform |
| GET | `/api/v1/platform/subscriptions` | Platform subscription overview | `platform.subscriptions.manage` | Platform | none-platform | No | Subscriptions |
| POST | `/api/v1/platform/subscriptions/:id/suspend` | Suspend subscription | `platform.subscriptions.manage` | Platform | none-platform | Yes | Subscriptions |
| POST | `/api/v1/platform/subscriptions/:id/reactivate` | Reactivate subscription | `platform.subscriptions.manage` | Platform | none-platform | Yes | Subscriptions |
| POST | `/api/v1/platform/subscriptions/:id/cancel` | Cancel subscription | `platform.subscriptions.manage` | Platform | none-platform | Yes | Subscriptions |
| POST | `/api/v1/platform/subscriptions/:id/change-plan` | Change subscription plan version | `platform.subscriptions.manage` | Platform | none-platform | Yes | Subscriptions |
| GET | `/api/v1/platform/billing-records` | List billing evidence | `platform.billing.verify` | Platform | none-platform | No | Subscriptions |
| GET | `/api/v1/platform/billing-records/:id` | View billing evidence | `platform.billing.verify` | Platform | none-platform | No | Subscriptions |
| POST | `/api/v1/platform/billing-records/:id/approve` | Approve billing evidence | `platform.billing.verify` | Platform | none-platform | Yes | Subscriptions |
| POST | `/api/v1/platform/billing-records/:id/reject` | Reject billing evidence | `platform.billing.verify` | Platform | none-platform | Yes | Subscriptions |
| GET | `/api/v1/platform/audit-events` | Platform audit query | `platform.audit.view` | Platform | none-platform | No | Audit |
| GET | `/api/v1/platform/operations/backups` | Backup status | `operations.backups.view` | Platform | none-platform | No | Operations |
| POST | `/api/v1/platform/operations/restores` | Execute restore coordination | `operations.restore.execute` | Platform | none-platform | Yes | Operations |
| GET | `/api/v1/platform/operations/restores/:id` | Restore operation status | `operations.restore.execute` | Platform | none-platform | No | Operations |

### 12.3 Organizations

| Method | Path | Purpose | Required permission | Tenant scope | Subscription | Idempotency | Transaction owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/organization` | View current organization | `organization.view` | Membership | billing-access | No | Organizations |
| PATCH | `/api/v1/organization` | Update organization profile | `organization.update` | Membership | operational | No | Organizations |

### 12.4 Subscriptions

| Method | Path | Purpose | Required permission | Tenant scope | Subscription | Idempotency | Transaction owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/subscription` | View subscription status/entitlements | `subscription.view` | Membership | billing-access | No | Subscriptions |
| GET | `/api/v1/subscription/plans` | List available plans | `subscription.view` | Membership | billing-access | No | Subscriptions |
| POST | `/api/v1/subscription/billing-records` | Submit payment evidence | `subscription.billing-evidence.submit` | Membership | billing-access | Yes | Subscriptions |
| GET | `/api/v1/subscription/billing-records` | List own billing records | `subscription.view` | Membership | billing-access | No | Subscriptions |
| GET | `/api/v1/subscription/billing-records/:id` | View own billing record | `subscription.view` | Membership | billing-access | No | Subscriptions |

### 12.5 Identity users and access (organization)

| Method | Path | Purpose | Required permission | Tenant scope | Subscription | Idempotency | Transaction owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/users` | List organization users | `users.view` | Membership | operational | No | Identity and Access |
| POST | `/api/v1/users` | Create employee membership in pending or active state according to credential status; when activation is required, return one-time activation token once for manual delivery | `users.create` | Membership | operational+limit | No | Identity and Access |
| GET | `/api/v1/users/:id` | View user membership | `users.view` | Membership | operational | No | Identity and Access |
| PATCH | `/api/v1/users/:id` | Update user/role | `users.update` | Membership | operational | No | Identity and Access |
| POST | `/api/v1/users/:id/deactivate` | Deactivate user | `users.deactivate` | Membership | operational | Yes | Identity and Access |
| PUT | `/api/v1/users/:id/access-assignments` | Assign branches/warehouses | `users.assign-access` | Membership | operational | No | Locations |

### 12.6 Locations

| Method | Path | Purpose | Required permission | Tenant scope | Subscription | Idempotency | Transaction owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/branches` | List branches | `branches.view` | Membership | operational | No | Locations |
| POST | `/api/v1/branches` | Create branch | `branches.manage` | Membership | operational+limit | No | Locations |
| GET | `/api/v1/branches/:id` | View branch | `branches.view` | Membership | operational | No | Locations |
| PATCH | `/api/v1/branches/:id` | Update branch / invoice prefix | `branches.manage` | Membership | operational | No | Locations |
| GET | `/api/v1/warehouses` | List warehouses | `warehouses.view` | Membership | operational | No | Locations |
| POST | `/api/v1/warehouses` | Create warehouse | `warehouses.manage` | Membership | operational+limit | No | Locations |
| GET | `/api/v1/warehouses/:id` | View warehouse | `warehouses.view` | Membership | operational | No | Locations |
| PATCH | `/api/v1/warehouses/:id` | Update warehouse | `warehouses.manage` | Membership | operational | No | Locations |

### 12.7 Catalog and Pricing

| Method | Path | Purpose | Required permission | Tenant scope | Subscription | Idempotency | Transaction owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/product-categories` | List categories | `catalog.view` | Membership | operational | No | Catalog and Pricing |
| POST | `/api/v1/product-categories` | Create category | `catalog.manage` | Membership | operational | No | Catalog and Pricing |
| GET | `/api/v1/product-categories/:id` | View category | `catalog.view` | Membership | operational | No | Catalog and Pricing |
| PATCH | `/api/v1/product-categories/:id` | Update category | `catalog.manage` | Membership | operational | No | Catalog and Pricing |
| GET | `/api/v1/products` | List products | `catalog.view` | Membership | operational | No | Catalog and Pricing |
| POST | `/api/v1/products` | Create product | `catalog.manage` | Membership | operational+limit | No | Catalog and Pricing |
| GET | `/api/v1/products/:id` | View product | `catalog.view` | Membership | operational | No | Catalog and Pricing |
| PATCH | `/api/v1/products/:id` | Update product | `catalog.manage` | Membership | operational | No | Catalog and Pricing |
| GET | `/api/v1/products/:id/packaging-units` | List packaging units | `catalog.view` | Membership | operational | No | Catalog and Pricing |
| PUT | `/api/v1/products/:id/packaging-units` | Replace packaging units | `catalog.manage` | Membership | operational | No | Catalog and Pricing |
| GET | `/api/v1/products/:id/prices` | List product prices | `pricing.view` | Membership | operational | No | Catalog and Pricing |
| PUT | `/api/v1/products/:id/prices` | Manage product prices | `pricing.manage` | Membership | operational | No | Catalog and Pricing |

### 12.8 Customers

| Method | Path | Purpose | Required permission | Tenant scope | Subscription | Idempotency | Transaction owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/customers` | List customers | `customers.view` | Membership | operational | No | Customers |
| POST | `/api/v1/customers` | Create customer | `customers.manage` | Membership | operational+limit | No | Customers |
| GET | `/api/v1/customers/:id` | View customer | `customers.view` | Membership | operational / suspended-read | No | Customers |
| PATCH | `/api/v1/customers/:id` | Update customer | `customers.manage` | Membership | operational | No | Customers |
| PATCH | `/api/v1/customers/:id/credit-policy` | Manage credit policy | `customers.credit-policy.manage` | Membership | operational | No | Customers |
| POST | `/api/v1/customers/:id/opening-balance` | Post opening receivable/advance | `customers.opening-balance.post` | Membership | operational | Yes | Payments and Ledgers (effects); Customers owns request facts |

### 12.9 Suppliers

| Method | Path | Purpose | Required permission | Tenant scope | Subscription | Idempotency | Transaction owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/suppliers` | List suppliers | `suppliers.view` | Membership | operational | No | Suppliers |
| POST | `/api/v1/suppliers` | Create supplier | `suppliers.manage` | Membership | operational+limit | No | Suppliers |
| GET | `/api/v1/suppliers/:id` | View supplier | `suppliers.view` | Membership | operational / suspended-read | No | Suppliers |
| PATCH | `/api/v1/suppliers/:id` | Update supplier | `suppliers.manage` | Membership | operational | No | Suppliers |
| POST | `/api/v1/suppliers/:id/opening-balance` | Post opening payable/advance | `suppliers.opening-balance.post` | Membership | operational | Yes | Payments and Ledgers (effects); Suppliers owns request facts |

### 12.10 Inventory

| Method | Path | Purpose | Required permission | Tenant scope | Subscription | Idempotency | Transaction owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/inventory/balances` | Query stock balances | `inventory.view` | Membership + warehouse scope | operational | No | Inventory |
| GET | `/api/v1/inventory/movements` | Query stock movements | `inventory.view` | Membership + warehouse scope | operational / suspended-read | No | Inventory |
| GET | `/api/v1/inventory/batches` | Query batches | `inventory.view` | Membership | operational | No | Inventory |
| GET | `/api/v1/inventory/batches/:id` | View batch | `inventory.view` | Membership | operational | No | Inventory |
| GET | `/api/v1/inventory/expiry` | Expiry-oriented inventory query | `inventory.expiry.view` | Membership | operational | No | Inventory |
| POST | `/api/v1/inventory/opening-stock` | Post opening stock | `inventory.opening-stock.post` | Membership + warehouse | operational | Yes | Inventory |
| GET | `/api/v1/stock-adjustments` | List adjustments | `inventory.view` | Membership | operational | No | Inventory |
| POST | `/api/v1/stock-adjustments` | Create adjustment draft | `inventory.adjust` | Membership + warehouse | operational | No | Inventory |
| GET | `/api/v1/stock-adjustments/:id` | View adjustment | `inventory.view` | Membership | operational | No | Inventory |
| PATCH | `/api/v1/stock-adjustments/:id` | Update adjustment draft | `inventory.adjust` | Membership | operational | No | Inventory |
| POST | `/api/v1/stock-adjustments/:id/post` | Post adjustment | `inventory.adjust` | Membership | operational | Yes | Inventory |
| POST | `/api/v1/stock-adjustments/:id/reverse` | Reverse posted adjustment | `inventory.adjust.reverse` | Membership | operational | Yes | Inventory |
| GET | `/api/v1/warehouse-transfers` | List transfers | `inventory.view` | Membership | operational | No | Inventory |
| POST | `/api/v1/warehouse-transfers` | Create transfer draft | `inventory.transfer` | Membership + warehouses | operational | No | Inventory |
| GET | `/api/v1/warehouse-transfers/:id` | View transfer | `inventory.view` | Membership | operational | No | Inventory |
| PATCH | `/api/v1/warehouse-transfers/:id` | Update transfer draft | `inventory.transfer` | Membership | operational | No | Inventory |
| POST | `/api/v1/warehouse-transfers/:id/post` | Post transfer | `inventory.transfer` | Membership | operational | Yes | Inventory |
| POST | `/api/v1/warehouse-transfers/:id/reverse` | Reverse posted transfer | `inventory.transfer.reverse` | Membership | operational | Yes | Inventory |

Negative-stock override is supplied on eligible posting payloads and requires `inventory.negative-stock.override` in addition to the posting permission. Price override on sales uses `pricing.override`.

### 12.11 Purchases

| Method | Path | Purpose | Required permission | Tenant scope | Subscription | Idempotency | Transaction owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/purchases` | List purchases | `purchases.view` | Membership | operational / suspended-read | No | Purchases |
| POST | `/api/v1/purchases` | Create purchase draft | `purchases.create` | Membership + warehouse | operational | No | Purchases |
| GET | `/api/v1/purchases/:id` | View purchase | `purchases.view` | Membership | operational / suspended-read | No | Purchases |
| PATCH | `/api/v1/purchases/:id` | Update purchase draft | `purchases.create` | Membership | operational | No | Purchases |
| POST | `/api/v1/purchases/:id/post` | Post purchase | `purchases.post` | Membership | operational | Yes | Purchases |
| POST | `/api/v1/purchases/:id/cancel` | Cancel posted purchase | `purchases.cancel` | Membership | operational | Yes | Purchases |

### 12.12 Sales

| Method | Path | Purpose | Required permission | Tenant scope | Subscription | Idempotency | Transaction owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/sales` | List sales | `sales.view` | Membership + branch | operational / suspended-read | No | Sales |
| POST | `/api/v1/sales` | Create sale draft | `sales.create` | Membership + branch/warehouse | operational | No | Sales |
| GET | `/api/v1/sales/:id` | View sale | `sales.view` | Membership | operational / suspended-read | No | Sales |
| PATCH | `/api/v1/sales/:id` | Update sale draft | `sales.create` | Membership | operational | No | Sales |
| POST | `/api/v1/sales/:id/post` | Post sale | `sales.post` | Membership | operational | Yes | Sales |
| POST | `/api/v1/sales/:id/cancel` | Cancel posted sale | `sales.cancel` | Membership | operational | Yes | Sales |
| POST | `/api/v1/sales/:id/returns` | Create sales-return draft linked to original sale; no posting until return is posted | `returns.post` | Membership | operational | No | Returns and Corrections |

Expired-stock sale approval requires `sales.expired-stock.approve`. Credit-limit override approval requires `sales.credit-limit.approve`. Manual price override requires `pricing.override`.

### 12.13 Payments and Ledgers

| Method | Path | Purpose | Required permission | Tenant scope | Subscription | Idempotency | Transaction owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/customer-payments` | List customer payments | `customer-payments.view` | Membership | operational / suspended-read | No | Payments and Ledgers |
| POST | `/api/v1/customer-payments` | Post customer payment | `customer-payments.post` | Membership | operational | Yes | Payments and Ledgers |
| GET | `/api/v1/customer-payments/:id` | View customer payment | `customer-payments.view` | Membership | operational / suspended-read | No | Payments and Ledgers |
| GET | `/api/v1/customers/:id/ledger` | Customer ledger history | `customer-payments.view` | Membership | operational / suspended-read | No | Payments and Ledgers |
| GET | `/api/v1/supplier-payments` | List supplier payments | `supplier-payments.view` | Membership | operational / suspended-read | No | Payments and Ledgers |
| POST | `/api/v1/supplier-payments` | Post supplier payment | `supplier-payments.post` | Membership | operational | Yes | Payments and Ledgers |
| GET | `/api/v1/supplier-payments/:id` | View supplier payment | `supplier-payments.view` | Membership | operational / suspended-read | No | Payments and Ledgers |
| GET | `/api/v1/suppliers/:id/ledger` | Supplier ledger history | `supplier-payments.view` | Membership | operational / suspended-read | No | Payments and Ledgers |
| POST | `/api/v1/payments/:id/correct` | Correct payment | `payments.correct` | Membership | operational | Yes | Payments and Ledgers |

### 12.14 Accounts and Expenses

| Method | Path | Purpose | Required permission | Tenant scope | Subscription | Idempotency | Transaction owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/accounts` | List accounts | `accounts.view` | Membership | operational / suspended-read | No | Accounts and Expenses |
| POST | `/api/v1/accounts` | Create account | `accounts.manage` | Membership | operational | No | Accounts and Expenses |
| GET | `/api/v1/accounts/:id` | View account | `accounts.view` | Membership | operational / suspended-read | No | Accounts and Expenses |
| PATCH | `/api/v1/accounts/:id` | Update account | `accounts.manage` | Membership | operational | No | Accounts and Expenses |
| POST | `/api/v1/accounts/:id/opening-balance` | Post opening account balance | `accounts.opening-balance.post` | Membership | operational | Yes | Accounts and Expenses |
| GET | `/api/v1/accounts/:id/movements` | Account movement history | `accounts.view` | Membership | operational / suspended-read | No | Accounts and Expenses |
| POST | `/api/v1/account-transactions` | Post one authorized manual account inflow or outflow; creates one signed account movement | `accounts.transaction.post` | Membership | operational | Yes | Accounts and Expenses |
| GET | `/api/v1/account-transactions/:id` | View manual account transaction | `accounts.view` | Membership | operational / suspended-read | No | Accounts and Expenses |
| POST | `/api/v1/account-transactions/:id/reverse` | Reverse manual account transaction | `accounts.transaction.correct` | Membership | operational | Yes | Accounts and Expenses |
| POST | `/api/v1/account-transfers` | Post account transfer | `accounts.transfer` | Membership | operational | Yes | Accounts and Expenses |
| POST | `/api/v1/account-transfers/:id/reverse` | Reverse account transfer (both linked movements atomically) | `accounts.transfer.reverse` | Membership | operational | Yes | Accounts and Expenses |
| GET | `/api/v1/expense-categories` | List expense categories | `expenses.view` | Membership | operational | No | Accounts and Expenses |
| POST | `/api/v1/expense-categories` | Create expense category | `expenses.post` | Membership | operational | No | Accounts and Expenses |
| PATCH | `/api/v1/expense-categories/:id` | Update expense category | `expenses.post` | Membership | operational | No | Accounts and Expenses |
| GET | `/api/v1/expenses` | List expenses | `expenses.view` | Membership | operational / suspended-read | No | Accounts and Expenses |
| POST | `/api/v1/expenses` | Create expense draft | `expenses.post` | Membership | operational | No | Accounts and Expenses |
| GET | `/api/v1/expenses/:id` | View expense | `expenses.view` | Membership | operational / suspended-read | No | Accounts and Expenses |
| PATCH | `/api/v1/expenses/:id` | Update expense draft | `expenses.post` | Membership | operational | No | Accounts and Expenses |
| POST | `/api/v1/expenses/:id/post` | Post expense | `expenses.post` | Membership | operational | Yes | Accounts and Expenses |
| POST | `/api/v1/expenses/:id/correct` | Correct expense | `expenses.correct` | Membership | operational | Yes | Accounts and Expenses |

### 12.15 Returns and Corrections

| Method | Path | Purpose | Required permission | Tenant scope | Subscription | Idempotency | Transaction owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/returns` | List returns | `returns.view` | Membership | operational / suspended-read | No | Returns and Corrections |
| POST | `/api/v1/returns` | Create return draft | `returns.post` | Membership | operational | No | Returns and Corrections |
| POST | `/api/v1/returns/without-invoice` | Create return-without-invoice draft | `returns.post` | Membership | operational | No | Returns and Corrections |
| GET | `/api/v1/returns/:id` | View return | `returns.view` | Membership | operational / suspended-read | No | Returns and Corrections |
| PATCH | `/api/v1/returns/:id` | Update return draft | `returns.post` | Membership | operational | No | Returns and Corrections |
| POST | `/api/v1/returns/:id/post` | Post return | `returns.post` | Membership | operational | Yes | Returns and Corrections |
| POST | `/api/v1/returns/:id/reverse` | Reverse posted return | `returns.reverse` | Membership | operational | Yes | Returns and Corrections |
| POST | `/api/v1/purchases/:id/returns` | Create purchase-return draft linked to purchase | `returns.post` + `purchases.return` | Membership | operational | No | Returns and Corrections |

Additive permissions on return posting:

* Linked sales return: `returns.post`
* Linked purchase return: `returns.post` plus `purchases.return`
* Return without invoice: `returns.post` plus `returns.without-invoice.approve` (required at post)
* Reversal: `returns.reverse`

Every reversal endpoint requires idempotency, reason, audit, preserves the original, posts opposite signed effects, rejects duplicate reversal, and uses the source-owning module’s transaction boundary.

There is no public generic `/corrective-transactions` endpoint. `corrective_transactions` is not a generic public CRUD resource.

### 12.16 Alerts

| Method | Path | Purpose | Required permission | Tenant scope | Subscription | Idempotency | Transaction owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/alerts` | List alert queries/results | `alerts.view` | Membership | operational | No | Alerts |
| GET | `/api/v1/notifications` | List notification presentation items | `alerts.view` | Membership | operational | No | Alerts |
| POST | `/api/v1/notifications/:id/acknowledge` | Acknowledge notification | `alerts.view` | Membership | operational | No | Alerts |

### 12.17 Reporting

| Method | Path | Purpose | Required permission | Tenant scope | Subscription | Idempotency | Transaction owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/dashboard` | Dashboard composition | `dashboard.view` | Membership | operational | No | Reporting |
| GET | `/api/v1/reports/:reportKey` | Fixed report query | `reports.view` | Membership | operational / entitlement:reports / suspended-read | No | Reporting |
| POST | `/api/v1/reports/:reportKey/export` | Export report | `reports.export` | Membership | operational / entitlement:exports / suspended-read | No | Reporting |

Exact report keys and columns remain unresolved.

### 12.18 Imports

| Method | Path | Purpose | Required permission | Tenant scope | Subscription | Idempotency | Transaction owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/v1/imports` | Create import job | `imports.preview` | Membership | operational / entitlement:imports | No | Imports |
| POST | `/api/v1/imports/:id/upload` | Upload workbook | `imports.preview` | Membership | operational / entitlement:imports | No | Imports |
| POST | `/api/v1/imports/:id/validate` | Validate import | `imports.preview` | Membership | operational / entitlement:imports | No | Imports |
| GET | `/api/v1/imports/:id` | Retrieve job/preview status | `imports.preview` | Membership | operational / entitlement:imports | No | Imports |
| GET | `/api/v1/imports/:id/errors` | Retrieve row errors | `imports.preview` | Membership | operational / entitlement:imports | No | Imports |
| POST | `/api/v1/imports/:id/confirm` | Confirm preview | `imports.execute` | Membership | operational / entitlement:imports | No | Imports |
| POST | `/api/v1/imports/:id/execute` | Execute import | `imports.execute` | Membership | operational / entitlement:imports | Yes | Imports |

### 12.19 Audit

| Method | Path | Purpose | Required permission | Tenant scope | Subscription | Idempotency | Transaction owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/audit-events` | Query organization audit events | `audit.view` | Membership | operational / entitlement:audit-history / suspended-read | No | Audit |
| GET | `/api/v1/audit-events/:id` | View audit event | `audit.view` | Membership | operational / entitlement:audit-history / suspended-read | No | Audit |

### 12.20 Settings

| Method | Path | Purpose | Required permission | Tenant scope | Subscription | Idempotency | Transaction owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/settings` | View residual organization settings | `settings.view` | Membership | operational | No | Settings |
| PATCH | `/api/v1/settings` | Update residual organization settings | `settings.manage` | Membership | operational | No | Settings |

### 12.21 Operations (organization-visible health where applicable)

| Method | Path | Purpose | Required permission | Tenant scope | Subscription | Idempotency | Transaction owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/health` | Minimal public liveness only; must not expose database topology, connection strings, collection names, dependency internals, backup status, version secrets, or environment configuration | — | None | none-public | No | Operations |

Backup status and restore execution remain platform-only (section 12.2). Detailed readiness and dependency health remain private operational monitoring concerns.

### 12.22 Inventory count summary

| Metric | Value |
| --- | --- |
| Endpoint rows documented | 157 |
| Canonical modules covered | 20 / 20 |
| Endpoints requiring Idempotency-Key | 38 |
| Protected endpoints without permission mapping | 0 (auth/public marked `—`) |

---

## 13. API Permission Mapping Rules

* Every protected business endpoint maps to one or more real permission codes.
* The permission column contains only real permission identifiers, or `—` for explicitly public/auth-only endpoints.
* Approval permissions are additive to action permissions.
* Frontend route hiding is not authorization.
* Platform permissions never auto-grant organization permissions.
* Subscription labels document entitlement gates separately from permissions.
* Opening-balance posting uses dedicated permissions, not broad master-data manage permissions.

---

## 14. API Contract Testing Expectations

Future tests must cover:

* Envelope shape for success and error
* Auth required vs public routes
* Permission denial
* Tenant scope denial
* Branch and warehouse scope denial
* Subscription restriction
* Validation rejection of unknown filters
* Version conflict
* Idempotency replay and conflict
* Decimal and date serialization
* Import preview has no posting side effects
* Platform route separation

P1-05 does not create contract tests or TypeScript contract packages.

---

## 15. Controlled Unresolved API Details

| Item | Assigned to |
| --- | --- |
| Exact report keys and columns | Later report specification |
| Exact import spreadsheet columns | Later import specification |
| Exact export generation threshold | Implementation |
| Exact import upload size | Implementation |
| Exact framework/package versions | P1-06 / implementation |

---

## 16. Traceability

| Endpoint group | Owning module | Permission domain | Subscription requirement | Transaction owner |
| --- | --- | --- | --- | --- |
| Auth/session/reset | Identity and Access | — / auth | none-public / none-auth | Identity and Access |
| Platform org/billing/ops | Platform / Subscriptions / Operations / Audit | `platform.*`, `operations.*` | none-platform | Owning module |
| Organization profile | Organizations | `organization.*` | billing-access / operational | Organizations |
| Subscription/billing evidence | Subscriptions | `subscription.*` | billing-access | Subscriptions |
| Users/access | Identity and Access / Locations | `users.*` | operational(+limit) | Identity / Locations |
| Branches/warehouses | Locations | `branches.*`, `warehouses.*` | operational(+limit) | Locations |
| Catalog/pricing | Catalog and Pricing | `catalog.*`, `pricing.*` | operational(+limit) | Catalog and Pricing |
| Customers/suppliers | Customers / Suppliers | `customers.*`, `suppliers.*` | operational(+limit) | Customers / Suppliers |
| Inventory | Inventory | `inventory.*` | operational | Inventory |
| Purchases/sales | Purchases / Sales | `purchases.*`, `sales.*` | operational | Purchases / Sales |
| Payments/ledgers | Payments and Ledgers | `*-payments.*`, `payments.correct` | operational | Payments and Ledgers |
| Accounts/expenses | Accounts and Expenses | `accounts.*`, `expenses.*` | operational | Accounts and Expenses |
| Returns/corrections | Returns and Corrections | `returns.*`, `purchases.return` | operational | Returns and Corrections |
| Alerts | Alerts | `alerts.view` | operational | Alerts |
| Dashboard/reports | Reporting | `dashboard.view`, `reports.*` | operational + entitlements | Reporting |
| Imports | Imports | `imports.*` | operational + entitlement | Imports |
| Audit | Audit | `audit.view` | operational + entitlement | Audit |
| Settings | Settings | `settings.*` | operational | Settings |
| Health | Operations | — | none-public | Operations |

---

## 17. Document Control

* Frozen requirements define product scope.
* Frozen Business Rules define calculations and behaviour.
* Frozen architecture defines module ownership and dependencies.
* This document defines implementation-ready API contracts.
* This document does not create Express routes, controllers, or contract packages.
