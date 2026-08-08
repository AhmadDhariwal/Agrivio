# npm Workspace Migration

## Task Status

* Status: Complete
* Completion date: 2026-08-08
* Scope: Tooling / developer-experience migration only (no F02 Phase 5, no new business functionality)
* Branch note: Requested branch `task/NPM-MIGRATION` was not present; work performed on the already checked-out branch
* Next phase: **F02 Phase 5**

## Final Decision

```text
Package manager: npm
Workspace management: npm workspaces
Task/build orchestration: Nx
Frontend: Angular
Backend: Express CommonJS JavaScript
```

Detected and pinned from Node `24.18.0`:

```text
npm 11.16.0
```

## What Changed

* Root `package.json` declares `workspaces: ["apps/*", "packages/*"]`
* `packageManager` / `engines` pin npm instead of pnpm
* Internal workspace dependencies use `*`
* Authoritative `package-lock.json` created
* Removed `pnpm-lock.yaml` and `pnpm-workspace.yaml`
* `.npmrc` uses `save-exact=true` and `strict-peer-deps=true`
* `.gitignore` tracks `package-lock.json` and ignores pnpm lock/workspace files
* Root scripts converted from `pnpm …` to `npm run …`
* `apps/frontend/package.json` added so `npm start` serves Angular via Nx
* `apps/backend/index.js` added as the obvious CommonJS entry (`require('./src/main')`)
* `apps/backend` scripts: `npm start` → `node index.js`; `npm run dev` → `node --watch index.js`
* Architecture and Mongo helper scripts updated to npm command text
* Backend `prune-lockfile` output expects `package-lock.json`
* Backend Vitest `testTimeout` set to `20000` so argon2-heavy auth/onboarding suites do not flake under the default 5s limit
* Documented npm `allowScripts` for required package install scripts (mirrors former pnpm `allowBuilds`; `argon2` denied)
* Narrow `overrides` for `@babel/helper-define-polyfill-provider@0.6.8` (Nx transitive peer metadata defect under npm)
* `.vscode/launch.json` updated from obsolete `pnpm` / `apps/api` to npm / `apps/backend`

## Files Removed

* `pnpm-lock.yaml`
* `pnpm-workspace.yaml`

## CI

GitHub Actions workflows live under `.github/workflows/`:

* `quality.yml`
* `integration.yml`
* `e2e-smoke.yml`

They install with `npm ci` on Node `24.18.0` / npm `11.16.0`. No pnpm or Corepack.

## Manual Startup

```bash
npm install   # first time / lockfile regeneration
npm ci        # preferred when package-lock.json is present

cd apps/frontend
npm start

cd apps/backend
node index.js
# or
npm run dev
```

## Validation

Environment: Node `v24.18.0`, npm `11.16.0`.

| Check | Result |
| --- | --- |
| `npm install` | Pass — `package-lock.json` created |
| Workspace resolution (`@agrivio/*`) | Pass |
| `cd apps/frontend && npm start` | Pass — Angular dev server |
| `cd apps/backend && node index.js` | Pass — CommonJS boot (Mongo may time out without Docker) |
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm test` | Pass (backend Vitest `testTimeout` raised to 20s for argon2-heavy suites under load) |
| `npm run test:architecture` | Pass |
| `npm run build` | Pass |
| Docker `npm run db:*` | Pending — Docker not available on this Windows host |

Docker-dependent Mongo integration remains pending when Docker Compose is unavailable.

## Documentation Amended

* `README.md`
* `docs/PROJECT_INDEX.md`
* `docs/TOOLCHAIN.md` (v1.4.0)
* `docs/REPOSITORY_INITIALIZATION.md` (v1.4.0)
* `docs/DEVELOPMENT_WORKFLOW.md` (v1.4.0)
* `docs/TEST_STRATEGY.md` (v1.4.0)
* `docs/QUALITY_GATES.md` (v1.4.0)
* `docs/tasks/BACKEND-COMMONJS-MIGRATION.md` (pointer amendment)

Historical task records may retain pnpm command evidence as historical.
