# F00 Phase 1 — MongoDB and Test Foundation

## Task Status

* Status: **Incomplete** — implementation present; final runtime validation blocked (Docker Compose v2 / Docker CLI absent)
* Completed IDs (implementation): `R1-F00-006`, `R1-F00-010`
* Final validation date: 2026-08-05
* Local implementation commit (prior): `8c783dead9410bdf42ecdd923f2425766dcc8680`
* Next phase: **F00 Phase 2** — `R1-F00-008` (do not start until this phase validation is green)

## Final Validation Gate (Node 24.18.0 / pnpm 11.17.0)

Runtime: portable Node `.tools/node-v24.18.0-win-x64` → `v24.18.0`; `corepack pnpm` → `11.17.0`.

| Command | Exit | Result |
| --- | --- | --- |
| `pnpm db:up` | 1 | Fail — `Docker CLI was not found. Install Docker Compose v2 and ensure docker is on PATH.` |
| `pnpm db:init` | 1 | Fail — same Docker CLI absence |
| `pnpm db:status` | 1 | Fail — same Docker CLI absence |
| `pnpm test:integration` | 1 | Fail — 4 tests timed out connecting to `127.0.0.1:27017`; 1 unavailable-endpoint test passed |

### Required proofs

| Proof | Result |
| --- | --- |
| MongoDB `8.2.12` image running | **Not verified** (Compose never started) |
| Replica set `rs0` | **Not verified** |
| Member state PRIMARY | **Not verified** |
| Transaction commit test | **Fail** — `MongoServerSelectionError: Server selection timed out after 5000 ms` |
| Transaction rollback test | **Fail** — same timeout |
| Test database cleanup | **Fail** — same timeout (suite never reached live DB) |

### Integration suite detail

```text
✓ replica-set-unavailable.integration.spec.ts (1 passed)
× replica-set.integration.spec.ts (2 failed — no MongoDB)
× transaction.integration.spec.ts (2 failed — no MongoDB)
Test Files  2 failed | 1 passed (3)
Tests       4 failed | 1 passed (5)
```

No implementation defect was identified. Failure is environmental: Docker Desktop / Docker Compose v2 is not installed on this machine (`docker.exe` not present under Program Files or PATH).

## Migration Gate (Node 24.18.0) — earlier in phase

| Step | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Pass |
| `pnpm format:check` | Pass |
| `pnpm lint` | Pass |
| `pnpm typecheck` | Pass |
| `pnpm test:unit` | Pass |
| `pnpm test:architecture` | Pass (placeholder) |
| `pnpm build` | Pass |

## R1-F00-006 — Local MongoDB Replica-Set Topology

### Topology (configured)

| Setting | Value |
| --- | --- |
| Image | `mongo:8.2.12` |
| Compose file | `tools/docker/mongodb/compose.yml` |
| Replica set | `rs0` |
| Bind | `127.0.0.1:27017` |
| Dev database | `agrivio_dev` |
| Test DB prefix | `agrivio_test_` |

### Lifecycle scripts

| Command | Script |
| --- | --- |
| `pnpm db:up` | `scripts/mongodb/up.mjs` |
| `pnpm db:init` | `scripts/mongodb/init.mjs` |
| `pnpm db:status` | `scripts/mongodb/status.mjs` |
| `pnpm db:logs` | `scripts/mongodb/logs.mjs` |
| `pnpm db:down` | `scripts/mongodb/down.mjs` |
| `pnpm db:reset` | `scripts/mongodb/reset.mjs` |

## R1-F00-010 — Test-Support Package

* Package: `@agrivio/test-support` / `packages/test-support`
* Driver: `mongodb@7.5.0`
* Unit tests: Pass (3)
* Integration tests: Require running replica set from `pnpm db:up` + `pnpm db:init`

## Blocker to mark phase complete

Install and start **Docker Compose v2**, ensure `docker` is on `PATH`, then re-run:

```bash
pnpm db:up
pnpm db:init
pnpm db:status
pnpm test:integration
```

Do not begin F00 Phase 2 until those four commands pass under Node `24.18.0`.

## Confirmation

No Phase 2 / F01 work started. No git commit or push performed for this validation update.
