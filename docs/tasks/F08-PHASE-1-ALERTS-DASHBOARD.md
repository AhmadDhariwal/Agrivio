# F08 Phase 1 — Inventory Alerts, Dues Alerts, and Operational Dashboard

## Task Status

* Status: **Complete** (implementation)
* Date: 2026-08-14
* Work items: `R1-F08-001`, `R1-F08-002`, `R1-F08-003`
* Does **not** implement `R1-F08-004`+ (fixed reports, exports, imports, audit/backup views, suspended policy F08-009, vertical-slice E2E)

## Scope Delivered

### R1-F08-001 — Low stock / expiry / expired / dead-stock alerts

Read-only Alerts queries over Inventory public reads (`listBalances`, `queryExpiry`) and Sales `listPostedSaleProductActivity`.

* Low stock: sellable on-hand ≤ product+warehouse threshold (BR-ALERT-002)
* Upcoming expiry / expired: Inventory `classifyExpiry` / `queryExpiry` (BR-ALERT-003/004, FR-INVENTORY-013 threshold days)
* Dead stock: sellable > 0 and no posted sale in configured inactivity window (BR-ALERT-005/006); inactivity days are persisted, never silently hardcoded
* `notification_items` for in-app presentation/acknowledgement only
* Alerts do not mutate Inventory or ledgers

### R1-F08-002 — Customer / supplier dues alerts

Dues from Payments/Ledgers `listCustomerReceivableBalances` / `listSupplierPayableBalances`, which sum posted `ledger_effects` (same source as `sumCustomerReceivable` / `sumSupplierPayable`).

### R1-F08-003 — Dashboard operational views

Reporting `GET /api/v1/dashboard` composes FR-REPORT-001 / RELEASE_1_SCOPE widgets from Sales, Purchases, Accounts/Expenses, Ledgers, Alerts, and shared `computeGrossProfitFromEffects` (BR-REPORT-001/004/005/007). No dashboard collection. `reportsExports` entitlement is surfaced as `entitlements.reportsExportsAllowed` (export APIs remain F08-005).

## Model review (A/B)

| Model | Class | Result |
| --- | --- | --- |
| `notification_items` | A | Frozen Alerts presentation/acknowledgement |
| `alert_settings` (`deadStockInactivityDays`) | B | Org-level inactivity config required by FR-ALERT-010/012; not in Frozen 35-collection list |
| `low_stock_thresholds` (product+warehouse qty) | B | FR-ALERT-009; not in Frozen 35-collection list |
| No stock/ledger balance fields on Alerts | — | Calculations read Inventory/Ledgers |

## Angular

* `/app/dashboard` — Frozen minimum widget coverage
* `/app/alerts` — notification center + acknowledge
* Shell nav gated by `dashboard.view` / `alerts.view`

## Validation

* `f08-p1.spec.js` — **6 passed**
* `f08-p1-http.spec.js` — **2 passed**
* Architecture (`test:architecture`) — **4 passed**
* Angular dashboard + notification-center specs — **2 passed**
* Lint: backend **0 errors** (existing warnings); frontend existing warnings only
* Typecheck **pass**
* Frontend + backend build **pass**
* No browser E2E (deferred to F08 P5 / F08-010)

## Prompt vs Frozen

* Prompt listed dashboard widgets; Frozen FR-REPORT-001 / RELEASE_1_SCOPE define the exact set — implementation follows Frozen.
* Frozen DATA_MODEL lists only `notification_items` for Alerts. Product+warehouse low-stock and org dead-stock inactivity required extra Alerts-owned collections rather than residual `organization_settings` (explicitly rejected) or duplicated Inventory balances.
* Frozen API_DESIGN has no threshold-config HTTP routes; config is Alerts-owned persistence used by queries (upsert via service for tests/setup). Residual settings continue to reject those keys.
* `reports.view` / fixed reports are F08-004; dashboard uses `dashboard.view` plus entitlement flag only.

## Next

* F08 P2 — `R1-F08-004` fixed reports (gross profit, valuation, etc.)
