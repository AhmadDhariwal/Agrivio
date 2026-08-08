# Agrivio

> Working product name pending domain and trademark verification.

Agrivio is a cloud-first Fertilizer POS and Inventory Management web application for fertilizer retailers, seed stores, pesticide and chemical dealers, agricultural-input wholesalers, and dealers and distributors. The first release will initially serve two clients and must support additional organizations later.

## Current Status

Current task: **npm workspace migration complete** — package manager is npm; Nx retained  
Status: Unit/architecture gates targeted on Node `24.18.0` / npm `11.16.0`; live MongoDB transaction proofs still require Docker Compose v2  
Next work item: **F02 Phase 5**

P1-01 through P1-07 are complete.  
All four P1-07 toolchain documents are frozen at version 1.4.0 (npm workspace amendment).  
F00 workspace bootstrap (`R1-F00-001`) is complete.  
Angular frontend scaffold (`R1-F00-002`, historically `apps/web`) is complete.  
Express backend scaffold (`R1-F00-003`, now JavaScript CommonJS under `apps/backend`) is complete.  
Shared packages `@agrivio/api-contracts`, `@agrivio/tooling-config`, and `@agrivio/test-support` exist.  
Root commands from [docs/DEVELOPMENT_WORKFLOW.md](docs/DEVELOPMENT_WORKFLOW.md) are wired (`npm run check`, build/lint/typecheck/test/format/affected, `db:*`, `test:integration`).  
Manual app startup: `cd apps/frontend && npm start`, `cd apps/backend && node index.js`.  
E2E and CI foundation workflows exist under `.github/workflows/` (quality, integration, E2E smoke) using npm `ci`.  
Docker-dependent integration/E2E execution still requires Docker Compose v2 locally.

## Current Phase

Release 1 implementation — Stage F02 Identity & Access (after F01 Platform Foundation)

## Technology Stack

| Layer              | Choice                                                    |
| ------------------ | --------------------------------------------------------- |
| Frontend           | Angular and TypeScript (`apps/frontend`)                  |
| Backend            | Node.js, Express and JavaScript CommonJS (`apps/backend`) |
| Database           | MongoDB with Mongoose                                     |
| Repository         | Monorepo                                                  |
| Package manager    | npm workspaces                                            |
| Task orchestration | Nx                                                        |
| Architecture       | Modular monolith                                          |
| API                | REST                                                      |
| Styling            | SCSS with a centralized design system                     |

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

Frozen toolchain and initialization documents (P1-07, v1.4.0 npm workspace amendment):

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
6. Follow [`docs/DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md) for day-to-day commands.
7. Implementation records live under `docs/tasks/` (for example [`docs/tasks/NPM-WORKSPACE-MIGRATION.md`](docs/tasks/NPM-WORKSPACE-MIGRATION.md)).
