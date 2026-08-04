# Security and Authorization

Document status: Frozen for Release 1  
Current version: 1.0  
Last updated: 2026-08-04  
Approval status: Approved for implementation planning

## Document Authority

| Concern | Authoritative document |
| --- | --- |
| Product scope and NFRs | Frozen [PRD.md](PRD.md) |
| Access business rules | Frozen [BUSINESS_RULES.md](BUSINESS_RULES.md) |
| Module ownership | Frozen [MODULE_BOUNDARIES.md](MODULE_BOUNDARIES.md) |
| API endpoint permission mapping | [API_DESIGN.md](API_DESIGN.md) |
| Subscription entitlement gates | [SUBSCRIPTION_AND_BILLING.md](SUBSCRIPTION_AND_BILLING.md) |
| Authentication, sessions, permissions, security controls | This document |

Frozen requirements define product scope. Frozen Business Rules define calculations and behaviour. Frozen architecture defines module ownership and dependencies. P1-05 defines implementation-ready technical contracts. P1-05 does not create implementation.

---

## 1. Authentication Strategy

Release 1 uses server-managed opaque sessions for the browser application.

### 1.1 Session transport

* Opaque session token
* Secure cookie
* `HttpOnly`
* `Secure` in production
* `SameSite=Lax`
* Session token stored hashed in the database
* Session identifier rotated after login, activation, context switch, and sensitive privilege changes
* Frontend JavaScript must not read the session token or session cookie

Do not use local-storage authentication tokens.

### 1.1a Explicit session context

A global user may belong to more than one organization or may have platform access.

Every authenticated session must have one explicit active context: `platform` or organization membership.

The session record must store, where applicable:

```text
activeContextType
activeMembershipId
activeOrganizationId
```

Rules:

* The caller may select only a context they are authorized to use.
* Supplying an organization identifier on context switch is only a context-selection request.
* The server verifies the corresponding active membership.
* Normal business APIs still never trust a client-supplied organization ID.
* Context change rotates the session identifier and CSRF token.
* Platform context never silently grants organization access.
* Organization context never grants platform access.
* `GET /api/v1/auth/session` returns active context, available authorized contexts, effective role and permissions, branch and warehouse assignments, and subscription access state where applicable.

### 1.2 Session defaults

| Setting | Release 1 default |
| --- | --- |
| Inactivity timeout | 30 minutes |
| Absolute session lifetime | 12 hours |
| Remember me | Not included |

Session values remain configurable through secure server configuration; these are the Release 1 defaults.

### 1.3 Session invalidation

* Password reset invalidates all existing sessions
* User deactivation invalidates all sessions
* Permission, role, or membership changes invalidate affected sessions
* Organization suspension restricts session capabilities immediately

### 1.4 Account activation

* One-time activation tokens are stored hashed in `account_activation_tokens`.
* Default expiry is 24 hours and remains securely configurable.
* Successful activation consumes the token, sets the initial password, and activates eligible access.
* Plaintext activation tokens are returned only once for manual or approved out-of-band delivery and are never logged or persisted.
* Automated email delivery is not introduced in Release 1.

---

## 2. Password and Reset Policy

### 2.1 Password policy

* Minimum 12 characters
* Maximum 128 characters
* Allow passphrases
* Do not require arbitrary uppercase/lowercase/symbol composition rules
* Reject known-common or compromised passwords where supported
* Store passwords using Argon2id
* Never log passwords
* Never return password hashes

### 2.2 Password reset

* Single-use random token
* Store only token hash
* Expiry: 30 minutes
* Successful reset invalidates all sessions
* Reset responses must not reveal whether an email exists
* Reset actions are rate limited and audited where appropriate

Two-factor authentication is not included in Release 1.

A future 2FA introduction requires a controlled scope/security decision.

---

## 3. CSRF, CORS, and Security Headers

Because Release 1 uses cookie sessions:

* A pre-authentication CSRF context is issued before login or activation (`POST /api/v1/auth/csrf`, subscription label `none-public`).
* State-changing requests require CSRF protection, including login, logout, account activation, password-reset confirmation, organization activation request, and all authenticated mutations.
* CSRF tokens must be bound to the session context (pre-auth or authenticated).
* The CSRF token is rotated after login, activation, and context switch.
* CSRF token and session cookie are separate values.
* Frontend JavaScript must never read the session cookie.
* Validate Origin or Referer on browser-originated state-changing requests.
* CORS uses an explicit allowlist.
* Credentials are not permitted from arbitrary origins.
* Production must enforce HTTPS.

Security headers must include an approved baseline for:

* Content Security Policy
* Frame protection
* Content-type sniffing protection
* Referrer policy
* Permissions policy
* HSTS in production

Exact header values may be finalized during implementation hardening without weakening these requirements.

---

## 4. Rate Limiting

Apply stricter rate limits to:

* Login
* Password reset
* Account activation
* Organization activation request
* Billing-evidence submission
* Import upload
* Export generation
* Platform approval actions

Use progressive throttling for repeated authentication failures.

Do not permanently lock legitimate users through an unaudited automatic rule.

Exact numeric limits remain implementation configuration, but security tests must verify throttling exists.

---

## 5. Input Validation Boundaries

* Routes validate request shape, required fields, and basic formats before controllers.
* Validation must not replace domain rules in services.
* Unknown filters and disallowed sort fields are rejected.
* File uploads for imports are size- and type-constrained (exact limits unresolved).
* Clients never supply authoritative tenant context for normal organization APIs.

---

## 6. Authorization Model

Authorization consists of separate checks:

```text
authentication
organization scope
subscription entitlement
permission
branch assignment
warehouse assignment
business approval
```

Rules:

* Role names provide default permission bundles.
* Backend authorization uses permission codes.
* Direct role-name checks are prohibited except documented Super Admin platform boundaries.
* Frontend permission checks are usability only.
* Every protected endpoint maps to a permission.
* Every branch or warehouse endpoint validates assignment.
* Business approval does not replace permission.
* Permission does not bypass credit, stock, expiry, or other business rules.

---

## 7. Permission Naming

Use:

```text
<domain>.<action>
```

Examples:

```text
sales.view
sales.create
sales.post
sales.cancel
sales.expired-stock.approve
sales.credit-limit.approve
inventory.view
inventory.adjust
inventory.transfer
inventory.negative-stock.override
```

Permission identifiers are stable public authorization contracts.

Do not use route names or controller names as permissions.

---

## 8. Permission Catalog

Canonical permissions (unique identifiers):

### 8.1 Platform

```text
platform.organizations.view
platform.organizations.create
platform.organizations.approve
platform.organizations.suspend
platform.subscriptions.manage
platform.billing.verify
platform.audit.view
operations.backups.view
operations.restore.execute
```

### 8.2 Organization and users

```text
organization.view
organization.update
users.view
users.create
users.update
users.deactivate
users.assign-access
branches.view
branches.manage
warehouses.view
warehouses.manage
settings.view
settings.manage
```

### 8.3 Subscription

```text
subscription.view
subscription.billing-evidence.submit
```

### 8.4 Catalog

```text
catalog.view
catalog.manage
pricing.view
pricing.manage
pricing.override
```

### 8.5 Customers and suppliers

```text
customers.view
customers.manage
customers.credit-policy.manage
customers.opening-balance.post
suppliers.view
suppliers.manage
suppliers.opening-balance.post
```

### 8.6 Inventory

```text
inventory.view
inventory.opening-stock.post
inventory.adjust
inventory.adjust.reverse
inventory.transfer
inventory.transfer.reverse
inventory.negative-stock.override
inventory.expiry.view
```

### 8.7 Purchases

```text
purchases.view
purchases.create
purchases.post
purchases.cancel
purchases.return
```

### 8.8 Sales

```text
sales.view
sales.create
sales.post
sales.cancel
sales.expired-stock.approve
sales.credit-limit.approve
```

### 8.9 Payments and accounts

```text
customer-payments.view
customer-payments.post
supplier-payments.view
supplier-payments.post
payments.correct
accounts.view
accounts.manage
accounts.transfer
accounts.transfer.reverse
accounts.transaction.post
accounts.transaction.correct
accounts.opening-balance.post
expenses.view
expenses.post
expenses.correct
```

### 8.10 Returns

```text
returns.view
returns.post
returns.without-invoice.approve
returns.reverse
```

### 8.11 Reports and alerts

```text
alerts.view
dashboard.view
reports.view
reports.export
```

### 8.12 Imports and audit

```text
imports.preview
imports.execute
audit.view
```

**Permission count:** 81 unique identifiers.

---

## 9. Default Role Bundles

Matrix values:

```text
A = included automatically by the role bundle
C = not included automatically; may be explicitly granted to that membership
N = not available to that role
P = platform-context permission only
```

`organization_memberships` must support `role`, `conditionalPermissionGrants`, and `status`.

Rules:

* Only permissions marked `C` may appear in `conditionalPermissionGrants`.
* `N` permissions cannot be granted to that role.
* `P` permissions cannot be granted in organization context.
* Platform restore permission requires an explicit operational grant and is not automatically available to every platform user.
* Permission, role, or membership changes invalidate affected sessions.
* Do not add arbitrary permission denials in Release 1.

### 9.0 Owner-presence invariant

Every active organization must retain at least one active Owner.

* Deactivating the last active Owner is prohibited.
* Demoting or removing the last active Owner is prohibited.
* Owner-presence validation occurs in the same transaction as membership changes.
* Multiple-Owner policy remains controlled and unresolved.
* P1-05 must not silently permit or prohibit multiple active Owners beyond preserving at least one.
* Role changes to or from Owner must follow the later-approved multiple-Owner policy.

### 9.1 Super Admin

Platform-scoped permissions only, including:

* Organization approval
* Platform subscription management
* Billing verification
* Platform audit
* Backup status
* Controlled restore authorization where operationally assigned

Super Admin does not automatically act as an organization user.

### 9.2 Owner

Default organization-wide access to all organization permissions, including users, access, branches, warehouses, catalog, customers, suppliers, inventory, sales, purchases, payments, accounts, expenses, returns, reports, imports, audit, settings, negative-stock override, and required business approvals.

Owner has no platform permissions.

### 9.3 Manager

Operational management permissions, including catalog, customers, suppliers, inventory and transfers, purchases and sales, payments and accounts, expenses, returns, reports and exports, expired-sale approval, credit-limit approval, and return-without-invoice approval.

Manager must not:

* Manage Owners
* Approve organizations
* Manage platform subscriptions
* Execute production restore
* Use negative-stock override unless separately granted

### 9.4 Cashier

Default access to view catalog and stock availability, create and post sales, create customers where permitted, post customer payments, view limited customer ledger information, print invoices and receipts, and view dashboard information required for POS work.

Cashier must not by default:

* Cancel posted sales
* Approve expired sales
* Approve credit-limit overrides
* Post purchases
* Adjust stock
* Transfer stock
* Manage supplier payments
* Manage accounts
* View full audit history

### 9.5 Store Keeper

Default access to catalog and inventory view, opening stock where specifically assigned, purchases, purchase returns, batch and expiry operations, stock adjustments where granted, warehouse transfers, and supplier view.

Store Keeper must not by default:

* Post sales
* Receive customer payments
* Manage customer credit
* Manage organization settings
* View unrestricted financial reports

### 9.6 Permission matrix

| Permission | Super Admin | Owner | Manager | Cashier | Store Keeper |
| --- | --- | --- | --- | --- | --- |
| `platform.organizations.view` | P | N | N | N | N |
| `platform.organizations.create` | P | N | N | N | N |
| `platform.organizations.approve` | P | N | N | N | N |
| `platform.organizations.suspend` | P | N | N | N | N |
| `platform.subscriptions.manage` | P | N | N | N | N |
| `platform.billing.verify` | P | N | N | N | N |
| `platform.audit.view` | P | N | N | N | N |
| `operations.backups.view` | P | N | N | N | N |
| `operations.restore.execute` | P | N | N | N | N |
| `organization.view` | N | A | A | A | A |
| `organization.update` | N | A | N | N | N |
| `users.view` | N | A | A | N | N |
| `users.create` | N | A | N | N | N |
| `users.update` | N | A | N | N | N |
| `users.deactivate` | N | A | N | N | N |
| `users.assign-access` | N | A | N | N | N |
| `branches.view` | N | A | A | A | A |
| `branches.manage` | N | A | N | N | N |
| `warehouses.view` | N | A | A | A | A |
| `warehouses.manage` | N | A | N | N | N |
| `settings.view` | N | A | A | N | N |
| `settings.manage` | N | A | N | N | N |
| `subscription.view` | N | A | A | A | A |
| `subscription.billing-evidence.submit` | N | A | N | N | N |
| `catalog.view` | N | A | A | A | A |
| `catalog.manage` | N | A | A | N | N |
| `pricing.view` | N | A | A | A | A |
| `pricing.manage` | N | A | A | N | N |
| `pricing.override` | N | A | A | C | N |
| `customers.view` | N | A | A | A | N |
| `customers.manage` | N | A | A | C | N |
| `customers.credit-policy.manage` | N | A | A | N | N |
| `customers.opening-balance.post` | N | A | C | N | N |
| `suppliers.view` | N | A | A | N | A |
| `suppliers.manage` | N | A | A | N | N |
| `suppliers.opening-balance.post` | N | A | C | N | N |
| `inventory.view` | N | A | A | A | A |
| `inventory.opening-stock.post` | N | A | A | N | C |
| `inventory.adjust` | N | A | A | N | C |
| `inventory.adjust.reverse` | N | A | A | N | C |
| `inventory.transfer` | N | A | A | N | A |
| `inventory.transfer.reverse` | N | A | A | N | C |
| `inventory.negative-stock.override` | N | A | N | N | N |
| `inventory.expiry.view` | N | A | A | A | A |
| `purchases.view` | N | A | A | N | A |
| `purchases.create` | N | A | A | N | A |
| `purchases.post` | N | A | A | N | A |
| `purchases.cancel` | N | A | A | N | N |
| `purchases.return` | N | A | A | N | A |
| `sales.view` | N | A | A | A | N |
| `sales.create` | N | A | A | A | N |
| `sales.post` | N | A | A | A | N |
| `sales.cancel` | N | A | A | N | N |
| `sales.expired-stock.approve` | N | A | A | N | N |
| `sales.credit-limit.approve` | N | A | A | N | N |
| `customer-payments.view` | N | A | A | A | N |
| `customer-payments.post` | N | A | A | A | N |
| `supplier-payments.view` | N | A | A | N | N |
| `supplier-payments.post` | N | A | A | N | N |
| `payments.correct` | N | A | A | N | N |
| `accounts.view` | N | A | A | N | N |
| `accounts.manage` | N | A | A | N | N |
| `accounts.transfer` | N | A | A | N | N |
| `accounts.transfer.reverse` | N | A | A | N | N |
| `accounts.transaction.post` | N | A | A | N | N |
| `accounts.transaction.correct` | N | A | A | N | N |
| `accounts.opening-balance.post` | N | A | C | N | N |
| `expenses.view` | N | A | A | N | N |
| `expenses.post` | N | A | A | N | N |
| `expenses.correct` | N | A | A | N | N |
| `returns.view` | N | A | A | C | C |
| `returns.post` | N | A | A | C | C |
| `returns.without-invoice.approve` | N | A | A | N | N |
| `returns.reverse` | N | A | A | N | C |
| `alerts.view` | N | A | A | A | A |
| `dashboard.view` | N | A | A | A | C |
| `reports.view` | N | A | A | N | N |
| `reports.export` | N | A | A | N | N |
| `imports.preview` | N | A | A | N | C |
| `imports.execute` | N | A | A | N | N |
| `audit.view` | N | A | C | N | N |

Role-matrix coverage: all 81 permissions × 5 roles documented.

---

## 10. Approval Versus Permission

* Permission grants the ability to attempt an action.
* Business approval is an additional gate for restricted cases (expired stock, credit limit, return without invoice, negative stock override, duplicate supplier-reference override).
* Approval does not replace the underlying action permission.
* Approval actors, reasons, and timestamps are audited where required by BR-AUDIT rules.

---

## 11. Subscription Entitlement Enforcement

* Entitlements are evaluated on the backend from subscription and plan data.
* Frontend hiding is not enforcement.
* Soft warning occurs before applicable hard limit where configured.
* Hard limit blocks only new creation.
* Existing records remain accessible.
* Limits must not delete data.
* Detailed plan states and billing workflow live in [SUBSCRIPTION_AND_BILLING.md](SUBSCRIPTION_AND_BILLING.md).

---

## 12. Tenant, Branch, and Warehouse Enforcement

* Normal organization APIs derive organization context from the authenticated active membership.
* Organization users cannot choose another organization through request data on business APIs.
* Context selection verifies authorized membership before changing active context.
* Platform APIs use an explicit platform authorization path.
* Every referenced branch must belong to the authenticated organization.
* Every referenced warehouse must belong to the authenticated organization.
* Assigned branch/warehouse access is validated before business execution.
* Record lookup by ID verifies organization ownership.
* Cross-tenant IDs produce a safe not-found or scope-denied response according to security policy.
* Imports, reports, exports, audit, and background operations remain tenant scoped.
* Platform access must not silently bypass normal tenant rules.

---

## 13. Audit Requirements

Sensitive operations must record organization, actor, timestamp, action, affected business record, source transaction, reason where required, approval actor where applicable, and link to corrective transaction where applicable.

Mandatory audit categories include price override, credit-limit override, expired-product sale, negative-stock override, opening balances, stock adjustment, return without invoice, payment correction, expense correction, cancellation, reversal, subscription change, duplicate supplier-reference override, and restore operation.

Audit records and technical logs remain separate.

---

## 14. Sensitive-Data Handling and Logging Restrictions

Do not log:

* Passwords
* Session tokens
* Password-reset tokens
* CSRF secrets
* Database connection strings
* Full payment evidence
* Unnecessary identity documents
* Full request bodies for sensitive endpoints

Logs may contain, where safe:

* Request ID
* Organization ID
* Actor ID
* Module
* Operation
* Safe error code
* Outcome
* Duration
* Transaction ID

---

## 15. Backup and Restore Authorization

* Standard organization users cannot restore production data.
* Backup status is visible only to authorized platform operators.
* Restore execution requires `operations.restore.execute`.
* Restore requires controlled operational procedure.
* Restore requires verification before normal operations resume.
* Emergency direct database repair is not a normal business workflow.
* Emergency repair requires incident authorization, recovery plan, incident record, and reconciliation.
* Business transactions must not be edited directly through operational database access.

---

## 16. Security Testing Expectations

Define future tests for:

* Password hashing
* Login throttling
* Session expiration
* Session invalidation
* Cookie attributes
* CSRF rejection
* CORS allowlist
* Permission enforcement
* Tenant isolation
* Cross-tenant indirect-reference rejection
* Branch scope
* Warehouse scope
* Subscription entitlement
* Plan limits
* Business approval separation
* Reset-token single use
* Billing approval idempotency
* Sensitive logging restrictions
* Restore authorization
* Role default bundles
* Platform versus organization separation

P1-05 does not create tests.

---

## 17. Controlled Unresolved Security Details

| Item | Assigned to |
| --- | --- |
| Exact authentication rate-limit numbers | Implementation hardening |
| Exact security header values | Implementation hardening |
| Exact log-retention period | Deployment |
| Exact idempotency-record retention period | Implementation / security |
| Backup provider and restore runbooks | Deployment / operations |
| Monitoring provider | Deployment |
| Future 2FA | Controlled scope/security decision |

Do not invent values.

---

## 18. Traceability

| Security control | Relevant NFR / FR | Enforced layer | Required test category |
| --- | --- | --- | --- |
| Opaque HttpOnly session cookies | FR-AUTH-001/009/010, NFR-SEC-007 | Identity and Access / API middleware | Cookie attributes; session expiration/invalidation |
| Password hashing Argon2id | FR-AUTH-001/003 | Identity and Access | Password hashing |
| Password reset single-use TTL | FR-AUTH-003 | Identity and Access | Reset-token single use |
| CSRF on state-changing requests | NFR-SEC-* (session cookie auth) | API middleware | CSRF rejection |
| CORS allowlist | NFR-SEC-* | API middleware | CORS allowlist |
| Rate limiting | NFR-SEC-* | API middleware | Login throttling |
| Permission-based authorization | FR-AUTH-005/007/008, FR-USER-004 | API middleware + services | Permission enforcement; role default bundles |
| Tenant isolation | FR-PLATFORM-004, BR-ORG-001/002, NFR-SEC-001 | Repository + services | Tenant isolation; cross-tenant rejection |
| Branch/warehouse scope | FR-AUTH-006, BR-ORG-005 | Services | Branch scope; warehouse scope |
| Subscription entitlements | FR-SUB-007..010 | Services | Subscription entitlement; plan limits |
| Approval vs permission | FR-AUTH-005, BR-SALE/BATCH/RETURN | Services | Business approval separation |
| Sensitive logging | NFR-SEC-* | Logging pipeline | Sensitive logging restrictions |
| Backup/restore auth | FR-SETTINGS-002..005, NFR-BACKUP-* | Platform Operations | Restore authorization |
| Platform vs organization separation | FR-AUTH-008, FR-PLATFORM-* | Routes + auth context | Platform versus organization separation |

---

## 19. Document Control

* Frozen requirements define product scope.
* Frozen Business Rules define calculations and behaviour.
* Frozen architecture defines module ownership and dependencies.
* This document defines implementation-ready security and authorization contracts.
* This document does not create authentication code, middleware, or tests.
