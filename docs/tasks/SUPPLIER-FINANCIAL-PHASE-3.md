# Supplier Financial Phase 3 — Refunds and Balance Adjustments

## Task Status

* Status: **Complete** (backend implementation)
* Date: 2026-09-24
* Scope: supplier advance refunds/reversals, supplier payable/advance adjustments and reversals, target-aware payable allocation, reconciliation protection, and frontend API handoff
* Frontend workflow and comprehensive release smoke/regression are not included in this phase.

## Existing architecture audited

* `ledger_effects` is the authoritative signed supplier ledger. `payable` and `supplier_advance` remain separate; net payable remains `payable - advance`.
* `payment_allocations` owns opening-payable, purchase, advance, and now manual-payable allocation lineage. General Supplier Payment uses the existing deterministic opening/oldest-target FIFO; invoice-specific payment remains purchase-only.
* Purchase posting consumes supplier advance through paired payable/advance effects. Purchase cancellation restores that advance through immutable compensation. Supplier Payment correction reverses allocations and account movement effects.
* `account_movements` remains the only Cash/Bank/Wallet ledger. Refunds reuse its public posting interface; balance adjustments never write account movements.
* Supplier DTOs, reconciliation, and dashboard totals already derive payable/advance/net payable through bulk ledger aggregation. No mutable supplier balance or parallel ledger was introduced.
* Existing idempotency records, shared Mongo transaction runner, audit writer, frozen RBAC permissions, and organization-scoped service lookups remain authoritative.

## Supplier refunds

* `supplier_refunds` is the durable tenant-owned source collection. A posted refund records supplier, receiving account, positive amount, business date, optional reference/notes, actor, and reversal metadata.
* `POST /api/v1/supplier-refunds` locks the supplier financial position, re-reads available advance, rejects an excess refund with the latest available balance, appends one negative `supplier_advance_refund` ledger effect and one positive account movement, and audits all records in one Mongo transaction.
* `POST /api/v1/supplier-refunds/:id/reverse` leaves the original immutable, appends `supplier_advance_refund_reversal` supplier/account effects with `reversalOfId` lineage, and conditionally marks the source reversed. Double reversal is rejected and idempotent replay creates no duplicate effects.
* Refunds do not touch payable targets, purchases, revenue, expenses, stock, batches, quantity, expiry, WAC, or landed cost. Account reversal follows the existing Accounts negative-balance policy.
* `GET /api/v1/supplier-refunds` provides tenant-scoped, paginated supplier/status/date filtering for the frontend.

## Supplier balance adjustments

* `supplier_balance_adjustments` is the durable immutable source collection for payable/advance set-balance commands and their compensating reversal records.
* Requests carry expected current and desired balances. The backend locks the supplier position, recalculates the authoritative ledger balance, returns HTTP 409 with `latestBalance` on stale input, and posts only `desired - current`.
* Supplier Advance adjustment writes only a signed `supplier_advance_adjustment` ledger effect. A reversal that would make current advance negative after downstream purchase consumption is rejected.
* Positive Supplier Payable adjustment creates a first-class `supplier_manual_payable` target. General Supplier Payment can settle it through existing FIFO; invoice-specific payment cannot select or intercept it.
* Negative Supplier Payable adjustment reduces actual opening/purchase/manual target outstanding in the existing FIFO order. The signed target effects are stored on the adjustment and reversed exactly on compensation.
* A positive manual target cannot be reversed while a payment has consumed it. Supplier Payment correction contributes a compensating target allocation, restores the target outstanding, and then permits a safe adjustment reversal. Purchase cancellation and purchase return reject a purchase target with an active adjustment until that adjustment is reversed.
* Supplier balance adjustments create zero account movements and zero inventory effects.

## Concurrency, reconciliation, and reporting

* `supplier_financial_versions` provides an organization/supplier serialization point. Every supplier ledger append advances it, so refunds, purchase advance consumption, Supplier Payments, returns/cancellation, and balance adjustments conflict and retry against fresh balances.
* Ledger reads, payable-target adjustments, payment allocations, and unpaid-purchase reads accept the active session where used by the new workflows.
* Reconciliation retains `UNALLOCATED_SUPPLIER_ADVANCE_WITH_PAYABLE` and adds `SUPPLIER_PAYABLE_TARGET_MISMATCH` when authoritative payable differs from remaining allocatable targets. Manual-target allocations participate in allocation/ledger consistency checks.
* Existing supplier DTO and dashboard bulk aggregations automatically reflect refunds and adjustments. Refunds reduce Total Supplier Advance; payable/advance adjustments update their corresponding totals; Net Supplier Payable remains derived. No per-supplier query loop or revenue effect was added.

## API and authorization

| Method | Path | Authorization |
| --- | --- | --- |
| GET | `/api/v1/supplier-refunds` | `supplier-payments.view` |
| POST | `/api/v1/supplier-refunds` | `supplier-payments.post` + `accounts.transaction.post` |
| POST | `/api/v1/supplier-refunds/:id/reverse` | `payments.correct` + `accounts.transaction.correct` |
| POST | `/api/v1/supplier-balance-adjustments` | `suppliers.manage` |
| POST | `/api/v1/supplier-balance-adjustments/:id/reverse` | `suppliers.manage` |

The frozen catalog has no supplier-refund or supplier-balance-correction permission. The implementation reuses the smallest safe intersections: Supplier Payments plus Accounts for actual money movement, Payments/Accounts correction for its reversal, and supplier management for non-cash supplier reconciliation. Existing Supplier Payments/Suppliers capability controls are enforced in the service. Every supplier, account, source, and list lookup remains organization-scoped.

## Model review checklist outcome

* Ownership: refund/adjustment source records live in Supplier Finance; signed supplier effects remain in Payments and Ledgers; cash effects remain in Accounts.
* Fields: all persisted fields support source identity, tenant scope, immutable financial meaning, UI context, lifecycle/reversal, target allocation, actor audit, or concurrency. No loan, interest, GL, revenue, expense, inventory, or mutable balance field was added.
* Lifecycle and relationships: refunds use posted/reversed lifecycle; adjustment reversal is a separate posted source. Same-organization supplier/account composition is enforced.
* Indexes: org-leading refund history and adjustment history indexes, unique adjustment reversal lineage, operational ledger/account source uniqueness, and a unique org/supplier financial-version lock.
* Transactions/audit: refund source + supplier effect + account movement + audit are atomic. Adjustment source + target effects + ledger effect + audit are atomic.
* Evolution: additive and backward-compatible. Existing payment, purchase, advance consumption/restoration, inventory, reporting, and account data require no backfill.
* Real Mongo: isolated replica-set tests prove refund rollback on account failure, concurrent refund serialization, refund-versus-purchase-advance serialization, and corrected manual-target restoration.

## Frontend handoff

* Use `API_SUPPLIER_REFUNDS_PATH` and `API_SUPPLIER_BALANCE_ADJUSTMENTS_PATH` from `@agrivio/api-contracts` and send `Idempotency-Key` on every mutation.
* On refund validation failure, show `error.details[0].latestAvailableAdvance`. On stale adjustment HTTP 409, show `error.details.latestBalance` and require review before resubmission.
* Keep “Supplier refunded money” separate from non-cash “Adjust Supplier Balance.” Refund requires a receiving account; balance adjustment must not show one.
* Refund success/reversal invalidates supplier/detail/ledger/balances/refunds, accounts/summary/movements, dashboard, and reports.
* Balance adjustment/reversal invalidates supplier/detail/ledger/balances, unpaid payable targets/Supplier Payments, dashboard, and reports. It must not invalidate Accounts data.
* Render ledger `displayLabel`; do not use raw source enums as the primary user label.

## Validation

* Supplier Finance service/RBAC plus supplier allocation, reconciliation, F05 P3 purchase, and return regressions: **44 passed**.
* Supplier Finance and F05 P3 real-Mongo replica-set tests: **11 passed**; existing real-Mongo payment-correction regression: **1 passed**.
* Customer Finance, payment correction, treasury, account summary, dashboard, and API-contract regressions: **22 passed**.
* Repository lint: pass.
* Backend build: pass.
* Architecture boundary gate: pass.
* `git diff --check`: pass (line-ending notices only).
* Full repository regression/smoke intentionally not run for this focused backend phase.
