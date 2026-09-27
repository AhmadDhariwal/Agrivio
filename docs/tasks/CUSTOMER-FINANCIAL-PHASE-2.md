# Customer Financial Phase 2 — Loans, Repayments, and Balance Adjustments

## Task Status

* Status: **Complete** (backend implementation)
* Date: 2026-09-24
* Scope: customer loans, loan repayments and reversals, customer financial balance adjustments, derived balances, and dashboard totals
* Frontend workflow is not included in this backend phase.

## Architecture delivered

* Existing `ledger_effects` remains authoritative for customer balances. The additive `loan_receivable` effect kind is separate from trade `receivable` and customer `advance`.
* `customer_loans`, `customer_loan_repayments`, and `customer_balance_adjustments` are durable tenant-owned source records. Principal, repayments, adjustments, and reversals are immutable signed ledger effects rather than a mutable loan balance.
* Loan disbursement posts one `loan_receivable` increase and one `account_movements` outflow in one Mongo transaction. Repayment posts one loan decrease and one account inflow in one transaction.
* Loan and repayment reversal append compensating ledger/account effects and preserve `reversalOfId` lineage. A loan cannot be reversed while active repayments or loan adjustments exist.
* Customer financial writes serialize through `customer_financial_versions`; account writes retain Accounts-owned `movementVersion` serialization. Transaction retries re-read outstanding balances, preventing concurrent over-repayment and stale balance adjustments.
* Existing Customer Payment allocation remains limited to opening receivable, sales, and manual trade-receivable targets. It never allocates to a loan, and customer advance never auto-offsets a loan.

## Balance adjustment design

* Set-balance requests carry expected and desired values. The backend recalculates the authoritative balance and returns HTTP 409 with `latestBalance` when the expected value is stale. Only the delta is posted.
* Advance and loan corrections are non-cash ledger effects. Negative resulting advance or loan outstanding is rejected. Reversals are also checked against current downstream activity.
* Positive trade-receivable adjustment creates a `customer_manual_receivable` target. Negative adjustment writes immutable target effects in deterministic opening → oldest sale → manual target order.
* General Customer Payment understands manual targets and all trade target corrections. The sum of remaining allocatable trade targets therefore remains equal to the authoritative trade-receivable ledger balance.
* Reversing a positive manual receivable is rejected after dependent payment/correction activity; this prevents orphaned allocations and preserves the target-sum invariant.
* Sale cancellation, linked ledger-adjustment returns, and opening-receivable correction reject an active target adjustment and require its reversal first.

## Derived balances and reporting

* Customer DTOs expose `receivable`, `loanReceivable`, `advance`, existing `netExposure`, and additive `totalExposure`.
* `netExposure` remains `receivable - advance`; sale credit-limit calculation remains unchanged.
* `totalExposure` is `receivable + loanReceivable - advance`.
* Dashboard financial summary adds `totalCustomerLoanReceivable` and `totalCustomerExposure` using bulk ledger aggregation.
* Loan list filtering/pagination derives outstanding and repayment totals with bulk ledger reads; it does not query the ledger once per loan.
* Customer ledger DTOs provide readable labels for all new loan and adjustment effects.

## API and authorization

| Method | Path | Authorization |
| --- | --- | --- |
| GET/POST | `/api/v1/customer-loans` | `customers.view` / `customers.manage` + `accounts.transaction.post` |
| GET | `/api/v1/customer-loans/:id` | `customers.view` |
| POST | `/api/v1/customer-loans/:id/repayments` | `customers.manage` + `accounts.transaction.post` |
| POST | `/api/v1/customer-loans/:id/reverse` | `customers.manage` + `accounts.transaction.post` |
| POST | `/api/v1/customer-loan-repayments/:id/reverse` | `customers.manage` + `accounts.transaction.post` |
| POST | `/api/v1/customer-balance-adjustments` | `customers.manage` |
| POST | `/api/v1/customer-balance-adjustments/:id/reverse` | `customers.manage` |

The frozen permission catalog has no loan-specific permission. This phase reuses the smallest safe intersection: customer management for customer financial corrections and Accounts transaction posting for every cash/bank effect. No frozen permission was added or renamed.

## Model review checklist outcome

* Ownership: loan/repayment/adjustment source records live in Customer Finance; signed customer effects remain in Payments and Ledgers; cash effects remain in Accounts.
* Fields: all persisted fields support tenant ownership, principal-only lifecycle, source/reference context, immutable correction lineage, audit, target-aware allocation, or concurrency. No interest, schedules, penalties, collateral, GL, revenue, expense, or inventory fields were added.
* Scope and relationships: every customer, account, loan, repayment, and adjustment lookup is organization-scoped. Cross-organization composition is rejected.
* Lifecycle: loans and repayments use posted/reversed lifecycle; adjustment reversals are separate posted source records. Original financial amounts are not rewritten.
* Indexes: org-leading loan list/customer history indexes, loan repayment history index, adjustment customer history index, unique adjustment reversal lineage, ledger loan lookup, and unique customer financial-version lock.
* Transactions/audit: every multi-record financial operation and audit event shares the Mongo transaction.
* Evolution: additive and backward-compatible. Existing trade receivable, advance, customer payment, sale cancellation, and credit-limit semantics remain unchanged.
* Real Mongo: isolated replica-set tests prove rollback of a partially attempted loan and serialized concurrent repayment.

## Validation

* Customer Finance focused service tests: **10 passed**
* Customer Finance real-Mongo integration: **2 passed**
* Existing customer allocation, sales/cancellation/returns accounting, dashboard integrity, treasury, and customer opening regression selection: **16 passed**
* Architecture boundary gate: **6 passed**
* Backend build: pass
* Repository lint: pass after the implementation introduced no new lint errors; existing warnings remain
* Full repository regression/smoke was intentionally not run for this light implementation phase.

## Frontend handoff

* Use the three API path constants exported by `@agrivio/api-contracts`.
* Send `Idempotency-Key` on every mutation.
* On stale adjustment HTTP 409, display `error.details.latestBalance` and require review before resubmission.
* Keep loan repayment separate from Customer Payment. Do not offer advance application or overpayment on the loan repayment form.
* After successful money operations, invalidate account list/summary/movements, customer detail/ledger/loans, dashboard, and reports. Non-cash balance adjustments should not invalidate account balance data.
