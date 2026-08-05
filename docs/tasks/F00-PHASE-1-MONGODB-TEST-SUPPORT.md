# F00 Phase 1 — MongoDB and Test Foundation

## Task Status

* Status: **Implementation complete** — runtime MongoDB validation blocked in local agent environment (Docker CLI absent)
* Completed IDs: `R1-F00-006`, `R1-F00-010`
* Completion date: 2026-08-05
* Commit hash: `73ee41825056dd8c9f6a88f93d55aa8408c04cc5`
* Next phase: **F00 Phase 2** — `R1-F00-008` Architecture-boundary testing foundation (not started)

## Migration Gate (Node 24.18.0)

Preflight used portable Node `v24.18.0` (`.tools/node-v24.18.0-win-x64`) and pnpm `11.17.0`.

| Step | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Pass |
| `pnpm format:check` | Pass (after `pnpm format` normalized CRLF) |
| `pnpm lint` | Pass |
| `pnpm typecheck` | Pass |
| `pnpm test:unit` | Pass |
| `pnpm test:architecture` | Pass (placeholder) |
| `pnpm build` | Pass |

## R1-F00-006 — Local MongoDB Replica-Set Topology

### Topology

| Setting | Value |
| --- | --- |
| Image | `mongo:8.2.12` |
| Compose file | `tools/docker/mongodb/compose.yml` |
| Replica set | `rs0` |
| Bind | `127.0.0.1:27017` |
| Dev database (documented) | `agrivio_dev` |
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

`db:init` is idempotent (safe to re-run). `db:status` verifies image tag `8.2.12` and PRIMARY election.

### Runtime validation (this environment)

| Check | Result |
| --- | --- |
| `pnpm db:up` | **Fail** — Docker CLI not on PATH |
| Replica-set init / PRIMARY | Not executed (requires Docker) |
| Transaction commit/rollback integration | Not executed against live replica set (requires Docker) |

## R1-F00-010 — Test-Support Package

### Package

* Path: `packages/test-support`
* Name: `@agrivio/test-support`
* Dependency: `mongodb@7.5.0` (aligned with Mongoose `9.8.0` driver line)

### Exported helpers (non-business)

* MongoDB test URI resolution and client lifecycle
* Replica-set PRIMARY assertions
* Isolated `agrivio_test_*` database naming and cleanup
* Multi-document transaction runner and empty-collection verification
* Deterministic test/org id builders (no domain rules)
* `waitForHttpReady` for backend boot tests

### Tests

| Suite | Command | Result (no Docker) |
| --- | --- | --- |
| Unit | `nx run test-support:test` | Pass (3 tests) |
| Integration | `pnpm test:integration` | **Partial** — `replica-set-unavailable` pass; replica-set + transaction tests fail with `MongoServerSelectionError` when stack not running (expected without Docker) |

Integration specs:

* `replica-set.integration.spec.ts` — PRIMARY + DB cleanup
* `transaction.integration.spec.ts` — commit + rollback
* `replica-set-unavailable.integration.spec.ts` — clear failure without server

## Commands Executed

```text
node --version                    # v24.18.0 (portable)
pnpm --version                    # 11.17.0
pnpm install --frozen-lockfile
pnpm format:check / lint / typecheck / test:unit / build
nx run test-support:test
nx run test-support:test-integration   # without MongoDB stack
pnpm db:up                        # failed: no Docker CLI
```

## Versions

| Component | Version |
| --- | --- |
| Node.js | 24.18.0 |
| pnpm | 11.17.0 |
| MongoDB Server (image) | 8.2.12 |
| mongodb driver | 7.5.0 |

## Risks

* Docker Compose v2 must be installed locally/CI before `db:*` and full integration gates succeed.
* Default shell Node on this machine remains `v22.22.2`; use `.nvmrc` / `.node-version` (`24.18.0`).
* Integration tests assume replica set at `mongodb://127.0.0.1:27017/?replicaSet=rs0` (not standalone).

## Confirmation

No architecture fixtures (`R1-F00-008`), GitHub Actions (`R1-F00-009`), auth, Mongoose business models, business routes, or F01 work was started. **Nothing was pushed to remote.**
