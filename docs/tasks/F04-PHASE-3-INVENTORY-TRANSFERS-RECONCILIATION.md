# F04 Phase 3 — Transfers, Reconciliation, Angular Workflows, Shared Contracts

## Task Status

* Status: **Complete** (implementation)
* Date: 2026-08-11
* Work items: `R1-F04-009`, `R1-F04-010`, `R1-F04-011`, `R1-F04-012`
* Final F04 Inventory Engine phase
* Does **not** implement F05 Purchases or F06 Sales/POS workflows

## Scope Delivered

### R1-F04-009 — Warehouse transfers and reversals

* Collection `warehouse_transfers` (draft → posted → reversed)
* Atomic post: outbound source movement + inbound destination movement + balance/cost + audit
* Same org only; source ≠ destination; warehouse assignment + `inventory.transfer` / `.reverse`
* Batch identity preserved across warehouses; outbound WAC value carried exactly inbound (BR-COST-009–011)
* Reversal creates compensating transfer + paired `warehouse_transfer_reversal` movements
* Idempotency-Key on post/reverse; fingerprint includes reason/override fields
* Outbound posting applies balance availability check before cost mutation

### R1-F04-010 — Inventory reconciliation queries

* Pure `reconciliation.js` over authoritative movements/balances/cost states (no new collection)
* `GET /api/v1/inventory/reconciliation` + Angular reconciliation page
* Detects quantity mismatches, missing balances/cost states, valuation drift, zero-qty value residue

### R1-F04-011 — Inventory Angular workflows

* Transfers page + reverse UX
* Reconciliation page
* Batch-aware adjustment picker from authoritative positive balances
* Nav/routes for transfers and reconciliation

### R1-F04-012 — Shared posting contracts

* Public entry points:
  * `modules/inventory/public`
  * `modules/payments-ledgers/public`
  * `modules/accounts-expenses/public`
  * `modules/audit/public`
* Contract/architecture tests prove F05/F06 can depend without foreign persistence imports

## Model review (A/B)

| Model | Class | Result |
| --- | --- | --- |
| `warehouse_transfers` | A | Transfer source docs; lifecycle + paired movement ids + reversal linkage |
| `stock_movements` (extended) | B | `warehouse_transfer` / `warehouse_transfer_reversal` source types |
| No reconciliation collection | — | Query composition only |

## Validation

* `reconciliation.spec.js`, `f04-p3-inventory.service.spec.js`, `f04-p3-contracts.spec.js`
* `f04-p3-mongo.integration.spec.js` on `rs0` PRIMARY when available
* Playwright `f04-p3-inventory.e2e.spec.ts` + full E2E suite
* Gates: lint, typecheck, test:unit, test:architecture, build, test:integration, e2e

## Next

* F05 Purchases / F06 Sales may begin after F04 exit acceptance (requires R1-F03-011 + R1-F04-012)
