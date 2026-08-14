# F08 Phase 5 — Alerts, reporting, imports Angular vertical slice

## Task Status

* Status: **Complete** (implementation)
* Date: 2026-08-14
* Work items: `R1-F08-010`
* Does **not** implement F09

## Scope Delivered

P1–P4 engines were left in place. This phase completed missing frontend/backend wiring, the reported F08 navigation defect, focused Playwright coverage, and F08 stage-exit evidence.

### Navigation root cause

Sidebar Alerts / Reports / Audit were registered, permission-gated, and bound with `RouterLink`. Clicks still failed because Vite’s stale `@agrivio/api-contracts` prebundle did not export F08 path constants (`API_REPORTS_PATH`, `API_IMPORTS_PATH`, `API_AUDIT_EVENTS_PATH`, …). Lazy chunks threw `SyntaxError`, Angular cancelled navigation, and the URL stayed on the previous page. Dashboard/Alerts did not import those symbols, so they appeared to work.

**Fix:** import those contract constants from the application bootstrap graph (`app.config.ts`) so the prebundle includes them. Local recovery: clear `.angular/cache` if a stale Vite optimize cache remains. Shell F08 links keep matching `routerLink` + `href`. `data-testid="authenticated-shell"` lives on `.ag-shell` (not only workspace home).

### Alerts

Notification center lists the six Frozen types (low stock, upcoming expiry, expired, dead stock, customer dues, supplier dues) from authoritative APIs and supports acknowledgement. Read-only over source data.

### Reports / export

Report selection, filters, results, totals, PDF/Excel/CSV. Export uses the same canonical report dataset. E2E proves customer-ledger total vs dashboard receivables and CSV contract.

### Imports

Browser workflow: type → upload (`fetch` + `X-Filename`; CORS allows the header) → preview → row errors → confirm → execute → result. Invalid preview does not execute. Representative category import in E2E; all 14 types remain backend-covered from P3.

### Audit

Inquiry loads via sidebar, filters, tenant-scoped events. Customers/imports dual-write to canonical `audit.store` so org inquiry is not empty. No editable audit UI.

### Operations

`/app/platform/operations` shows backup status for a Super Admin. Default Super Admin bundle is **not** granted `operations.restore.execute`. No production restore.

### Suspended UX

P4 Frozen matrix in the browser: dashboard denied; reports/audit remain usable when entitled; imports blocked. No “disable everything.”

### Full-suite login throttle

Playwright shares one test backend and one client key. Default login rate limit (20 / 15 min) blocked later specs once F08 added more sign-ins. **Test `nodeEnv` only** raises `maxAttempts` to 10_000. Production limiter unchanged.

## Model review (A/B)

No new collections. Dual-write of existing audit events onto canonical `audit_events`.

## Validation

* Focused Playwright: `f08-p5-navigation`, `alerts`, `reports`, `imports`, `audit`, `operations`, `suspended` — **7 passed**
* Final F08 gate (once, after login-throttle fix): lint **pass** (existing warnings only), typecheck **pass**, `test:architecture` **4 passed**, build **pass**, `test:unit` **pass** (frontend 73, backend 264, api-contracts 3, test-support 3), `npm run e2e` **26 passed**
* Playwright `reuseExistingServer: false`; stale `:3000`/`:4200` cleared before full E2E

## Next

* F09 — hardening, pilot, and release (`R1-F09-001`+)
