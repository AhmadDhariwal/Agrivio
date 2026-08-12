# F05 Phase 3 — Standalone Supplier Payments, Cancellation, Returns, Reconciliation

## Task Status

* Status: **Complete** (implementation)
* Date: 2026-08-12
* Work items: `R1-F05-007`, `R1-F05-008`, `R1-F05-009`, `R1-F05-010`
* Final F05 Purchases & Supplier Payables phase
* Does **not** implement F06 Sales/POS or general F07 returns/accounts/expenses beyond purchase-return orchestration required by `R1-F05-009`

## Scope Delivered

### R1-F05-007 — Supplier payments and advances outside purchase post

* Live outstanding payable derived from `purchaseTotal − posted allocations − purchase-return credits` (not stale `payableTotalMinorUnits` snapshot)
* Invoice-specific and general standalone supplier payments reuse `postSupplierPayment` / `postSupplierPaymentInSession`
* General allocation via pure BR-PAYMENT-008 `allocateGeneralSupplierPayment` (oldest unpaid → date → sequence)
* Excess remainder posts `supplier_advance` allocation + ledger effect
* Account movements via Accounts public (`supplier_payment`); Payments does not write `account_movements` directly
* `GET /api/v1/suppliers/:id/unpaid-purchases` for invoice-specific UI
* Idempotency + post-allocation over-allocation conflict protection

### R1-F05-008 — Purchase cancellation

* `POST /api/v1/purchases/:id/cancel` (`purchases.cancel`, reason, Idempotency-Key)
* Preserves original purchase; sets `status=cancelled` + reason/actor/timestamp
* Compensating inventory outbound via `postOutboundIssueInSession` (original receipt value; no negative-stock override)
* Payable reversal + allocation reversals + account refund movements through public interfaces
* Rejects cancel when posted purchase returns exist (BR-PURCHASE-012)
* Double-cancel rejected via `updatePurchaseIfPosted`

### R1-F05-009 — Purchase returns

* New `returns-corrections` module owning orchestration; Purchases validates source via `getPurchaseSourceForReturn`
* `POST /api/v1/purchases/:id/returns` + `POST /api/v1/returns/:id/post`
* Permissions: `returns.post` + `purchases.return`
* Returnable qty and available stock both enforced; batch identity must match original receipt
* Default resolution `ledger_adjustment`; optional `account_refund`
* Collection `returns` (draft → posted)

### R1-F05-010 — Supplier ledger reconciliation + Purchases Angular completion

* Pure `reconcileSupplierLedgerState` + `GET /api/v1/suppliers/:id/reconciliation`
* Angular: invoice-specific/general supplier payments, cancel/return on purchase detail, supplier ledger/reconciliation page
* Critical E2E vertical slice covering payment → return → separate cancel → healthy reconciliation

## Model review (A/B)

| Model | Class | Result |
| --- | --- | --- |
| `returns` | A | Purchase-return source docs; draft/posted/reversed lifecycle |
| `purchases` (extended) | B | `cancellationReason` / `cancelledAt` / `cancelledBy` |
| `ledger_effects` (extended) | B | `purchase_cancellation`, `purchase_cancellation_allocation_reversal`, `purchase_return` |
| `account_movements` (extended) | B | `purchase_cancellation_refund`, `purchase_return_refund` |
| `stock_movements` (extended) | B | `purchase_cancellation`, `purchase_return` |
| No supplier.balance authority | — | Derived from signed effects |

## Validation

* `supplier-reconciliation.spec.js`, `f05-p3.spec.js`
* `f05-p3-mongo.integration.spec.js` — skips when `rs0` unavailable (MongoDB Windows service stopped in this environment)
* Playwright `f05-p3-purchases.e2e.spec.ts` + full E2E suite (**11 passed**, `CI=true`, Playwright-owned servers)
* Gates: lint, typecheck, test:unit, test:architecture, build, test:integration, e2e

## Next

* F06 Sales/POS may begin after F04 exit acceptance (does not require F05)
* Re-run `f05-p3-mongo.integration.spec.js` once local `rs0` PRIMARY is available
