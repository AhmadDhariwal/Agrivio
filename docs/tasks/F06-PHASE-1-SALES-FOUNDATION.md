# F06 Phase 1 — Customer Payments, Sale Drafts, Invoice Numbering

## Task Status

* Status: **Complete** (implementation)
* Date: 2026-08-12
* Work items: `R1-F06-001`, `R1-F06-002`, `R1-F06-003`
* Does **not** implement `R1-F06-004+` (sale posting, pricing overrides, POS payments orchestration, approvals, cancellation, returns)

## Persistence decision (R1-F06-002)

Frozen `DATA_MODEL.md` §8.10 assigns draft and posted lifecycle to the canonical **`sales`** collection (`status=draft|posted|cancelled`). No separate `sale_drafts` collection. Invoice sequence state lives in **`invoice_sequences`** (Sales-owned; branch prefix on `branches`).

## Scope Delivered

### R1-F06-001 — Customer payments, advances, receivable foundation

* `customer-allocation.js` — BR-PAYMENT-004 oldest-first allocation (fixture-driven until posted sales exist)
* Extended `payments.service.js`: `postCustomerPayment`, `postCustomerPaymentInSession`, `postCustomerReceivableEffect`, ledger/list APIs
* Routes: `GET/POST /api/v1/customer-payments`, `GET /api/v1/customers/:id/ledger`
* Opening receivable/advance compatibility preserved via existing F03 ledger effects
* Public contract exports via `payments-ledgers/public`

### R1-F06-002 — Sale drafts

* Sales module: draft create/read/list/edit/discard on `sales` collection
* Zero stock/ledger/account/invoice-sequence effects on draft lifecycle
* Angular sales draft/cart foundation with disabled Post action

### R1-F06-003 — Branch invoice numbering

* `invoice_sequences` model + `allocateInvoiceNumberInSession` (session-scoped, branch/org isolated)
* Format `{branch.invoicePrefix}-{6-digit sequence}` (e.g. `LHR-000001`)
* **Not** called from draft APIs — allocation only via public service for future posting
* Mongo proofs: concurrent uniqueness, branch/org isolation, transaction rollback (no committed sequence on abort)

## Model review (A/B)

| Model | Class | Result |
| --- | --- | --- |
| `sales` (new) | A | Draft fields only; no posted-only snapshots/COGS yet |
| `invoice_sequences` (new) | A | Branch-scoped sequence counter |
| `payments` / `payment_allocations` / `ledger_effects` (extended) | reuse | Customer target types + source types |
| `account_movements` (extended) | reuse | `customer_payment` source type |

No mutable customer balances added.

## Validation

* `customer-allocation.spec.js`, `invoice-sequence.spec.js`, `f06-p1-contracts.spec.js`
* `f06-p1.spec.js` — HTTP: customer payments, drafts, isolation, subscription, idempotency
* `f06-p1-mongo.integration.spec.js` — rs0: draft effectlessness, sequence concurrency/rollback, customer payment
* Playwright `f06-p1-sales.e2e.spec.ts` + full E2E suite

Gates: lint, typecheck, test:unit, test:architecture, build, test:integration, e2e.

## F05 verification debt

Existing `f05-p3-mongo.integration.spec.js` may be run separately when rs0 is healthy; failures are reported independently of F06 scope.

## Next

* F06 P2: `R1-F06-004` sale posting (uses `allocateInvoiceNumberInSession`, inventory, receivable/payment orchestration)
