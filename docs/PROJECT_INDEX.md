# Project Documentation Index

Central navigation for Agrivio documentation.

## Current Status

* P1-01 through P1-07 are complete
* R1-F00-001 monorepo workspace bootstrap is complete
* All four P1-07 toolchain documents are frozen at version 1.1.0 (application naming and backend JavaScript amendment)
* R1-F00-002 Angular frontend application scaffold is complete (historically `apps/web`)
* R1-F00-003 Express backend scaffold is complete (historically `apps/api`; now JavaScript ESM under `apps/backend`)
* F00 application naming and backend JavaScript migration complete — see [tasks/F00-APP-NAMING-BACKEND-JS-MIGRATION.md](tasks/F00-APP-NAMING-BACKEND-JS-MIGRATION.md)
* F00 Batch A complete: `R1-F00-004`, `R1-F00-005`, `R1-F00-007`
* `packages/api-contracts` and `packages/tooling-config` exist; root command contract wired; env validation foundation in place
* F00 Phase 1 complete (`R1-F00-006`, `R1-F00-010`) — see [tasks/F00-PHASE-1-MONGODB-TEST-SUPPORT.md](tasks/F00-PHASE-1-MONGODB-TEST-SUPPORT.md)
* `packages/test-support` (`@agrivio/test-support`) provides MongoDB/transaction test helpers
* F01 Phase 1 complete (`R1-F01-001`–`R1-F01-005`) — see [tasks/F01-PHASE-1-PLATFORM-RUNTIME.md](tasks/F01-PHASE-1-PLATFORM-RUNTIME.md)
* F01 Phase 2 complete (`R1-F01-006`–`R1-F01-011`) — see [tasks/F01-PHASE-2-TRANSACTIONAL-PLATFORM.md](tasks/F01-PHASE-2-TRANSACTIONAL-PLATFORM.md); **F01 stage exit satisfied** (unit-level)
* Architecture-boundary tests runnable via `pnpm test:architecture` (replaces F00 placeholder)
* Next work item: **F02 Phase 1 — Organization Onboarding and Authentication**

## Existing Documents

| Document | Purpose |
| --- | --- |
| [PROJECT_DECISIONS.md](PROJECT_DECISIONS.md) | Finalized product and technical decisions |
| [PRD.md](PRD.md) | Product requirements |
| [RELEASE_1_SCOPE.md](RELEASE_1_SCOPE.md) | Release 1 scope boundary |
| [BUSINESS_RULES.md](BUSINESS_RULES.md) | Release 1 formulas and operational behaviour (Frozen for Release 1, v1.0; 295 BR IDs; 20 prefixes) |
| [DOMAIN_GLOSSARY.md](DOMAIN_GLOSSARY.md) | Domain terms and definitions (Frozen for Release 1, v1.0; 86 terms) |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture overview (Frozen for Release 1, v1.0) |
| [MODULE_BOUNDARIES.md](MODULE_BOUNDARIES.md) | Canonical modules, ownership, and dependency rules (Frozen for Release 1, v1.1.0) |
| [REPOSITORY_STRUCTURE.md](REPOSITORY_STRUCTURE.md) | Target monorepo and module/feature layout (Frozen for Release 1, v1.1.0) |
| [DATA_MODEL.md](DATA_MODEL.md) | Data model, collections, indexes, transactions (Frozen for Release 1, v1.0) |
| [API_DESIGN.md](API_DESIGN.md) | API conventions and endpoint inventory (Frozen for Release 1, v1.0) |
| [SECURITY_AUTHORIZATION.md](SECURITY_AUTHORIZATION.md) | Authentication, sessions, permissions, security controls (Frozen for Release 1, v1.0) |
| [SUBSCRIPTION_AND_BILLING.md](SUBSCRIPTION_AND_BILLING.md) | Subscription lifecycle and manual billing (Frozen for Release 1, v1.0) |
| [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) | Release 1 implementation stages and work-item catalog (Frozen for Release 1, v1.1.0; 10 stages; 109 work items) |
| [DELIVERY_PLAN.md](DELIVERY_PLAN.md) | Delivery estimates, risks, pilot and rollout (Frozen for Release 1, v1.0) |
| [QUALITY_GATES.md](QUALITY_GATES.md) | Per-item, per-stage, and release quality gates (Frozen for Release 1, v1.1.0) |
| [TOOLCHAIN.md](TOOLCHAIN.md) | Exact Release 1 toolchain versions and policies (Frozen for Release 1, v1.1.0) |
| [REPOSITORY_INITIALIZATION.md](REPOSITORY_INITIALIZATION.md) | F00 initialization order and bootstrap gates (Frozen for Release 1, v1.1.0) |
| [DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md) | Local commands, branching, PR, and agent workflow (Frozen for Release 1, v1.1.0) |
| [TEST_STRATEGY.md](TEST_STRATEGY.md) | Test stack, locations, CI layers, and coverage policy (Frozen for Release 1, v1.1.0) |
| [tasks/P1-01.md](tasks/P1-01.md) | Phase 1 task: project documentation baseline |
| [tasks/P1-02.md](tasks/P1-02.md) | Phase 1 task: product requirements and Release 1 scope |
| [tasks/P1-03.md](tasks/P1-03.md) | Phase 1 task: business rules and domain glossary (complete and frozen) |
| [tasks/P1-04.md](tasks/P1-04.md) | Phase 1 task: architecture and repository structure (complete and frozen) |
| [tasks/P1-05.md](tasks/P1-05.md) | Phase 1 task: data, API, security, and subscription design (complete and frozen) |
| [tasks/P1-06.md](tasks/P1-06.md) | Phase 1 task: implementation roadmap and delivery plan (complete and frozen) |
| [tasks/P1-07.md](tasks/P1-07.md) | Phase 1 task: toolchain and repository initialization specification (complete and frozen) |
| [tasks/R1-F00-001.md](tasks/R1-F00-001.md) | F00 work item: monorepo workspace bootstrap (complete) |
| [tasks/R1-F00-002.md](tasks/R1-F00-002.md) | F00 work item: Angular frontend application scaffold (complete; historically `apps/web`) |
| [tasks/R1-F00-003.md](tasks/R1-F00-003.md) | F00 work item: Express backend scaffold (complete; historically TypeScript `apps/api`) |
| [tasks/F00-BATCH-A.md](tasks/F00-BATCH-A.md) | F00 Batch A: shared packages, root commands, env validation (`R1-F00-004`/`005`/`007`, complete) |
| [tasks/F00-APP-NAMING-BACKEND-JS-MIGRATION.md](tasks/F00-APP-NAMING-BACKEND-JS-MIGRATION.md) | F00 amendment: `apps/frontend` / `apps/backend` naming and backend JavaScript ESM migration (complete) |
| [tasks/F01-PHASE-1-PLATFORM-RUNTIME.md](tasks/F01-PHASE-1-PLATFORM-RUNTIME.md) | F01 Phase 1: platform runtime foundation |
| [tasks/F01-PHASE-2-TRANSACTIONAL-PLATFORM.md](tasks/F01-PHASE-2-TRANSACTIONAL-PLATFORM.md) | F01 Phase 2: transactional platform foundation (completes F01) |
| [../README.md](../README.md) | Repository landing page |
| [../AGENTS.md](../AGENTS.md) | Repository agent and contribution rules |

## Planned Documents

These documents are not created yet. Paths below are reserved targets for later tasks and are intentionally non-clickable.

| Document | Planned purpose |
| --- | --- |
| `FRONTEND_ARCHITECTURE.md` | Frontend architecture detail beyond the architecture baseline |
| `BACKEND_ARCHITECTURE.md` | Backend architecture detail beyond the architecture baseline |
| `FILE_STRUCTURE.md` | Legacy reserved name; prefer `REPOSITORY_STRUCTURE.md` |
| `DEFINITION_OF_DONE.md` | Definition of done |
| `PHASES.md` | Delivery phases |
| `TASK_CATALOG.md` | Task catalog |

## Source of Truth

* Finalized decisions: [PROJECT_DECISIONS.md](PROJECT_DECISIONS.md)
* Product requirements: [PRD.md](PRD.md)
* Release 1 boundary: [RELEASE_1_SCOPE.md](RELEASE_1_SCOPE.md)
* Business rules (Frozen for Release 1, v1.0): [BUSINESS_RULES.md](BUSINESS_RULES.md)
* Domain glossary (Frozen for Release 1, v1.0): [DOMAIN_GLOSSARY.md](DOMAIN_GLOSSARY.md)
* Architecture structure (Frozen for Release 1, v1.0): [ARCHITECTURE.md](ARCHITECTURE.md)
* Module boundaries (Frozen for Release 1, v1.1.0): [MODULE_BOUNDARIES.md](MODULE_BOUNDARIES.md)
* Target repository layout (Frozen for Release 1, v1.1.0): [REPOSITORY_STRUCTURE.md](REPOSITORY_STRUCTURE.md)
* Data model (Frozen for Release 1, v1.0): [DATA_MODEL.md](DATA_MODEL.md)
* API design (Frozen for Release 1, v1.0): [API_DESIGN.md](API_DESIGN.md)
* Security and authorization (Frozen for Release 1, v1.0): [SECURITY_AUTHORIZATION.md](SECURITY_AUTHORIZATION.md)
* Subscription and billing (Frozen for Release 1, v1.0): [SUBSCRIPTION_AND_BILLING.md](SUBSCRIPTION_AND_BILLING.md)
* Implementation roadmap (Frozen for Release 1, v1.1.0): [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md)
* Delivery plan (Frozen for Release 1, v1.0): [DELIVERY_PLAN.md](DELIVERY_PLAN.md)
* Quality gates (Frozen for Release 1, v1.1.0): [QUALITY_GATES.md](QUALITY_GATES.md)
* Toolchain (Frozen for Release 1, v1.1.0): [TOOLCHAIN.md](TOOLCHAIN.md)
* Repository initialization (Frozen for Release 1, v1.1.0): [REPOSITORY_INITIALIZATION.md](REPOSITORY_INITIALIZATION.md)
* Development workflow (Frozen for Release 1, v1.1.0): [DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md)
* Test strategy (Frozen for Release 1, v1.1.0): [TEST_STRATEGY.md](TEST_STRATEGY.md)
* Agent and scope rules: [../AGENTS.md](../AGENTS.md)
* Do not duplicate finalized rules across documents; link here or to the authoritative document instead.
