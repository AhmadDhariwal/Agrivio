# Repository Structure

Document status: Frozen for Release 1  
Current version: 1.1.0  
Last updated: 2026-08-05  
Approval status: Approved for Phase 1 continuation

> **Amendment 1.1.0 (2026-08-05):** Frontend canonical project: `apps/frontend`. Backend canonical project: `apps/backend`. Backend implementation language: JavaScript ESM. Frontend implementation language: Angular TypeScript. Details: [tasks/F00-APP-NAMING-BACKEND-JS-MIGRATION.md](tasks/F00-APP-NAMING-BACKEND-JS-MIGRATION.md).

## Document Authority

| Concern | Authoritative document |
| --- | --- |
| What Release 1 must provide | Frozen [PRD.md](PRD.md) |
| Business behaviour and formulas | Frozen [BUSINESS_RULES.md](BUSINESS_RULES.md) |
| System architecture | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Module ownership and dependencies | [MODULE_BOUNDARIES.md](MODULE_BOUNDARIES.md) |
| Target repository layout | This document |

This document defines the target monorepo layout for later initialization. Architecture documents define how the system will be structured to support frozen requirements.

P1-04 does not create the documented folders, packages, source trees, frameworks, CI, infrastructure, schemas, APIs, or tests.

---

## 1. Target Monorepo Layout

```text
Agrivio/
├── apps/
│   ├── frontend/
│   └── backend/
├── packages/
│   ├── api-contracts/
│   ├── tooling-config/
│   └── test-support/
├── docs/
│   ├── tasks/
│   ├── PROJECT_INDEX.md
│   ├── PROJECT_DECISIONS.md
│   ├── PRD.md
│   ├── RELEASE_1_SCOPE.md
│   ├── BUSINESS_RULES.md
│   ├── DOMAIN_GLOSSARY.md
│   ├── ARCHITECTURE.md
│   ├── MODULE_BOUNDARIES.md
│   └── REPOSITORY_STRUCTURE.md
├── scripts/
├── tools/
├── AGENTS.md
├── README.md
└── .gitignore
```

These folders are targets for later initialization. Do not create them in P1-04.

The product and repository are both named Agrivio. Internal folders, modules, packages, and TypeScript files continue to use lowercase kebab-case.

---

## 2. Shared Package Rules

### `packages/api-contracts`

May later contain:

* Approved request and response contracts
* Shared API enums
* Stable transport-level types

Must not contain:

* Backend domain services
* Mongoose models
* Angular services
* Business calculations
* Repository interfaces tied to persistence

### `packages/tooling-config`

May later contain shared:

* TypeScript configuration
* Lint configuration
* Formatting configuration
* Test configuration

### `packages/test-support`

May later contain reusable:

* Test builders
* Fixtures
* Tenant-isolation helpers
* Transaction test utilities

Must not contain production business logic.

---

## 3. Backend Target Structure

```text
apps/backend/
├── src/
│   ├── bootstrap/
│   ├── config/
│   ├── infrastructure/
│   │   ├── database/
│   │   ├── logging/
│   │   ├── monitoring/
│   │   └── transactions/
│   ├── middleware/
│   ├── modules/
│   │   ├── platform/
│   │   ├── identity-access/
│   │   ├── organizations/
│   │   ├── subscriptions/
│   │   ├── locations/
│   │   ├── catalog/
│   │   ├── customers/
│   │   ├── suppliers/
│   │   ├── inventory/
│   │   ├── purchases/
│   │   ├── sales/
│   │   ├── payments-ledgers/
│   │   ├── accounts-expenses/
│   │   ├── returns-corrections/
│   │   ├── alerts/
│   │   ├── reporting/
│   │   ├── imports/
│   │   ├── audit/
│   │   ├── settings/
│   │   └── operations/
│   └── shared/
└── tests/
    ├── integration/
    ├── workflows/
    ├── architecture/
    └── e2e/
```

### Backend `shared/` allowlist

Permitted examples:

* Domain-neutral error base
* Request context type
* Money/quantity primitives where approved
* Generic result type
* Date utility with no business policy

Prohibited examples:

* Sale calculation
* Stock allocation
* Customer credit policy
* Weighted-average cost policy
* Subscription business logic
* Generic repositories for unrelated modules

`shared/` must use an explicit allowlist. Technical shared folders are allowed only with narrow documented ownership.

---

## 4. Backend Module Template

```text
modules/<module>/
├── public/
├── routes/
├── validation/
├── controllers/
├── services/
├── repositories/
├── persistence/
├── policies/
├── mappers/
├── types/
└── tests/
```

Responsibilities:

| Folder | Responsibility |
| --- | --- |
| `public/` | Module interfaces available to other modules |
| `routes/` | HTTP registration |
| `validation/` | Request-shape validation |
| `controllers/` | HTTP adaptation |
| `services/` | Use cases and orchestration |
| `repositories/` | Persistence abstractions and module-owned queries |
| `persistence/` | Mongoose models and implementations |
| `policies/` | Module-owned business policies |
| `mappers/` | Persistence/transport mapping |
| `types/` | Module-internal types |
| `tests/` | Module unit and integration tests |

Not every module must contain every folder. Empty folders must not be created merely to match a template.

---

## 5. Frontend Target Structure

```text
apps/frontend/
├── src/
│   ├── app/
│   │   ├── core/
│   │   ├── layout/
│   │   ├── shared/
│   │   └── features/
│   │       ├── public/
│   │       ├── authentication/
│   │       ├── platform/
│   │       ├── organization/
│   │       ├── subscriptions/
│   │       ├── users-access/
│   │       ├── branches-warehouses/
│   │       ├── catalog/
│   │       ├── customers/
│   │       ├── suppliers/
│   │       ├── inventory/
│   │       ├── purchases/
│   │       ├── sales-pos/
│   │       ├── payments-ledgers/
│   │       ├── returns/
│   │       ├── accounts-expenses/
│   │       ├── alerts/
│   │       ├── dashboard/
│   │       ├── reports/
│   │       ├── imports/
│   │       ├── audit/
│   │       └── settings/
│   └── assets/
└── tests/
    └── e2e/
```

### Feature template

```text
features/<feature>/
├── pages/
├── components/
├── data-access/
├── services/
├── models/
├── routes/
└── tests/
```

Not every feature must contain every folder.

No feature may import another feature's internal folder.

---

## 6. Test Layout

| Location | Purpose |
| --- | --- |
| `apps/backend/src/modules/<module>/tests/` | Module unit and module-local integration tests |
| `apps/backend/tests/integration/` | Broader module integration tests |
| `apps/backend/tests/workflows/` | Cross-module workflow tests |
| `apps/backend/tests/architecture/` | Architecture boundary tests |
| `apps/backend/tests/e2e/` | API end-to-end tests |
| `apps/frontend/src/app/features/<feature>/tests/` | Feature tests |
| `apps/frontend/tests/e2e/` | Frontend end-to-end tests |
| `packages/test-support/` | Shared test utilities only |

---

## 7. Documentation Layout

Authoritative documents remain under `docs/` with task files under `docs/tasks/`.

Navigation starts at [PROJECT_INDEX.md](PROJECT_INDEX.md).

Do not duplicate frozen product rules into repository-structure notes; link to the authoritative document instead.

---

## 8. Script and Tooling Locations

| Path | Purpose |
| --- | --- |
| `scripts/` | Operational and developer scripts for later initialization and maintenance |
| `tools/` | Repository tooling helpers that are not production application code |
| `packages/tooling-config/` | Shared lint, format, TypeScript, and test configuration |

Exact package manager, monorepo orchestration, and CI tooling remain unresolved until P1-07 or deployment tasks.

---

## 9. Naming Conventions

* Directories: `kebab-case`
* TypeScript files: `kebab-case`
* Classes and interfaces: `PascalCase`
* Variables and functions: `camelCase`
* Constants: use a project-approved consistent convention
* Test files: consistent `.spec.ts` or later-approved project convention
* Business module names: canonical names from [MODULE_BOUNDARIES.md](MODULE_BOUNDARIES.md)
* No abbreviations that obscure domain meaning
* Use `organization`, not interchangeable `tenant`, inside business-module naming unless referring specifically to tenancy infrastructure
* Use `warehouse`, not generic `store`
* Use `customer advance`, not generic `credit balance`
* Use `weighted-average cost`, not ambiguous `average price`

Exact lint rules belong in P1-07.

---

## 10. Import-Boundary Conventions

* Import from another module only through its public surface.
* Internal relative imports remain inside the same module.
* Frontend features import shared UI only through approved shared exports.
* Infrastructure may depend on technical configuration but must not own business policy.
* Business services must not depend on Express request/response types.
* Persistence implementations may depend on Mongoose.
* Domain policies must not depend on Mongoose.
* API contracts must not import backend persistence types.
* Test-support packages must not become production dependencies.

---

## 11. Public Module Surfaces

Backend public surfaces live under `modules/<module>/public/`.

Frontend cross-feature interaction must use a published feature facade, approved shared service, router navigation, or stable API contract. Features must not import another feature's internal folders.

---

## 12. File-Ownership Rules

* Every business file belongs to exactly one canonical module or feature.
* Persistence models belong to the owning module's `persistence/` folder.
* Controllers, routes, validation, services, repositories, and policies remain module-local.
* Cross-cutting technical concerns belong in `infrastructure/`, `middleware/`, or explicitly allowlisted `shared/`.
* Documentation ownership follows the Project Index; do not fork authoritative rules into code comments as a second source of truth.

---

## 13. Prohibited Folders and Dumping Grounds

Explicitly prohibit these root-level dumping grounds for unrelated business features:

```text
src/common/
src/helpers/
src/utils/
src/services/
src/models/
src/controllers/
```

Also prohibit:

* One global models directory containing every business model
* One global service directory containing every business service
* One global controller directory
* One global repository with access to every collection
* Generic CRUD service used as a substitute for domain services
* Shared business logic without a clear owning module
* Frontend `shared` containing feature pages
* Client-specific directories
* Separate source trees for shared SaaS and dedicated cloud

Technical shared folders are allowed only with narrow documented ownership.
