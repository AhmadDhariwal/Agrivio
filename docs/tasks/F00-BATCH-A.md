# F00 Batch A — Shared Foundation

## Task Status

* Status: Complete
* Completed roadmap IDs: `R1-F00-004`, `R1-F00-005`, `R1-F00-007`
* Completion date: 2026-08-05
* Commit: _(filled after commit)_
* Next batch: `R1-F00-006` — Local MongoDB replica-set topology (with later `R1-F00-008` architecture harness, `R1-F00-010` test-support)

## Goal

Deliver shared packages, the frozen root command contract, and typed environment validation foundations without MongoDB/Docker, CI, test-support, architecture fixtures, or business modules.

## Frozen Sources

* [TOOLCHAIN.md](../TOOLCHAIN.md) v1.0.1
* [REPOSITORY_INITIALIZATION.md](../REPOSITORY_INITIALIZATION.md) v1.0.1 §7 / §12–13
* [DEVELOPMENT_WORKFLOW.md](../DEVELOPMENT_WORKFLOW.md) v1.0.1 §3 / §9
* [TEST_STRATEGY.md](../TEST_STRATEGY.md) v1.0.1
* [IMPLEMENTATION_ROADMAP.md](../IMPLEMENTATION_ROADMAP.md) `R1-F00-004`, `R1-F00-005`, `R1-F00-007`
* [REPOSITORY_STRUCTURE.md](../REPOSITORY_STRUCTURE.md)
* [MODULE_BOUNDARIES.md](../MODULE_BOUNDARIES.md)
* [QUALITY_GATES.md](../QUALITY_GATES.md)
* [AGENTS.md](../../AGENTS.md)

## Completed Roadmap IDs

| ID | Result |
| --- | --- |
| R1-F00-004 | Pass — `@agrivio/api-contracts` and `@agrivio/tooling-config` created and consumed |
| R1-F00-005 | Pass — full 23-command root contract wired; quality commands succeed |
| R1-F00-007 | Pass — API + browser-safe web env validation with secret redaction |

Explicitly deferred (not part of this batch):

* `packages/test-support` → `R1-F00-010`
* MongoDB / Docker / `db:*` behaviour → `R1-F00-006`
* Architecture fixtures → `R1-F00-008`
* GitHub Actions / Playwright E2E → `R1-F00-009`

## Dry-Run / Generator Evidence

1. `pnpm exec nx g @nx/js:library --help` confirmed positional `directory`, `--importPath`, `--unitTestRunner=vitest|none`, `--bundler=tsc|none`, `--linter=eslint`.
2. Dry-run for `packages/api-contracts` and `packages/tooling-config` succeeded (`NOTE: The "dryRun" flag means no changes were made.`).
3. Generated with frozen positional destinations and import paths.
4. Narrow workaround: `tooling-config` with `--bundler=none` did not emit `package.json`; added package metadata and config exports manually while preserving `@agrivio/tooling-config`.
5. Narrow workaround: TypeScript `6.0.3` requires explicit `rootDir` on project tsconfigs (`TS5011`); set per app/lib/spec config.
6. Generator added `jsonc-eslint-parser` for `@nx/dependency-checks` JSON linting; pinned exact `2.4.2` (support package required by Nx eslint dependency-checks, not listed in primary TOOLCHAIN matrix).

## Generation Commands

```bash
pnpm exec nx g @nx/js:library packages/api-contracts \
  --name=api-contracts \
  --importPath=@agrivio/api-contracts \
  --unitTestRunner=vitest \
  --bundler=tsc \
  --linter=eslint \
  --minimal \
  --no-interactive

pnpm exec nx g @nx/js:library packages/tooling-config \
  --name=tooling-config \
  --importPath=@agrivio/tooling-config \
  --unitTestRunner=none \
  --bundler=none \
  --linter=eslint \
  --minimal \
  --no-interactive
```

## Files Created and Updated

### Created

* `packages/api-contracts/**` — transport contracts package
* `packages/tooling-config/**` — shared TS/ESLint/Prettier/Vitest config package
* `apps/api/src/config/env.ts`, `env.spec.ts`
* `apps/web/src/environments/**`
* `scripts/architecture-placeholder.mjs`
* `scripts/deferred-command.mjs`, `scripts/lib/deferred-command.mjs`
* `docs/tasks/F00-BATCH-A.md`

### Updated

* Root `package.json` — workspace deps + 23 command scripts
* `eslint.config.mjs`, `.prettierrc`, `.prettierignore`, `tsconfig.base.json`
* `apps/api` / `apps/web` tsconfigs, project targets, vitest config, `main.ts`, `app.config.ts`
* `.env.example`, `.gitignore`
* `README.md`, `docs/PROJECT_INDEX.md`
* `pnpm-lock.yaml` (workspace package links / `jsonc-eslint-parser` pin)

## Dependencies Added

| Package | Version | Notes |
| --- | --- | --- |
| `@agrivio/api-contracts` | `workspace:*` | Root + `apps/api` |
| `@agrivio/tooling-config` | `workspace:*` | Root devDependency |
| `jsonc-eslint-parser` | `2.4.2` | Exact pin; Nx dependency-checks support |
| `tslib` in api-contracts | `2.8.1` | Exact TOOLCHAIN version |

No unapproved runtime libraries (no Zod, no dotenv).

## Root Command Contract

All **23** frozen scripts exist:

* Implemented now: `dev*`, `build*`, `lint`, `typecheck`, `test`, `test:unit`, `test:architecture` (placeholder pass), `format*`, `check`, `affected:check`
* Deferred with clear exit/`R1-F00-*` message: `test:integration`, `e2e`, `db:*`

`pnpm check` order: format check → lint → typecheck → unit tests → architecture placeholder → build.

## Environment Validation

### API (`apps/api/src/config/env.ts`)

* Validates `NODE_ENV`, `AGRIVIO_APP_PROFILE`, `HOST`, `PORT`, `MONGODB_URI`, `MONGODB_DB_NAME`, `MONGODB_REPLICA_SET`, `SESSION_SECRET`
* Non-test profiles fail fast on missing/short secrets
* Test profile supplies safe placeholders
* `redactSecrets` / `toSafeApiEnvSummary` prevent secret logging
* Wired into `main.ts` before listen

### Web (`apps/web/src/environments`)

* Browser-safe `publicApiBaseUrl` only
* Rejects secret-bearing keys (`SESSION_SECRET`, `MONGODB_*`, `HOST`, `PORT`)
* Build-time validation via `environment.ts` module load

## Commands Executed

```text
node --version                 # v24.18.0
pnpm --version                 # 11.17.0
pnpm exec nx g @nx/js:library --help
pnpm exec nx g @nx/js:library packages/api-contracts ... --dry-run
pnpm exec nx g @nx/js:library packages/tooling-config ... --dry-run
pnpm exec nx g @nx/js:library packages/api-contracts ...
pnpm exec nx g @nx/js:library packages/tooling-config ...
pnpm install
pnpm install --frozen-lockfile
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:architecture
pnpm build
pnpm build:web
pnpm build:api
pnpm check
pnpm affected:check
```

## Tests and Results

| Suite | Result |
| --- | --- |
| `api-contracts` unit + forbidden-import scan | Pass — 2 tests |
| `api` boot smoke + env validation/redaction | Pass — 7 tests |
| `web` App + public config validation | Pass — 5 tests |
| Architecture placeholder | Pass — deferred message, exit 0 |
| Package builds (`api-contracts`, `api`, `web`) | Pass |
| Root format/lint/typecheck/check/affected | Pass |
| Frozen-lockfile install | Pass |
| Frozen P1-02–P1-07 docs unmodified | Pass |
| Web bundle contains no MongoDB URI / session secret values | Pass (denylist key names only appear in validation code) |

## Quality Gates

| Gate | Result |
| --- | --- |
| WI-G01 Scope check | Pass — Batch A only |
| WI-G02 Frozen-document traceability | Pass |
| WI-G03 Type checking | Pass |
| WI-G04 Linting | Pass |
| WI-G05 Unit tests | Pass — contracts, env, web public config, boot smoke |
| WI-G06–WI-G13 | N/A — no persistence/tenant/auth/subscription behaviour |
| WI-G14 Documentation update | Pass |
| WI-G15 Diff review | Pass — no frozen-doc edits; no unrelated features |

## Risks

* `db:*`, `test:integration`, and `e2e` intentionally fail with deferral messages until later F00 items.
* Architecture suite is a placeholder until `R1-F00-008`.
* `test-support` package intentionally absent until `R1-F00-010` (roadmap DoD for `R1-F00-004` mentions it; batch scope excludes it).
* `@nx/eslint:lint` / `@nx/vitest:test` executors emit Nx v24 migration deprecations (pre-existing pattern).
* API serve requires validated env outside `NODE_ENV=test`; developers should copy `.env.example`.

## Confirmation

No unrelated business modules, auth, Mongoose schemas, Docker/MongoDB topology, GitHub Actions, or product screens were added. Frozen toolchain documents were not modified.
