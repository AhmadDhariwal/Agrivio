# Repository Initialization

Document status: Frozen for Release 1  
Current version: 1.4.0  
Last updated: 2026-08-08  
Approval status: Approved for repository initialization

> **Amendment 1.1.0 (2026-08-05):** Frontend canonical project: `apps/frontend`. Backend canonical project: `apps/backend`. Backend implementation language was JavaScript ESM. Frontend implementation language: Angular TypeScript. Details: [tasks/F00-APP-NAMING-BACKEND-JS-MIGRATION.md](tasks/F00-APP-NAMING-BACKEND-JS-MIGRATION.md).
>
> **Amendment 1.2.0 (2026-08-08):** Backend implementation language: JavaScript CommonJS (`require` / `module.exports`). Frontend remains Angular TypeScript. Shared packages remain TypeScript. Details: [tasks/BACKEND-COMMONJS-MIGRATION.md](tasks/BACKEND-COMMONJS-MIGRATION.md).
>
> **Amendment 1.3.0 (2026-08-08):** Backend coding style is plain CommonJS JavaScript without `// @ts-check` or JSDoc type annotations. Backend gates use ESLint and tests; `checkJs` is not required. Details: [tasks/BACKEND-COMMONJS-MIGRATION.md](tasks/BACKEND-COMMONJS-MIGRATION.md).
>
> **Amendment 1.4.0 (2026-08-08):** Package manager migrated from pnpm to npm workspaces. Active install/lockfile/commands use npm. Historical F00 bootstrap evidence that used pnpm remains historical. Details: [tasks/NPM-WORKSPACE-MIGRATION.md](tasks/NPM-WORKSPACE-MIGRATION.md).

## Document Authority

| Concern | Authoritative document |
| --- | --- |
| Target monorepo layout | Frozen [REPOSITORY_STRUCTURE.md](REPOSITORY_STRUCTURE.md) |
| Exact toolchain versions | Frozen [TOOLCHAIN.md](TOOLCHAIN.md) |
| Development commands | Frozen [DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md) |
| Test smoke requirements | Frozen [TEST_STRATEGY.md](TEST_STRATEGY.md) |
| F00 work items | Frozen [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) |
| Initialization sequence and F00 acceptance | This document |

This document defines how to initialize the existing Agrivio documentation repository into the Release 1 monorepo. It does not perform initialization during P1-07.

The repository root remains:

```text
Agrivio/
```

Do not create a nested workspace directory.

---

## 1. Preflight Checks

Before F00 begins, verify all of the following:

1. P1-07 documents are frozen at version 1.0.1.
2. Working tree is clean except for the intentional F00 branch changes in progress.
3. Current branch is dedicated to the active F00 work item (starting with `task/R1-F00-001`).
4. Node.js reports exactly `24.18.0`.
5. npm reports exactly `11.16.0` (bundled with Node `24.18.0`), or an equivalent install matching `packageManager`.
6. Docker Compose v2 is available for the local MongoDB replica set.
7. No `package.json`, lockfile, `apps/`, `packages/`, or Nx workspace already exists unless created by the active F00 sequence itself.
8. Frozen P1-02 through P1-06 documents are not modified.
9. The next executable work item is `R1-F00-001 — Monorepo workspace bootstrap`.

---

## 2. Exact Initialization Order

Execute F00 in this exact order:

1. Verify P1-07 freeze tag and clean working tree.
2. Verify Node.js and npm versions.
3. Create root package metadata and version files.
4. Declare npm `workspaces` in root `package.json` (`apps/*`, `packages/*`).
5. Install exact Nx core and plugins, including `@nx/express@23.1.0`.
6. Initialize Nx in the existing documentation repository.
7. Set `appsDir=apps` and `libsDir=packages`.
8. Run Nx generator `--help` for Angular application, Node application, and JS library generators.
9. Dry-run and then generate `apps/frontend` with approved Angular options.
10. Dry-run and then generate `apps/backend` with approved Express/Node options.
11. Dry-run and then create the three approved non-empty shared packages.
12. Configure root TypeScript, ESLint, and Prettier.
13. Add root command contract.
14. Add local MongoDB replica-set configuration.
15. Add F00 smoke and architecture tests.
16. Add GitHub Actions quality, integration, and E2E foundations.
17. Run all F00 gates.
18. Verify no business feature implementation exists.
19. Record F00 completion evidence.

Map to roadmap work items:

| Order steps | Primary work item |
| --- | --- |
| 1–8 | `R1-F00-001` |
| 9 | `R1-F00-002` |
| 10 | `R1-F00-003` |
| 11 | `R1-F00-004`, `R1-F00-010` |
| 12–13 | `R1-F00-005` |
| 14 | `R1-F00-006` |
| Env validation foundation | `R1-F00-007` |
| 15 architecture fixtures | `R1-F00-008` |
| 16–17 | `R1-F00-009` |

Do not reorder generation of web and API before workspace bootstrap is complete.
Do not execute a real generator until its `--help` inspection and `--dry-run` diff match the frozen intent.

---

## 3. Root Files to Create

Create these root files during F00 bootstrap:

```text
package.json
package-lock.json
nx.json
tsconfig.base.json
eslint.config.mjs
.prettierrc
.prettierignore
.editorconfig
.npmrc
.nvmrc
.node-version
.env.example
.gitignore updates as required for env secrets, coverage, dist, and Playwright artifacts
```

> Historical note: F00 originally created `pnpm-workspace.yaml` / `pnpm-lock.yaml`. After amendment 1.4.0 those are replaced by npm `workspaces` and `package-lock.json`. See [tasks/NPM-WORKSPACE-MIGRATION.md](tasks/NPM-WORKSPACE-MIGRATION.md).

### Root `package.json` baseline

```json
{
  "name": "@agrivio/source",
  "private": true,
  "packageManager": "npm@11.16.0",
  "engines": {
    "node": ">=24.18.0 <25",
    "npm": ">=11.16.0 <12"
  },
  "workspaces": ["apps/*", "packages/*"]
}
```

### Version files

```text
.nvmrc        -> 24.18.0
.node-version -> 24.18.0
```

### `.npmrc`

```text
save-exact=true
strict-peer-deps=true
```

Every required direct peer must be explicitly pinned in `package.json`. Do not allow npm to silently select an unreviewed peer version. Missing optional peers such as Zone.js must remain absent when the application is intentionally zoneless. A genuine peer conflict is a bootstrap blocker; do not silence it globally. Use a narrow documented package-specific override only when an upstream metadata defect is proven.

npm workspaces are declared in root `package.json` (`workspaces: ["apps/*", "packages/*"]`). Do not use `pnpm-workspace.yaml`.

---

## 4. Nx Workspace Configuration

Initialize Nx inside the existing repository root. Do not run a create-workspace flow that nests a second project.

Required settings:

```json
{
  "workspaceLayout": {
    "appsDir": "apps",
    "libsDir": "packages"
  }
}
```

Additional Release 1 bootstrap rules:

* Nx Cloud is not enabled.
* Use local Nx caching only.
* Remote caching requires later explicit approval.
* Install exact versions from [TOOLCHAIN.md](TOOLCHAIN.md).
* Install `@nx/express@23.1.0` explicitly with the other `@nx/*@23.1.0` plugins. Do not replace Express or `@nx/node`. Do not rely on an unpinned generator-added `@nx/express` version.

Deterministic Nx project and package names:

| Path | Nx project name | Package name |
| --- | --- | --- |
| `apps/frontend` | `frontend` | `@agrivio/frontend` |
| `apps/backend` | `backend` | `@agrivio/backend` |
| `packages/api-contracts` | `api-contracts` | `@agrivio/api-contracts` |
| `packages/tooling-config` | `tooling-config` | `@agrivio/tooling-config` |
| `packages/test-support` | `test-support` | `@agrivio/test-support` |

---

## 5. Angular Generation Configuration

Generate `apps/frontend` with:

```text
Angular 22.0.8
Standalone components
Strict mode
SCSS
Angular routing
Zoneless change detection
Angular native Vitest unit tests (`vitest-angular`)
No SSR
No SSG
No service worker
No PWA
No Module Federation
No global state-management library
```

Generation command:

```bash
npx nx g @nx/angular:application apps/frontend \
  --name=frontend \
  --bundler=esbuild \
  --style=scss \
  --routing=true \
  --standalone=true \
  --strict=true \
  --ssr=false \
  --zoneless=true \
  --unitTestRunner=vitest-angular \
  --e2eTestRunner=none \
  --linter=eslint \
  --prefix=agrivio
```

Rules:

* Do not use `--directory=apps/frontend`.
* Do not use `--unitTestRunner=vitest` for the Angular application.
* Angular unit/component testing remains the native Angular Vitest integration.
* Playwright remains a separate workspace E2E setup.
* Before generation, run the pinned generator with `--help` and `--dry-run` as required in section 5a.

After generation:

* Confirm Angular packages remain on `22.0.8`.
* Confirm zoneless change detection is active.
* Keep only the minimum files required to build, serve, and run the scaffold test.
* Do not create business-feature folders as empty placeholders.
* Do not create Release 1 pages or business UI.
* Do not select a third-party UI component framework.
* Preserve SCSS as the styling language.
* Public landing-page implementation belongs to its roadmap work item, not the scaffold.

If Nx generator help shows a renamed but semantically equivalent option on Nx `23.1.0`, use the Nx 23.1.0-supported name and record it in the `R1-F00-002` completion evidence without changing product decisions.

---

## 5a. Bootstrap Dry-Run Gate

Before any Nx generation during F00, require:

```bash
npx nx g @nx/angular:application --help
npx nx g @nx/node:application --help
npx nx g @nx/js:library --help
```

Then run each approved generator command with:

```text
--dry-run
```

Validate the dry-run output for:

* Destination path
* Project name
* Package name
* Added dependencies
* Test runner
* Bundler
* No nested workspace
* No unexpected module/feature placeholders
* No prohibited framework or test tool

Only execute the real generator after its dry-run diff matches the frozen intent.

---

## 6. Express Backend Generation Configuration

Generate `apps/backend` with:

```text
Node.js 24
Express 5.2.1
JavaScript source (CommonJS)
ESLint for backend static analysis (no checkJs / JSDoc typing requirement)
Nx Node application with `@nx/express@23.1.0`
Vitest
No business routes
No business schemas
No authentication implementation
No module placeholders
```

Generation command:

```bash
npx nx g @nx/node:application apps/backend \
  --name=backend \
  --framework=express \
  --bundler=esbuild \
  --unitTestRunner=vitest \
  --e2eTestRunner=none \
  --linter=eslint
```

Rules:

* Do not use `--directory=apps/backend`.
* Keep CommonJS (`require` / `module.exports`), Express `5.2.1`, and plain JavaScript implementation sources. Do not require `// @ts-check` or JSDoc type annotations; validate with ESLint and tests.
* Ensure `@nx/express@23.1.0` is installed explicitly during F00 rather than relying on an unpinned generator-added version.
* Before actual generation, F00 must run the pinned generator with `--help` and `--dry-run`.

After generation / CommonJS migration, ensure backend `package.json` does **not** set `"type": "module"`:

```json
{
  "name": "@agrivio/backend",
  "private": true
}
```

API compiler baseline:

```text
target: ES2024
module: NodeNext
moduleResolution: NodeNext
strict: true
```

Additional rules:

* The scaffold may expose only the minimum bootstrap behaviour required for a smoke test.
* The public health endpoint belongs to F01 unless the generator requires a minimal temporary smoke route.
* Temporary smoke behaviour must not be mistaken for the final health contract.
* Do not create business controllers, services, repositories, or persistence models.
* Do not use `ts-node` as the production runtime.
* Do not add NestJS.
* Do not add a generic CRUD framework.
* Do not add a generic global repository.
* Pin Express to `5.2.1` and Mongoose to `9.8.0` when persistence wiring begins; F00 may delay Mongoose usage until replica-set smoke needs it.

---

## 7. Shared-Package Generation

Create only these three non-empty shared packages:

### `packages/api-contracts` (`@agrivio/api-contracts`)

May contain:

* Approved request and response contracts
* Shared API enums
* Stable transport-level types

Must not contain:

* Backend domain services
* Mongoose models
* Angular services
* Business calculations
* Repository interfaces tied to persistence

F00 content: minimal package entrypoint and TypeScript configuration proving the package builds. No business DTOs required yet.

### `packages/tooling-config` (`@agrivio/tooling-config`)

May contain shared:

* TypeScript configuration
* Lint configuration
* Formatting configuration
* Test configuration

F00 content: shared config files consumed by apps and packages.

### `packages/test-support` (`@agrivio/test-support`)

May contain reusable:

* Test builders
* Fixtures
* Tenant-isolation helpers
* Transaction test utilities

Must not contain production business logic.

F00 content: minimal helpers needed for replica-set and architecture smoke tests.

Generation commands:

```bash
npx nx g @nx/js:library packages/api-contracts \
  --name=api-contracts \
  --importPath=@agrivio/api-contracts \
  --unitTestRunner=vitest \
  --bundler=tsc \
  --linter=eslint

npx nx g @nx/js:library packages/tooling-config \
  --name=tooling-config \
  --importPath=@agrivio/tooling-config \
  --unitTestRunner=none \
  --bundler=none \
  --linter=eslint

npx nx g @nx/js:library packages/test-support \
  --name=test-support \
  --importPath=@agrivio/test-support \
  --unitTestRunner=vitest \
  --bundler=tsc \
  --linter=eslint
```

Do not use separate `--directory=` arguments. Destination paths are positional. Before generation, run each command with `--dry-run` after the shared `--help` gate in section 5a.

If Nx generator help shows a renamed but semantically equivalent option on Nx `23.1.0`, use the Nx 23.1.0-supported name and record it in F00 completion evidence while preserving package names, import paths, and non-empty real configuration or test-support content.

---

## 8. Local MongoDB Replica-Set Initialization

Use:

```text
MongoDB 8.2.12
Single-node local replica set
Replica-set name: rs0
Docker Compose v2
Development database: agrivio_dev
Test database prefix: agrivio_test_
```

Planned locations:

```text
tools/docker/mongodb/compose.yml
scripts/mongodb/
```

Required commands after F00:

```text
npm run db:up
npm run db:init
npm run db:status
npm run db:logs
npm run db:down
npm run db:reset
```

Rules:

* Bind the development port to localhost only.
* Local and CI MongoDB must support multi-document transactions.
* Health checking must wait until a primary is elected.
* Integration tests use isolated database names with the `agrivio_test_` prefix.
* Tests clean their own data.
* Production must not use the local Docker configuration.
* Production authentication, TLS, backup, and topology remain deployment concerns.
* A standalone MongoDB server is not an accepted development substitute.
* `db:reset` must be clearly destructive and limited to local data.
* Pin the Compose image tag to `mongo:8.2.12`.

---

## 9. CI Foundation Sequence

Provider: GitHub Actions

Planned workflows under `.github/workflows/`:

| Workflow | Purpose |
| --- | --- |
| Quality | Install, format check, lint, type check, unit tests, architecture tests, build |
| Integration | Start MongoDB replica set, initialize replica set, API integration tests, transaction smoke, tenant-isolation smoke |
| E2E smoke | Start MongoDB, start API, start web, run Chromium Playwright smoke |

CI baseline:

```text
Ubuntu runner
Node.js 24.18.0
npm 11.16.0
npm ci
Nx local cache
MongoDB 8.2.12 replica-set service through Docker Compose
Playwright browsers installed through the official Playwright command
```

Rules:

* CI never modifies the lockfile.
* CI must fail on an uncommitted generated diff.
* Production secrets are not used in pull-request workflows.
* Deployment pipelines are outside F00.
* Nx Cloud is disabled initially.

---

## 10. Bootstrap Validation Commands

After initialization, the following must succeed:

```bash
node --version                # v24.18.0
npm --version                # 11.16.0
npm ci
npx nx show projects
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run test:architecture
npm run build
npm run build:frontend
npm run build:backend
npm run db:up
npm run db:init
npm run db:status
npm run test:integration
npm run e2e
npm run check
```

`npm run check` order:

```text
format check
→ lint
→ type check
→ unit tests
→ architecture tests
→ build
```

---

## 11. Expected File Tree After F00

Minimum expected tree after F00. Do not create this tree during P1-07.

```text
Agrivio/
├── apps/
│   ├── web/
│   └── api/
├── packages/
│   ├── api-contracts/
│   ├── tooling-config/
│   └── test-support/
├── tools/
│   └── docker/
│       └── mongodb/
├── scripts/
│   └── mongodb/
├── docs/
├── .github/
│   └── workflows/
├── package.json
├── package-lock.json
├── package.json (includes workspaces)
├── nx.json
├── tsconfig.base.json
├── eslint.config.mjs
├── .prettierrc
├── .prettierignore
├── .editorconfig
├── .npmrc
├── .nvmrc
├── .node-version
├── .env.example
├── AGENTS.md
└── README.md
```

No future domain-module or frontend-feature placeholder trees are created in F00.

Create a module or feature directory only when its first real implementation, public interface, test, or configuration file exists. Do not use `.gitkeep` to pre-create all future modules.

---

## 12. F00 Bootstrap Acceptance Gates

F00 is complete only when all of the following are proven:

* Exact Node version check
* Exact npm version check
* Frozen lockfile
* Explicit `@nx/express@23.1.0` install aligned with `nx@23.1.0`
* Generator `--help` and `--dry-run` gates completed before each real generation
* Workspace project graph
* Empty web application build
* Empty API application build
* Web scaffold test
* API boot smoke test
* Type checking
* ESLint
* Formatting check
* Architecture-boundary fixture
* MongoDB replica-set primary election
* Multi-document transaction commit test
* Multi-document transaction rollback test
* CI quality job
* CI integration job
* CI E2E smoke job
* Strict peer-dependency policy enforced (`auto-install-peers=false`, `strict-peer-dependencies=true`)
* No business routes
* No business schemas
* No business feature folders
* No client-specific code
* No production deployment configuration

---

## 13. Rollback Procedure for Failed Initialization

If initialization fails before a clean F00 gate:

1. Stop all local processes started by the failed attempt (`npm run db:down`, stop served apps).
2. Do not push a broken bootstrap branch as complete.
3. Prefer reversing uncommitted generated files with a clean restore of the pre-F00 documentation state when no valuable reviewed work exists.
4. If partial reviewed commits exist, create a revert commit rather than rewriting shared history.
5. Delete generated `apps/`, `packages/`, lockfiles, and Nx config only when they were produced by the failed attempt and are not yet accepted by F00 gates.
6. Re-run preflight checks before retrying from the failed step.
7. Do not repair a failed bootstrap by substituting prohibited tools or unapproved versions.
8. Record the failure cause in the work-item completion notes before retrying.

Never permanently delete posted financial or stock data during rollback. F00 has no business data; local Docker volumes may be destroyed only through the documented local `db:reset` / Compose teardown path.
