# F07 Phase 3 — Manual Account Transactions, Reversals, and Expenses

## Task Status

* Status: **Complete** (implementation)
* Date: 2026-08-13
* Work items: `R1-F07-006`, `R1-F07-007`, `R1-F07-008`
* Does **not** implement `R1-F07-009` (Accounts/expenses/returns Angular vertical slice + stage-exit E2E)

## Scope Delivered

### R1-F07-006 — Manual account inflow, outflow, and transfer

* `POST /api/v1/account-transactions` posts one signed `account_movements` row (`manual_inflow` positive / `manual_outflow` negative)
* `GET /api/v1/account-transactions/:id` views that movement (no `account_transactions` collection)
* `POST /api/v1/account-transfers` posts two linked movements in one Mongo transaction (`account_transfer_out` / `account_transfer_in`, shared `sourceId`)
* Account balance is derived only from signed posted movements; `accounts` has no mutable `balance`
* Amount must be `> 0`; source and destination must differ; both accounts must be active and in the same organization
* Permissions: `accounts.transaction.post` (inflow/outflow), `accounts.transfer` (transfer) per Frozen API_DESIGN / SECURITY_AUTHORIZATION
* Idempotency-Key, tenant scope, audit, one Mongo transaction

### R1-F07-007 — Account transaction reversal

* `POST /api/v1/account-transactions/:id/reverse` (`accounts.transaction.correct`, reason required)
* `POST /api/v1/account-transfers/:id/reverse` (`accounts.transfer.reverse`, reason required; both legs reversed atomically)
* Original movements are not edited or deleted; corrective movements use opposite signed amounts and `reversalOfId`
* Double reversal rejected; idempotent replay does not duplicate; failed reversal leaves no partial corrective movement
* No generic `/corrective-transactions`, `/generic-correction`, `/adjust-anything`, or `/balance-edit` route
* Accounts does **not** write Returns-owned `corrective_transactions`

### R1-F07-008 — Expenses and expense correction

* `expense_categories` master data (`expenses.view` / `expenses.post`)
* Expense draft → post: valid category, active account, positive PKR amount, purpose, `YYYY-MM-DD` date, optional reference
* Posting creates the expense record and a matching signed account outflow (`sourceType=expense`) atomically
* `POST /api/v1/expenses/:id/correct` (`expenses.correct`, reason): original expense preserved (`status=corrected`); linked corrective expense + opposite account movement (`expense_correction`, `reversalOfId`)
* Double correction rejected; posted expense is not deleted or rewritten

## Model review (A/B)

| Model | Class | Result |
| --- | --- | --- |
| `account_movements` (extended) | A/B | Manual/transfer/expense/reversal source types; optional `purpose`/`reference`; unique owned-source and `reversalOfId` indexes |
| `expense_categories` | A | Tenant category master; unique org+nameNormalized; `version` |
| `expenses` | A/B | Draft/posted/corrected lifecycle; `correctionOfId` unique; original amounts/purpose preserved on correction |
| No `account_transactions` / `account_transfers` collections | — | DATA_MODEL + R1-F07-006 data scope: movements only; transfer identity is shared `sourceId` |
| No `account.balance` | — | Derived from signed movement sum |

Deferred **C/D**: payroll, tax, double-entry GL, F08 reporting, R1-F07-009 E2E vertical slice.

## APIs

| Method | Path | Permission |
| --- | --- | --- |
| POST | `/api/v1/account-transactions` | `accounts.transaction.post` |
| GET | `/api/v1/account-transactions/:id` | `accounts.view` |
| POST | `/api/v1/account-transactions/:id/reverse` | `accounts.transaction.correct` |
| POST | `/api/v1/account-transfers` | `accounts.transfer` |
| POST | `/api/v1/account-transfers/:id/reverse` | `accounts.transfer.reverse` |
| GET/POST/PATCH | `/api/v1/expense-categories` | `expenses.view` / `expenses.post` |
| GET/POST/PATCH | `/api/v1/expenses`, `/:id` | `expenses.view` / `expenses.post` |
| POST | `/api/v1/expenses/:id/post` | `expenses.post` |
| POST | `/api/v1/expenses/:id/correct` | `expenses.correct` |

## Angular workflow

* Account detail: manual inflow/outflow, transfer to another active account, reverse with required reason
* `/app/expenses` list + draft/post/correct; `/app/expense-categories` master data
* Shell nav `Expenses` gated by `expenses.view`
* R1-F07-009 browser E2E not in this phase

## Validation

* Focused unit: `apps/backend/src/modules/accounts-expenses/f07-p3.spec.js` — **2 passed**
* Real-Mongo rs0: `f07-p3-mongo.integration.spec.js` — **2 passed** (transfer rollback; transfer/expense idempotency + expense-correction rollback)
* Angular: accounts-expenses page specs — **5 passed**
* Phase gates (once): `test:architecture` **pass** (4), `f04-p3-contracts` **pass** (6), lint **pass** (existing warnings only), typecheck **pass**, frontend build **pass**
* Browser E2E not run in this phase

## Prompt vs Frozen

* Agent prompt listed `accounts.transaction.post` for transfers. Frozen API_DESIGN / SECURITY_AUTHORIZATION use `accounts.transfer` and `accounts.transfer.reverse`. Implementation follows Frozen.
* Agent prompt listed purpose/reference as invariants; Frozen BR-ACCOUNT does not require purpose on transfers. Manual transactions and expenses require purpose; transfer purpose/reference remain optional; reversal/correction require reason.

## Next

* `R1-F07-009` Accounts/expenses/returns Angular vertical slice and stage-exit E2E / reconciliation suite

## Treasury / Account Management Phase 1 hardening (2026-09-23)

### Existing architecture audit

* `accounts` is tenant-owned master data for Cash, Bank, JazzCash, and Easypaisa. It has no mutable balance; `openingBalance` is source metadata linked to its immutable opening movement.
* `account_movements` remains the only authoritative money-effect collection. Balances are the sum of signed posted movements. Sales/customer payments, supplier payments, direct purchase payments, expenses, returns/refunds, cancellations, corrections, and opening balances already reuse the Accounts public posting interface and source linkage.
* Manual inflow/outflow and paired transfers already used organization-scoped transactions, audit events, idempotency records, and the frozen Accounts permissions. Phase 1 extends those paths rather than creating another ledger or transaction collection.
* Audit remains in `audit_events`; request replay protection remains in `idempotency_records`; Mongo work continues through the shared transaction runner/session.
* Frontend financial cache invalidation already targets `accounts`, `accounts-summary`, `account-movements`, `dashboard`, and `reports` only. No inventory, customer, supplier, branch, warehouse, product, or category invalidation was added.

### Added behavior

* `POST /api/v1/account-balance-adjustments` uses `accounts.transaction.post` plus the existing `accounts.actions.postManualMovement` capability. It accepts `accountId`, `expectedCurrentBalance`, `desiredBalance`, required `reason`, category, optional business date/reference/notes, and `Idempotency-Key`.
* Set-balance semantics recalculate the authoritative movement sum in the transaction, reject a stale expected balance with HTTP 409, and append only `desired - current`. Equal balances return `no_change` without a money movement and retain an audit event.
* Added movement types: `balance_adjustment_increase`, `balance_adjustment_decrease`, and their linked reversal types. Adjustment movements retain balance-before, requested desired balance, delta, category, reason, date, actor, and reversal lineage.
* Manual treasury inflow/outflow supports safe categories including `unclassified`; transfer accepts established source/destination names and the request aliases `fromAccountId`/`toAccountId`.
* Every Accounts-owned/public money append advances an internal `accounts.movementVersion` in the same session. Adjustment read + version write prevents concurrent account activity from silently invalidating a set-balance decision. Paired transfer locks use stable account-ID order.
* Account lists now resolve all displayed balances through one grouped aggregation rather than one query per account. Summary exposes derived `totalLiquidFunds` across active liquid accounts; transfers preserve it while external movements and adjustments change it by their signed delta.
* Movement history now supports source type, inflow/outflow direction, inclusive date range, reference/purpose/category/notes search, posted status, and pagination. DTOs expose direction and readable treasury metadata.
* Reversal stays append-only. Manual adjustments use the existing account-transaction reversal endpoint; transfer reversal still appends both corrective legs atomically.

### Model review checklist outcome

* Ownership/scope: `accounts` and `account_movements` remain in Accounts and Expenses and remain organization-scoped.
* A fields: adjustment/source categories, notes, business date, balance-before, and desired balance provide required current-scope meaning and audit context. B field: `movementVersion` is an internal concurrency token; it is not a balance or API source of truth.
* Lifecycle/relationships: movements remain posted and immutable; source IDs and `reversalOfId` retain lineage; both transfer accounts are resolved inside the current organization.
* Indexes: the existing org/account/posting index remains primary; an org/account/business-date index supports the new history filter. No speculative collection or denormalized liquid-funds value was added.
* Evolution: additive and backward-compatible. Existing account documents treat absent `movementVersion` as zero; historical movements may have null business/category metadata and continue to filter by `postedAt`.
* Transaction/audit: multi-movement writes, balance adjustment validation+append, concurrency token writes, and audit events share the Mongo transaction.
* Real-Mongo evidence: existing replica-set transfer rollback/idempotency/correction coverage passes after the schema and concurrency changes.

### Validation

* Treasury focused service + existing F07/summary: **7 passed**
* Accounts capability/payment integration: **14 passed**
* Real-Mongo rs0 F07 P3 integration: **2 passed**
* Architecture boundary gate: **6 passed**
* `npm run lint`: pass, warnings only (no errors)
* `npm run build:backend`: pass
* No full repository regression/smoke run was performed, per the Phase 1 light-testing instruction.
