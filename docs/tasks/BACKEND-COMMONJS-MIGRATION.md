# Backend CommonJS Simplification Migration

## Task Status

* Status: Complete
* Completion date: 2026-08-08
* Scope: Coding-style and cleanup migration only (no F02 Phase 2, no new business functionality)
* Next phase: **F02 Phase 1 — Organization Onboarding and Authentication** (session authentication follows in later F02 items)

## Previous Backend Format

* JavaScript native ESM
* `import` / `export`
* `apps/backend/package.json` had `"type": "module"`
* Nx esbuild `format: ["esm"]`

## New Backend Format

* JavaScript CommonJS
* `require()` / `module.exports`
* No backend `"type": "module"`
* Nx esbuild `format: ["cjs"]`
* Backend business pattern remains module/domain-first:
  `Route → Middleware → Controller → Service → Repository when useful → Mongoose Model`

## Files Converted

All backend runtime sources under `apps/backend/src/**/*.js` converted to CommonJS, including:

* `src/main.js`, `src/app.js`
* `src/platform/**/*.js` (config, database, logging, errors, http, health, transactions, idempotency, audit, tenancy, validation, primitives, architecture)

Architecture fixture converted to CommonJS:

* `tests/architecture/fixtures/controllers/forbidden-controller-persistence.fixture.js`

Supporting changes:

* `apps/backend/package.json` — removed `"type": "module"`
* `apps/backend/project.json` — build format `esm` → `cjs`
* `packages/api-contracts/src/index.ts` — unchanged ESM TypeScript entry (`./lib/api-contracts.js`)
* `packages/api-contracts/src/require-entry.cjs` — added CommonJS `require` entry so backend CommonJS can load contracts without converting the TypeScript package
* `packages/api-contracts/package.json` — `exports.require` / `main` point at `require-entry.cjs`

## Files Removed

* `apps/backend/tests/architecture/boundaries.architecture.spec.ts` — replaced by CommonJS/Vitest-compatible `boundaries.architecture.spec.js` (ESM import syntax required by Vitest)

No obsolete ESM shims, empty module folders, or duplicate backend configs were present beyond the package `"type": "module"` flag.

## Tooling Files Intentionally Still ESM

| File / package | Why it remains ESM |
| --- | --- |
| `apps/backend/vitest.config.mts` | Vitest/Vite config requires ESM |
| `apps/backend/eslint.config.mjs` | Flat ESLint config convention / shared root ESM config |
| Root / package `*.mjs` scripts (for example `scripts/run-architecture-tests.mjs`) | Existing Nx/script tooling |
| `packages/tooling-config` (`"type": "module"`) | Shared tooling package; not backend runtime |
| `packages/api-contracts` (`"type": "module"`) | Shared TypeScript contracts package; not converted to CommonJS |
| `packages/test-support` (`"type": "module"`) | Shared TypeScript test helpers; not converted to CommonJS |
| Vitest `*.spec.js` files under `apps/backend` | Use ESM `import` because Vitest forbids `require('vitest')`; they load CommonJS implementation modules |

## Tests

### Retained

* All meaningful backend unit specs (boot, health, config, logging, errors, validation, money, tenancy, transactions, idempotency, audit, request-id)
* Architecture boundary tests
* No behavioural F01 coverage deleted

### Removed / replaced

* `boundaries.architecture.spec.ts` only — superseded by `.js` Vitest file (same assertions)

### Test adjustments

* `instanceof AppError` assertions adjusted to name/shape matching where Vitest ESM tests dual-load CJS modules
* `mapErrorToHttpResponse` now duck-types `AppError` by `name`/`statusCode`/`code` so CJS/ESM boundary dual instances cannot weaken error mapping

## Existing F01 / F02 Functionality

* F01 platform runtime and transactional foundations preserved
* F02 Phase 1 onboarding was **not present** in the tree (no `modules/onboarding`, `/request-access`, `/activate`, or `X-Platform-Actor` middleware)
* No F02 Phase 2 session authentication introduced
* No trial/subscription onboarding behaviour added or removed (none implemented yet)

## Security / Onboarding Corrections

Inspected for the requested concerns; none were present to correct:

1. Development `X-Platform-Actor` auth — absent
2. Approval/rejection endpoint naming — absent
3. Trial/subscription creation during onboarding — absent

## Cleanup

* Removed backend `"type": "module"`
* Removed temporary conversion helper scripts used during migration
* Left Nx, pnpm workspace, shared packages, Mongo/Docker infra, and frontend configuration intact

## Documentation Amended

* `README.md`
* `docs/PROJECT_INDEX.md`
* `docs/TOOLCHAIN.md` (v1.2.0)
* `docs/REPOSITORY_INITIALIZATION.md` (v1.2.0)
* `docs/DEVELOPMENT_WORKFLOW.md` (v1.2.0)
* `docs/TEST_STRATEGY.md` (v1.2.0)
* `docs/REPOSITORY_STRUCTURE.md` (v1.2.0)
* `docs/MODULE_BOUNDARIES.md` (v1.2.0)
* `docs/IMPLEMENTATION_ROADMAP.md` (v1.2.0)
* `docs/QUALITY_GATES.md` (v1.2.0)
* Historical notes on `docs/tasks/R1-F00-003.md` and `docs/tasks/F00-APP-NAMING-BACKEND-JS-MIGRATION.md`

## Validation Evidence

Environment: Node `v24.18.0`, pnpm `11.17.0` (portable Node under `%LOCALAPPDATA%\agrivio-node`).

| Gate | Result |
| --- | --- |
| Backend unit tests (`nx test backend`) | Pass — 14 files / 45 tests |
| Architecture tests (`pnpm test:architecture`) | Pass |
| Unit tests all projects (`pnpm test:unit`) | Pass |
| Lint (`pnpm lint`) | Pass |
| Typecheck (`pnpm typecheck`) | Pass |
| Build (`pnpm build`) | Pass — backend emits CommonJS (`dist/apps/backend` `"type": "commonjs"`) |
| Backend static check (`tsc -p apps/backend/jsconfig.json`) | Pass |
| Prettier on migration-touched backend/docs/contracts paths | Pass |
| Full-repo `pnpm format:check` | Fail on Windows working tree for many **untouched** files due to LF/CRLF (`core.autocrlf`) — pre-existing environment issue; not introduced by this migration |
| Backend startup smoke (`node dist/apps/backend/main.js`, `NODE_ENV=test`) | Process boots CommonJS bundle; exits on Mongo server-selection timeout without Docker Mongo (expected pending Docker checks) |
| Production bundle loads test files | Pass — no `.spec` / `vitest` references in `dist/apps/backend/main.js` |
| No backend `"type": "module"` | Pass |
| No F02 Phase 2 functionality introduced | Pass |

## Unresolved Blockers

* Docker-dependent MongoDB integration checks remain pending and do not block this migration
* Live transaction proofs still require Docker Compose v2 (pre-existing F01 note)
* Full-repo Prettier check on Windows may fail for untouched files until line-ending policy is normalized in CI/dev machines

## Confirmation

Backend coding conventions are frozen after this migration:

```text
Express 5
JavaScript CommonJS
module/domain-first folders
Route → Middleware → Controller → Service → Repository when needed → Model
```

Do not introduce another repository/module-system migration later without a genuine blocker.
