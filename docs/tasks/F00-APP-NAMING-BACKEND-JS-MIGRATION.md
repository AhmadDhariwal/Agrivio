# F00 — Application Naming and Backend JavaScript Migration

## Task Status

* Status: Complete
* Completion date: 2026-08-05
* Commit hash: `74419da7bb9d5660982a509f07411dec5a128017`
* Next batch: **F00 Batch B** — `R1-F00-006` Local MongoDB Replica-Set Topology

## Reason

Deliberate architecture amendment before F00 Batch B: align application directory and Nx project names with frontend/backend roles, and implement the backend in native JavaScript ESM while keeping Angular and shared packages on TypeScript.

## Canonical Name Changes

| Concern | Previous | New |
| --- | --- | --- |
| Frontend path | `apps/web` | `apps/frontend` |
| Backend path | `apps/api` | `apps/backend` |
| Nx frontend project | `web` | `frontend` |
| Nx backend project | `api` | `backend` |
| Backend workspace package | `@agrivio/api` | `@agrivio/backend` |

## Language Changes

| Layer | Previous | New |
| --- | --- | --- |
| Backend implementation | TypeScript (`apps/api/src/**/*.ts`) | JavaScript ESM (`apps/backend/src/**/*.js`) |
| Frontend implementation | Angular TypeScript | Unchanged (Angular TypeScript) |
| Shared packages | TypeScript | Unchanged (TypeScript) |

## Files Moved (Git-aware intent)

* `apps/web/**` → `apps/frontend/**`
* `apps/api/**` → `apps/backend/**`

## Backend Files Converted

| From | To |
| --- | --- |
| `src/main.ts` | `src/main.js` |
| `src/app.ts` | `src/app.js` |
| `src/app.spec.ts` | `src/app.spec.js` |
| `src/config/env.ts` | `src/config/env.js` |
| `src/config/env.spec.ts` | `src/config/env.spec.js` |

Removed: `tsconfig.app.json`, `tsconfig.spec.json`, and TypeScript build project configs. Added: `jsconfig.json` (`checkJs`), minimal `tsconfig.json` shim for Nx Vitest path resolution only.

## Commands Changed (root `package.json`)

| Previous | New |
| --- | --- |
| `dev:web` / `dev:api` | `dev:frontend` / `dev:backend` |
| `build:web` / `build:api` | `build:frontend` / `build:backend` |
| `nx … -p web,api` | `nx … -p frontend,backend` |

## Documents Amended (v1.1.0 unless noted)

* `docs/TOOLCHAIN.md`
* `docs/REPOSITORY_INITIALIZATION.md`
* `docs/DEVELOPMENT_WORKFLOW.md`
* `docs/TEST_STRATEGY.md`
* `docs/REPOSITORY_STRUCTURE.md`
* `docs/MODULE_BOUNDARIES.md`
* `docs/IMPLEMENTATION_ROADMAP.md`
* `docs/QUALITY_GATES.md`
* `docs/PROJECT_INDEX.md`
* `README.md`
* `docs/tasks/F00-BATCH-A.md` (historical path note)
* `docs/tasks/R1-F00-002.md` / `R1-F00-003.md` (historical path banners)

## Validation Evidence

Environment: Node `v22.22.2` (toolchain requires `24.18.0`; validation run noted engine warning).

| Gate | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Pass |
| `pnpm format:check` | Pass |
| `pnpm lint` (`nx run-many -t lint --all`) | Pass |
| Frontend type-check | Pass |
| Backend JavaScript static check (`tsc -p apps/backend/jsconfig.json`) | Pass |
| Shared-package type-check | Pass |
| `pnpm test:unit` | Pass (backend 7, frontend 5, api-contracts 2) |
| `pnpm test:architecture` | Pass (placeholder) |
| `pnpm build` | Pass |
| `pnpm build:frontend` / `build:backend` | Pass |
| Native ESM execution `node dist/apps/backend/main.js` (`NODE_ENV=test`) | Pass — `[ ready ]` log |
| `pnpm affected:check` | Pass |
| API-contract forbidden-import tests | Pass |
| `apps/backend` contains no `.ts`/`.tsx` implementation sources | Pass |
| `apps/web` / `apps/api` absent | Pass |

## Build Note

Backend production build uses `@nx/esbuild:esbuild` with `bundle: true` so the JavaScript entry graph (including Express) emits a single runnable `dist/apps/backend/main.js` for native ESM execution.

## Risks

* Local Node `22.x` during validation vs frozen `24.18.0` — use `.nvmrc` / `.node-version` in CI and developer machines.
* `pnpm check` nested script invocation requires `pnpm` on `PATH` (use Corepack-enabled shell).
* Minimal `apps/backend/tsconfig.json` remains for Nx Vitest/tsconfig-paths only; implementation sources stay `.js`.

## Confirmation

No MongoDB replica-set work, CI workflows, architecture fixtures, test-support package, authentication, Mongoose models, business routes, product screens, or F01 domain modules were started.
