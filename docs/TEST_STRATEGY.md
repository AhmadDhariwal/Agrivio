# Test Strategy

Document status: Frozen for Release 1  
Current version: 1.3.0  
Last updated: 2026-08-08  
Approval status: Approved for repository initialization

> **Amendment 1.1.0 (2026-08-05):** Frontend canonical project: `apps/frontend`. Backend canonical project: `apps/backend`. Backend implementation language was JavaScript ESM. Frontend implementation language: Angular TypeScript. Details: [tasks/F00-APP-NAMING-BACKEND-JS-MIGRATION.md](tasks/F00-APP-NAMING-BACKEND-JS-MIGRATION.md).
>
> **Amendment 1.2.0 (2026-08-08):** Backend implementation language: JavaScript CommonJS (`require` / `module.exports`). Frontend remains Angular TypeScript. Shared packages remain TypeScript. Details: [tasks/BACKEND-COMMONJS-MIGRATION.md](tasks/BACKEND-COMMONJS-MIGRATION.md).
>
> **Amendment 1.3.0 (2026-08-08):** Backend coding style is plain CommonJS JavaScript without `// @ts-check` or JSDoc type annotations. Details: [tasks/BACKEND-COMMONJS-MIGRATION.md](tasks/BACKEND-COMMONJS-MIGRATION.md).

## Document Authority

| Concern | Authoritative document |
| --- | --- |
| Quality gates and required evidence | Frozen [QUALITY_GATES.md](QUALITY_GATES.md) |
| Target test locations | Frozen [REPOSITORY_STRUCTURE.md](REPOSITORY_STRUCTURE.md) |
| Exact tool versions | Frozen [TOOLCHAIN.md](TOOLCHAIN.md) |
| Local replica-set topology | Frozen [REPOSITORY_INITIALIZATION.md](REPOSITORY_INITIALIZATION.md) |
| Development commands | Frozen [DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md) |
| Test tooling responsibilities and conventions | This document |

This document freezes the Release 1 test strategy. It does not create tests during P1-07.

---

## 1. Testing Stack

| Test category | Tool |
| --- | --- |
| Angular unit/component | Angular native Vitest integration |
| API unit | Vitest |
| API module integration | Vitest against real local MongoDB replica set |
| Transaction/concurrency | Vitest against real MongoDB replica set |
| Architecture tests | Nx boundaries plus custom Vitest/Node assertions |
| End-to-end | Playwright Test |
| Browser coverage | Chromium required in normal CI; Firefox and WebKit in release/nightly matrix |
| Coverage engine | Vitest V8 coverage (`@vitest/coverage-v8@4.1.10`) |

Exact versions: [TOOLCHAIN.md](TOOLCHAIN.md).

### Prohibited test tools

Do not use:

* Karma
* Jasmine as the primary runner
* Jest
* Cypress
* Protractor
* `mongodb-memory-server` as the authoritative transaction test environment
* Mocked MongoDB for transaction correctness

Mocks may be used for pure unit tests. Transaction, index, tenant-isolation, concurrency, and repository tests must use a real replica-set-capable MongoDB environment.

---

## 2. Unit-Test Stack

* Runner: Vitest `4.1.10`
* Angular unit and component tests use Angular’s supported Vitest integration through `@angular/build` and `@nx/vitest`, selected with `--unitTestRunner=vitest-angular` for `apps/frontend`
* API and shared-package Vitest suites use `--unitTestRunner=vitest` where applicable
* Playwright remains a separate workspace E2E setup and is not the Angular unit-test runner
* DOM environment for Angular tests: `jsdom@30.0.1`
* API pure unit tests run in Node without MongoDB when no persistence behaviour is under test
* Coverage provider: V8

Unit tests focus on:

* Business calculations and documented rule cases
* Pure domain policies
* Mappers and validators
* Permission decision helpers that do not require persistence
* Frontend presentational and form logic that does not require a full browser workflow

---

## 3. Angular Component-Test Stack

* Use Angular standalone component testing with Vitest
* Prefer Testing Library-style interaction only if later approved; F00 does not require a third-party component-testing framework beyond Angular’s Vitest integration
* Cover rendering, form validation UX, and permission-aware UI hiding as non-authoritative UI behaviour
* Authoritative authorization remains backend-enforced and covered by API tests

---

## 4. API Integration-Test Stack

* Runner: Vitest
* Environment: real MongoDB Server `8.2.12` single-node replica set `rs0`
* Database naming: isolated names with prefix `agrivio_test_`
* Scope: module service/repository persistence, indexes, tenant scoping, and module public interfaces

Integration tests must:

* Create isolated organization and actor context
* Clean their own data
* Not depend on execution order
* Fail when organization scope is omitted from tenant-owned persistence operations

---

## 5. MongoDB Transaction-Test Environment

Required topology:

```text
MongoDB 8.2.12
Single-node replica set
Replica-set name: rs0
Docker Compose v2 for local and CI foundation
```

Required proofs:

* Primary election health
* Multi-document transaction commit
* Multi-document transaction rollback
* Later concurrency and duplicate-request coverage for financial and stock workflows

Standalone MongoDB is not accepted. Memory servers are not authoritative for transaction correctness.

---

## 6. Architecture-Test Approach

Use both:

1. Nx/ESLint module-boundary enforcement
2. Custom Vitest or Node assertions under architecture test locations

Architecture tests must detect:

* Forbidden cross-module imports
* Frontend feature-internal import restrictions
* Public module entry-point violations
* Cross-module Mongoose-model imports
* Cross-module repository imports
* Controller persistence access patterns where fixtures exist

Architecture tests must not be hidden inside ordinary unit-test suites.

During F00, fixtures under test tooling may prove forbidden imports without creating empty production module folders.

---

## 7. E2E Stack

* Runner: Playwright Test `1.62.0`
* Normal CI browser: Chromium
* Release/nightly matrix: Firefox and WebKit in addition to Chromium
* E2E tests interact only through public UI and API surfaces
* F00 requires only a minimal smoke path proving web and API can start together

Do not use Cypress or Protractor.

---

## 8. Test Locations

Use frozen repository boundaries.

### Backend

```text
apps/backend/src/modules/<module>/tests/
apps/backend/tests/integration/
apps/backend/tests/workflows/
apps/backend/tests/architecture/
apps/backend/tests/e2e/
```

### Frontend

```text
apps/frontend/src/app/features/<feature>/tests/
apps/frontend/tests/e2e/
```

### Shared reusable test support

```text
packages/test-support/
```

Rules:

* Test support must not contain production business logic.
* Unit tests may be colocated where framework conventions require.
* Integration and workflow tests remain clearly separated.
* E2E tests must interact through public UI/API surfaces.
* Architecture tests must not be hidden inside ordinary unit-test suites.
* Create module or feature test directories only when real tests exist.

---

## 9. Naming Conventions

```text
*.spec.ts
*.integration.spec.ts
*.workflow.spec.ts
*.architecture.spec.ts
*.e2e.spec.ts
```

Guidance:

* Default unit/component files use `*.spec.ts`
* Integration suites use `*.integration.spec.ts`
* Cross-module workflow suites use `*.workflow.spec.ts`
* Architecture suites use `*.architecture.spec.ts`
* Playwright specs use `*.e2e.spec.ts`

---

## 10. CI Test Layers

| CI job | Tests and checks |
| --- | --- |
| Quality | Format check, lint, type check, unit tests, architecture tests, build |
| Integration | Replica-set startup, API integration tests, transaction smoke, tenant-isolation smoke |
| E2E smoke | MongoDB, API, web, Chromium Playwright smoke |

CI installs with `pnpm install --frozen-lockfile` and never modifies the lockfile.

Details: [REPOSITORY_INITIALIZATION.md](REPOSITORY_INITIALIZATION.md), [DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md).

---

## 11. Coverage Policy

Do not invent a misleading global coverage threshold for an empty F00 scaffold.

Principles:

* New business calculations require complete branch coverage for documented rule cases.
* Transaction workflows require success, rollback, retry, and duplicate-request coverage.
* Tenant and permission enforcement require explicit allow and deny cases.
* Coverage must not be used as a substitute for reconciliation or security tests.
* A global numeric baseline must be established no later than the F01 exit review once meaningful production code exists.
* Coverage reduction requires explicit review.
* Generated files, configuration-only files, and type-only contracts may be excluded with documented rules.

Coverage engine: Vitest V8.

---

## 12. Fixture Boundaries

`packages/test-support` may provide:

* Organization and actor builders
* Authentication/session test helpers after those modules exist
* MongoDB test-database naming helpers
* Transaction helper wrappers
* Architecture fixture loaders

Must not provide:

* Production business calculations
* Hidden bypasses of tenant isolation
* Permanent shared mutable global test state
* Client-specific fixtures as the default path

Fixtures must encourage correct organization scoping rather than make incorrect code easier to write.

---

## 13. Test-Data Isolation

Every test creates isolated organization and actor context.

Rules:

* No dependence on execution order
* No reliance on leftover data from another test
* Integration tests use unique `agrivio_test_` database names or equivalent unique namespaces
* Tests clean their own data
* Parallelism is allowed only when isolation is proven
* Production credentials and production data are never used

---

## 14. Required Smoke Tests for F00

F00 must include at least:

| Smoke | Requirement |
| --- | --- |
| Web scaffold unit test | Angular Vitest harness runs for a trivial component |
| API boot smoke | API process boots in test/smoke mode |
| Architecture-boundary fixture | Forbidden-import fixture fails as expected |
| Replica-set primary election | `pnpm db:status` or equivalent proves primary |
| Transaction commit | Multi-document transaction commits successfully |
| Transaction rollback | Multi-document transaction aborts with no partial residue |
| CI quality | Empty-app quality job is green |
| CI integration | Transaction/integration smoke job is green |
| CI E2E smoke | Chromium smoke against started web and API is green |

F00 must not include business feature tests that imply business routes, schemas, or feature folders exist.

---

## 15. Mapping to Quality Gates

| Quality concern | Test strategy response |
| --- | --- |
| WI-G03 Type checking | `pnpm typecheck` |
| WI-G04 Linting | `pnpm lint` |
| WI-G05 Unit tests | Vitest unit/component suites |
| WI-G06 Module integration | Vitest + real MongoDB replica set |
| WI-G07 Architecture | Nx boundaries + architecture specs |
| WI-G08 Tenant scope | Integration and architecture assertions with allow/deny cases |
| WI-G09 Permissions | Explicit allow/deny API and policy tests |
| WI-G10 Subscription | Entitlement and suspension tests when those modules exist |
| WI-G11 Transactions | Commit/rollback/concurrency suites on replica set |
| WI-G12 Idempotency | Duplicate-request suites when idempotent endpoints exist |
| E2E | Playwright against public surfaces |

Authoritative gate definitions remain in [QUALITY_GATES.md](QUALITY_GATES.md).
