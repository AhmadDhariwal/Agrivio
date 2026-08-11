# F05 Phase 1 — Supplier Payments Foundation, Account Movements, Purchase Drafts

## Task Status

* Status: **Complete** (implementation)
* Date: 2026-08-11
* Work items: `R1-F05-001`, `R1-F05-002`, `R1-F05-003`
* Does **not** implement `R1-F05-004+` (purchase posting, landed-cost WAC, mixed purchase payments, standalone supplier payments beyond foundation, cancellation, returns)

## Scope Delivered

### R1-F05-001 — Supplier payment, allocation, advance, and payable services

* Collections `payments`, `payment_allocations`
* Extended `ledger_effects` source types for purchase payable / supplier payment allocation / advance
* Pure BR-PAYMENT-008 oldest-first allocator (`supplier-allocation.js`)
* Public Payments service: `postSupplierPayment`, session `postSupplierPaymentInSession`, `postSupplierPayableEffect`, list/get, supplier ledger inquiry
* HTTP: `GET/POST /api/v1/supplier-payments`, `GET /api/v1/supplier-payments/:id`, `GET /api/v1/suppliers/:id/ledger`
* Angular supplier-payments list + general payment form (advance path when no unpaid purchases)
* Opening supplier ledger effects preserved and included in derived payable/advance

### R1-F05-002 — Purchase-side account movement integration

* Reused `account_movements` (no second ledger)
* Extended movement source types: `supplier_payment`, `purchase_payment`
* Strengthened `postAccountMovement` (org ownership + active account)
* Inquiry via existing `GET /api/v1/accounts/:id/movements` + derived balance
* Angular account form shows movement history and derived balance

### R1-F05-003 — Purchase drafts

* New Purchases module + `purchases` collection (`status=draft` only exercised)
* Draft create / list / get / edit / discard (`DELETE` draft)
* Zero stock / ledger / account effects on create, edit, discard
* Line validation: org-scoped supplier/product/warehouse, packaging, qty, cost, batch/expiry vs tracking mode, optimistic `expectedVersion`
* Angular purchases list + draft editor with clear unposted banner

## Purchase persistence decision (`R1-F05-003`)

**Canonical Frozen model:** one tenant-owned `purchases` collection holding draft and posted purchases (DATA_MODEL §8.9; R1-F05-003 Data scope: “`purchases` with status=draft. Draft and posted lifecycle remain in the canonical `purchases` collection.”; R1-F05-004 posts within the same collection; API `/api/v1/purchases`; BR-COMMON draft→posted lifecycle). There is **no** Frozen `purchase_drafts` collection (tenant collection inventory lists only `purchases`).

**Implementation:** `collection: 'purchases'` with `status: 'draft'` (posted statuses deferred to F05 P2). Matches sales pattern (`sales` draft+posted).

**Verdict:** PASS — not a deviation. Any prior wording of `purchase_drafts` was informal agent-prompt language, not Frozen DATA_MODEL.

## Model review (A/B)

| Model | Class | Result |
| --- | --- | --- |
| `payments` | A | Supplier payment source docs; posted-only in P1 |
| `payment_allocations` | A | Purchase or supplier_advance targets |
| `ledger_effects` (extended) | B | Operational supplier payment/payable source types + unique index |
| `account_movements` (extended) | B | `supplier_payment` / `purchase_payment` source types + unique index |
| `purchases` | A | Draft/posted/cancelled lifecycle collection; P1 uses draft only |
| No `supplier.balance` / `account.balance` authority | — | Derived from signed effects/movements |

Deferred **C/D**: posted purchase effects, purchase payments on post, customer payments, expenses, transfers, returns/cancellations.

## Validation

Focused:

* `supplier-allocation.spec.js` — BR-PAYMENT-008 pure allocation
* `f05-p1.spec.js` — isolation, idempotency, draft effectlessness, version conflict, suspended writes, batch rules
* `f05-p1-mongo.integration.spec.js` — rs0 atomicity/idempotency/draft zero effects
* `f04-p3-contracts.spec.js` — public contracts + no foreign persistence imports
* Playwright `f05-p1-purchases.e2e.spec.ts` + full E2E suite

Gates: lint, typecheck, test:unit, test:architecture, build, test:integration, e2e — **all passed** (E2E with clean Playwright-owned servers / `CI=true`).

## Next

* F05 P2 complete — see [F05-PHASE-2-PURCHASE-POSTING.md](F05-PHASE-2-PURCHASE-POSTING.md)
* F05 P3 complete — see [F05-PHASE-3-SUPPLIER-PAYMENTS-CANCEL-RETURNS.md](F05-PHASE-3-SUPPLIER-PAYMENTS-CANCEL-RETURNS.md)