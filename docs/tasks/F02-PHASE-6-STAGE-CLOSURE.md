# F02 Phase 6 — Onboarding E2E, Tenant Isolation, and F02 Stage Closure

## Task Status

* Status: **Implementation complete — stage verification pending**
* Completion date: 2026-08-08
* Branch: `task/R1-F02-P6`
* Work items: `R1-F02-013`, `R1-F02-014`
* Backend convention: Express 5 + JavaScript CommonJS (`require` / `module.exports`)
* Next stage: **F03** entry gate is **not** satisfied until Docker/CI-backed F02 exit verification completes

## R1-F02-001 through R1-F02-014 final status

| ID | Title | Final status |
| --- | --- | --- |
| R1-F02-001 | Global users and credentials | Complete (Phase 4 verified) |
| R1-F02-002 | Memberships and default role bundles | Complete (Phase 4 verified) |
| R1-F02-003 | Opaque sessions and CSRF | Complete (Phase 2; CORS allowlist headers closed in Phase 6) |
| R1-F02-004 | Password reset | Complete (Phase 2) |
| R1-F02-005 | Organization activation requests | Complete (Phase 1) |
| R1-F02-006 | Platform organization create/approve and Owner activation | Complete (Phase 1; platform UI closed in Phase 6) |
| R1-F02-007 | Active session context selection | Complete (Phase 3) |
| R1-F02-008 | Permission evaluation middleware | Complete (Phase 3) |
| R1-F02-009 | Branch and warehouse assignment enforcement foundation | Complete (Phase 4) |
| R1-F02-010 | Plans and subscription records | Complete (Phase 5) |
| R1-F02-011 | Trial/grace/suspension entitlement enforcement | Complete (Phase 5) |
| R1-F02-012 | Manual billing evidence and Super Admin review | Complete (Phase 5) |
| R1-F02-013 | Public landing sign-in and onboarding Angular workflows | Complete (this phase) |
| R1-F02-014 | Cross-tenant isolation and platform context test suite | Complete (this phase) |

## R1-F02-013 delivered

Usable Angular vertical slice:

```text
public landing
→ organization access request
→ platform approval (Organizations UI)
→ Owner activation
→ sign in
→ authenticated session
→ active context
→ authenticated application shell
→ sign out
```

Also kept integrated: password reset, CSRF client attachment, session restoration on shell/context, subscription status banner in shell, permission-aware nav hiding (non-authoritative).

Supporting backend gap closed for browser E2E:

* Explicit CORS allowlist + credentials headers (paired with existing Origin/Referer guard)
* Test-only `POST /api/v1/test/e2e/bootstrap` when `AGRIVIO_ALLOW_E2E_BOOTSTRAP=true` and `NODE_ENV !== production` (impossible in production)
* `AGRIVIO_SKIP_MONGO` permitted only in `NODE_ENV=test` for memory-backed local E2E without Docker

## R1-F02-014 delivered

Dedicated attack suite: `apps/backend/src/modules/identity/tenant-isolation.security.spec.js`

Covers implemented-route attacks with two organizations plus platform/org actors:

* cross-tenant organization read isolation
* membership/context identifier escalation denial
* cross-tenant branch/warehouse assignment denial
* organization context cannot invoke platform administration
* platform context does not inherit organization APIs
* organization role cannot gain platform permissions
* unknown permissions default-deny
* revoked membership loses access / stale scope cleared
* CSRF required on authenticated mutations
* tampered session credentials fail safely
* subscription suspension blocks operational writes
* permitted suspended reads (subscription + organization view)
* billing records cannot be accessed cross-tenant
* platform plan management remains platform-only
* UI hiding is not authorization (direct API deny)

## F02 exit-gate evaluation

| Exit criterion | Evidence | Status |
| --- | --- | --- |
| 1. Organization onboarding works end-to-end | Playwright `onboarding.e2e.spec.ts` + Angular workflows | Local E2E runnable with skip-mongo; CI/Docker evidence pending |
| 2. Cross-tenant isolation suite passes | `tenant-isolation.security.spec.js` | Local unit/security harness green |
| 3. Subscription suspension blocks operational writes | Phase 5 + Phase 6 attack suite | Local green |
| 4. Platform and organization contexts remain separated | Phase 3 + Phase 6 attack suite | Local green |
| 5. Permission enforcement is backend-authoritative | Phase 3/6 suites; UI checks non-authoritative | Local green |
| 6. Session/CSRF controls remain valid | Phase 2 + Phase 6 CSRF/CORS tests | Local green |
| 7. Branch/warehouse assignment enforcement remains valid | Phase 4 + Phase 6 probes | Local green |
| 8. No unresolved Critical defects for F02 | None known from this phase | Local claim only |

Applicable QUALITY_GATES stage checks:

* ST-G01 work items complete (implementation)
* ST-G02 architecture suite (local gate)
* ST-G03 no known Critical defects from this work
* ST-G05 security controls covered locally
* ST-G06 workflow E2E authored; CI Chromium evidence pending
* ST-G08 this stage report

## Local tests

| Suite | Result |
| --- | --- |
| Focused `tenant-isolation.security.spec.js` | passed |
| Focused `cors-e2e-bootstrap.spec.js` | passed |
| Backend unit (`npm run test:unit` backend portion) | 25 files / 80 tests passed |
| Frontend unit | 14 files / 18 tests passed |
| Playwright Chromium (`onboarding.e2e` + smoke) | 2 passed (local; `AGRIVIO_SKIP_MONGO=true`) |
| Lint | passed |
| Typecheck | passed |
| Architecture | passed |
| Build | passed |

## CI/Docker evidence status

* Docker unavailable on the Phase 6 implementation machine for replica-set proofs
* Local Playwright used memory persistence + `AGRIVIO_SKIP_MONGO` (not a substitute for CI Mongo-backed smoke)
* GitHub workflows `quality`, `integration`, `e2e-smoke` remain compatible; CI Chromium E2E against started Mongo + apps is still required to close stage verification
* Do **not** treat F02 as fully closed until CI/Docker-backed integration and E2E smoke evidence is recorded

## Residual risks / deferred infrastructure proofs

* Mongo replica-set TTL/index proofs for identity/org/subscription collections
* CI Chromium E2E green run on GitHub Actions
* Integration job tenant-isolation smoke against replica set
* Storage provider for billing evidence remains unresolved (Phase 5 residual)

## F03 entry gate

**Not satisfied** while F02 remains `implementation complete — stage verification pending`.

## Cleanup

* Replaced F00 scaffold root heading with public landing
* No obsolete temp files retained
* Repo-wide CRLF/Prettier drift intentionally not mass-fixed

## Suggested commit message

```text
feat(f02-p6): close onboarding E2E and tenant isolation suite

Complete R1-F02-013/014 with landing/shell/platform approval UX,
Playwright vertical-slice E2E, CORS credentials allowlist, and
cross-tenant/platform attack coverage. Mark F02 verification pending.
```
