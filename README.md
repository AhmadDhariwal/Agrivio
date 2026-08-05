# Agrivio

> Working product name pending domain and trademark verification.

Agrivio is a cloud-first Fertilizer POS and Inventory Management web application for fertilizer retailers, seed stores, pesticide and chemical dealers, agricultural-input wholesalers, and dealers and distributors. The first release will initially serve two clients and must support additional organizations later.

## Current Status

Current task: **F00 complete** (`R1-F00-001`–`R1-F00-010`)  
Status: Workspace, empty apps, shared packages, MongoDB replica-set tooling, architecture-boundary tests, and GitHub Actions CI foundations are in place  
Next stage: **F01 Phase 1 — Platform Runtime Foundation**

P1-01 through P1-07 are complete.  
All four P1-07 toolchain documents are frozen at version 1.1.0.  
F00 workspace bootstrap through CI foundation is complete — see [docs/tasks/F00-PHASE-2-ARCHITECTURE-CI.md](docs/tasks/F00-PHASE-2-ARCHITECTURE-CI.md).  
Applications: `apps/frontend` (Angular TypeScript) and `apps/backend` (Express JavaScript ESM).  
Shared packages: `@agrivio/api-contracts`, `@agrivio/tooling-config`, `@agrivio/test-support`.  
Root commands from [docs/DEVELOPMENT_WORKFLOW.md](docs/DEVELOPMENT_WORKFLOW.md) are wired, including `pnpm check`, `pnpm test:architecture`, `pnpm test:integration`, `pnpm e2e`, and `db:*`.  
CI workflows: `.github/workflows/quality.yml`, `integration.yml`, `e2e-smoke.yml`.

## Current Phase

Release 1 implementation — Stage F01 Platform Runtime Foundation (next)

## Technology Stack

| Layer              | Choice                                               |
| ------------------ | ---------------------------------------------------- |
| Frontend           | Angular and TypeScript (`apps/frontend`)             |
| Backend            | Node.js, Express and JavaScript ESM (`apps/backend`) |
| Database           | MongoDB with Mongoose                                |
| Repository         | Monorepo                                             |
| Package manager    | pnpm                                                 |
| Task orchestration | Nx                                                   |
| Architecture       | Modular monolith                                     |
| API                | REST                                                 |
| Styling            | SCSS with a centralized design system                |

Exact versions: [`docs/TOOLCHAIN.md`](docs/TOOLCHAIN.md).

## Documentation

Start at [`docs/PROJECT_INDEX.md`](docs/PROJECT_INDEX.md).

Authoritative finalized decisions are recorded in [`docs/PROJECT_DECISIONS.md`](docs/PROJECT_DECISIONS.md).

Frozen business rules and glossary:

- [`docs/BUSINESS_RULES.md`](docs/BUSINESS_RULES.md) — version 1.0
- [`docs/DOMAIN_GLOSSARY.md`](docs/DOMAIN_GLOSSARY.md) — version 1.0

Frozen architecture documents (P1-04, version 1.0):

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/MODULE_BOUNDARIES.md`](docs/MODULE_BOUNDARIES.md)
- [`docs/REPOSITORY_STRUCTURE.md`](docs/REPOSITORY_STRUCTURE.md)

Frozen technical-design documents (P1-05, version 1.0):

- [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md)
- [`docs/API_DESIGN.md`](docs/API_DESIGN.md)
- [`docs/SECURITY_AUTHORIZATION.md`](docs/SECURITY_AUTHORIZATION.md)
- [`docs/SUBSCRIPTION_AND_BILLING.md`](docs/SUBSCRIPTION_AND_BILLING.md)

Frozen implementation planning documents (P1-06, version 1.0):

- [`docs/IMPLEMENTATION_ROADMAP.md`](docs/IMPLEMENTATION_ROADMAP.md)
- [`docs/DELIVERY_PLAN.md`](docs/DELIVERY_PLAN.md)
- [`docs/QUALITY_GATES.md`](docs/QUALITY_GATES.md)

Frozen toolchain and initialization documents (P1-07, v1.1.0 application-path amendment):

- [`docs/TOOLCHAIN.md`](docs/TOOLCHAIN.md)
- [`docs/REPOSITORY_INITIALIZATION.md`](docs/REPOSITORY_INITIALIZATION.md)
- [`docs/DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md)
- [`docs/TEST_STRATEGY.md`](docs/TEST_STRATEGY.md)

## Contribution Guidance

1. Read `AGENTS.md` before making changes.
2. Implement only the assigned task or roadmap work item.
3. Do not change finalized product decisions.
4. Do not initialize frameworks, install packages, or create source-code folders until a work item explicitly requires it.
5. Prefer linking to authoritative documents over duplicating rules.
6. Follow [`docs/REPOSITORY_INITIALIZATION.md`](docs/REPOSITORY_INITIALIZATION.md) for F00 history. Next stage is F01.
7. Implementation records live under `docs/tasks/` (for example [`docs/tasks/F00-PHASE-2-ARCHITECTURE-CI.md`](docs/tasks/F00-PHASE-2-ARCHITECTURE-CI.md)).
