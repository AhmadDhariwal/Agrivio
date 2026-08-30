# F09 Phase 1 — Full regression suite consolidation

## Task Status

* Status: **Complete** (R1-F09-001 only; proven by canonical release regression)
* Date: 2026-08-14
* Proven: `npm run test:regression:release` green (lint, typecheck, unit, integration, architecture, production builds, Playwright 27/27).
* Work items: `R1-F09-001`

## Scope Delivered

* Canonical REL-G02 command: `npm run test:regression:release` (`scripts/run-regression.mjs --release`).
  Includes lint, typecheck, unit, real-Mongo `test:integration`, architecture, production builds, and Playwright E2E automatically. No hidden environment variable.
* Faster non-E2E command: `npm run test:regression` — same suites except Playwright. Not the release gate.
* Playwright `reuseExistingServer: false` on dedicated ports **3100** (API) and **4300** (web) so developer servers on 3000/4200 are not reused or killed.
* Release mode refuses occupied 3100/4300; it does not kill other processes.
* Release mode deletes `.angular/cache` and sets `NG_BUILD_CACHE=0` on the Playwright frontend server.
* Playwright backend uses `MONGODB_DB_NAME=agrivio_test_e2e`. Test runtime default DB is `agrivio_test_default`, not `Agrivio`.
* Auth rate-limit ceiling override is applied only when `nodeEnv === 'test'`.
* `@agrivio/api-contracts` `require` and `import` are resolved as a regression step.

## Out of scope

* New product features.
* R1-F09-002 through R1-F09-009 (not started as Frozen DoD; later-phase artifacts are preparatory only).

## Next

* F09 Phase 2 (`R1-F09-002`) after this gate remains green — do not treat preparatory P2–P5 files as accepted.
