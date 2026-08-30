# F09 Phase 2 — Security, permission matrix, performance, accessibility

## Task Status

* Status: **R1-F09-002, R1-F09-003, and R1-F09-004 complete** (REL-G06 workstation evidence; REL-G07 pass for Frozen NFR-A11Y-001–006; NFR-A11Y-007 screen-reader combo not in this ID)
* Date: 2026-08-15
* Work items: `R1-F09-002` (accepted), `R1-F09-003` (accepted this record), `R1-F09-004`

## R1-F09-002 — Security review and tenant-isolation attack tests

**Status: complete** for Frozen REL-G03 / REL-G05 evidence in this work item.

Adversarial review of existing Release 1 behavior (not new product features). Preparatory `f09-security-attack.spec.js` was reviewed and replaced with representative attack coverage; it is not treated as previously accepted.

### Finding inventory

| ID | Severity | Endpoint / workflow | Reproduction | Root cause | Fix | Regression test | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F09-002-C1 | — | — | — | No genuine Critical finding | — | — | None |
| F09-002-H1 | — | — | — | No genuine High finding | — | — | None |
| F09-002-M1 | Medium | Auth throttle key (`clientKey`) | Send varying `X-Forwarded-For` on login | First forwarded hop is trusted without an explicit trusted-proxy flag | Production must sit behind a trusted reverse proxy; do not expose Node directly. Not a Frozen throttle-number change | Covered as residual risk; not altered in this item | Open (documented) |
| F09-002-L1 | Low | `X-Platform-Actor` | Header in non-production | Documented test/dev bypass | Production middleware rejects the header | `platform-actor.middleware.spec.js`; F09-002 platform suite | Closed as designed |
| F09-002-L2 | Low | Angular org child routes | Open `/app/purchases` without permission | Frontend has session/platform guards only | Frozen: UI is usability, API is authoritative | `app.routes.spec.ts`; cashier API 403 | Closed as designed |
| F09-002-L3 | Low | Password-reset test handoff | `resetTokenForTest` when `nodeEnv === 'test'` | Test-only delivery of hashed-token plaintext | Client headers cannot select test env; production omits the field | F09-002 CSRF/session suite | Closed as designed |

No risk acceptance was manufactured. QUALITY_GATES still leave exact *production* numeric rate-limit contracts unresolved; the **coded default** remains 20 attempts / 15 minutes, and the 10_000 test ceiling applies only when server `nodeEnv === 'test'`.

### Attack coverage

* Tenant isolation: two real orgs; path/body/filter/warehouse/customer/supplier/product/account/import/audit probes; 403/404 without foreign names or secrets
* Platform vs org: org user cannot use platform APIs; platform context cannot use org APIs; context switch to platform denied; `createSystemScope` rejects request-like tokens; production blocks `X-Platform-Actor`
* Authorization bypass: unauthenticated 401; cashier vs purchases/reports/catalog.manage; StoreKeeper adjacent catalog.manage; foreign warehouse assignment; UI routes are not permission-gated
* CSRF/session: missing/invalid/mismatched CSRF; disallowed Origin/Referer; HttpOnly + SameSite=Lax; login rotation; logout; expired session; reset does not reveal unknown emails
* Subscription: suspended blocks operational writes/imports/dashboard; report view remains allowed; org data retained
* Sensitive data: session/users omit hashes; 404 has no stack; malformed IDs do not 500
* Rate-limit isolation: default 20/15 min; test ceiling only from `nodeEnv === 'test'`

### Out of scope (this ID)

* R1-F09-003 81-permission matrix (REL-G04)
* R1-F09-004 performance/accessibility baselines (REL-G06/G07)

## R1-F09-003 — Permission-matrix verification

**Status: complete** for Frozen REL-G04 against [SECURITY_AUTHORIZATION.md](../SECURITY_AUTHORIZATION.md) §8–§9.6 and implemented route guards.

Preparatory `f09-permission-matrix.spec.js` was reviewed and replaced with Frozen-document parsers plus representative HTTP proofs. It is not treated as previously accepted.

### Catalog and bundles

| Check | Result |
| --- | --- |
| Frozen permission count | 81 |
| Implementation permission count | 81 |
| Missing / extra / duplicate codes | none |
| Owner A-bundle | pass (all organization `A`; no platform `P`) |
| Manager A-bundle | pass (no Owner-only user/settings/restore; no negative-stock override) |
| Cashier A-bundle | pass (no purchases/cancel/approvals/audit by default) |
| Store Keeper A-bundle | pass (no sales/customers/reports by default) |
| Super Admin | pass (platform `P` only; restore excluded unless explicit grant; no org permissions) |

### Endpoint map

Implemented protected routes were checked against [API_DESIGN.md](../API_DESIGN.md) §12. Extra helper routes (print, draft discard, templates, setup progress, reconciliation) use Frozen permission codes. Public/auth-only Frozen rows remain `—`.

### Finding inventory

| ID | Severity | Permission/role/endpoint | Frozen expectation | Implementation | Root cause | Fix | Regression test | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F09-003-C1 | — | — | — | No genuine Critical finding | — | — | — | None |
| F09-003-H1 | — | — | — | No genuine High finding | — | — | — | None |
| F09-003-M1 | Medium | `POST /api/v1/payments/:id/correct` / `payments.correct` | Frozen endpoint with `payments.correct` | Implemented: original posted payment stays immutable; reversal payment + allocation/ledger/account neutralizing effects; optional replacement payment; double-correction 409; Idempotency-Key required | Capability gap closed by defect remediation (not a new roadmap ID) | `POST /api/v1/payments/:id/correct` owned by Payments/Ledgers | `payment-correct.spec.js`, `payment-correct-mongo.integration.spec.js`, permission matrix | **CLOSED** |
| F09-003-M2 | Medium | `POST /api/v1/platform/organizations` / `platform.organizations.create` | Frozen platform create | Implemented via existing R1-F02-006 pending-org path (`pending_approval` org, pending Owner membership, pending_approval subscription). No operational access until approve+activate | Capability gap closed | Reuses `createPendingOrganization`; platform permission `platform.organizations.create` | `f09-platform-org-gaps.spec.js`, Angular create form | **CLOSED** |
| F09-003-M3 | Medium | `POST /api/v1/platform/organizations/:id/suspend` / `platform.organizations.suspend` | Frozen platform suspend | Thin orchestration of R1-F02-011 `suspendSubscription`; org `status` remains `approved`; access follows subscription `suspended`; repeat suspend is idempotent | Capability gap closed | No second suspension state machine | `f09-platform-org-gaps.spec.js` | **CLOSED** |
| F09-003-L1 | Low | `GET /api/v1/platform/operations/readiness` | Frozen public surface is liveness-only `/health` | Unguarded extra readiness probe (`ready`/`not_ready`) | Extra operational route | Not treated as topology leak; not altered here | Matrix extra-route inventory | Open (documented) |
| F09-003-L2 | Low | Cashier shell Adjustments/Transfers links | UI is usability only | Nav gated on `inventory.view` (Cashier `A`), not `inventory.adjust` | Frontend visibility ≠ API auth | API still 403 without adjust/transfer | Angular shell spot check + cashier HTTP 403 on adjustments | Closed as designed |
| F09-003-F1 | — | `POST /api/v1/purchases/:id/returns` | `returns.post` + `purchases.return` | Route middleware had only `returns.post` (service still checked `purchases.return`) | Additive permission not on middleware | Chained `purchases.return` middleware | Architecture + matrix + Store Keeper HTTP 403 | Closed |

No risk acceptance was manufactured. F09-003-M1/M2/M3 Frozen HTTP capability gaps are closed. Remaining F09-003-L1 is an extra unguarded readiness probe, not a missing Frozen endpoint.

### Payment model review (F09-003-M1)

`payments` fields `correctionOfId`, `reason`, `replacementPaymentId` are class **A/B** for Frozen `POST /api/v1/payments/:id/correct` (source-linked, auditable, unique one-correction-per-original). Original posted payments remain immutable. Unique partial index `payments_correction_of_unique`. Ledger reversal source types and account `customer_payment_correction` / `supplier_payment_correction` are required neutralizing effects, not a generic correction API.

### Coverage

* Catalog parsed from Frozen §8 fences vs `PERMISSION_CATALOG`
* Five-role cells parsed from Frozen §9.6 vs `ROLE_MATRIX` / bundle helpers
* Endpoint scan of production `*.routes.js` vs Frozen §12
* Additive approvals: sale cancel, stock adjust, return-without-invoice, purchase-return (middleware); service-level expired-stock / credit-limit / negative-stock / price override remain in posting services
* Representative HTTP allow/deny: organization/settings, catalog, customers/suppliers, inventory, purchases, sales, payments, returns, accounts/expenses, alerts/reports, imports, audit, platform vs org
* Angular Owner/Manager/Cashier/Store Keeper nav spot check (`app-shell.page.spec.ts`); hidden UI is not treated as security
* `npm run test:regression:release` green after closing F09-003-M1/M2/M3 Frozen HTTP gaps (payment correct, platform org create, platform org suspend)

## R1-F09-004 — Performance and accessibility baselines

**Status: complete 2026-08-15.** Accepted non-SLA planning thresholds recorded and measured (REL-G06). Approved WCAG 2.2 AA contrast criteria recorded and rendered contrast measured (REL-G07). This ID does **not** invent a contractual SLA or claim complete WCAG 2.2 AA product conformance.

Commands (not part of `npm test` / unit):

* `npm run test:perf:baseline` — replica-set Mongo HTTP harness, isolated DB, dropped after run; fails if accepted p95/error-rate/correctness checks are exceeded
* `npm run test:perf:navigation` — Playwright route navigation to usable primary content
* `npm run test:a11y:baseline` — Playwright login + shell + critical workflows

### Test environment (measured 2026-08-15)

* Windows 10 10.0.26200, x64, Intel i5-8365U (8 logical), 16 GB RAM, Node v24.19.0
* MongoDB replica set `rs0` PRIMARY on `127.0.0.1:27017`
* Isolated database `agrivio_test_f09_perf_*` (non-production; no client data)

### Synthetic dataset

| Entity | Count |
| --- | --- |
| Products | 2000 |
| Customers | 500 |
| Suppliers | 150 |
| Branches | 2 |
| Warehouses | 3 |
| Opening stock (real posting path) | 24 |
| Posted sales (real path) | 12 + timed/concurrent extras |
| Posted purchases (real path) | 8 + timed extras |
| Import preview rows | 500 |
| Import execute rows | 200 |

### Performance results (server/application HTTP; warm-up discarded; samples retained including outliers)

| Scenario | n | min | p50 | p95 | max | failures |
| --- | --- | --- | --- | --- | --- | --- |
| POS search `GET /products?q=&limit=25` | 11 | 43 | 55 | 78 | 78 | 0 |
| Full catalog list (current POS load) | 7 | 80 | 90 | 95 | 95 | 0 |
| Customer list | 11 | 54 | 62 | 76 | 76 | 0 |
| Supplier list | 11 | 28 | 33 | 46 | 46 | 0 |
| Inventory balances | 11 | 63 | 76 | 92 | 92 | 0 |
| Inventory movements | 11 | 21 | 30 | 35 | 35 | 0 |
| Dashboard | 11 | 110 | 122 | 143 | 143 | 0 |
| Sales report | 7 | 83 | 104 | 113 | 113 | 0 |
| Sale draft+post | 7 | 163 | 187 | 214 | 214 | 0 |
| Purchase draft+post | 5 | 138 | 144 | 165 | 165 | 0 |
| Import preview 500 rows | 3 | 1175 | 1194 | 1345 | 1345 | 0 |
| Import execute 200 rows | 2 | 629 | 629 | 659 | 659 | 0 |

Concurrency (non-prod): 20 virtual users including 5 concurrent sale-posting users; 100 mixed requests; 0 failures; 10 unique posted invoices; no lost stock; no partial payment/stock effects; no tenant leakage (`FOREIGN-LEAK-001` not visible). Mixed-read p95 1431 ms vs idle POS search p95 78 ms (degradation recorded, not an idle-list SLA).

Browser route navigation: `npm run test:perf:navigation` passed (Playwright E2E stack, skip-mongo API; p95 <= 2000 ms to usable primary content).

### Accepted planning thresholds (non-SLA; recorded in [PROJECT_DECISIONS.md](../PROJECT_DECISIONS.md))

| Scenario | metric | measured | accepted | status |
| --- | --- | --- | --- | --- |
| POS product search | p95 | 78 ms | 300 ms | within |
| Common paginated/search list APIs | p95 | 76–95 ms | 500 ms | within |
| Inventory balance/list queries | p95 | 35–92 ms | 500 ms | within |
| Dashboard | p95 | 143 ms | 1,000 ms | within |
| Sale posting | p95 | 214 ms | 1,000 ms | within |
| Purchase posting | p95 | 165 ms | 1,000 ms | within |
| Standard reports | p95 | 113 ms | 2,000 ms | within |
| Browser route navigation | p95 | pass `test:perf:navigation` | 2,000 ms | within |
| Excel import preview, 500 rows | p95 | 1345 ms | 5,000 ms | within |
| Excel import execution, 200 rows | p95 | 659 ms | 5,000 ms | within |
| Normal-request application error rate | rate | 0% | < 1% | within |
| Mixed concurrency | 20 VUs / 5 posters | 0 fail; correctness pass; read p95 1431 ms under load | recorded | within |

**REL-G06: measured within accepted planning thresholds** on this workstation (not a production SLA).

### Performance findings

| ID | Area | Severity | Scenario | Evidence | Root cause | Fix | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F09-004-P1 | performance | High | Customer/supplier lists | 500 customers p95 ~2.2 s then ~90 ms after fix | Per-row ledger `sum*` (N+1) | Batch `mapPartyBalances` | Closed |
| F09-004-P2 | performance | High | Dashboard/standard report | ~1.7 s then ~220 ms | Report category map called `listProducts` (full DTOs) | `listProductCategoryMap` projection | Closed |
| F09-004-P3 | performance | Medium | POS SKU equality explain | `docsExamined` 2000 on `organizationId_1` | Planner did not pick unique `{organizationId,sku}` | `findProductBySku` uses that filter + hint | Closed with residual planner note |
| F09-004-P4 | performance | Medium | Mongoose plan/onboarding HTTP | Plan create 500 | Subscription session port signature mismatch; audit `organizationId: "platform"` cast | Align transaction port; skip invalid ObjectId on audit | Closed |
| F09-004-P5 | performance | Low | Full POS catalog select | 2000 products still loaded by Angular | No Frozen pagination | `q`/`limit` search API + POS filter input; list still unpaginated | Open (documented) |

### Accessibility

R1-F09-004 uses WCAG 2.2 Level AA contrast criteria for NFR-A11Y-006. This does not claim complete WCAG 2.2 AA product conformance.

Workflows measured: login (default, validation error, focus), authenticated shell (nav hover, skip-link styles), dashboard, sales list, POS sale form, purchase form, customer form, supplier form, inventory stock, returns, expenses, accounts, reports, imports (including focus).

Methodology: Playwright collects computed `color` / `background-color` / `border-color` / `outline-color` / `::placeholder` from rendered DOM. Semi-transparent layers are composited onto ancestor backgrounds. Body page gradients are treated as unreliable and evaluated conservatively against `#eef3ef`, `#e4ebe5`, and `#ffffff` (worst ratio must still pass). Inactive (`:disabled` / `aria-disabled`) controls are skipped per WCAG inactive-component exception. Ratios use the relative-luminance formula from WCAG 2.

| Check | Result |
| --- | --- |
| Keyboard | Pass (`npm run test:a11y:baseline`) |
| Semantic controls | Pass |
| Labels | Pass |
| Focus | Pass (`:focus-visible` outline + dual-ring; skip-link focus) |
| Validation | Pass on login (`aria-invalid` / `aria-describedby` / `role="alert"`) |
| Contrast (NFR-A11Y-006) | Pass — 526 rendered pairs in canonical E2E (428 normal text ≥4.5:1, 34 large text ≥3:1, 64 non-text ≥3:1); 10 inactive skipped; 214 conservative-gradient pairs still passed |

**REL-G07: PASS** for Frozen NFR-A11Y-001–006 on critical Release 1 workflows. NFR-A11Y-007 screen-reader combo was not in this ID’s listed NFRs and was not executed.

### Accessibility findings

| ID | Severity | Workflow | Fix | Status |
| --- | --- | --- | --- | --- |
| F09-004-A1 | Medium | Login field errors | `aria-invalid` + `aria-describedby` | Closed |
| F09-004-A2 | Medium | Import file control | Visible `<label>` wrapping file input | Closed |
| F09-004-A3 | Medium | Skip link in SPA | Prevent default hash; focus `#ag-main` | Closed |
| F09-004-A4 | Low | Reports/returns/imports/dashboard errors | `role="alert"` | Closed |
| F09-004-A5 | Medium | Contrast standard unapproved | WCAG 2.2 AA recorded in PROJECT_DECISIONS | Closed |
| F09-004-A6 | High | Control borders ~1.4:1 on white | `--ag-color-border` / `--ag-color-border-strong` darkened; `--ag-border` alias | Closed |
| F09-004-A7 | High | Focus ring 1.6:1 translucent green | Opaque 2px `outline` + dual-offset ring using `--ag-color-focus` | Closed |
| F09-004-A8 | Medium | Unstyled `.ag-btn` UA gray fill | Default `.ag-btn` uses surface + strong border + primary text | Closed |
| F09-004-A9 | Medium | Sidebar Sign out border on `#123528` | Sidebar button border/text override | Closed |
| F09-004-A10 | Low | Skip-link fill vs page gradient | 2px primary border | Closed |
| F09-004-A11 | Low | Dashboard meta used `--ag-muted` fallback | `--ag-color-text-muted`; `--ag-muted` alias | Closed |
| F09-004-A12 | Low | Sale/purchase status banners hardcoded | Reuse `ag-alert` tones | Closed |

## Out of scope for this record


* External penetration-test vendor procurement
* Final SLA contracts
* Claiming F09 stage complete (F09-005+ remain)
* Claiming complete WCAG 2.2 AA product conformance
* NFR-A11Y-007 screen-reader certification
