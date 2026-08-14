# F09 Phase 2 — Security, permission matrix, performance, accessibility

## Task Status

* Status: **R1-F09-002 and R1-F09-003 complete; F09-003-M1/M2/M3 Frozen capability gaps closed 2026-08-14; R1-F09-004 not started as Frozen DoD**
* Date: 2026-08-14
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

## R1-F09-004

Still **not accepted**. Performance and accessibility baselines remain out of this ID.

## Out of scope for this record

* External penetration-test vendor procurement
* Final SLA contracts
* Claiming Phase 2 complete
