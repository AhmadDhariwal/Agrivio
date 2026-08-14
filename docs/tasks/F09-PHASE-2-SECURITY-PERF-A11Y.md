# F09 Phase 2 — Security, permission matrix, performance, accessibility

## Task Status

* Status: **R1-F09-002 complete; R1-F09-003 and R1-F09-004 not started as Frozen DoD**
* Date: 2026-08-14
* Work items: `R1-F09-002` (accepted this record), `R1-F09-003`, `R1-F09-004`

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

## R1-F09-003 / R1-F09-004

Still **not accepted**. Preparatory permission-matrix and a11y/perf artifacts remain rehearsal only.

## Out of scope for this record

* External penetration-test vendor procurement
* Final SLA contracts
* Claiming Phase 2 complete
