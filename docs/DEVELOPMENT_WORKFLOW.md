# Development Workflow

Document status: Frozen for Release 1  
Current version: 1.4.0  
Last updated: 2026-08-08  
Approval status: Approved for repository initialization

> **Amendment 1.1.0 (2026-08-05):** Frontend canonical project: `apps/frontend`. Backend canonical project: `apps/backend`. Backend implementation language was JavaScript ESM. Frontend implementation language: Angular TypeScript. Details: [tasks/F00-APP-NAMING-BACKEND-JS-MIGRATION.md](tasks/F00-APP-NAMING-BACKEND-JS-MIGRATION.md).
>
> **Amendment 1.2.0 (2026-08-08):** Backend implementation language: JavaScript CommonJS (`require` / `module.exports`). Frontend remains Angular TypeScript. Shared packages remain TypeScript. Details: [tasks/BACKEND-COMMONJS-MIGRATION.md](tasks/BACKEND-COMMONJS-MIGRATION.md).
>
> **Amendment 1.3.0 (2026-08-08):** Backend coding style is plain CommonJS JavaScript. Do not add `// @ts-check` or JSDoc type annotations to backend application source. Rely on ESLint, runtime validation, and tests. Details: [tasks/BACKEND-COMMONJS-MIGRATION.md](tasks/BACKEND-COMMONJS-MIGRATION.md) and [../AGENTS.md](../AGENTS.md).
>
> **Amendment 1.4.0 (2026-08-08):** Package manager migrated from pnpm to npm workspaces. Local apps may also start without Nx knowledge via `apps/frontend` `npm start` and `apps/backend` `node index.js`. Details: [tasks/NPM-WORKSPACE-MIGRATION.md](tasks/NPM-WORKSPACE-MIGRATION.md).

## Document Authority

| Concern | Authoritative document |
| --- | --- |
| Exact toolchain versions | Frozen [TOOLCHAIN.md](TOOLCHAIN.md) |
| Initialization sequence | Frozen [REPOSITORY_INITIALIZATION.md](REPOSITORY_INITIALIZATION.md) |
| Test commands and layers | Frozen [TEST_STRATEGY.md](TEST_STRATEGY.md) |
| Quality gates | Frozen [QUALITY_GATES.md](QUALITY_GATES.md) |
| Work-item execution order | Frozen [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) |
| Agent and scope rules | [../AGENTS.md](../AGENTS.md) |
| Day-to-day development workflow | This document |

This document defines how engineers and AI agents work in the Agrivio monorepo after F00. It does not initialize the repository during P1-07.

---

## 1. Local Prerequisites

Required before development:

| Prerequisite | Exact requirement |
| --- | --- |
| Node.js | `24.18.0` |
| npm | `11.16.0` (bundled with Node `24.18.0`) |
| Git | Available and authenticated for the repository remote |
| Docker Compose | v2 available for MongoDB replica-set commands |
| OS support | Windows, macOS, or Linux able to run Node 24 and Docker Compose |

Do not rely on globally installed Nx, Angular CLI, or TypeScript executables for project work. Use workspace-local binaries through `npm` scripts and `npx`.

---

## 2. Installation Process

After F00 exists:

```bash
git checkout <task-branch>
node --version
npm --version
npm ci
npm run db:up
npm run db:init
npm run db:status
```

First-time install without a lockfile checkout uses `npm install` once; thereafter prefer `npm ci`.

First-time Playwright setup when E2E is needed:

```bash
npx playwright install --with-deps chromium
```

Firefox and WebKit installation is reserved for release/nightly matrix jobs unless a work item explicitly requires them locally.

---

## 3. Root Command Contract

Documented root commands for F00 and later stages:

```text
npm start
npm run dev
npm run dev:frontend
npm run dev:backend

npm run build
npm run build:frontend
npm run build:backend

npm run lint
npm run typecheck
npm test
npm run test:unit
npm run test:integration
npm run test:architecture
npm run e2e

npm run format
npm run format:check

npm run check
npm run affected:check

npm run db:up
npm run db:init
npm run db:status
npm run db:logs
npm run db:down
npm run db:reset
```

### Manual app startup (no Nx knowledge required)

```bash
cd apps/frontend
npm start

cd apps/backend
node index.js
# or, with auto-reload:
npm run dev
```

### Command responsibilities

| Command | Responsibility |
| --- | --- |
| `npm start` / `npm run dev` | Start the approved local development composition for frontend and backend |
| `npm run dev:frontend` | Serve `apps/frontend` only |
| `npm run dev:backend` | Serve `apps/backend` only |
| `npm run build` | Build all workspace projects required for Release 1 |
| `npm run build:frontend` | Build `apps/frontend` |
| `npm run build:backend` | Build `apps/backend` |
| `npm run lint` | Run ESLint across the configured workspace projects |
| `npm run typecheck` | Run TypeScript checking for Angular and shared TypeScript packages (backend plain JavaScript is not type-checked via `checkJs`) |
| `npm test` | Default local test entry; runs the unit suite unless a later stage documents otherwise |
| `npm run test:unit` | Unit and Angular component tests via Vitest |
| `npm run test:integration` | API integration and transaction tests against the local replica set |
| `npm run test:architecture` | Architecture-boundary tests |
| `npm run e2e` | Playwright end-to-end suite |
| `npm run format` | Write Prettier formatting |
| `npm run format:check` | Verify Prettier formatting |
| `npm run check` | Deterministic full local quality gate |
| `npm run affected:check` | Nx affected quality gate for changed projects |
| `npm run db:*` | Local MongoDB replica-set lifecycle |

### `npm run check` order

```text
format check
→ lint
→ type check
→ unit tests
→ architecture tests
→ build
```

Transaction integration and E2E suites remain separate because of environment startup cost. CI runs them in their designated jobs.

---

## 4. Database Commands

| Command | Behaviour |
| --- | --- |
| `npm run db:up` | Start the local MongoDB `8.2.12` replica-set Compose stack |
| `npm run db:init` | Initialize replica set `rs0` and wait for primary election |
| `npm run db:status` | Show replica-set and connectivity status |
| `npm run db:logs` | Tail MongoDB container logs |
| `npm run db:down` | Stop the local Compose stack without claiming production safety |
| `npm run db:reset` | Destructive local reset of containers/volumes for development data only |

Rules:

* Development database name: `agrivio_dev`
* Test database names use prefix `agrivio_test_`
* Bind to localhost only
* Never point these commands at production

Details: [REPOSITORY_INITIALIZATION.md](REPOSITORY_INITIALIZATION.md), [TOOLCHAIN.md](TOOLCHAIN.md).

---

## 5. Branch Naming

```text
task/R1-F00-001
task/R1-F01-001
fix/<short-description>
docs/<short-description>
```

Rules:

* One roadmap work item per primary branch.
* Do not combine unrelated work items.
* Use `fix/` for defect branches that are not already covered by a roadmap ID branch convention required by the active task.
* Use `docs/` only for documentation-only changes that are not frozen-document edits.

---

## 6. Commit Naming

```text
<type>: <imperative summary>
```

Approved types:

```text
build
chore
ci
docs
feat
fix
perf
refactor
revert
test
```

Rules:

* Prefer one logical change per commit when practical.
* Do not hide lockfile or generated toolchain changes inside unrelated feature commits.
* Do not amend shared history unless the active user instruction and git safety rules allow it.

---

## 7. Pull-Request Gates

Every pull request references:

* Roadmap work-item ID
* Frozen source documents
* Tests run
* Quality gates
* Remaining risks

Before merge:

1. Applicable gates from [QUALITY_GATES.md](QUALITY_GATES.md) pass.
2. CI quality job passes.
3. Integration and E2E jobs pass when the change affects those layers.
4. Diff is limited to the work item.
5. No frozen-document edits from an implementation branch.
6. Generated changes are reviewed rather than blindly accepted.
7. Secrets are not committed.

---

## 8. Dependency Update Workflow

Follow [TOOLCHAIN.md](TOOLCHAIN.md) upgrade policy.

Practical workflow:

1. Create `chore/<dependency>-upgrade`.
2. Change only the intended manifests and lockfile.
3. Review changelogs and migration notes.
4. Run `npm run check` and applicable integration/E2E jobs.
5. For Nx or Angular migrations, review every generated file.
6. Open a dedicated PR that does not include feature work.

Major updates require ADR or formal technical decision, compatibility matrix, migration plan, full regression, and rollback plan.

---

## 9. Environment-File Rules

Planned files:

```text
.env.example
.env.local
.env.test
```

Rules:

* Commit `.env.example`.
* Ignore `.env.local` and secret-bearing variants.
* Do not place secrets in Angular environment output.
* Browser configuration contains public values only.
* API validates required environment values at startup.
* Test configuration must not use production credentials.
* Never print complete environment configuration.
* Local MongoDB credentials or connection details must not be reused in production.

P1-07 documents variable categories only. Exact application environment-variable names are finalized during F00/F01 work items.

### Variable categories

| Category | Examples of concern | Client visibility |
| --- | --- |
| Runtime mode | `NODE_ENV`, application profile | Server only |
| API listen binding | Host and port | Server only |
| MongoDB connection | URI, database name, replica-set name | Server only |
| Session and auth secrets | Session signing, CSRF secrets | Server only |
| Public web config | Public API base URL | Browser-safe only |
| Test overrides | Test database prefix, smoke flags | Test/server only |

---

## 10. Troubleshooting Boundaries

Allowed local troubleshooting:

* Reinstall with `npm ci`
* Restart MongoDB through `npm run db:down` / `npm run db:up` / `npm run db:init`
* Clear local Nx cache when cache corruption is suspected
* Reinstall Playwright browsers for the pinned Playwright version
* Compare local Node and npm versions against the pinned baseline

Not allowed as silent fixes:

* Switching to pnpm, Yarn, or Bun
* Replacing Nx, Angular, Express, MongoDB, Vitest, or Playwright
* Using standalone MongoDB instead of the replica set
* Using prerelease packages
* Weakening tenant, permission, or transaction tests to make CI green
* Editing frozen documents from an implementation branch

---

## 11. AI-Agent Workflow Expectations

AI agents must:

1. Read `AGENTS.md`.
2. Read the assigned roadmap work item or Phase 1 task file.
3. Read only the frozen sources and files referenced by that work item.
4. Implement only the assigned scope.
5. Preserve tenant isolation, thin controllers, and transaction rules.
6. Avoid scanning the full repository when the work item gives an explicit file scope.
7. Avoid placeholder implementations, unresolved TODOs, and unrelated refactors.
8. Run every command required by the work item.
9. Return only the completion report required by the active work item or `AGENTS.md`.

Agents must not:

* Begin F00 during P1-07
* Modify frozen documents
* Install dependencies during documentation-only tasks
* Create package files during documentation-only tasks
* Substitute tools or versions
* Leave incomplete implementation behind

---

## 12. Definition Boundaries

* Product behaviour remains owned by frozen PRD, scope, business rules, and glossary documents.
* Architecture and module ownership remain owned by frozen P1-04 documents.
* Data, API, security, and subscription contracts remain owned by frozen P1-05 documents.
* Delivery order and quality gates remain owned by frozen P1-06 documents.
* Tool versions and bootstrap mechanics remain owned by the P1-07 documents.
