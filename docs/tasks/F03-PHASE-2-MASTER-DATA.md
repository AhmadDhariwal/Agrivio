# F03 Phase 2 — Catalog, Pricing, Customers, Suppliers, Accounts Master Data

## Task Status

* Status: **Complete** (implementation); **real-Mongo rs0 index proof skipped on this host** (standalone mongod)
* Date: 2026-08-10
* Work items: `R1-F03-005`, `R1-F03-006`, `R1-F03-007`, `R1-F03-008`, `R1-F03-009`, `R1-F03-010`
* Does **not** implement `R1-F03-011` onward or F04

## Scope Delivered

### R1-F03-005 — Categories and products

* `product_categories` / `products` with org isolation, active/inactive, version concurrency
* `productClass` drives mandatory batch tracking for fertilizer/seed/pesticide/chemical
* Tracking modes: `none` | `batch` | `batch_expiry`
* Angular `features/catalog/` category + product list/create/edit

### R1-F03-006 — Base units and packaging conversions

* Product `baseUnitCode` + `measurementDimension` (`mass` | `volume`)
* `product_packaging_units` with positive conversion factors (≤6 decimals)
* Soft-deactivate on replace; design supports later transaction snapshots
* No transaction snapshot posting

### R1-F03-007 — Price tiers and product prices

* Tiers: retail / wholesale / dealer / distributor on `product_prices`
* Customer type remains separate from price tier
* Money via established minor-units + API `{ amount, currency: PKR }`

### R1-F03-008 — Customers and credit policy

* Types: walk_in / farmer / individual / business / corporate
* Credit limit, behaviour (`warning` | `manager_approval` | `block`), `creditEnabled`
* Anonymous walk-in credit rejected
* `PATCH .../credit-policy` with `customers.credit-policy.manage`

### R1-F03-009 — Suppliers

* Org-scoped supplier master (name/phone/contact/email), no payables

### R1-F03-010 — Accounts master data

* Types: cash / bank / jazzcash / easypaisa
* Type-specific metadata only; no movements/openings

## Model review (A/B/C/D)

| Model | Result |
| --- | --- |
| `product_categories` | A fields + B `productClass` for BR-BATCH-001 |
| `products` | A identity/tracking/base unit; no stock/cost |
| `product_packaging_units` | A conversion; soft status for history-friendly replace |
| `product_prices` | A tier/money; not embedded on Product |
| `customers` | A type/tier/credit; no ledger/opening |
| `suppliers` | A identity/contact; no payable/opening |
| `accounts` | A type/name/metadata; no movements/balance |

Deferred **C/D**: stock, batches inventory, openings, ledgers, movements, transfers, price override sales workflow, generic units collection.

## Validation

Focused:

* `f03-p2-master-data.spec.js` — tenant isolation, validation, version conflict, plan product limit (**pass**)
* `conversion-factor.spec.js` (**pass**)
* `f03-p2-mongo.integration.spec.js` — skips unless `rs0` PRIMARY (**skipped** on this host; standalone mongod)
* Playwright `f03-p2-master-data.e2e.spec.ts` (**pass**)

Gates:

```text
npm run lint                 # pass (warnings only)
npm run typecheck            # pass
npm run test:unit            # pass (101 passed; Mongo rs0 suites skipped)
npm run test:architecture    # pass
npm run build                # pass
npm run test:integration     # fail — host Mongo not rs0 (environmental)
npm run e2e -- apps/frontend/tests/e2e/f03-p2-master-data.e2e.spec.ts  # pass
```

## Next

* Enable local Mongo `rs0` to execute real-Mongo index proof
* `R1-F03-011` openings / signed ledger foundations
