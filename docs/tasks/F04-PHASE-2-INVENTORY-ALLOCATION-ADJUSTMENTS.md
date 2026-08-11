# F04 Phase 2 — FEFO/FIFO, Expiry, Negative Stock, Adjustments

## Task Status

* Status: **Complete** (implementation)
* Date: 2026-08-11
* Work items: `R1-F04-005`, `R1-F04-006`, `R1-F04-007`, `R1-F04-008`
* Does **not** implement `R1-F04-009` onward (transfers, reconciliation UI, purchases/sales)

## Scope Delivered

### R1-F04-005 — FEFO and FIFO allocation

* Pure `allocation.js` service (FEFO for `batch_expiry`, FIFO otherwise; tie-break `firstReceivedAt` + batch id)
* `allocateStockForProduct` on inventory public service interface (read-only; no stock mutation)
* Unit tests: `allocation.spec.js`, service integration in `f04-p2-inventory.service.spec.js`

### R1-F04-006 — Expiry behaviour foundation

* `expiry.js` classification: `expired` / `upcoming` / `normal` / `not_applicable` (BR-BATCH-012, BR-ALERT-003/004)
* `inventory_settings.expiryThresholdDays` (default 30)
* `GET /api/v1/inventory/expiry` + Angular expiry inquiry page

### R1-F04-007 — Negative-stock block and Owner override

* Shared outbound posting in `inventory-posting.js` with optimistic balance version check
* Default block via `insufficientStock()`; override requires `inventory.negative-stock.override` + reason + audit on movement
* Override metadata on `stock_movements`; Angular override fields on adjustments form

### R1-F04-008 — Stock adjustments and reversals

* Collection `stock_adjustments` (draft/posted/reversed lifecycle)
* APIs per `API_DESIGN.md`: list/create/patch/post/reverse under `/api/v1/stock-adjustments`
* Atomic post: adjustment → movement → balance → WAC → audit; reversal nets via opposite movement
* Types: damage/expiry/loss (outbound), correction (inbound/outbound with explicit inbound value)
* Angular adjustments page

## Model review (A/B)

| Model | Class | Result |
| --- | --- | --- |
| `stock_adjustments` | A/B | Adjustment source docs; lifecycle + reversal linkage |
| `inventory_settings` | B | Org expiry threshold ownership (Inventory) |
| `stock_movements` (extended) | B | `stock_adjustment*`, override + reason fields |
| No new alert-cache collections | — | Expiry queries compose authoritative batches/balances |

Deferred **C/D**: transfers, purchases/sales sources, expired-sale approval (F06), alert center (F08)

## Validation

Focused:

* `allocation.spec.js`, `expiry.spec.js`, `wac.spec.js` (outbound) — **pass**
* `f04-p2-inventory.service.spec.js` — allocation, negative stock, override, adjustment, reversal — **pass**
* `f04-p2-mongo.integration.spec.js` — idempotency, negative block, reversal reconcile on `rs0` — **pass** when PRIMARY available
* Playwright `f04-p2-inventory.e2e.spec.ts` — P2 vertical slice — **pass**

Gates: `npm run lint`, `typecheck`, `test:unit`, `test:architecture`, `build`, `test:integration`, `e2e`

## Next

* F04 P3 (`R1-F04-009`+) warehouse transfers after P2 acceptance
