# F06 Phase 2 — Sale Posting, Tier Pricing, Payments

## Task Status

* Status: **Complete** (implementation)
* Date: 2026-08-12
* Work items: `R1-F06-004`, `R1-F06-005`, `R1-F06-006`
* Does **not** implement `R1-F06-007+` (credit-limit/expired/negative-stock approvals, cancellation, returns)

## Scope Delivered

### R1-F06-004 — Sale posting with FEFO/FIFO allocation and unit conversion

* `postSale` — single Mongo transaction: invoice allocation, FEFO/FIFO stock outbound, COGS, receivable/payment/account effects
* `POST /api/v1/sales/:id/post` with `sales.post`, CSRF, Idempotency-Key
* `updateSaleIfDraft` optimistic concurrent-post guard
* Extended `sales` model: totals, payment snapshots, line stock allocations, COGS snapshots
* Added `sale` to inventory `stock_movements` source types
* Wired inventory, payments, accounts into sales module via `app.js`

### R1-F06-005 — Tier pricing and permissioned price override

* Tier price resolution from customer `priceTier` (retail fallback for walk-in)
* Override requires `pricing.override` permission + per-line reason + audit (`sale.price.overridden`)
* Posted line snapshots: `priceTierSnapshot`, `catalogPriceMinorUnits`, `priceOverrideReason`
* Angular: auto-fill tier price on customer/product change; override reason field; tier display on posted sale

### R1-F06-006 — Cash credit partial and mixed sale payments

* Cash (walk-in full pay), credit (no payments), partial, and mixed payment modes
* `postCustomerReceivableEffect` + `postCustomerPaymentInSession` for registered customers
* Walk-in cash: account movements only; anonymous walk-in credit blocked (BR-SALE-014)
* Enhanced `listUnpaidCustomerSales` with payment allocation netting

## Model review (A/B)

| Model | Class | Result |
| --- | --- | --- |
| `sales` (extended) | A | Posted totals, payment snapshots, line pricing/COGS/allocation snapshots |
| `stock_movements` (extended enum) | reuse | Added `sale` source type |

## Validation

* `f06-p2.spec.js` — HTTP: walk-in cash, customer credit/partial/mixed, tier pricing, override audit, idempotency, walk-in credit block, immutability
* `f06-p2-mongo.integration.spec.js` — rs0: atomic post, idempotency replay, ledger/payment/stock reconciliation, concurrent guard
* Playwright `f06-p2-sales.e2e.spec.ts`
* Full gate: lint, typecheck, unit, architecture, build, e2e

## Next

* F06 P3: `R1-F06-007` credit-limit / expired-stock / negative-stock sale approvals

## Post-audit customer accounting corrections (2026-09-20)

* Sale posting now consumes available customer advance through paired signed receivable/advance ledger effects; the posted amount due is net of explicit payments and applied advance.
* Sale cancellation appends linked opposite effects that restore consumed advance without editing historical ledger rows.
* Both credit-limit evaluations use ledger exposure: current receivable minus available advance plus projected new credit.
* General customer payments include the customer opening receivable as the oldest FIFO allocation target; excess still becomes customer advance.
* Posted customer opening balances are corrected only through an idempotent reasoned reversal-and-replacement command with actor audit.
* Dashboard financial summary now exposes total receivable, total customer advance, and net exposure (`receivable - advance`).

Model review: existing tenant-owned `ledger_effects` and `payment_allocations` remain Payments/Ledgers-owned, organization-scoped, append-only, and transactionally written. The changes are backward-compatible enum extensions (`sourceType` and allocation `targetType`); they require no backfill or destructive migration. Existing source indexes remain valid, and real-Mongo tests cover the updated validators and allocation persistence.
