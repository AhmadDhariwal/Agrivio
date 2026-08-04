# Agrivio

> Working product name pending domain and trademark verification.

Agrivio is a cloud-first Fertilizer POS and Inventory Management web application for fertilizer retailers, seed stores, pesticide and chemical dealers, agricultural-input wholesalers, and dealers and distributors. The first release will initially serve two clients and must support additional organizations later.

## Current Status

Current task: P1-06 complete  
Status: Implementation roadmap, delivery plan, and quality gates approved and frozen  
Next task: P1-07 — Toolchain and Repository Initialization Specification

P1-01 through P1-06 are complete.  
All three P1-06 planning documents are frozen at version 1.0.  
Application implementation has not started.  
No application folders or packages have been initialized.

## Current Phase

Phase 1 — Requirements and Architecture Documentation

## Technology Stack

| Layer | Choice |
| --- | --- |
| Frontend | Angular and TypeScript |
| Backend | Node.js, Express and TypeScript |
| Database | MongoDB with Mongoose |
| Repository | Monorepo |
| Architecture | Modular monolith |
| API | REST |
| Styling | SCSS with a centralized design system |

## Documentation

Start at [`docs/PROJECT_INDEX.md`](docs/PROJECT_INDEX.md).

Authoritative finalized decisions are recorded in [`docs/PROJECT_DECISIONS.md`](docs/PROJECT_DECISIONS.md).

Frozen business rules and glossary:

* [`docs/BUSINESS_RULES.md`](docs/BUSINESS_RULES.md) — version 1.0
* [`docs/DOMAIN_GLOSSARY.md`](docs/DOMAIN_GLOSSARY.md) — version 1.0

Frozen architecture documents (P1-04, version 1.0):

* [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
* [`docs/MODULE_BOUNDARIES.md`](docs/MODULE_BOUNDARIES.md)
* [`docs/REPOSITORY_STRUCTURE.md`](docs/REPOSITORY_STRUCTURE.md)

Frozen technical-design documents (P1-05, version 1.0):

* [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md)
* [`docs/API_DESIGN.md`](docs/API_DESIGN.md)
* [`docs/SECURITY_AUTHORIZATION.md`](docs/SECURITY_AUTHORIZATION.md)
* [`docs/SUBSCRIPTION_AND_BILLING.md`](docs/SUBSCRIPTION_AND_BILLING.md)

Frozen implementation planning documents (P1-06, version 1.0):

* [`docs/IMPLEMENTATION_ROADMAP.md`](docs/IMPLEMENTATION_ROADMAP.md)
* [`docs/DELIVERY_PLAN.md`](docs/DELIVERY_PLAN.md)
* [`docs/QUALITY_GATES.md`](docs/QUALITY_GATES.md)

## Contribution Guidance

1. Read `AGENTS.md` before making changes.
2. Implement only the assigned task.
3. Do not change finalized product decisions.
4. Do not initialize frameworks, install packages, or create source-code folders until a later task explicitly requires it.
5. Prefer linking to authoritative documents over duplicating rules.
