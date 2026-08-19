# Project Documentation Index

Central navigation for Agrivio documentation.

## Current Status

* P1-01 through P1-07 are complete
* R1-F00-001 monorepo workspace bootstrap is complete
* All four P1-07 toolchain documents are frozen at version 1.4.0 (application naming, backend JavaScript, CommonJS, plain-JS coding-style, and npm workspace amendments)
* R1-F00-002 Angular frontend application scaffold is complete (historically `apps/web`)
* R1-F00-003 Express backend scaffold is complete (historically `apps/api`; now JavaScript CommonJS under `apps/backend`)
* F00 application naming and backend JavaScript migration complete — see [tasks/F00-APP-NAMING-BACKEND-JS-MIGRATION.md](tasks/F00-APP-NAMING-BACKEND-JS-MIGRATION.md)
* Backend CommonJS simplification migration complete — see [tasks/BACKEND-COMMONJS-MIGRATION.md](tasks/BACKEND-COMMONJS-MIGRATION.md)
* Backend plain-JavaScript coding-style cleanup complete (no `// @ts-check` / JSDoc typing; `checkJs` disabled) — see [tasks/BACKEND-COMMONJS-MIGRATION.md](tasks/BACKEND-COMMONJS-MIGRATION.md) final amendment
* npm workspace migration complete (pnpm removed; npm `11.16.0` + workspaces; Nx retained) — see [tasks/NPM-WORKSPACE-MIGRATION.md](tasks/NPM-WORKSPACE-MIGRATION.md)
* F00 CI foundation workflows restored under `.github/workflows/` (quality, integration, E2E smoke; npm `ci`)
* F00 Batch A complete: `R1-F00-004`, `R1-F00-005`, `R1-F00-007`
* `packages/api-contracts` and `packages/tooling-config` exist; root command contract wired; env validation foundation in place
* F00 Phase 1 complete (`R1-F00-006`, `R1-F00-010`) — see [tasks/F00-PHASE-1-MONGODB-TEST-SUPPORT.md](tasks/F00-PHASE-1-MONGODB-TEST-SUPPORT.md)
* `packages/test-support` (`@agrivio/test-support`) provides MongoDB/transaction test helpers
* F01 Phase 1 complete (`R1-F01-001`–`R1-F01-005`) — see [tasks/F01-PHASE-1-PLATFORM-RUNTIME.md](tasks/F01-PHASE-1-PLATFORM-RUNTIME.md)
* F01 Phase 2 complete (`R1-F01-006`–`R1-F01-011`) — see [tasks/F01-PHASE-2-TRANSACTIONAL-PLATFORM.md](tasks/F01-PHASE-2-TRANSACTIONAL-PLATFORM.md); **F01 stage exit satisfied** (unit-level)
* Architecture-boundary tests runnable via `npm run test:architecture` (replaces F00 placeholder)
* F02 Phase 1 complete (`R1-F02-005`, `R1-F02-006`) — see [tasks/F02-PHASE-1-ORGANIZATION-ONBOARDING.md](tasks/F02-PHASE-1-ORGANIZATION-ONBOARDING.md)
* F02 Phase 2 complete (`R1-F02-003`, `R1-F02-004`) — see [tasks/F02-PHASE-2-SESSION-AUTHENTICATION.md](tasks/F02-PHASE-2-SESSION-AUTHENTICATION.md)
* F02 Phase 3 complete (`R1-F02-007`, `R1-F02-008`) — see [tasks/F02-PHASE-3-CONTEXT-PERMISSIONS.md](tasks/F02-PHASE-3-CONTEXT-PERMISSIONS.md)
* F02 Phase 4 complete (`R1-F02-001`, `R1-F02-002`, `R1-F02-009`) — see [tasks/F02-PHASE-4-ACCESS-ASSIGNMENTS.md](tasks/F02-PHASE-4-ACCESS-ASSIGNMENTS.md)
* F02 Phase 5 complete (`R1-F02-010`, `R1-F02-011`, `R1-F02-012`) — see [tasks/F02-PHASE-5-SUBSCRIPTIONS-BILLING.md](tasks/F02-PHASE-5-SUBSCRIPTIONS-BILLING.md)
* F02 Phase 6 implementation complete (`R1-F02-013`, `R1-F02-014`) — see [tasks/F02-PHASE-6-STAGE-CLOSURE.md](tasks/F02-PHASE-6-STAGE-CLOSURE.md); **F02 implementation complete — stage verification pending** (CI/Docker evidence outstanding)
* F02 UI/UX hardening complete — see [tasks/F02-UI-UX-HARDENING.md](tasks/F02-UI-UX-HARDENING.md); **13** user-facing F02 pages/views polished; local `.env.local` auto-load for backend startup
* Local runtime finalization (pre-F03) complete — see [tasks/LOCAL-RUNTIME-BEFORE-F03.md](tasks/LOCAL-RUNTIME-BEFORE-F03.md); native/Docker `rs0`, startup diagnostics, Angular CLI serve workspace file
* F02 Owner activation handoff fix complete — see [tasks/F02-OWNER-ACTIVATION-HANDOFF.md](tasks/F02-OWNER-ACTIVATION-HANDOFF.md); approve/reissue absolute activation URL + copy UI
* Pre-F03 architecture cleanup + Super Admin bootstrap complete — see [tasks/PRE-F03-SOURCE-LAYOUT-AND-SUPER-ADMIN-BOOTSTRAP.md](tasks/PRE-F03-SOURCE-LAYOUT-AND-SUPER-ADMIN-BOOTSTRAP.md); Angular cohesive page folders, shallow backend module layout, `npm run bootstrap:super-admin`
* F03 Phase 1 complete (`R1-F03-001`–`R1-F03-004`) — see [tasks/F03-PHASE-1-ORG-SETUP.md](tasks/F03-PHASE-1-ORG-SETUP.md); organization settings, branches, warehouses, employees/access
* Pre-F03 P2 implemented-model audit complete — see [tasks/PRE-F03-P2-IMPLEMENTED-MODEL-AUDIT.md](tasks/PRE-F03-P2-IMPLEMENTED-MODEL-AUDIT.md) and [MODEL_REVIEW_CHECKLIST.md](MODEL_REVIEW_CHECKLIST.md)
* F03 Phase 2 complete (`R1-F03-005`–`R1-F03-010`) — see [tasks/F03-PHASE-2-MASTER-DATA.md](tasks/F03-PHASE-2-MASTER-DATA.md); categories/products/units/pricing, customers/credit policy, suppliers, accounts master data
* F03 Phase 3 complete (`R1-F03-011`–`R1-F03-013`) — see [tasks/F03-PHASE-3-OPENINGS-SETUP.md](tasks/F03-PHASE-3-OPENINGS-SETUP.md); opening balances / signed ledger+account foundations, centralized plan limits, guided organization setup
* F04 Phase 1 complete (`R1-F04-001`–`R1-F04-004`) — see [tasks/F04-PHASE-1-INVENTORY-ENGINE.md](tasks/F04-PHASE-1-INVENTORY-ENGINE.md); product batches, opening stock, movements/balances, WAC
* F04 Phase 2 complete (`R1-F04-005`–`R1-F04-008`) — see [tasks/F04-PHASE-2-INVENTORY-ALLOCATION-ADJUSTMENTS.md](tasks/F04-PHASE-2-INVENTORY-ALLOCATION-ADJUSTMENTS.md); FEFO/FIFO, expiry inquiry, negative-stock enforcement, adjustments/reversals
* F04 Phase 3 complete (`R1-F04-009`–`R1-F04-012`) — see [tasks/F04-PHASE-3-INVENTORY-TRANSFERS-RECONCILIATION.md](tasks/F04-PHASE-3-INVENTORY-TRANSFERS-RECONCILIATION.md); warehouse transfers/reversals, reconciliation, inventory Angular workflows, shared Inventory/Payments/Accounts/Audit contracts; **F04 stage exit ready pending acceptance**
* F05 Phase 1 complete (`R1-F05-001`–`R1-F05-003`) — see [tasks/F05-PHASE-1-PURCHASES-FOUNDATION.md](tasks/F05-PHASE-1-PURCHASES-FOUNDATION.md); supplier payment/ledger foundation, account movement reuse, purchase drafts only (no posting)
* F05 Phase 2 complete (`R1-F05-004`–`R1-F05-006`) — see [tasks/F05-PHASE-2-PURCHASE-POSTING.md](tasks/F05-PHASE-2-PURCHASE-POSTING.md); atomic purchase posting, landed-cost WAC, full/partial/mixed purchase payments
* F05 Phase 3 complete (`R1-F05-007`–`R1-F05-010`) — see [tasks/F05-PHASE-3-SUPPLIER-PAYMENTS-CANCEL-RETURNS.md](tasks/F05-PHASE-3-SUPPLIER-PAYMENTS-CANCEL-RETURNS.md); standalone supplier payments/advances, purchase cancellation, purchase returns, supplier ledger reconciliation, Purchases Angular completion; **F05 stage exit ready pending acceptance**
* F06 Phase 1 complete (`R1-F06-001`–`R1-F06-003`) — see [tasks/F06-PHASE-1-SALES-FOUNDATION.md](tasks/F06-PHASE-1-SALES-FOUNDATION.md); customer payment/ledger foundation, sale drafts, invoice numbering
* F06 Phase 2 complete (`R1-F06-004`–`R1-F06-006`) — see [tasks/F06-PHASE-2-SALE-POSTING.md](tasks/F06-PHASE-2-SALE-POSTING.md); sale posting, tier pricing, cash/credit/partial/mixed payments
* F06 Phase 3 complete (`R1-F06-007`–`R1-F06-009`) — see [tasks/F06-PHASE-3-SALE-APPROVALS-CANCEL.md](tasks/F06-PHASE-3-SALE-APPROVALS-CANCEL.md); sale approvals, walk-in/customer handling, sale cancellation
* F06 Phase 4 complete (`R1-F06-010`, `R1-F06-011`) — see [tasks/F06-PHASE-4-PRINTING-POS.md](tasks/F06-PHASE-4-PRINTING-POS.md); printing (58mm/80mm/A4) and cashier POS E2E; **F06 stage exit ready pending acceptance**
* F07 Phase 1 complete (`R1-F07-001`–`R1-F07-003`) — see [tasks/F07-PHASE-1-SALES-RETURNS.md](tasks/F07-PHASE-1-SALES-RETURNS.md); linked sales returns, return-without-invoice approval, sellable/unsellable + refund/ledger resolution
* F07 Phase 2 complete (`R1-F07-004`, `R1-F07-005`) — see [tasks/F07-PHASE-2-RETURN-REVERSAL.md](tasks/F07-PHASE-2-RETURN-REVERSAL.md); linked return reversal, shared correction validation, purchase-return integration
* F07 Phase 3 complete (`R1-F07-006`–`R1-F07-008`) — see [tasks/F07-PHASE-3-ACCOUNT-TRANSACTIONS-EXPENSES.md](tasks/F07-PHASE-3-ACCOUNT-TRANSACTIONS-EXPENSES.md); manual account inflow/outflow/transfer, account reversal, expenses/expense correction
* F07 Phase 4 complete (`R1-F07-009`) — see [tasks/F07-PHASE-4-ACCOUNTS-EXPENSES-RETURNS-SLICE.md](tasks/F07-PHASE-4-ACCOUNTS-EXPENSES-RETURNS-SLICE.md); returns/accounts/expenses Angular vertical slice, stage-exit reconciliation and E2E; **F07 stage exit ready pending acceptance**
* F08 Phase 1 complete (`R1-F08-001`–`R1-F08-003`) — see [tasks/F08-PHASE-1-ALERTS-DASHBOARD.md](tasks/F08-PHASE-1-ALERTS-DASHBOARD.md); inventory/dues alerts and operational dashboard
* F08 Phase 2 complete (`R1-F08-004`, `R1-F08-005`) — see [tasks/F08-PHASE-2-FIXED-REPORTS-EXPORTS.md](tasks/F08-PHASE-2-FIXED-REPORTS-EXPORTS.md); fixed reports and PDF/Excel/CSV exports
* F08 Phase 3 complete (`R1-F08-006`) — see [tasks/F08-PHASE-3-EXCEL-IMPORTS.md](tasks/F08-PHASE-3-EXCEL-IMPORTS.md); Excel import preview and all-or-nothing execution
* F08 Phase 4 complete (`R1-F08-007`–`R1-F08-009`) — see [tasks/F08-PHASE-4-AUDIT-BACKUP-SUSPENDED.md](tasks/F08-PHASE-4-AUDIT-BACKUP-SUSPENDED.md); audit inquiry, backup/restore status, suspended report/import policy
* F08 Phase 5 complete (`R1-F08-010`) — see [tasks/F08-PHASE-5-ALERTS-REPORTING-IMPORTS-SLICE.md](tasks/F08-PHASE-5-ALERTS-REPORTING-IMPORTS-SLICE.md); alerts/reports/imports/audit/ops vertical slice and E2E; **F08 stage exit ready pending acceptance**
* F09 Phase 1 complete (`R1-F09-001`) — see [tasks/F09-PHASE-1-REGRESSION-CONSOLIDATION.md](tasks/F09-PHASE-1-REGRESSION-CONSOLIDATION.md); canonical `npm run test:regression:release`
* F09 Phase 2 **complete for R1-F09-002–004**: REL-G03/G04/G05 evidence in-item; REL-G06 measured within accepted non-SLA thresholds; REL-G07 pass for NFR-A11Y-001–006 (not full WCAG product conformance). Do not start later F09 IDs from this record — see [tasks/F09-PHASE-2-SECURITY-PERF-A11Y.md](tasks/F09-PHASE-2-SECURITY-PERF-A11Y.md)
* F09 Phase 3 complete for local technical rehearsal (`R1-F09-005`): REL-G08/G09 proven with host `mongodump`/`mongorestore`; REL-G10 passed; production vendor backup verification pending — see [tasks/F09-PHASE-3-BACKUP-RESTORE-IMPORT.md](tasks/F09-PHASE-3-BACKUP-RESTORE-IMPORT.md)
* F09 Phase 4 **not accepted** (`R1-F09-006`–`007`) — automated orgs are not real pilot UAT; see [tasks/F09-PHASE-4-PILOT-UAT.md](tasks/F09-PHASE-4-PILOT-UAT.md)
* F09 Phase 5 **not accepted** (`R1-F09-008`–`009`) — procedure drafts; named owners and production launch outstanding; see [tasks/F09-PHASE-5-PRODUCTION-LAUNCH.md](tasks/F09-PHASE-5-PRODUCTION-LAUNCH.md)
* Project-wide server-side pagination complete — see [tasks/PROJECT-WIDE-SERVER-SIDE-PAGINATION.md](tasks/PROJECT-WIDE-SERVER-SIDE-PAGINATION.md); shared contract/parser/paginator, scoped stable queries, bounded/searchable selectors, and paginated list screens
* Organization Capability & UI Policy Phase 1 implementation complete for the generic foundation and Products reference module only — see [tasks/ORGANIZATION-CAPABILITY-PHASE-1.md](tasks/ORGANIZATION-CAPABILITY-PHASE-1.md)
* Next work item: `R1-F09-005` local technical rehearsal is complete. Do not start `R1-F09-006` until assigned. Production target/vendor backup verification remains pending.

## Existing Documents

| Document | Purpose |
| --- | --- |
| [PROJECT_DECISIONS.md](PROJECT_DECISIONS.md) | Finalized product and technical decisions |
| [PRD.md](PRD.md) | Product requirements |
| [RELEASE_1_SCOPE.md](RELEASE_1_SCOPE.md) | Release 1 scope boundary |
| [BUSINESS_RULES.md](BUSINESS_RULES.md) | Release 1 formulas and operational behaviour (Frozen for Release 1, v1.0; 295 BR IDs; 20 prefixes) |
| [DOMAIN_GLOSSARY.md](DOMAIN_GLOSSARY.md) | Domain terms and definitions (Frozen for Release 1, v1.0; 86 terms) |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture overview (Frozen for Release 1, v1.0) |
| [MODULE_BOUNDARIES.md](MODULE_BOUNDARIES.md) | Canonical modules, ownership, and dependency rules (Frozen for Release 1, v1.2.0) |
| [REPOSITORY_STRUCTURE.md](REPOSITORY_STRUCTURE.md) | Target monorepo and module/feature layout (Frozen for Release 1, v1.2.0) |
| [DATA_MODEL.md](DATA_MODEL.md) | Data model, collections, indexes, transactions (Frozen for Release 1, v1.0) |
| [MODEL_REVIEW_CHECKLIST.md](MODEL_REVIEW_CHECKLIST.md) | Mandatory completeness checklist for every new/changed persisted model (F03 P2+) |
| [API_DESIGN.md](API_DESIGN.md) | API conventions and endpoint inventory (Frozen for Release 1, v1.0) |
| [SECURITY_AUTHORIZATION.md](SECURITY_AUTHORIZATION.md) | Authentication, sessions, permissions, security controls (Frozen for Release 1, v1.0) |
| [ENV.md](ENV.md) | Runtime environment variables (required / optional / production-only) |
| [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) | Release 1 implementation stages and work-item catalog (Frozen for Release 1, v1.2.0; 10 stages; 109 work items) |
| [DELIVERY_PLAN.md](DELIVERY_PLAN.md) | Delivery estimates, risks, pilot and rollout (Frozen for Release 1, v1.0) |
| [QUALITY_GATES.md](QUALITY_GATES.md) | Per-item, per-stage, and release quality gates (Frozen for Release 1, v1.4.0) |
| [TOOLCHAIN.md](TOOLCHAIN.md) | Exact Release 1 toolchain versions and policies (Frozen for Release 1, v1.4.0) |
| [REPOSITORY_INITIALIZATION.md](REPOSITORY_INITIALIZATION.md) | F00 initialization order and bootstrap gates (Frozen for Release 1, v1.4.0) |
| [DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md) | Local commands, branching, PR, and agent workflow (Frozen for Release 1, v1.4.0) |
| [TEST_STRATEGY.md](TEST_STRATEGY.md) | Test stack, locations, CI layers, and coverage policy (Frozen for Release 1, v1.4.0) |
| [tasks/PROJECT-WIDE-SERVER-SIDE-PAGINATION.md](tasks/PROJECT-WIDE-SERVER-SIDE-PAGINATION.md) | Project-wide server-side pagination implementation record (complete) |
| [tasks/ORGANIZATION-CAPABILITY-PHASE-1.md](tasks/ORGANIZATION-CAPABILITY-PHASE-1.md) | Organization Capability & UI Policy generic foundation plus Products reference integration (complete) |
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
| [tasks/F00-APP-NAMING-BACKEND-JS-MIGRATION.md](tasks/F00-APP-NAMING-BACKEND-JS-MIGRATION.md) | F00 amendment: `apps/frontend` / `apps/backend` naming and backend JavaScript ESM migration (complete; superseded for module format by CommonJS migration) |
| [tasks/BACKEND-COMMONJS-MIGRATION.md](tasks/BACKEND-COMMONJS-MIGRATION.md) | Backend coding-style migration: JavaScript ESM → CommonJS (complete) |
| [tasks/NPM-WORKSPACE-MIGRATION.md](tasks/NPM-WORKSPACE-MIGRATION.md) | Tooling migration: pnpm → npm workspaces; simplified app startup (complete) |
| [tasks/F02-PHASE-1-ORGANIZATION-ONBOARDING.md](tasks/F02-PHASE-1-ORGANIZATION-ONBOARDING.md) | F02 Phase 1: organization onboarding and Owner activation (complete; CommonJS) |
| [tasks/F02-PHASE-5-SUBSCRIPTIONS-BILLING.md](tasks/F02-PHASE-5-SUBSCRIPTIONS-BILLING.md) | F02 Phase 5: plans, subscription lifecycle, and manual billing |
| [tasks/F02-PHASE-6-STAGE-CLOSURE.md](tasks/F02-PHASE-6-STAGE-CLOSURE.md) | F02 Phase 6: onboarding E2E, tenant isolation, stage closure (implementation complete — verification pending) |
| [tasks/F02-UI-UX-HARDENING.md](tasks/F02-UI-UX-HARDENING.md) | F02 final UI/UX hardening: visual system, routing, local env startup, frontend quality |
| [tasks/LOCAL-RUNTIME-BEFORE-F03.md](tasks/LOCAL-RUNTIME-BEFORE-F03.md) | Pre-F03 local runtime: native/Docker Mongo `rs0`, backend diagnostics, serve paths |
| [tasks/F02-OWNER-ACTIVATION-HANDOFF.md](tasks/F02-OWNER-ACTIVATION-HANDOFF.md) | F02 Owner activation approve/reissue handoff URL and UI |
| [tasks/PRE-F03-SOURCE-LAYOUT-AND-SUPER-ADMIN-BOOTSTRAP.md](tasks/PRE-F03-SOURCE-LAYOUT-AND-SUPER-ADMIN-BOOTSTRAP.md) | Pre-F03 source-layout conventions + operational Super Admin bootstrap CLI |
| [tasks/F03-PHASE-1-ORG-SETUP.md](tasks/F03-PHASE-1-ORG-SETUP.md) | F03 Phase 1: organization settings, branches, warehouses, employees/access (`R1-F03-001`–`004`) |
| [tasks/PRE-F03-P2-IMPLEMENTED-MODEL-AUDIT.md](tasks/PRE-F03-P2-IMPLEMENTED-MODEL-AUDIT.md) | Pre-F03 P2 implemented-model completeness/ownership/utilization audit |
| [tasks/F03-PHASE-2-MASTER-DATA.md](tasks/F03-PHASE-2-MASTER-DATA.md) | F03 Phase 2: catalog/pricing, customers/credit, suppliers, accounts master (`R1-F03-005`–`010`) |
| [tasks/F03-PHASE-3-OPENINGS-SETUP.md](tasks/F03-PHASE-3-OPENINGS-SETUP.md) | F03 Phase 3: openings / signed ledger+account foundations, plan limits, guided setup (`R1-F03-011`–`013`) |
| [tasks/F04-PHASE-1-INVENTORY-ENGINE.md](tasks/F04-PHASE-1-INVENTORY-ENGINE.md) | F04 Phase 1: batches, opening stock, movements/balances, WAC (`R1-F04-001`–`004`) |
| [tasks/F04-PHASE-2-INVENTORY-ALLOCATION-ADJUSTMENTS.md](tasks/F04-PHASE-2-INVENTORY-ALLOCATION-ADJUSTMENTS.md) | F04 Phase 2: FEFO/FIFO, expiry, negative stock, adjustments (`R1-F04-005`–`008`) |
| [tasks/F04-PHASE-3-INVENTORY-TRANSFERS-RECONCILIATION.md](tasks/F04-PHASE-3-INVENTORY-TRANSFERS-RECONCILIATION.md) | F04 Phase 3: transfers, reconciliation, Angular workflows, shared contracts (`R1-F04-009`–`012`) |
| [tasks/F05-PHASE-1-PURCHASES-FOUNDATION.md](tasks/F05-PHASE-1-PURCHASES-FOUNDATION.md) | F05 Phase 1: supplier payments foundation, account movements, purchase drafts (`R1-F05-001`–`003`) |
| [tasks/F05-PHASE-2-PURCHASE-POSTING.md](tasks/F05-PHASE-2-PURCHASE-POSTING.md) | F05 Phase 2: purchase posting, landed-cost WAC, full/partial/mixed payments (`R1-F05-004`–`006`) |
| [tasks/F05-PHASE-3-SUPPLIER-PAYMENTS-CANCEL-RETURNS.md](tasks/F05-PHASE-3-SUPPLIER-PAYMENTS-CANCEL-RETURNS.md) | F05 Phase 3: standalone supplier payments, cancellation, returns, reconciliation (`R1-F05-007`–`010`) |
| [tasks/F06-PHASE-1-SALES-FOUNDATION.md](tasks/F06-PHASE-1-SALES-FOUNDATION.md) | F06 Phase 1: customer payments foundation, sale drafts, invoice numbering (`R1-F06-001`–`003`) |
| [tasks/F06-PHASE-2-SALE-POSTING.md](tasks/F06-PHASE-2-SALE-POSTING.md) | F06 Phase 2: sale posting, tier pricing, payments (`R1-F06-004`–`006`) |
| [tasks/F06-PHASE-3-SALE-APPROVALS-CANCEL.md](tasks/F06-PHASE-3-SALE-APPROVALS-CANCEL.md) | F06 Phase 3: approvals, walk-in/customer, sale cancellation (`R1-F06-007`–`009`) |
| [tasks/F06-PHASE-4-PRINTING-POS.md](tasks/F06-PHASE-4-PRINTING-POS.md) | F06 Phase 4: printing 58mm/80mm/A4 and POS cashier E2E (`R1-F06-010`/`011`) |
| [tasks/F07-PHASE-1-SALES-RETURNS.md](tasks/F07-PHASE-1-SALES-RETURNS.md) | F07 Phase 1: linked sales returns, without-invoice approval, sellable/unsellable + refund/ledger (`R1-F07-001`–`003`) |
| [tasks/F07-PHASE-2-RETURN-REVERSAL.md](tasks/F07-PHASE-2-RETURN-REVERSAL.md) | F07 Phase 2: return reversal and purchase-return integration (`R1-F07-004`, `R1-F07-005`) |
| [tasks/F07-PHASE-3-ACCOUNT-TRANSACTIONS-EXPENSES.md](tasks/F07-PHASE-3-ACCOUNT-TRANSACTIONS-EXPENSES.md) | F07 Phase 3: manual account transactions, reversals, expenses (`R1-F07-006`–`R1-F07-008`) |
| [tasks/F07-PHASE-4-ACCOUNTS-EXPENSES-RETURNS-SLICE.md](tasks/F07-PHASE-4-ACCOUNTS-EXPENSES-RETURNS-SLICE.md) | F07 Phase 4: accounts/expenses/returns Angular vertical slice and stage-exit E2E (`R1-F07-009`) |
| [tasks/F08-PHASE-1-ALERTS-DASHBOARD.md](tasks/F08-PHASE-1-ALERTS-DASHBOARD.md) | F08 Phase 1: inventory/dues alerts and operational dashboard (`R1-F08-001`–`003`) |
| [tasks/F08-PHASE-2-FIXED-REPORTS-EXPORTS.md](tasks/F08-PHASE-2-FIXED-REPORTS-EXPORTS.md) | F08 Phase 2: fixed reports and PDF/Excel/CSV exports (`R1-F08-004`, `R1-F08-005`) |
| [tasks/F08-PHASE-3-EXCEL-IMPORTS.md](tasks/F08-PHASE-3-EXCEL-IMPORTS.md) | F08 Phase 3: Excel import preview and execution (`R1-F08-006`) |
| [tasks/F08-PHASE-4-AUDIT-BACKUP-SUSPENDED.md](tasks/F08-PHASE-4-AUDIT-BACKUP-SUSPENDED.md) | F08 Phase 4: audit views, backup/restore status, suspended policy (`R1-F08-007`–`009`) |
| [tasks/F08-PHASE-5-ALERTS-REPORTING-IMPORTS-SLICE.md](tasks/F08-PHASE-5-ALERTS-REPORTING-IMPORTS-SLICE.md) | F08 Phase 5: alerts/reporting/imports/audit/ops Angular vertical slice (`R1-F08-010`) |
| [tasks/F09-PHASE-1-REGRESSION-CONSOLIDATION.md](tasks/F09-PHASE-1-REGRESSION-CONSOLIDATION.md) | F09 Phase 1: full regression suite consolidation (`R1-F09-001`, complete) |
| [tasks/F09-PHASE-2-SECURITY-PERF-A11Y.md](tasks/F09-PHASE-2-SECURITY-PERF-A11Y.md) | F09 Phase 2: `R1-F09-002`/`003`/`004` complete; REL-G06/G07 evidenced (non-SLA perf; WCAG 2.2 AA contrast criteria only) |
| [tasks/F09-PHASE-3-BACKUP-RESTORE-IMPORT.md](tasks/F09-PHASE-3-BACKUP-RESTORE-IMPORT.md) | F09 Phase 3: local REL-G08/G09/G10 passed (`R1-F09-005`); production vendor pending |
| [ops/BACKUP_RESTORE_REHEARSAL.md](ops/BACKUP_RESTORE_REHEARSAL.md) | Path-generic local mongodump/mongorestore/import rehearsal runbook |
| [tasks/F09-PHASE-4-PILOT-UAT.md](tasks/F09-PHASE-4-PILOT-UAT.md) | F09 Phase 4: automated demo-org rehearsal — Frozen DoD not accepted (`R1-F09-006`–`007`) |
| [tasks/F09-PHASE-5-PRODUCTION-LAUNCH.md](tasks/F09-PHASE-5-PRODUCTION-LAUNCH.md) | F09 Phase 5: procedure drafts — Frozen DoD not accepted (`R1-F09-008`–`009`) |
| [ops/RELEASE_NOTES.md](ops/RELEASE_NOTES.md) | Preparatory Release 1 notes draft (pending named operational contacts) |
| [ops/APPLICATION_ROLLBACK.md](ops/APPLICATION_ROLLBACK.md) | Preparatory application-rollback draft (no automatic database restore) |
| [ops/DATA_RECOVERY.md](ops/DATA_RECOVERY.md) | Preparatory data-recovery draft (distinct from application rollback) |
| [ops/CONTROLLED_LAUNCH.md](ops/CONTROLLED_LAUNCH.md) | Preparatory controlled-launch draft (production launch not executed) |
| [ops/UAT-DEFECT-LOG.md](ops/UAT-DEFECT-LOG.md) | Preparatory automated-rehearsal defect log (not real client UAT) |
| [ops/F09-RELEASE-GATE-EVIDENCE.md](ops/F09-RELEASE-GATE-EVIDENCE.md) | REL-G01–REL-G15 evidence map; only REL-G01/G02 are in R1-F09-001 scope |
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
* Module boundaries (Frozen for Release 1, v1.2.0): [MODULE_BOUNDARIES.md](MODULE_BOUNDARIES.md)
* Target repository layout (Frozen for Release 1, v1.2.0): [REPOSITORY_STRUCTURE.md](REPOSITORY_STRUCTURE.md)
* Data model (Frozen for Release 1, v1.0): [DATA_MODEL.md](DATA_MODEL.md)
* Model review checklist for new/changed persistence (active): [MODEL_REVIEW_CHECKLIST.md](MODEL_REVIEW_CHECKLIST.md)
* API design (Frozen for Release 1, v1.0): [API_DESIGN.md](API_DESIGN.md)
* Security and authorization (Frozen for Release 1, v1.0): [SECURITY_AUTHORIZATION.md](SECURITY_AUTHORIZATION.md)
* Subscription and billing (Frozen for Release 1, v1.0): [SUBSCRIPTION_AND_BILLING.md](SUBSCRIPTION_AND_BILLING.md)
* Implementation roadmap (Frozen for Release 1, v1.2.0): [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md)
* Delivery plan (Frozen for Release 1, v1.0): [DELIVERY_PLAN.md](DELIVERY_PLAN.md)
* Quality gates (Frozen for Release 1, v1.4.0): [QUALITY_GATES.md](QUALITY_GATES.md)
* Toolchain (Frozen for Release 1, v1.4.0): [TOOLCHAIN.md](TOOLCHAIN.md)
* Repository initialization (Frozen for Release 1, v1.4.0): [REPOSITORY_INITIALIZATION.md](REPOSITORY_INITIALIZATION.md)
* Development workflow (Frozen for Release 1, v1.4.0): [DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md)
* Test strategy (Frozen for Release 1, v1.4.0): [TEST_STRATEGY.md](TEST_STRATEGY.md)
* Agent and scope rules: [../AGENTS.md](../AGENTS.md)
* Do not duplicate finalized rules across documents; link here or to the authoritative document instead.
