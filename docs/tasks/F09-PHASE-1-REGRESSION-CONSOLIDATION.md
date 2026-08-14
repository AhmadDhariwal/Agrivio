# F09 Phase 1 — Full regression suite consolidation

## Task Status

* Status: **Complete** (implementation)
* Date: 2026-08-14
* Work items: `R1-F09-001`

## Scope Delivered

* `npm run test:regression` runs lint, typecheck, unit (including Angular), architecture, and production builds as one release-candidate job set.
* Playwright remains `npm run e2e` (CI `e2e-smoke`). Set `AGRIVIO_REGRESSION_E2E=1` to fold E2E into the local regression script.
* Inventory test asserts F02 isolation, architecture, F09 hardening, and E2E a11y surfaces exist.

## Out of scope

* New product features.

## Next

* F09 Phase 2 (`R1-F09-002`–`004`)
