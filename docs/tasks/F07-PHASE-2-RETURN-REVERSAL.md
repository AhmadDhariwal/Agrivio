# F07 Phase 2 — Return Reversal and Purchase-Return Integration

## Task Status

* Status: **Complete** (implementation)
* Date: 2026-08-13
* Work items: `R1-F07-004`, `R1-F07-005`
* Does **not** implement `R1-F07-006`+ (manual account movements, account reversal, expenses, Angular stage-exit E2E)

## Scope Delivered

### R1-F07-004 — Return reversal / shared correction validation

* `POST /api/v1/returns/:id/reverse` (`returns.reverse`, reason, Idempotency-Key)
* Returns/Corrections owns reversal orchestration; Inventory, Payments/Ledgers, Accounts, and Audit are used only through public contracts
* Original posted return remains preserved (lines, totals, reason, resolution snapshots unchanged)
* Linked `corrective_transactions` record references the exact source return (`sourceType=return`, `sourceId`/`reversalOfId`)
* Compensating stock/ledger/account effects use opposite signed values, `reversalOfId` to the source effect, and reversal source types
* No generic `/corrective-transactions`, `/generic-correction`, or `/adjust-anything` endpoint
* Original stock/ledger/account effects are not edited or deleted
* Double reversal rejected; idempotent replay does not duplicate; one Mongo transaction; failure leaves no partial effects
* Audit records source return id and corrective transaction id

### R1-F07-005 — Purchase-return integration

* Existing `returns` purchase-return records remain authoritative; no new purchase-return collection
* Purchase-return posting business rules (qty cap, batch identity, availability, `purchases.return` + `returns.post`) are unchanged
* Purchase returns reverse through the same shared `/returns/:id/reverse` path and `corrective_transactions` linkage
* Purchases still only supplies source data via `getPurchaseSourceForReturn`
* Purchase-return UX points reversal at the shared Returns list; F05 `POST /api/v1/purchases/:id/returns` and `POST /api/v1/returns` draft paths remain

## Model review (A/B)

| Model | Class | Result |
| --- | --- | --- |
| `corrective_transactions` | A | Returns-owned reversal orchestration; unique per source return |
| `returns` (extended) | B | Lifecycle linkage only: `status=reversed`, `reversedByCorrectiveTransactionId`, `reversedAt`, `reversedBy` |
| `stock_movements` (extended) | A | `sales_return_reversal`, `purchase_return_reversal`; `reversalOfId` already existed |
| `ledger_effects` (extended) | A/B | Reversal source types + `reversalOfId` so every corrective effect references its source |
| `account_movements` (extended) | A/B | Refund reversal source types + `reversalOfId` |
| Inventory posting | B | Unsellable outbound so unsellable return reversals net unsellable qty without touching sellable WAC |
| No public corrective CRUD | — | Collection is internal; no generic correction API |

## APIs

| Method | Path | Permission |
| --- | --- | --- |
| POST | `/api/v1/returns/:id/reverse` | `returns.reverse` |

Existing F05/F07 P1 return draft/post/list paths are unchanged.

## Angular workflow

* `/app/returns` reverse action (`returns.reverse`) with required reason; no generic correction affordance
* Purchase detail return create/post unchanged; reversal is directed to the shared Returns list

## Validation

* Focused unit: `apps/backend/src/modules/returns-corrections/f07-p2.spec.js` — **2 passed**
* Real-Mongo rs0: `f07-p2-mongo.integration.spec.js` — **2 passed** (rollback, idempotency)
* F05 purchase-return regression: `f05-p3.spec.js` `-t "purchase returns"` — **1 passed**
* Phase gates (once): `test:architecture` **pass** (4), lint **pass** (existing warnings only), typecheck **pass**, build **pass**
* Browser E2E not run in this phase

## Next

* `R1-F07-006` manual account inflow/outflow/transfer
* Shared correction conventions from this phase are the pattern for later account/expense corrections (`R1-F07-007`+)
