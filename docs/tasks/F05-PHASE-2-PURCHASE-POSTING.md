# F05 Phase 2 — Purchase Posting, Landed Cost, Mixed Payments

## Task Status

* Status: **Complete** (implementation)
* Date: 2026-08-11
* Work items: `R1-F05-004`, `R1-F05-005`, `R1-F05-006`
* Does **not** implement `R1-F05-007+` (standalone supplier payment allocation completion, cancellation, returns)

## Scope Delivered

### R1-F05-004 — Purchase posting with batch and expiry receipt

* `POST /api/v1/purchases/:id/post` with `purchases.post`, CSRF, Idempotency-Key
* Atomic orchestration: draft → inventory inbound receipts (batch reuse) → supplier payable → optional payments/account movements → posted purchase snapshots → audit
* Concurrent safety via `updatePurchaseIfDraft` + Mongo transactions
* Posted purchases reject normal edit/discard

### R1-F05-005 — Landed-cost allocation and WAC update

* Pure BR-COST-014/015 allocator (`landed-cost-allocation.js`)
* Receipt inventory value = goods line amount + allocated landed cost
* Inventory WAC updated through `inventoryService.postInboundReceiptInSession`

### R1-F05-006 — Full / partial / mixed purchase payments

* Post body `payments[]` across cash/bank/JazzCash/Easypaisa accounts
* Invoice-specific allocations to the posting purchase
* Purchases owns TX; Payments posts with `postAccountMovement: false`; Accounts posts `purchase_payment` movements
* Full purchase payable = goods + landed; net payable = unpaid

## Model review (A/B)

| Model | Class | Result |
| --- | --- | --- |
| `purchases` (extended) | A | Posted totals, paymentSnapshots, line receipt/landed fields |
| `stock_movements` (extended) | B | `purchase` source type |
| `payments` / `payment_allocations` / `ledger_effects` / `account_movements` | reuse | Purchase-owned posting effects |

## Validation

* `landed-cost-allocation.spec.js`
* `f05-p2.spec.js` — credit/full/partial/mixed, landed WAC, idempotency, immutability, isolation, unauthorized
* `f05-p2-mongo.integration.spec.js` — rs0 atomicity, rollback, concurrent post, reconciliation
* `f04-p3-contracts.spec.js` — `postInboundReceiptInSession` contract
* Playwright `f05-p2-purchases.e2e.spec.ts` + full E2E suite

Gates: lint, typecheck, test:unit, test:architecture, build, test:integration, e2e — **all passed** (E2E with clean Playwright-owned servers / `CI=true`).

## Next

* F05 P3 complete — see [F05-PHASE-3-SUPPLIER-PAYMENTS-CANCEL-RETURNS.md](F05-PHASE-3-SUPPLIER-PAYMENTS-CANCEL-RETURNS.md)
