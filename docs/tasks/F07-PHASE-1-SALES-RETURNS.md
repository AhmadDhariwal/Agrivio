# F07 Phase 1 — Linked Sales Returns, Without-Invoice, and Resolution

## Task Status

* Status: **Complete** (implementation)
* Date: 2026-08-13
* Work items: `R1-F07-001`, `R1-F07-002`, `R1-F07-003`
* Does **not** implement `R1-F07-004`+ (return reversal, shared corrective workflow, purchase-return realignment, account transfers/expenses, reporting)

## Scope Delivered

### R1-F07-001 — Linked sales return

* Returns and Corrections owns orchestration; Sales exposes read-only `getSaleSourceForReturn`
* `POST /api/v1/sales/:id/returns` + `POST /api/v1/returns/:id/post` (`returns.post`, Idempotency-Key)
* Remaining returnable quantity = original sold qty minus posted non-reversed returns (BR-RETURN-001)
* Original sale/invoice/effects remain immutable
* Identifiable original batch is restored; unrelated batch IDs are rejected
* One Mongo transaction; Inventory inbound, Payments/Ledgers, Accounts, and Audit participate in the caller session

### R1-F07-002 — Return without invoice

* `POST /api/v1/returns/without-invoice` creates a typed `sales_without_invoice` draft (not a generic return-anything endpoint)
* Product/warehouse/customer-or-identifying-info lookup; batch required when the product is batch-tracked
* Post requires `returns.post` **and** `returns.without-invoice.approve`, mandatory reason, and manually approved refund/credit value
* Audit records approver, reason, and return context; no approval bypass

### R1-F07-003 — Sellable / unsellable + refund resolution

* Explicit `stockCondition` `sellable` | `unsellable` (unsellable requires Frozen reason: expired/damaged/opened/contaminated/other)
* Sellable inbound restores sellable on-hand and WAC using the original COGS snapshot (linked) or current WAC / documented unit cost (without invoice)
* Unsellable inbound increments `inventory_balances.unsellableQuantityBaseMinorUnits` and does **not** enter sellable on-hand or distort WAC
* Financial resolution is exclusive: `ledger_adjustment` posts a customer `sales_return` ledger effect with **no** cash movement; `account_refund` posts a negative `sales_return_refund` account movement (cash/bank/jazzcash/easypaisa) with **no** fabricated ledger credit
* Walk-in ledger adjustment is rejected (no customer ledger)

## Model review (A/B)

| Model | Class | Result |
| --- | --- | --- |
| `returns` (extended) | A | `returnType` `sales` / `sales_without_invoice`; `saleId`; `customerId`; identifying name/phone; line `stockCondition` / `unsellableReason`; `approvedReturnValueMinorUnits`; `withoutInvoiceApproval` snapshot |
| `stock_movements` (extended) | A | source `sales_return`; `stockCondition` sellable/unsellable |
| `inventory_balances.unsellableQuantityBaseMinorUnits` | B | Required so unsellable returns cannot enter sellable on-hand (BR-RETURN-016) |
| `ledger_effects` (extended) | A | source `sales_return` |
| `account_movements` (extended) | A | source `sales_return_refund` |
| No `corrective_transactions` API | — | F07-004 |
| No F07-004 reverse fields / F08 reporting fields | — | Out of scope |

## APIs

| Method | Path | Permission |
| --- | --- | --- |
| POST | `/api/v1/sales/:id/returns` | `returns.post` |
| POST | `/api/v1/returns/without-invoice` | `returns.post` (approve required at post) |
| POST | `/api/v1/returns/:id/post` | `returns.post` (+ `returns.without-invoice.approve` when type is without-invoice) |
| GET/PATCH | `/api/v1/returns`, `/:id` | `returns.view` / `returns.post` |

`POST /api/v1/returns` remains the F05 purchase-return draft path. `POST /api/v1/returns/:id/reverse` is **not** implemented.

## Angular workflow

* Linked return on posted sale detail (`returns.post`): reason, sellable/unsellable, ledger vs cash/bank/digital refund
* `/app/returns` list (`returns.view`) and `/app/returns/without-invoice` (post + without-invoice approve)
* Shell nav `Returns` gated by `returns.view`

## Validation

* Focused unit: `apps/backend/src/modules/returns-corrections/f07-p1.spec.js` — **2 passed**
* Real-Mongo rs0: `f07-p1-mongo.integration.spec.js` — **3 passed** (concurrent cap, rollback, idempotency)
* Focused Playwright `f07-p1-returns.e2e.spec.ts` — **not executed here**: `localhost:3000` is an Agrivio process without e2e bootstrap; `localhost:4200` is occupied by another app (`vmo2-admin`)
* Final gates (once): lint **pass** (existing warnings only), typecheck **pass**, `test:architecture` **pass**, build **pass**, `test:unit` **pass** (195 tests). Full `npm run e2e` not run (focused E2E not green in this environment).

## Next

* `R1-F07-004` return reversal and shared corrective workflow (no generic correction endpoint)
* Re-run focused F07 P1 E2E (and then full `npm run e2e`) when Agrivio can own ports 3000/4200 with `AGRIVIO_ALLOW_E2E_BOOTSTRAP=true`
