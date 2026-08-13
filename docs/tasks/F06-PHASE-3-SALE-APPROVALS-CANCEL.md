# F06 Phase 3 — Sale Approvals, Walk-in/Customer, Cancellation

## Task Status

* Status: **Complete** (implementation)
* Date: 2026-08-13
* Work items: `R1-F06-007`, `R1-F06-008`, `R1-F06-009`
* Does **not** implement `R1-F06-010` (printing) or `R1-F06-011` (final POS cashier E2E) or F07 returns

## Scope Delivered

### R1-F06-007 — Credit-limit / expired-stock / negative-stock sale approvals

* Post body `approvals.{creditLimit|expiredStock|negativeStock}.reason`
* Distinct permissions: `sales.credit-limit.approve`, `sales.expired-stock.approve`, `inventory.negative-stock.override` (never substitutes for `sales.post`)
* Credit-limit behaviours: `warning` (audit), `manager_approval` (permission+reason), `block` (hard deny)
* Expired stock: allocate non-expired first; include expired only when needed with approval + audit
* Negative stock: Owner override via Inventory public outbound contract; Inventory protections unchanged without override
* Approval snapshots persisted on `sales` + audit events

### R1-F06-008 — Customer and walk-in handling

* Registered customer selection with tenant ownership and price-tier snapshots (existing P2 path retained)
* Anonymous walk-in cash allowed; anonymous walk-in credit blocked
* Named `walk_in` customer credit only when `creditEnabled` + identifying name/phone
* Credit sales require `creditEnabled`

### R1-F06-009 — Sale cancellation

* `POST /api/v1/sales/:id/cancel` with `sales.cancel`, CSRF, Idempotency-Key, required reason
* Single Mongo transaction: restore stock/COGS to original batches, reverse receivable, reverse payment allocations + account refunds
* Original posted invoice preserved (`status=cancelled`); no permanent delete; no in-place rewrite of historical movements
* Double cancel rejected; idempotent retry safe
* Inventory/Payments/Accounts/Audit only through public contracts

## Model review (A/B)

| Model | Class | Result |
| --- | --- | --- |
| `sales` (extended) | A | Approval snapshots + cancellation fields |
| `stock_movements` (enum) | A | Added `sale_cancellation` |
| `ledger_effects` (enum) | A | Added `sale_cancellation`, `sale_cancellation_allocation_reversal` |
| `account_movements` (enum) | A | Added `sale_cancellation_refund` |
| `sales.paymentSnapshots.accountMovementSourceId` | B | Walk-in cash cancel refund linkage |

## Validation

* `f06-p3.spec.js` — approvals, walk-in, cancellation, architecture imports
* `f06-p3-mongo.integration.spec.js` — rs0 isolated DB: atomic cancel, idempotency, reconciliation
* Playwright `f06-p3-sales.e2e.spec.ts`
* Final gates: lint, typecheck, test:unit, architecture, build; focused E2E; full E2E once if focused green

## Next

* Next: F07 after F06 P4 acceptance
