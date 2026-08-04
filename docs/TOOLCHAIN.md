# Toolchain

Document status: Frozen for Release 1  
Current version: 1.0.1  
Last updated: 2026-08-04  
Approval status: Approved for repository initialization

## Document Authority

| Concern | Authoritative document |
| --- | --- |
| Finalized product and technical stack decisions | [PROJECT_DECISIONS.md](PROJECT_DECISIONS.md) |
| Target monorepo layout | Frozen [REPOSITORY_STRUCTURE.md](REPOSITORY_STRUCTURE.md) |
| System architecture | Frozen [ARCHITECTURE.md](ARCHITECTURE.md) |
| Implementation sequence | Frozen [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) |
| Quality gates | Frozen [QUALITY_GATES.md](QUALITY_GATES.md) |
| Repository initialization order | [REPOSITORY_INITIALIZATION.md](REPOSITORY_INITIALIZATION.md) |
| Development commands and workflow | [DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md) |
| Test tooling responsibilities | [TEST_STRATEGY.md](TEST_STRATEGY.md) |
| Exact Release 1 toolchain versions and policies | This document |

This document freezes the Release 1 toolchain. It does not install packages, initialize Nx, create applications, or begin F00.

---

## 1. Exact Approved Version Matrix

| Tool / package | Approved version | Role |
| --- | --- | --- |
| Node.js | `24.18.0` | Runtime for API, tooling, CI, and local development |
| pnpm | `11.17.0` | Sole package manager and workspace installer |
| Nx | `23.1.0` | Monorepo task orchestration |
| `@nx/angular` | `23.1.0` | Angular application generation and executors |
| `@nx/node` | `23.1.0` | Node application generation and executors |
| `@nx/express` | `23.1.0` | Approved Nx Express integration for Express generation with `@nx/node` |
| `@nx/js` | `23.1.0` | Shared JS/TS library generation and executors |
| `@nx/eslint` | `23.1.0` | ESLint Nx integration |
| `@nx/eslint-plugin` | `23.1.0` | Nx module-boundary ESLint rules |
| `@nx/vitest` | `23.1.0` | Vitest Nx integration |
| `@nx/playwright` | `23.1.0` | Playwright Nx integration |
| `@nx/workspace` | `23.1.0` | Nx workspace utilities |
| `@nx/devkit` | `23.1.0` | Nx plugin development kit used by plugins |
| `@nx/web` | `23.1.0` | Web tooling dependency of `@nx/angular` |
| Angular core packages | `22.0.8` | Frontend framework (`@angular/core`, `@angular/common`, `@angular/compiler`, `@angular/forms`, `@angular/platform-browser`, `@angular/router`, and matching framework packages) |
| Angular CLI / build line | `22.0.8` | `@angular/cli`, `@angular/build`, `@angular/compiler-cli`, `@schematics/angular`, `@angular-devkit/core`, `@angular-devkit/schematics`, `@angular-devkit/build-angular` |
| TypeScript | `6.0.3` | Language and type-checker for all TypeScript packages |
| Express | `5.2.1` | HTTP framework for `apps/api` |
| Mongoose | `9.8.0` | MongoDB ODM for persistence implementations |
| MongoDB Server | `8.2.12` | Local and CI database server image/binary |
| Vitest | `4.1.10` | Unit, component, integration, architecture, and API test runner |
| `@vitest/coverage-v8` | `4.1.10` | V8 coverage provider aligned with Vitest |
| Playwright Test (`@playwright/test`) | `1.62.0` | End-to-end browser tests |
| ESLint | `10.7.0` | Linting and architecture enforcement host |
| Prettier | `3.9.6` | Formatting |

### Approved support packages

These packages are not part of the primary matrix above but are required for F00 scaffolding. Exact stable versions only:

| Package | Approved version | Role |
| --- | --- | --- |
| `typescript-eslint` | `8.66.0` | TypeScript ESLint flat-config integration |
| `@typescript-eslint/parser` | `8.66.0` | TypeScript ESLint parser alignment |
| `@typescript-eslint/eslint-plugin` | `8.66.0` | TypeScript ESLint rules alignment |
| `@typescript-eslint/utils` | `8.66.0` | Shared TypeScript ESLint utilities |
| `angular-eslint` | `22.1.0` | Angular ESLint meta-package compatible with Angular 22 |
| `@angular-eslint/eslint-plugin` | `22.1.0` | Angular TypeScript lint rules |
| `@angular-eslint/eslint-plugin-template` | `22.1.0` | Angular template lint rules |
| `@angular-eslint/template-parser` | `22.1.0` | Angular template parser |
| `@angular-eslint/builder` | `22.1.0` | Angular ESLint builder |
| `eslint-config-prettier` | `10.1.8` | Disables ESLint rules that conflict with Prettier |
| `eslint-plugin-playwright` | `2.11.0` | Playwright E2E lint rules |
| `globals` | `17.9.0` | ESLint shared global definitions |
| `jsdom` | `30.0.1` | DOM environment for Angular Vitest unit/component tests |
| `vite` | `7.3.6` | Vite aligned with `@angular/build@22.0.8` and Vitest 4 |
| `rxjs` | `7.8.2` | Angular peer dependency |
| `tslib` | `2.8.1` | TypeScript helper library |
| `sass` | `1.99.0` | SCSS compilation aligned with `@angular/build@22.0.8` |
| `@types/node` | `24.13.3` | Node.js TypeScript types for the Node 24 line |
| `@types/express` | `5.0.6` | Express TypeScript types for Express 5 |

### Transitive database driver note

Mongoose `9.8.0` depends on the MongoDB Node.js driver line `mongodb@~7.5`. That driver version is distinct from MongoDB Server `8.2.12`. Do not replace the approved server version with the driver version, and do not treat the driver package as the authoritative database topology.

### Zone.js policy

`@angular/core@22.0.8` marks `zone.js` as an optional peer dependency. Release 1 uses zoneless change detection. Do not install or enable Zone.js change detection for `apps/web`.

---

## 2. Version Compatibility Evidence

Official registry and release checks performed for P1-07:

| Check | Result |
| --- | --- |
| Node.js `24.18.0` LTS release exists | Pass — Node.js Krypton LTS release published |
| pnpm `11.17.0` exists on npm | Pass |
| Nx `23.1.0` and all listed `@nx/*@23.1.0` packages exist | Pass |
| `@nx/express@23.1.0` exists and matches `nx@23.1.0` | Pass — approved Express Nx plugin; does not replace Express or `@nx/node` |
| Angular framework and CLI packages at `22.0.8` exist | Pass |
| TypeScript `6.0.3` exists | Pass |
| Express `5.2.1`, Mongoose `9.8.0`, Vitest `4.1.10`, Playwright Test `1.62.0`, ESLint `10.7.0`, Prettier `3.9.6` exist | Pass |
| MongoDB Server `8.2.12` exists as an official server release | Pass — production-ready 8.2 patch release |
| Angular `@angular/compiler-cli@22.0.8` TypeScript peer | Pass — `typescript: >=6.0 <6.1`; `6.0.3` is inside range |
| Angular `@angular/core@22.0.8` Node engines | Pass — `^22.22.3 \|\| ^24.15.0 \|\| >=26.0.0`; Node `24.18.0` satisfies `^24.15.0` |
| `@angular/build@22.0.8` Vitest peer | Pass — `vitest: ^4.0.8`; Vitest `4.1.10` is compatible |
| `@nx/vitest@23.1.0` Vitest peer | Pass — `vitest: ^3.0.0 \|\| ^4.0.0` |
| `@nx/playwright@23.1.0` Playwright peer | Pass — `@playwright/test: ^1.36.0` |
| `typescript-eslint@8.66.0` peers | Pass — ESLint `^8.57 \|\| ^9 \|\| ^10` and TypeScript `>=4.8.4 <6.1.0` |
| `angular-eslint@22.1.0` peers | Pass — ESLint `^9 \|\| ^10`, `@angular/cli >=22 <23`, `typescript-eslint ^8` |
| All selected packages are stable releases | Pass — no `next`, `rc`, `beta`, `alpha`, canary, nightly, or preview tags selected |
| All `@nx/*` versions match `nx@23.1.0` | Pass |
| Angular framework and CLI patch line match | Pass — all `22.0.8` |

No genuine compatibility blocker was found for the approved baseline.

---

## 3. Package Manager and Lockfile Policy

Root metadata must use:

```json
{
  "private": true,
  "packageManager": "pnpm@11.17.0",
  "engines": {
    "node": ">=24.18.0 <25",
    "pnpm": ">=11.17.0 <12"
  }
}
```

Required after F00:

```text
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
nx.json
.nvmrc
.node-version
.npmrc
```

`.npmrc` baseline:

```text
save-exact=true
auto-install-peers=false
strict-peer-dependencies=true
```

Rules:

* `.nvmrc` and `.node-version` contain exactly `24.18.0`.
* `.npmrc` uses the baseline above.
* Every required direct peer must be explicitly pinned in `package.json`.
* Do not allow pnpm to silently select an unreviewed peer version.
* Missing optional peers such as Zone.js must remain absent when the application is intentionally zoneless.
* A genuine peer conflict is a bootstrap blocker; do not silence it globally.
* Use a narrow documented package-specific override only when an upstream metadata defect is proven.
* Direct dependencies and direct devDependencies use exact versions.
* Commit `pnpm-lock.yaml`.
* CI installs with `pnpm install --frozen-lockfile`.
* Do not commit `package-lock.json`, `yarn.lock`, or Bun lockfiles.
* Internal packages use the pnpm workspace protocol (`workspace:`).
* Do not use `latest`, `*`, broad major ranges, or unbounded dependency ranges in committed manifests.
* Dependency updates occur only through dedicated reviewed commits.
* Lockfile changes must not be mixed invisibly into unrelated feature work.
* Install `@nx/express@23.1.0` explicitly during F00; do not rely on an unpinned generator-added version.

---

## 4. Monorepo Runtime Format

| Concern | Decision |
| --- | --- |
| Package manager | pnpm workspaces |
| Task orchestration | Nx integrated workspace |
| Application directory | `apps/` |
| Internal package directory | `packages/` |
| Package scope | `@agrivio` |
| API module format | Native ESM (`"type": "module"`) |
| API TypeScript target | `ES2024` |
| API TypeScript module | `NodeNext` |
| API moduleResolution | `NodeNext` |
| Frontend styling | SCSS |
| Frontend change detection | Zoneless |
| Nx Cloud | Disabled for Release 1 bootstrap |
| Caching | Local Nx cache only |

Nx workspace layout:

```json
{
  "workspaceLayout": {
    "appsDir": "apps",
    "libsDir": "packages"
  }
}
```

Do not use `libs/`. Do not create a nested workspace under the existing `Agrivio/` repository root.

---

## 5. TypeScript Strict Policy

Shared strict compiler settings must include:

```text
strict
noUncheckedIndexedAccess
exactOptionalPropertyTypes
noImplicitOverride
noImplicitReturns
noFallthroughCasesInSwitch
useUnknownInCatchVariables
forceConsistentCasingInFileNames
```

Additional rules:

* Avoid `any`. Exceptional usage requires a narrow documented reason at the call site or adjacent ADR note.
* API contracts must not import Express, Angular, Mongoose, or backend persistence types.
* Frontend must not import API implementation code.
* Backend domain and application logic must not depend on Express request/response objects.
* Mongoose types remain inside persistence boundaries.
* Internal package references use workspace packages or approved Nx path configuration.
* Do not use path aliases to bypass public module boundaries.

### `skipLibCheck`

`skipLibCheck` is enabled (`true`) in the shared TypeScript baseline.

Reason: third-party declaration files occasionally conflict under the strict project settings above. Enabling `skipLibCheck` avoids blocking the build on external `.d.ts` inconsistencies while preserving full strict checking for first-party Agrivio source.

---

## 6. Linting and Formatting Baseline

Use:

```text
ESLint flat configuration
typescript-eslint
Angular ESLint
Nx module-boundary enforcement
Prettier
```

Responsibilities:

* ESLint detects correctness, architecture, and code-quality problems.
* Prettier controls formatting.
* Do not duplicate formatting rules in ESLint.

Formatting baseline:

```text
UTF-8
LF line endings
Single quotes where supported
Trailing commas where supported
100-character print width
Two-space indentation
Final newline required
```

Required commands:

```bash
pnpm format
pnpm format:check
pnpm lint
```

Architecture linting must later support:

* Forbidden cross-module imports
* Frontend feature-internal import restrictions
* Public module entry-point enforcement
* No cross-module Mongoose-model imports
* No cross-module repository imports

Custom business architecture assertions may be implemented during F00/F01 where ordinary lint rules are insufficient. See [TEST_STRATEGY.md](TEST_STRATEGY.md).

---

## 7. Version-Pinning Rules

* Every direct dependency uses an exact version.
* Every approved `@nx/*` package matches `nx` exactly, including `@nx/express@23.1.0`.
* Angular framework, Angular build packages, and Angular CLI stay on the same patch line.
* TypeScript remains inside Angular 22’s supported `6.0.x` range.
* Playwright browser binaries are installed through the official Playwright command for the pinned `@playwright/test` version.
* MongoDB Server image/tag is pinned to `8.2.12`.
* Generator-installed support packages must be pinned to the exact versions recorded in this document or added through a dedicated dependency review commit.

---

## 8. Upgrade Policy

### Patch updates

May be proposed through a dedicated dependency PR with:

* Changelog review
* Lockfile diff
* Full applicable quality checks

### Minor updates

Require:

* Compatibility review
* Migration-note review
* Full quality checks

### Major updates

Require:

* ADR or formal technical decision
* Compatibility matrix
* Migration plan
* Full regression
* Rollback plan

Additional rules:

* Angular major updates occur one supported major at a time.
* Nx migrations must be reviewed before execution.
* Node major changes require CI and production-runtime compatibility validation.
* MongoDB upgrades require feature-compatibility and backup/restore planning.
* TypeScript must remain inside Angular’s supported range.
* Do not automatically update framework majors.
* Security patches may be expedited but still require validation.
* GitHub-hosted dependency update automation may be considered after F00, but it must not automatically merge major updates.

---

## 9. Prohibited Alternatives

Do not select or introduce during Release 1 bootstrap:

* NestJS
* Next.js
* React
* Vue
* npm as package manager
* Yarn
* Bun
* Turborepo
* Lerna
* Jest
* Karma
* Jasmine as the primary runner
* Cypress
* Protractor
* `mongodb-memory-server` as the authoritative transaction test environment
* Mocked MongoDB for transaction correctness
* Native mobile tooling
* Electron
* Module Federation
* Microservices
* Nx Cloud
* Redis
* Queue or broker
* Production Docker images
* Kubernetes
* Hosting provider
* Backup provider
* Monitoring provider
* UI component framework
* Global frontend state library
* Tax libraries
* Accounting framework
* Node 26 Current as a replacement for Node 24 LTS
* Prerelease packages (`next`, `rc`, `beta`, `alpha`, canary, nightly, preview)

These require a later approved need or architecture decision.

---

## 10. Controlled Future Upgrade Process

1. Open a dedicated branch named `chore/<dependency-or-tool>-upgrade`.
2. Record the current and target versions in the PR description.
3. Update only the intended dependency set and lockfile.
4. Run the applicable local and CI quality, integration, and E2E jobs.
5. For Nx or Angular migrations, review generated diffs before accepting them.
6. For MongoDB Server upgrades, validate replica-set transactions and backup/restore assumptions.
7. Merge only after review confirms no silent toolchain substitution.

Authoritative command and PR expectations live in [DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md).
