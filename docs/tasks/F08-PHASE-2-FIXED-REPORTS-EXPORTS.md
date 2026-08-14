# F08 Phase 2 — Fixed Reports and Exports

## Task Status

* Status: **Complete** (implementation)
* Date: 2026-08-14
* Work items: `R1-F08-004`, `R1-F08-005`
* Does **not** implement `R1-F08-006`+ (Excel imports, audit UI, backup/restore views, F08-009 suspended-policy work, vertical-slice E2E)

## Scope Delivered

### R1-F08-004 — Fixed reports

Read-only Reporting queries over public/read contracts (Sales, Purchases, Returns, Inventory, Payments/Ledgers, Accounts/Expenses, Alerts, Catalog, Customers). No Reporting collections. No ad-hoc report builder.

Families: sales, purchases, gross-profit, stock, stock-valuation, stock-movements, customer-ledger, supplier-ledger, account-cash-book, expenses, low-stock, expiry, dead-stock, top-products, top-customers, employee-sales.

Product/category/branch/date-range variants via Frozen-applicable filters (`groupBy` on sales/purchases). Backend validates filters; inapplicable filters are rejected.

Gross profit uses shared `computeGrossProfitFromEffects` (BR-REPORT-001/004/005/007) from posted sale WAC COGS snapshots and posted sales-return effects. Dashboard and report reconcile for the same scope.

Stock valuation uses Inventory `listBalances` warehouse-product WAC `valuation` (deduped; not a second engine).

### R1-F08-005 — Exports

`POST /api/v1/reports/:reportKey/export` with `format` pdf | excel | csv. Exporters consume the same canonical dataset as GET. Transient buffers only. `reports.export` + `reportsExports` entitlement. Subscription `suspended-read` middleware reused (no F08-009 policy). No scheduled/email exports.

## Angular

* `/app/reports` — catalog, applicable filters, run, empty/error/permission, totals, PDF/Excel/CSV actions
* Shell nav gated by `reports.view`

## Validation

* `f08-p2.spec.js` — focused report/reconciliation/export/architecture
* `f08-p2-http.spec.js` — catalog/query HTTP + unentitled export + unauthenticated
* Architecture (`test:architecture`)
* Angular reports page spec
* Lint / typecheck / build (see completion report)

## Next

* F08 P3 — `R1-F08-006` Excel import preview and execution
