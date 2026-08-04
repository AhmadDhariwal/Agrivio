# Data Model

Document status: Frozen for Release 1  
Current version: 1.0  
Last updated: 2026-08-04  
Approval status: Approved for implementation planning

## Document Authority

| Concern | Authoritative document |
| --- | --- |
| Product scope | Frozen [PRD.md](PRD.md) |
| Business behaviour and formulas | Frozen [BUSINESS_RULES.md](BUSINESS_RULES.md) |
| Domain terminology | Frozen [DOMAIN_GLOSSARY.md](DOMAIN_GLOSSARY.md) |
| Module ownership and dependencies | Frozen [MODULE_BOUNDARIES.md](MODULE_BOUNDARIES.md) |
| System architecture | Frozen [ARCHITECTURE.md](ARCHITECTURE.md) |
| Data model, indexes, transactions, concurrency | This document |
| API contracts | [API_DESIGN.md](API_DESIGN.md) |
| Security and authorization | [SECURITY_AUTHORIZATION.md](SECURITY_AUTHORIZATION.md) |
| Subscription and billing | [SUBSCRIPTION_AND_BILLING.md](SUBSCRIPTION_AND_BILLING.md) |

Frozen requirements define product scope. Frozen Business Rules define calculations and behaviour. Frozen architecture defines module ownership and dependencies. P1-05 defines implementation-ready technical contracts. P1-05 does not create implementation.

---

## 1. MongoDB Modeling Principles

### 1.1 Database baseline

* MongoDB is the Release 1 persistence database.
* Mongoose will be the persistence mapping layer.
* Exact Mongoose schema code is not created in P1-05.
* Collection ownership follows [MODULE_BOUNDARIES.md](MODULE_BOUNDARIES.md).
* One module must not access another module’s collection directly.
* Cross-module access occurs through public module interfaces.

### 1.2 Identifiers

* MongoDB `ObjectId` is the internal record identifier.
* API contracts expose identifiers as opaque strings.
* Security must not depend on identifiers being difficult to guess.
* Every identifier lookup must still enforce organization ownership and authorization.
* Human-readable invoice numbers remain separate from internal identifiers.

### 1.3 Common technical fields

Tenant-owned records must include, where applicable:

```text
_id
organizationId
createdAt
updatedAt
createdBy
updatedBy
version
status
```

Posted or corrective records may additionally include:

```text
postedAt
postedBy
sourceType
sourceId
correctionOfId
reversalOfId
reason
```

Rules:

* `organizationId` is mandatory for tenant-owned data.
* Tenant-owned repositories must never treat `organizationId` as an optional filter.
* `version` supports optimistic concurrency on mutable records.
* Immutable posted records must not be updated through normal mutation APIs.
* Audit information must not be silently replaced during updates.

### 1.4 Platform-owned records

Platform-owned records may omit `organizationId` only when they are genuinely platform scoped.

Examples:

* Global identity
* Platform subscription-plan definitions
* Platform operation status
* Cross-organization Super Admin operations

A record must not be treated as platform owned merely to avoid tenant filtering.

---

## 2. Decimal and Date Representation

### 2.1 Money

* MongoDB stores monetary values using Decimal128-compatible decimal representation.
* API contracts serialize monetary values as decimal strings.
* Monetary values use two decimal places in final posted values.
* JavaScript binary floating-point must not be authoritative for business calculations.
* Currency remains PKR in Release 1.

Example API value:

```json
{
  "amount": "1250.50",
  "currency": "PKR"
}
```

### 2.2 Quantity

* MongoDB stores quantities using Decimal128-compatible decimal representation.
* API contracts serialize quantities as decimal strings.
* Final posted base quantities support four decimal places.
* Conversion factors support six decimal places.

### 2.3 Time and date-only values

* Store timestamps as BSON dates in UTC.
* Serialize timestamps using ISO 8601 UTC format.
* Store organization business timezone as an IANA timezone identifier (for example `Asia/Karachi`).
* Business date is derived using the organization’s IANA timezone.
* Store date-only business values as validated `YYYY-MM-DD` strings.
* Date-only applies to batch expiry date, manufacturing date where used, and other business dates that must not shift by timezone conversion.
* Do not store date-only values as timestamps that can shift to another calendar date.
* API date-only values remain `YYYY-MM-DD`.
* API timestamps remain ISO 8601 UTC strings.

---

## 3. Embedded Versus Referenced Data

### 3.1 Embed when

* The data is an immutable transaction snapshot.
* It is always read with its owning transaction.
* It must preserve historical values.
* It does not have an independent lifecycle.

Examples:

* Sale lines
* Purchase lines
* Return lines
* Unit and conversion snapshots
* Price and cost snapshots
* Payment-method breakdown inside a payment command where appropriate

### 3.2 Reference when

* The record has its own lifecycle.
* It is queried independently.
* It may grow without a safe bounded size.
* Multiple modules need access through the owning module’s public interface.

Examples:

* Customers
* Suppliers
* Products
* Warehouses
* Payments
* Ledger effects
* Stock movements
* Account movements
* Audit events

Posted snapshots retain both the reference identifier and required historical display values.

Changing master data must not alter historical transactions.

Purchase lines, sale lines, and return lines remain embedded immutable snapshots inside their owning records unless a later measured document-size constraint requires an ADR-approved change.

---

## 4. Authoritative and Projected State

### 4.1 Authoritative movement and effect records

* Stock movements
* Signed ledger effects
* Account movements
* Payment allocations
* Posted sales
* Posted purchases
* Returns
* Corrective transactions

### 4.2 Maintained projections

* `inventory_balances`
* `inventory_cost_states`
* Derived current customer balance
* Derived current supplier balance
* Derived current account balance
* Alert presentation state

Rules:

* A projection must reconcile to authoritative effects.
* Projections may improve read performance.
* Projections must not conflict with authoritative movement history.
* Reconciliation tests must be able to rebuild or verify projected totals.
* Reporting must not create an independent conflicting calculation.
* Reporting owns no authoritative transactional collection.
* Read models or cached projections require a later approved design and must remain rebuildable from authoritative data.

---

## 5. Posted Transaction Design

Sales, purchases, returns, payments, transfers, adjustments, expenses, and corrective transactions must distinguish:

```text
draft
posted
cancelled or reversed where applicable
```

Rules:

* Drafts may be edited or discarded.
* Posted records are immutable.
* Posted records are never permanently deleted.
* Cancellation and reversal create linked corrective records.
* The original record remains preserved.
* A transaction cannot be corrected twice through the same correction path.
* Corrective records use signed effects opposite to their source.
* Posted line snapshots preserve product, unit, conversion, price, cost, batch, customer, supplier, and relevant display facts.

### 5.1 Master-data lifecycle

* Master data is mutable under optimistic concurrency.
* Archive or deactivate rather than hard-delete when historical references must remain valid.
* Master-data changes never rewrite posted snapshots.

### 5.2 Posted-record lifecycle

* Draft → posted through an explicit business action.
* Posted → cancelled or reversed through corrective linked records.
* Soft deletion of posted financial or stock records is prohibited as a normal workflow.

---

## 6. Signed Effect Design

`ledger_effects` and `account_movements` must use explicit signed effect direction.

Do not store ambiguous generic “reversal amounts.”

Examples:

* Credit sale receivable: positive customer ledger effect
* Customer payment allocation: negative customer ledger effect
* Reversal of customer payment: positive customer ledger effect
* Purchase payable: positive supplier ledger effect
* Supplier payment: negative supplier ledger effect
* Account receipt: positive account movement
* Account payment: negative account movement

Rules:

* Every corrective effect references its source effect.
* Source plus complete reversal must net to zero.
* Original and reversal must not be double-subtracted.
* Balance calculation uses the sum of signed posted effects.

---

## 7. Inventory Data Rules

* `stock_movements` is the authoritative quantity history.
* `inventory_balances` is the maintained current projection.
* `inventory_cost_states` stores current warehouse-product weighted-average cost state.
* `product_batches` defines batch identity.
* Warehouse-specific quantity remains in balances and movements, not duplicated as batch identity.
* Loose stock from separate batches remains separate.
* Transfer outbound and inbound movements link to one transfer.
* Failed transfers create neither movement.
* Negative stock override is recorded on the source transaction and audit event.
* Later receipts do not recalculate historical sale COGS.

Required scopes:

```text
organizationId
warehouseId
productId
batchId where applicable
```

---

## 8. Canonical Collection Catalog

Collection names below are canonical and unique. Ownership follows [MODULE_BOUNDARIES.md](MODULE_BOUNDARIES.md).

### 8.1 Identity and Access

| Collection | Owning module | Scope | Notes |
| --- | --- | --- | --- |
| `users` | Identity and Access | Platform-owned | Global authentication identity; normalized login email is globally unique |
| `organization_memberships` | Identity and Access | Tenant-owned | Links user to organization; fields include `role`, `conditionalPermissionGrants`, and `status` |
| `auth_sessions` | Identity and Access | Platform-owned (user-scoped) | Session tokens stored hashed; stores explicit active context |
| `password_reset_tokens` | Identity and Access | Platform-owned (user-scoped) | Reset tokens stored hashed, never plaintext |
| `account_activation_tokens` | Identity and Access | Platform-owned, user-scoped security token | Single-use activation; store only token hash; default 24-hour expiry |

Rules:

* A user may hold platform access or organization membership according to authorization rules.
* Session tokens, reset tokens, and activation tokens are never stored in plaintext.
* `organization_memberships` support `role`, `conditionalPermissionGrants`, and `status`.
* Only permissions marked `C` for that role may appear in `conditionalPermissionGrants`.
* Every authenticated session must store one explicit active context: `platform` or organization membership, including where applicable `activeContextType`, `activeMembershipId`, and `activeOrganizationId`.
* Every active organization must retain at least one active Owner. Deactivating or demoting the last active Owner is prohibited. Owner-presence validation occurs in the same transaction as membership changes. Multiple-Owner policy remains controlled and unresolved.

#### Account activation tokens

* Store only token hash.
* Token is single use.
* Default expiry is 24 hours and remains securely configurable.
* Successful activation consumes the token.
* Activation token creation and use are audited where appropriate.
* Plaintext token must never be logged or persisted.
* Automated email delivery is not introduced in Release 1.
* Activation links or tokens may be delivered manually or through another approved out-of-band process.

#### Organization onboarding data effects

A public organization request may create a pending organization record, pending Owner membership, and new global user identity where required. The pending organization must not gain operational access before approval.

Approval must atomically:

* Approve the organization
* Ensure at least one active Owner
* Activate the pending Owner membership
* Create the approved trial or active subscription state
* Create an activation token when the Owner has no usable credentials
* Create required audit events

### 8.1a API Infrastructure — Transactions and Idempotency

| Collection | Owning module | Scope | Notes |
| --- | --- | --- | --- |
| `idempotency_records` | API Infrastructure — Transactions and Idempotency | Mixed: organization, platform, or public onboarding scope | Technical-collection exception; not a new business module |

This is a documented technical-collection exception and must not modify the frozen module dependency graph.

Business modules use an injected infrastructure idempotency service. No business module imports Identity and Access merely for idempotency.

Conceptual fields:

```text
scopeType
organizationId
actorId
operation
keyHash
requestHash
state
responseStatus
responseReference or safe replay body
createdAt
completedAt
expiresAt
```

Supported states: `in_progress`, `completed`, `failed`.

### 8.2 Organizations

| Collection | Owning module | Scope | Notes |
| --- | --- | --- | --- |
| `organizations` | Organizations | Tenant root | Organization master and lifecycle; referenced as `organizationId` elsewhere |

`organizations` is the tenant root record. Its `_id` is the organization identifier used as `organizationId` on tenant-owned collections. Queries that load an organization for a normal membership still enforce membership ownership. Organization timezone is stored as an IANA identifier.

### 8.3 Subscriptions

| Collection | Owning module | Scope | Notes |
| --- | --- | --- | --- |
| `subscription_plans` | Subscriptions | Platform-owned | Versioned plan definitions (`planCode`, `planVersion`, `status`) |
| `subscriptions` | Subscriptions | Tenant-owned | Exactly one current subscription record per organization |
| `subscription_billing_records` | Subscriptions | Tenant-owned | Manual payment evidence metadata and verification status; evidence via opaque storage refs |

`subscription_plans` rules:

* Plan code is Starter, Business, or Enterprise.
* A plan version becomes immutable after a subscription references it.
* Commercial or entitlement changes create a new plan version.
* Subscription stores the exact referenced plan version.
* Historical subscriptions must not change when a later plan version changes.
* Only one selectable active version may exist for each plan code.

Exactly one current `subscriptions` record per organization. Lifecycle history remains available through audit events, billing records, and versioned state-transition information.

### 8.4 Locations

| Collection | Owning module | Scope | Notes |
| --- | --- | --- | --- |
| `branches` | Locations | Tenant-owned | Includes invoice-prefix configuration owned by Locations |
| `warehouses` | Locations | Tenant-owned | Stock-holding locations |
| `access_assignments` | Locations | Tenant-owned | Branch and warehouse assignments for memberships |

### 8.5 Sales-owned sequencing

| Collection | Owning module | Scope | Notes |
| --- | --- | --- | --- |
| `invoice_sequences` | Sales | Tenant-owned | Invoice sequence state; Locations owns prefix configuration on branches |

Ownership note: [MODULE_BOUNDARIES.md](MODULE_BOUNDARIES.md) assigns invoice sequence state to Sales and invoice-prefix configuration to Locations. This catalog places the sequence collection under Sales ownership accordingly.

### 8.6 Catalog and Pricing

| Collection | Owning module | Scope | Notes |
| --- | --- | --- | --- |
| `product_categories` | Catalog and Pricing | Tenant-owned | Categories |
| `products` | Catalog and Pricing | Tenant-owned | Products, tracking mode, base unit |
| `product_packaging_units` | Catalog and Pricing | Tenant-owned | Packaging units and conversion factors |
| `product_prices` | Catalog and Pricing | Tenant-owned | Price-tier prices |

### 8.7 Customers and Suppliers

| Collection | Owning module | Scope | Notes |
| --- | --- | --- | --- |
| `customers` | Customers | Tenant-owned | Customer master, credit policy, opening source-request facts |
| `suppliers` | Suppliers | Tenant-owned | Supplier master, opening source-request facts |

### 8.8 Inventory

| Collection | Owning module | Scope | Notes |
| --- | --- | --- | --- |
| `product_batches` | Inventory | Tenant-owned | Batch identity |
| `stock_movements` | Inventory | Tenant-owned | Authoritative quantity history |
| `inventory_balances` | Inventory | Tenant-owned | Maintained current projection |
| `inventory_cost_states` | Inventory | Tenant-owned | Warehouse-product WAC projection |
| `warehouse_transfers` | Inventory | Tenant-owned | Transfer headers linking outbound/inbound movements |
| `stock_adjustments` | Inventory | Tenant-owned | Adjustment drafts and posted adjustments |

### 8.9 Purchases

| Collection | Owning module | Scope | Notes |
| --- | --- | --- | --- |
| `purchases` | Purchases | Tenant-owned | Draft and posted purchases with embedded line snapshots |

### 8.10 Sales

| Collection | Owning module | Scope | Notes |
| --- | --- | --- | --- |
| `sales` | Sales | Tenant-owned | Draft and posted sales with embedded line snapshots |

### 8.11 Payments and Ledgers

| Collection | Owning module | Scope | Notes |
| --- | --- | --- | --- |
| `payments` | Payments and Ledgers | Tenant-owned | Customer and supplier payments |
| `payment_allocations` | Payments and Ledgers | Tenant-owned | Invoice-specific and automatic allocations |
| `ledger_effects` | Payments and Ledgers | Tenant-owned | Signed customer/supplier ledger effects |

### 8.12 Accounts and Expenses

| Collection | Owning module | Scope | Notes |
| --- | --- | --- | --- |
| `accounts` | Accounts and Expenses | Tenant-owned | Cash, Bank, JazzCash, Easypaisa accounts |
| `account_movements` | Accounts and Expenses | Tenant-owned | Signed account movements |
| `expense_categories` | Accounts and Expenses | Tenant-owned | Expense categories |
| `expenses` | Accounts and Expenses | Tenant-owned | Expense drafts and posted expenses |

### 8.13 Returns and Corrections

| Collection | Owning module | Scope | Notes |
| --- | --- | --- | --- |
| `returns` | Returns and Corrections | Tenant-owned | Sales and purchase returns with embedded line snapshots |
| `corrective_transactions` | Returns and Corrections | Tenant-owned | Correction orchestration records only where Returns and Corrections orchestrates the use case; other modules must not write this collection directly |

### 8.14 Alerts

| Collection | Owning module | Scope | Notes |
| --- | --- | --- | --- |
| `notification_items` | Alerts | Tenant-owned | Presentation or acknowledgement state only |

`notification_items` must not become the source of truth for stock, expiry, receivables, or payables.

### 8.15 Reporting

Reporting owns no authoritative transactional collection.

### 8.16 Imports

| Collection | Owning module | Scope | Notes |
| --- | --- | --- | --- |
| `import_jobs` | Imports | Tenant-owned | Import job lifecycle; workbook stored via opaque `storageRef` metadata only |
| `import_row_errors` | Imports | Tenant-owned | Row and field validation errors |

Import workbooks and billing evidence store metadata and opaque storage references only (`storageRef`, `originalFileName`, `contentType`, `size`, `checksum`, `uploadedAt`, `uploadedBy`). Do not store large binary files or base64 file bodies in normal MongoDB documents. Exact storage provider and malware-scanning implementation remain unresolved.

### 8.17 Audit

| Collection | Owning module | Scope | Notes |
| --- | --- | --- | --- |
| `audit_events` | Audit | Tenant-owned for organization events; platform-scoped fields for platform operations | Actor, reason, approval, source references |

Platform Super Admin audit queries may filter platform-scoped events without treating platform access as a silent bypass of tenant rules for organization business data.

### 8.18 Settings

| Collection | Owning module | Scope | Notes |
| --- | --- | --- | --- |
| `organization_settings` | Settings | Tenant-owned | Residual organization settings not owned by a specialized domain module |

Specialized policies remain with owning modules (credit policy with Customers, expiry thresholds with Inventory, subscription settings with Subscriptions, invoice prefix with Locations).

### 8.19 Operations

| Collection | Owning module | Scope | Notes |
| --- | --- | --- | --- |
| `backup_operation_records` | Operations | Platform-owned | Backup status visibility; not business transactions |
| `restore_operation_records` | Operations | Platform-owned | Restore coordination; not business transactions |

Operations records must not contain normal business transactions.

### 8.20 Collection count summary

| Category | Count |
| --- | --- |
| Canonical collections | 44 |
| Tenant-owned (require organization scope) | 35 |
| Platform-owned or user-scoped platform | 7 |
| Infrastructure mixed-scope (`idempotency_records`) | 1 |
| Tenant root (`organizations`) | 1 |
| Reporting-owned collections | 0 |

Tenant-owned collections (35): `organization_memberships`, `organization_settings`, `subscriptions`, `subscription_billing_records`, `branches`, `warehouses`, `access_assignments`, `invoice_sequences`, `product_categories`, `products`, `product_packaging_units`, `product_prices`, `customers`, `suppliers`, `product_batches`, `stock_movements`, `inventory_balances`, `inventory_cost_states`, `warehouse_transfers`, `stock_adjustments`, `purchases`, `sales`, `payments`, `payment_allocations`, `ledger_effects`, `accounts`, `account_movements`, `expense_categories`, `expenses`, `returns`, `corrective_transactions`, `notification_items`, `import_jobs`, `import_row_errors`, `audit_events`.

Platform-owned / user-scoped (7): `users`, `auth_sessions`, `password_reset_tokens`, `account_activation_tokens`, `subscription_plans`, `backup_operation_records`, `restore_operation_records`.

Infrastructure: `idempotency_records` (organization-, platform-, or public-onboarding scoped via `scopeType`).

Platform-scoped operational audit uses the same `audit_events` collection through an explicit platform authorization path (not a separate collection).

`organizations` is the tenant root and is not queried as an unscoped multi-tenant bag; access is membership- or platform-authorized.

#### Correction ownership clarification

* Sale cancellation records remain Sales-owned.
* Purchase cancellation records remain Purchases-owned.
* Payment corrections remain Payments and Ledgers-owned.
* Stock-adjustment and transfer reversals remain Inventory-owned.
* Account and expense corrections remain Accounts and Expenses-owned.
* Return reversal remains Returns and Corrections-owned.
* `corrective_transactions` stores only correction orchestration records owned by Returns and Corrections where that module actually orchestrates the use case.

---

## 9. Collection Relationships

High-level relationship rules:

* `users` 1‥* `organization_memberships` *‥1 `organizations`
* `organization_memberships` 1‥* `access_assignments` *‥1 (`branches` | `warehouses`)
* `organizations` 1‥1 current `subscriptions` (lifecycle history via audit events, billing records, and versioned state transitions; not multiple simultaneous current subscriptions)
* `subscriptions` *‥1 `subscription_plans`
* `subscriptions` 1‥* `subscription_billing_records`
* `organizations` 1‥* `branches`, `warehouses`, catalog, customers, suppliers, accounts
* `products` 1‥* `product_packaging_units`, `product_prices`, `product_batches`
* Posted `sales` / `purchases` / `returns` embed line snapshots and reference master identifiers
* Posted stock-affecting documents 1‥* `stock_movements`
* `warehouse_transfers` 1‥2 linked `stock_movements` (outbound and inbound)
* Posted financial documents 1‥* `ledger_effects` and/or `account_movements`
* `payments` 1‥* `payment_allocations`
* `import_jobs` 1‥* `import_row_errors`
* Corrective records reference source via `correctionOfId` / `reversalOfId` / `sourceType`+`sourceId`
* Business modules create `audit_events` through the Audit public interface

---

## 10. Required Indexes

Exact index names are not required. Field order and purpose are mandatory.

### 10.1 Common tenant indexes

Every tenant-owned collection requires an organization-leading index appropriate to its primary queries.

Examples:

```text
{ organizationId: 1, createdAt: -1 }
{ organizationId: 1, status: 1, createdAt: -1 }
```

### 10.2 Identity and activation

| Purpose | Fields / constraint |
| --- | --- |
| Unique normalized email | unique on `users.normalizedEmail` |
| Unique membership | unique `{ organizationId: 1, userId: 1 }` on `organization_memberships` |
| Session TTL | TTL on `auth_sessions.expiresAt` |
| Reset-token TTL | TTL on `password_reset_tokens.expiresAt` |
| Activation-token TTL | TTL on `account_activation_tokens.expiresAt` |
| Hashed session lookup | unique/lookup on `auth_sessions.tokenHash` |
| Hashed reset-token lookup | unique/lookup on `password_reset_tokens.tokenHash` |
| Hashed activation-token lookup | unique/lookup on `account_activation_tokens.tokenHash` |

### 10.2a Idempotency infrastructure

Use separate partial unique indexes for:

* Organization-scoped operations
* Platform-scoped operations
* Public onboarding operations

| Purpose | Fields / constraint |
| --- | --- |
| Org-scoped claim | partial unique on `{ organizationId, actorId, operation, keyHash }` where `scopeType` is organization |
| Platform-scoped claim | partial unique on `{ actorId, operation, keyHash }` where `scopeType` is platform |
| Public onboarding claim | partial unique on public applicant fingerprint scope + `{ operation, keyHash }` |
| Idempotency TTL | TTL on `idempotency_records.expiresAt` (exact retention unresolved) |

Store the idempotency key as a hash, not plaintext. Store a deterministic request hash. Claiming a key must be atomic. Concurrent reuse while `in_progress` must not run the operation twice.

### 10.3 Locations and invoice sequencing

| Purpose | Fields / constraint |
| --- | --- |
| Unique branch invoice sequence ownership | unique `{ organizationId: 1, branchId: 1 }` on `invoice_sequences` |
| Unique posted invoice number | partial unique `{ organizationId: 1, branchId: 1, invoiceNumber: 1 }` on `sales` where invoice number is present |

Use a partial unique index so drafts without invoice numbers do not conflict.

### 10.4 Catalog

| Purpose | Fields / constraint |
| --- | --- |
| Product search | `{ organizationId: 1, nameNormalized: 1 }`, status filters as needed |
| Partial unique SKU | partial unique `{ organizationId: 1, sku: 1 }` when SKU present |
| Category name lookup | `{ organizationId: 1, nameNormalized: 1 }` |
| Unique price-tier | unique `{ organizationId: 1, productId: 1, priceTier: 1 }` on `product_prices` |
| Unique packaging-unit identity | unique on organization, product, and normalized packaging-unit identity on `product_packaging_units` |

Do not make optional fields globally unique.

### 10.5 Customers and Suppliers

| Purpose | Fields / constraint |
| --- | --- |
| Name/phone search | `{ organizationId: 1, nameNormalized: 1 }`, `{ organizationId: 1, phoneNormalized: 1 }` |
| Status indexes | `{ organizationId: 1, status: 1 }` |
| Supplier-reference warning lookup | non-unique `{ organizationId: 1, supplierInvoiceReferenceNormalized: 1 }` on purchases |

### 10.5a Subscriptions and billing

| Purpose | Fields / constraint |
| --- | --- |
| One current subscription per organization | unique `{ organizationId: 1 }` on `subscriptions` |
| Plan version identity | unique `{ planCode: 1, planVersion: 1 }` on `subscription_plans` |
| Active selectable plan version | partial unique on `{ planCode: 1 }` where status is the selectable active version |
| Billing status/date | `{ organizationId: 1, status: 1, submittedAt: -1 }` |
| Billing org/date | `{ organizationId: 1, submittedAt: -1 }` |
| Normalized payment reference review | non-unique `{ paymentMethod: 1, paymentReferenceNormalized: 1 }` |
| Applied subscription reference | `{ appliedSubscriptionId: 1 }` |
| Billing evidence is not unique by payment reference | duplicate payment references remain non-unique warnings |

### 10.6 Inventory

| Purpose | Fields / constraint |
| --- | --- |
| Movement lookup | `{ organizationId: 1, warehouseId: 1, productId: 1, batchId: 1, postedAt: -1 }` |
| Batch identity | `{ organizationId: 1, productId: 1, batchNumber: 1 }` |
| Current balance | unique or upsert key `{ organizationId: 1, warehouseId: 1, productId: 1, batchId: 1 }` on `inventory_balances` |
| Cost state | unique `{ organizationId: 1, warehouseId: 1, productId: 1 }` on `inventory_cost_states` |
| Expiry | `{ organizationId: 1, expiryDate: 1 }` on tracked batches (date-only `YYYY-MM-DD`) |
| FIFO/FEFO ordering | posted-at / expiry indexes on movements and batches |

### 10.7 Transactions

| Purpose | Fields / constraint |
| --- | --- |
| Status/date | `{ organizationId: 1, status: 1, postedAt: -1 }` / `createdAt` |
| Sales by branch | `{ organizationId: 1, branchId: 1, postedAt: -1 }` |
| Sales/purchases by warehouse | `{ organizationId: 1, warehouseId: 1, postedAt: -1 }` |
| Source and correction refs | `{ organizationId: 1, sourceType: 1, sourceId: 1 }`, `{ organizationId: 1, correctionOfId: 1 }`, `{ organizationId: 1, reversalOfId: 1 }` |

### 10.8 Ledgers and Accounts

| Purpose | Fields / constraint |
| --- | --- |
| Customer ledger | `{ organizationId: 1, customerId: 1, postedAt: -1 }` on `ledger_effects` |
| Supplier ledger | `{ organizationId: 1, supplierId: 1, postedAt: -1 }` on `ledger_effects` |
| Account movements | `{ organizationId: 1, accountId: 1, postedAt: -1 }` |
| Allocation refs | `{ organizationId: 1, paymentId: 1 }`, `{ organizationId: 1, sourceType: 1, sourceId: 1 }` |

### 10.9 Audit and operations

| Purpose | Fields / constraint |
| --- | --- |
| Organization/date | `{ organizationId: 1, createdAt: -1 }` |
| Actor/date | `{ organizationId: 1, actorId: 1, createdAt: -1 }` |
| Source | `{ organizationId: 1, sourceType: 1, sourceId: 1 }` |
| Platform operation/date | platform-scoped `{ createdAt: -1 }` / operation type indexes |
| Backup/restore status | platform operation indexes on operations collections |

### 10.10 Partial and TTL indexes

* Partial unique indexes for optional uniqueness (SKU, posted invoice number, active plan version).
* TTL indexes for sessions, password-reset tokens, account-activation tokens, and idempotency records.
* Exact TTL durations for idempotency retention remain unresolved (see Controlled Unresolved Details).

---

## 11. Transaction Boundaries

Use MongoDB transactions for frozen atomic workflows.

### 11.1 Deployment topology prerequisite

* MongoDB transactions require a transaction-capable replica-set or sharded deployment.
* Production must not use a standalone MongoDB server.
* Local integration tests must use a transaction-capable MongoDB topology.
* Transient transaction errors may be retried.
* Unknown commit results must be resolved through transaction retry and idempotency.
* A retry must never duplicate business effects.
* Exact hosting provider remains unresolved.

### 11.2 Orchestration

The orchestrating application service owns the transaction boundary.

Required transactional workflows:

* Organization approval and Owner activation orchestration
* Sale posting
* Purchase posting
* Return posting
* Warehouse transfer
* Customer payment
* Supplier payment
* Account transfer
* Manual account inflow/outflow
* Expense posting
* Opening balances
* Opening stock
* Cancellation
* Reversal
* Import execution
* Billing approval application

Rules:

* Participating module methods accept shared transaction context.
* Participating modules must not independently commit.
* Audit events required for correctness participate in the same transaction.
* A failed workflow rolls back all authoritative effects.
* After-commit events cannot establish authoritative stock or financial state.
* Transaction retry must not duplicate business effects.

---

## 12. Concurrency Controls

### 12.1 Optimistic concurrency

Mutable master data uses a `version` field.

An update must provide the expected version.

A stale update returns a conflict rather than overwriting newer data.

### 12.2 Invoice sequencing

* Sequence allocation is atomic.
* Posted invoice numbers are unique by organization and branch.
* Cancelled numbers are not reused.
* Sequence gaps are allowed.
* A failed retry must not create a duplicate invoice.

### 12.3 Stock and cost

* Stock validation and movement posting occur in the same transaction.
* WAC state updates use transaction-safe conditional updates.
* Concurrent sale or purchase posting must not silently overwrite stock or cost state.

---

## 13. Idempotency Persistence

`idempotency_records` is owned by API Infrastructure — Transactions and Idempotency.

Require an `Idempotency-Key` for:

* Public organization activation request
* Account activation
* Sale posting
* Purchase posting
* Return posting
* Payment posting
* Transfer posting
* Manual account transaction posting
* Cancellation
* Reversal
* Import execution
* Billing approval and subscription lifecycle actions

Rules:

* Store the idempotency key as a hash, not plaintext.
* Store a deterministic request hash.
* Same key plus equivalent request replays the original result.
* Same key plus different request returns `IDEMPOTENCY_CONFLICT`.
* Claiming a key must be atomic.
* Completion state and authoritative resource reference must participate safely in the business transaction.
* Concurrent reuse while an operation is `in_progress` must not run the operation twice.
* Public activation requests use a non-secret applicant fingerprint as part of their idempotency scope.
* Platform operations use platform actor scope.
* Tenant operations use organization and actor scope.

Idempotency records must have a controlled retention period defined before implementation. Exact retention is unresolved.

---

## 14. Reconciliation Strategy

* Rebuild or verify `inventory_balances` from `stock_movements`.
* Rebuild or verify `inventory_cost_states` against movement and cost rules.
* Rebuild or verify customer and supplier balances from `ledger_effects`.
* Rebuild or verify account balances from `account_movements`.
* Reporting queries must use authoritative effects or reconciled projections.
* Alert presentation state must not invent stock or ledger totals.
* Reconciliation tests are required before implementation freeze of posting paths.

---

## 15. Retention and Deletion Rules

* Posted financial and stock transactions are never permanently deleted through normal APIs.
* Master data uses archive/deactivate rather than hard delete when references exist.
* Subscription cancellation and data deletion are separate processes.
* Recommended recoverable retention after cancellation: 90 calendar days (configurable; commercial/default policy).
* Sessions and password-reset tokens expire via TTL.
* Idempotency records expire via TTL.
* Platform backup/restore records are operational history, not business ledgers.
* Exact log and evidence retention periods remain unresolved.

---

## 16. Migration and Import Implications

* Imports write through target-module public interfaces, never by direct foreign-collection writes.
* Opening balances and opening stock create auditable source transactions.
* Import jobs and row errors persist preview failures without posting effects.
* Import execution is transactional and all-or-nothing.
* Exact spreadsheet columns remain outside this document.

---

## 17. Controlled Unresolved Data Details

| Item | Assigned to |
| --- | --- |
| Exact framework and package versions | P1-06 / implementation |
| Package manager / monorepo tool | P1-06 |
| Exact idempotency-record retention period | Implementation / security hardening |
| Exact log-retention period | Deployment |
| Exact import upload size | Implementation |
| Exact report column definitions | Later report specification |
| Exact import spreadsheet columns | Later import specification |
| Exact commercial plan prices and numeric limits | Commercial approval |
| Exact storage provider for imports and billing evidence | Deployment |
| Exact malware-scanning implementation | Deployment |
| Tax and regulatory policy | Commercial / legal approval |

Do not invent values for unresolved items.

---

## 18. Traceability

| Collection | Owning module | PRD prefixes | BR prefixes | Authoritative / projected |
| --- | --- | --- | --- | --- |
| `users`, `organization_memberships`, `auth_sessions`, `password_reset_tokens`, `account_activation_tokens` | Identity and Access | FR-AUTH-*, FR-USER-*, FR-ORG-* | BR-ORG | Authoritative identity/session/activation |
| `idempotency_records` | API Infrastructure — Transactions and Idempotency | NFR-REL-003 | — | Authoritative idempotency |
| `organizations` | Organizations | FR-ORG-* | BR-ORG | Authoritative |
| `organization_settings` | Settings | FR-SETTINGS-001, FR-ORG-005 | Owning-domain BRs | Authoritative residual settings |
| `subscription_plans`, `subscriptions`, `subscription_billing_records` | Subscriptions | FR-SUB-* | BR-SUB | Authoritative |
| `branches`, `warehouses`, `access_assignments` | Locations | FR-BRANCH-*, FR-WAREHOUSE-001/002, FR-USER-003 | BR-ORG | Authoritative |
| `invoice_sequences` | Sales | FR-SALE-* | BR-SALE | Authoritative sequence state |
| `product_categories`, `products`, `product_packaging_units`, `product_prices` | Catalog and Pricing | FR-PRODUCT-* | BR-UNIT, BR-BATCH | Authoritative master |
| `customers` | Customers | FR-CUSTOMER-* | BR-SALE, BR-LEDGER | Authoritative master |
| `suppliers` | Suppliers | FR-SUPPLIER-* | BR-PURCHASE, BR-LEDGER | Authoritative master |
| `product_batches`, `stock_movements`, `warehouse_transfers`, `stock_adjustments` | Inventory | FR-INVENTORY-*, FR-WAREHOUSE-003 | BR-INVENTORY, BR-BATCH, BR-COST, BR-TRANSFER | Authoritative |
| `inventory_balances`, `inventory_cost_states` | Inventory | FR-INVENTORY-* | BR-INVENTORY, BR-COST | Projected |
| `purchases` | Purchases | FR-PURCHASE-* | BR-PURCHASE, BR-COST, BR-COMMON | Authoritative |
| `sales` | Sales | FR-SALE-* | BR-SALE, BR-COMMON | Authoritative |
| `payments`, `payment_allocations`, `ledger_effects` | Payments and Ledgers | FR-PAYMENT-*, FR-CUSTOMER-005, FR-SUPPLIER-002 | BR-PAYMENT, BR-LEDGER | Authoritative |
| `accounts`, `account_movements`, `expense_categories`, `expenses` | Accounts and Expenses | FR-ACCOUNT-*, FR-EXPENSE-* | BR-ACCOUNT, BR-EXPENSE | Authoritative (balances projected from movements) |
| `returns`, `corrective_transactions` | Returns and Corrections | FR-RETURN-* | BR-RETURN, BR-CORRECTION | Authoritative |
| `notification_items` | Alerts | FR-ALERT-* | BR-ALERT | Presentation projection only |
| (none) | Reporting | FR-REPORT-* | BR-REPORT | No authoritative collections |
| `import_jobs`, `import_row_errors` | Imports | FR-IMPORT-* | BR-IMPORT | Authoritative job/error state |
| `audit_events` | Audit | FR-AUDIT-* | BR-AUDIT | Authoritative audit |
| `backup_operation_records`, `restore_operation_records` | Operations | FR-SETTINGS-002..007, NFR-OBS-*, NFR-BACKUP-* | — | Authoritative operational status |

---

## 19. Document Control

* Frozen requirements define product scope.
* Frozen Business Rules define calculations and behaviour.
* Frozen architecture defines module ownership and dependencies.
* This document defines implementation-ready data contracts.
* This document does not create schemas, Mongoose models, or application code.
