# F00 Phase 2 — Architecture Boundaries and CI Foundation

## Task Status

* Status: **Complete** (local quality + architecture gates green; CI workflows authored; MongoDB/E2E runtime proofs require Docker Compose v2)
* Completed IDs: `R1-F00-008`, `R1-F00-009`
* Completion date: 2026-08-05
* Commit hash: `PENDING_COMMIT`
* F00 final status: **Complete** for authored foundation; next stage unlocked
* Next stage: **F01 Phase 1 — Platform Runtime Foundation**

## R1-F00-008 — Architecture-boundary testing foundation

### Delivered

| Item | Location |
| --- | --- |
| Import scanner and rules | `tools/architecture/lib/` |
| Architecture Vitest config | `tools/architecture/vitest.config.mts` |
| Architecture suite | `apps/backend/tests/architecture/boundaries.architecture.spec.ts` |
| Forbidden-import fixtures | `tools/architecture/fixtures/` |
| Nx ESLint dep-constraints | `packages/tooling-config/eslint/base.mjs` |
| Root command | `pnpm test:architecture` |

### Boundary coverage

* Backend cross-module internal imports (non-`public/`)
* Controller persistence / Mongoose access
* Frontend cross-feature internal imports
* Frontend ↛ backend / Backend ↛ frontend
* `packages/api-contracts` forbidden runtime deps
* `packages/tooling-config` forbidden app/domain deps
* `packages/test-support` forbidden module/feature imports

### Fixture proof

At least one intentional forbidden-import fixture fails the scanner as expected (suite includes six negative fixtures covering backend, frontend, controller persistence, api-contracts, tooling-config, and test-support).

## R1-F00-009 — CI foundation

### Workflows

| Workflow | Path | Purpose |
| --- | --- | --- |
| Quality | `.github/workflows/quality.yml` | Frozen install, format, lint, typecheck, unit, architecture, build |
| Integration | `.github/workflows/integration.yml` | MongoDB `8.2.12` replica set via Compose + `pnpm test:integration` |
| E2E smoke | `.github/workflows/e2e-smoke.yml` | MongoDB + Chromium Playwright empty-app smoke |

### Toolchain pins in CI

* Node.js `24.18.0`
* pnpm `11.17.0`
* `pnpm install --frozen-lockfile`
* Deterministic MongoDB startup: `pnpm db:up` → `pnpm db:init` → `pnpm db:status`

### E2E foundation

* `@playwright/test@1.62.0`
* `eslint-plugin-playwright@2.11.0`
* `playwright.config.ts` (Chromium; webServer starts backend + frontend)
* `apps/frontend/tests/e2e/scaffold.e2e.spec.ts`
* Root command: `pnpm e2e`

## Final F00 gate (Node 24.18.0 / pnpm 11.17.0)

Runtime: portable Node `.tools/node-v24.18.0-win-x64` → `v24.18.0`; `corepack pnpm` → `11.17.0`.

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Pass (after Playwright deps added) |
| `pnpm format:check` | Pass |
| `pnpm lint` | Pass |
| `pnpm typecheck` | Pass |
| `pnpm test:unit` | Pass |
| `pnpm test:architecture` | Pass (7 tests: 1 production + 6 fixtures) |
| `pnpm build` | Pass |
| `pnpm check` | Pass |
| `pnpm db:up` / `db:init` / `db:status` | Blocked locally — Docker CLI absent (same as Phase 1); CI integration job owns authoritative proof |
| `pnpm test:integration` | Blocked locally without MongoDB; CI integration job owns authoritative proof |
| `pnpm e2e` | Pass locally (Chromium; backend + frontend webServer) |

## F00 acceptance checklist (authored)

* Exact Node / pnpm pins documented and enforced in CI
* Frozen lockfile install
* Architecture-boundary fixture + production scan
* GitHub Actions quality / integration / E2E smoke workflows
* No business routes, schemas, feature folders, or domain modules added

## Confirmation

No F01 work started. No git commit or push performed.
