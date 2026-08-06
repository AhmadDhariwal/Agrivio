# F01 Phase 1 — Platform Runtime Foundation

## Task Status

* Status: **Complete** (unit-level); live MongoDB integration **pending** (Docker / CI)
* Completed roadmap IDs: `R1-F01-001`, `R1-F01-002`, `R1-F01-003`, `R1-F01-004`, `R1-F01-005`
* Completion date: 2026-08-06
* Next phase: **F01 Phase 2** — transaction abstraction, idempotency, tenant repository, audit, validation primitives (`R1-F01-006` onward; do not start until this phase gate is accepted)

## Goal

Deliver platform runtime infrastructure under `apps/backend/src/platform/` without business routes, authentication, tenancy, repositories, or domain models.

## Frozen Sources (read scope)

* [IMPLEMENTATION_ROADMAP.md](../IMPLEMENTATION_ROADMAP.md) — `R1-F01-001` through `R1-F01-005`
* [ARCHITECTURE.md](../ARCHITECTURE.md) — configuration, logging, observability, API error handling
* [API_DESIGN.md](../API_DESIGN.md) — §3–4 envelopes and error codes; public liveness path
* [MODULE_BOUNDARIES.md](../MODULE_BOUNDARIES.md) — Platform / Operations ownership
* [DATA_MODEL.md](../DATA_MODEL.md) — MongoDB baseline (connection only)
* [TEST_STRATEGY.md](../TEST_STRATEGY.md) — unit test locations
* [QUALITY_GATES.md](../QUALITY_GATES.md) — continuous gates

## Completed Roadmap IDs

| ID | Result |
| --- | --- |
| R1-F01-001 | Pass — fail-fast runtime config under `platform/config`; secrets never returned to clients |
| R1-F01-002 | Pass — request ID generation/acceptance, response header + envelope propagation |
| R1-F01-003 | Pass — structured JSON logging with field redaction |
| R1-F01-004 | Pass — central error handler + frozen envelopes via `@agrivio/api-contracts` |
| R1-F01-005 | Pass — Mongoose lifecycle adapter, public liveness, operational readiness (DB ping) |

## Platform Components

| Area | Location |
| --- | --- |
| Runtime configuration | `apps/backend/src/platform/config/runtime-config.js` |
| Request context / ID | `apps/backend/src/platform/http/` |
| Response envelopes | `apps/backend/src/platform/http/response-envelope.js` |
| Structured logging | `apps/backend/src/platform/logging/` |
| Application errors | `apps/backend/src/platform/errors/` |
| Health (liveness + readiness) | `apps/backend/src/platform/health/` |
| MongoDB lifecycle | `apps/backend/src/platform/database/mongo-connection.js` |
| Shared transport contracts | `packages/api-contracts/src/lib/api-contracts.ts` |

### HTTP surfaces

| Probe | Path | Behaviour |
| --- | --- | --- |
| Liveness | `GET /api/v1/health` | Always `{ data: { status: 'ok' } }` when process is up; no DB topology |
| Readiness | `GET /api/v1/platform/operations/readiness` | `200` + `{ status: 'ready' }` when DB ping succeeds; `503` + `{ status: 'not_ready' }` otherwise |

## Focused Validation

| Suite | Result |
| --- | --- |
| `nx run backend:test` | Pass — 21 tests (config, request ID, redaction, error mapping, health, DB mock lifecycle, 404 envelope) |
| `nx run api-contracts:test` | Pass — 3 tests (transport surface + envelope builders) |
| Config failure | Pass — `runtime-config.spec.js` |
| Secret redaction | Pass — config + log field specs |
| Request ID propagation | Pass — `health.routes.spec.js` |
| Unknown error sanitization | Pass — `map-http-error.spec.js` (production vs development) |

## Final Phase Gate (`pnpm check`)

Runtime: Node `v22.22.2` (repo engines prefer `>=24.18.0`); `corepack pnpm` `11.17.0`.

| Step | Result |
| --- | --- |
| `pnpm format:check` | **Fail** — Pre-existing formatting drift in unrelated files (`README.md`, `apps/backend/vitest.config.mts`, `packages/tooling-config/eslint/base.mjs`, `scripts/architecture-placeholder.mjs`); F01 platform files formatted |
| `pnpm lint` | Pass (backend: 0 errors; 1 pre-existing-style warning cleared) |
| `pnpm typecheck` | Pass after `maxNodeModuleJsDepth: 0` in `apps/backend/jsconfig.json` (Mongoose dependency) |
| `pnpm test:unit` | Pass |
| `pnpm test:architecture` | Pass (placeholder) |
| `pnpm build` | Pass |

## Docker-Dependent Validation (Pending)

| Proof | Result |
| --- | --- |
| Live Mongoose connect to replica set `rs0` on startup | **Not verified** — Docker CLI absent on this machine (same as F00 Phase 1) |
| Readiness against real MongoDB | **Not verified** — covered by mock adapter in unit tests |
| Graceful shutdown against live DB | **Not verified** — pending Docker or CI |

Record for CI: run `pnpm db:up`, `pnpm db:init`, then boot `nx serve backend` and hit readiness endpoint.

## Files Changed (main)

* `apps/backend/src/platform/**` — new platform runtime modules and specs
* `apps/backend/src/app.js`, `apps/backend/src/main.js` — bootstrap wiring + graceful shutdown
* `apps/backend/jsconfig.json` — `skipLibCheck`, `maxNodeModuleJsDepth`
* `apps/backend/package.json` — `mongoose@8.15.0`
* `packages/api-contracts/src/lib/api-contracts.ts` — envelopes, paths, header constants
* `packages/api-contracts/src/index.ts` — ESM `.js` re-export
* Removed legacy `apps/backend/src/config/env.js` (superseded by `platform/config`)

## Out of Scope (unchanged)

* `R1-F01-006`–`R1-F01-011` (transactions, idempotency, tenant repository, audit, validation helpers)
* Authentication, tenancy, business routes, Mongoose models
* README / PROJECT_INDEX updates (deferred until full F01 stage exit)

## Genuine Blockers

* None for unit-level completion.
* Full stage F01 exit still requires later work items (`R1-F01-006`+) and live MongoDB proof when Docker or CI is available.

## Suggested Commit Message

```text
feat(platform): add F01 phase 1 runtime foundation for backend

Wire config validation, request IDs, structured logging, API error envelopes,
liveness/readiness probes, and Mongoose lifecycle under apps/backend/src/platform.
Extend @agrivio/api-contracts with shared envelope helpers and health paths.
```

No git commit or push performed.
