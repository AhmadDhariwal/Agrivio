# F04 Phase 1 — Product Batches, Opening Stock, Movements, WAC

## Task Status

* Status: **Complete** (implementation)
* Date: 2026-08-11
* Work items: `R1-F04-001`, `R1-F04-002`, `R1-F04-003`, `R1-F04-004`
* Does **not** implement `R1-F04-005` onward (FEFO/FIFO, expiry alerts, negative-stock override UI, adjustments, transfers, reconciliation reports, purchases/sales)

## Scope Delivered

### R1-F04-001 — Product batches

* Collection `product_batches` with org+product+batchNumber unique identity
* Expiry/manufacture date-only fields; warehouse quantity not duplicated onto batch identity
* Tracking modes `none` / `batch` / `batch_expiry` enforced on opening stock
* Inquiry APIs/UI: `GET /api/v1/inventory/batches`, `/batches/:id`, Angular batches page

### R1-F04-002 — Opening stock posting

* `POST /api/v1/inventory/opening-stock` with `Idempotency-Key`
* Atomic posting: batch (when required) → cost state → balance → stock movement → audit
* Packaging conversion via F03 packaging units; base quantity + conversion snapshot retained
* Opening inventory value seeds WAC (PKR)
* Angular opening-stock page

### R1-F04-003 — Stock movements and inventory balances

* Collections `stock_movements`, `inventory_balances`
* Movements authoritative; balances projected with optimistic `version`
* Inquiry: balances + movements APIs/UI; warehouse assignment filtering
* No direct balance mutation or movement delete/edit endpoints

### R1-F04-004 — WAC cost states

* Collection `inventory_cost_states` keyed by organization+warehouse+product
* `applyInboundWac` implements BR-COST-004/017/018/019/020
* Valuation shown on stock inquiry

## Model review (A/B)

| Model | Result |
| --- | --- |
| `product_batches` | A batch identity; indexes per DATA_MODEL; no warehouse on identity |
| `stock_movements` | A authoritative quantity history; opening_stock source only for P1 |
| `inventory_balances` | A/B projected qty + version concurrency |
| `inventory_cost_states` | A/B WAC projection per warehouse+product |
| Opening source document | Not added — DATA_MODEL has no opening_stocks collection; movement `sourceType=opening_stock` is the auditable source |

Deferred **C/D**: FEFO/FIFO allocation, expiry alert queries, adjustments, transfers, purchase/sale source types, negative-stock override fields beyond generic movement refs.

## Validation

Focused:

* `wac.spec.js` — BR-COST unit proofs (**pass**)
* `f04-p1-inventory.spec.js` — tenant, warehouse, batch/expiry, idempotency, reconciliation, concurrency (**pass**)
* `f04-p1-mongo.integration.spec.js` — indexes, transaction rollback, concurrency on `rs0` (**pass**)
* Playwright `f04-p1-inventory.e2e.spec.ts` — opening stock → stock/movements/valuation (**pass**)

Gates:

```text
npm run lint                 # pass
npm run typecheck            # pass
npm run test:unit            # pass
npm run test:architecture    # pass
npm run build                # pass
npm run test:integration     # pass (rs0 available)
npm run e2e                  # pass (includes f04-p1-inventory)
```

## Next

* F04 P2 (`R1-F04-005`+) after P1 acceptance
