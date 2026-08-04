# Quality Gates

Document status: Frozen for Release 1  
Current version: 1.0  
Last updated: 2026-08-04  
Approval status: Approved for implementation preparation

## Document Authority

| Concern | Authoritative document |
| --- | --- |
| What Release 1 must provide | Frozen [PRD.md](PRD.md) |
| Release 1 boundary | Frozen [RELEASE_1_SCOPE.md](RELEASE_1_SCOPE.md) |
| Business behaviour | Frozen [BUSINESS_RULES.md](BUSINESS_RULES.md) |
| Module ownership and forbidden dependencies | Frozen [MODULE_BOUNDARIES.md](MODULE_BOUNDARIES.md) |
| System architecture | Frozen [ARCHITECTURE.md](ARCHITECTURE.md) |
| Target repository layout | Frozen [REPOSITORY_STRUCTURE.md](REPOSITORY_STRUCTURE.md) |
| Data, API, security, subscription contracts | Frozen P1-05 documents |
| Implementation sequence and work items | Frozen [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) |
| Delivery estimates, risks, and rollout | Frozen [DELIVERY_PLAN.md](DELIVERY_PLAN.md) |
| Gate definitions for implementation | This document |

This document defines quality gates for Release 1 implementation. It does not select tooling versions, create CI, or begin implementation. Exact test frameworks and CI providers remain unresolved for P1-07 or later.

---

## 1. Gate Principles

* Every work item includes tests; testing is never deferred to an end-only phase.
* Happy paths and failure paths are validated together.
* Frontend completion without backend enforcement is not done.
* Tenant isolation, permissions, and subscription controls are regression-checked continuously.
* Posted financial and stock effects must reconcile; silent overwrite and partial residue are defects.
* Frozen documents are not modified by implementation work without the documented change process.
* Quality gates reference frozen sources; they do not invent new product scope.

---

## 2. Per Work-Item Gates

A work item may merge only when all applicable gates below pass. Non-applicable gates must be explicitly marked N/A with justification (for example, pure documentation or F00 scaffolding before tenant modules exist).

| Gate ID | Gate | Required evidence |
| --- | --- | --- |
| WI-G01 | Scope check | Work matches roadmap title, owning module, and out-of-scope exclusions; no silent scope expansion |
| WI-G02 | Frozen-document traceability | Frozen sources listed on the work item are cited; behaviour matches those sources |
| WI-G03 | Type checking | Project type-check command passes for affected packages |
| WI-G04 | Linting | Lint command passes for affected packages |
| WI-G05 | Unit tests | Pure business-rule and domain-logic unit tests for new behaviour pass |
| WI-G06 | Module integration tests | Module service/repository integration tests pass against local MongoDB where persistence is involved |
| WI-G07 | Architecture-boundary tests | No forbidden module imports, controller persistence access, or circular dependencies introduced |
| WI-G08 | Tenant-scope tests | Tenant repositories and tenant APIs enforce `organizationId`; cross-tenant denial covered where applicable |
| WI-G09 | Permission tests | Protected operations enforce permission codes from [SECURITY_AUTHORIZATION.md](SECURITY_AUTHORIZATION.md) |
| WI-G10 | Subscription tests | Entitlement, suspension, grace, and creation-limit behaviour covered where the work item touches subscription-gated operations |
| WI-G11 | Transaction rollback tests | Multi-record financial or stock workflows prove atomic commit and full rollback on failure |
| WI-G12 | Idempotency tests | Idempotent mutating endpoints prove duplicate-safe behaviour where required by [API_DESIGN.md](API_DESIGN.md) |
| WI-G13 | Audit assertions | Required audit events include actor, timestamp, organization, action, and reason/approval where mandated |
| WI-G14 | Documentation update | Affected draft or non-frozen docs and indexes updated when contracts or procedures change |
| WI-G15 | Diff review | Diff limited to the work item; no unrelated refactors; no frozen-document edits |

### Work-item completion checklist

```text
[ ] WI-G01 Scope check
[ ] WI-G02 Frozen-document traceability
[ ] WI-G03 Type checking
[ ] WI-G04 Linting
[ ] WI-G05 Unit tests
[ ] WI-G06 Module integration tests
[ ] WI-G07 Architecture-boundary tests
[ ] WI-G08 Tenant-scope tests (or N/A with justification)
[ ] WI-G09 Permission tests (or N/A with justification)
[ ] WI-G10 Subscription tests (or N/A with justification)
[ ] WI-G11 Transaction rollback tests (or N/A with justification)
[ ] WI-G12 Idempotency tests (or N/A with justification)
[ ] WI-G13 Audit assertions (or N/A with justification)
[ ] WI-G14 Documentation update
[ ] WI-G15 Diff review
[ ] Definition of Done from IMPLEMENTATION_ROADMAP.md satisfied
```

---

## 3. Per Delivery-Stage Gates

A delivery stage (F00–F09) is complete only when:

| Gate ID | Gate | Required evidence |
| --- | --- | --- |
| ST-G01 | All required work-item gates pass | Every required stage work item is complete. A required work item may not be deferred while declaring the stage complete. A work item may leave the stage only through a formal frozen-scope change, a formal roadmap revision approved before stage completion, or proof that the item is not required for the stage exit gate or Release 1. A note saying “deferred” is not sufficient. Residual Medium/Low defects are not incomplete required work items. |
| ST-G02 | No forbidden dependency | Architecture-boundary suite green against [MODULE_BOUNDARIES.md](MODULE_BOUNDARIES.md) |
| ST-G03 | No unresolved Critical or High defect impacting the stage | No open Critical defects. No unresolved High defects that impact the stage’s primary workflow, reconciliation, security, tenant isolation, permissions, subscription enforcement, or posted money/stock. |
| ST-G04 | Reconciliation checks pass | Quantity, valuation, ledger, account, and sequence reconciliation required by the stage exit gate |
| ST-G05 | Security controls pass | Tenant isolation, permission, CSRF/session, and subscription controls applicable to the stage |
| ST-G06 | Relevant workflow E2E passes | Stage-critical vertical-slice E2E scenarios green |
| ST-G07 | No silent scope expansion | Diff and stage report show no Release 1 exclusions implemented |
| ST-G08 | Stage completion report exists | Report lists completed work items, residual risks, deferred items, and exit-gate evidence |

### Stage entry criteria

* Prior required stages’ exit gates are satisfied (see [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) dependency rules).
* Shared contracts required by the stage are stable enough for dependent work items.
* Environment needed by the stage (local replica set, CI, seed data) is available.

### Stage exit criteria

* Stage-specific exit gate in [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) is met.
* ST-G01 through ST-G08 pass.
* Remaining risks are recorded in [DELIVERY_PLAN.md](DELIVERY_PLAN.md) risk tracking.

---

## 4. Release Gate

Release readiness (F09 / production launch) requires all of the following:

| Gate ID | Gate | Required evidence |
| --- | --- | --- |
| REL-G01 | Production build | Production web and API builds succeed from the release candidate |
| REL-G02 | Full regression | Full automated regression suite green on the release candidate |
| REL-G03 | Tenant isolation | Cross-tenant attack and isolation suite passes |
| REL-G04 | Authorization matrix | Permission-matrix verification against [SECURITY_AUTHORIZATION.md](SECURITY_AUTHORIZATION.md) passes |
| REL-G05 | Security hardening | Genuine Critical or High security findings must be resolved. A finding may be closed as a documented false positive. An unresolved genuine Critical/High finding cannot be risk-accepted for launch. |
| REL-G06 | Performance baseline | Agreed Release 1 performance baseline scenarios measured and within accepted planning thresholds |
| REL-G07 | Accessibility baseline | Agreed accessibility baseline checks pass for critical workflows |
| REL-G08 | Backup verification | Automated backup policy verification succeeds for the target environment |
| REL-G09 | Restore rehearsal | Controlled data-recovery restore rehearsal succeeds with verification before normal operation. Restore is not used as application rollback. |
| REL-G10 | Import rehearsal | Opening-data and master-data import rehearsal succeeds with preview validation |
| REL-G11 | Data reconciliation | Pilot/opening stock, ledger, account, and valuation reconciliation reports balance |
| REL-G12 | UAT approval | Controlled UAT exit criteria met and recorded for pilot clients |
| REL-G13 | Application-rollback readiness | Documented application-rollback procedure reviewed and runnable. Application rollback must not automatically restore the database. Database restore readiness is covered by REL-G09 and the separate data-recovery procedure. |
| REL-G14 | Release notes | Release notes list included capabilities, known limitations, and operational contacts |
| REL-G15 | Operational ownership | Support ownership, monitoring ownership, and incident contacts assigned |

Exact production performance thresholds, rate limits, and hosting/backup providers remain unresolved until later approved decisions.

---

## 5. Required Test Types and Allocation

Every implementation work item must identify applicable types from this catalog. Types are included in the work item, not postponed to F09 alone.

| Test type | Purpose |
| --- | --- |
| Pure business-rule unit tests | Formulas and lifecycle rules from [BUSINESS_RULES.md](BUSINESS_RULES.md) |
| Repository integration tests | Persistence, indexes, optimistic concurrency, organization scoping |
| Transaction rollback tests | Atomic multi-collection workflows leave no partial residue |
| Concurrency tests | Concurrent stock posting, invoice numbering, and balance updates |
| Idempotency tests | Duplicate retries do not duplicate posted effects |
| Tenant-isolation tests | Cross-organization read/write denial |
| Permission tests | Deny without permission; allow with permission; role-bundle coverage |
| Subscription tests | Trial, grace, suspension, entitlements, creation limits |
| API contract tests | Envelopes, error codes, auth transport, pagination, idempotency headers |
| Angular component/form tests | Forms, validation UX, permission-aware UI hiding (non-authoritative) |
| Critical workflow E2E tests | Onboarding, setup, purchase, POS sale, return, import, report export |
| Architecture-boundary tests | Forbidden imports and modular-monolith rules |
| Reconciliation tests | Movements equal balances; ledgers equal signed effects; reports equal sources |
| Security tests | CSRF, session fixation/rotation, password reset abuse, tenant leakage probes |

### Continuous versus release-concentrated testing

| Category | When executed |
| --- | --- |
| Unit, integration, architecture, tenant, permission, subscription, transaction, idempotency, audit | Every applicable work item and stage |
| Critical workflow E2E | From the first stage that delivers the workflow; expanded each later stage |
| Full regression, security review, performance, accessibility, backup/restore/import rehearsal | Concentrated in F09 but not a substitute for earlier gates |

---

## 6. Defect Severity Policy

Use one consistent policy across Roadmap, Quality Gates, and Delivery Plan.

| Severity | Definition | Impact |
| --- | --- | --- |
| Critical | Data loss, tenant leakage, incorrect posted money/stock that cannot be safely corrected, authentication bypass, or equivalent | Blocks work-item completion where relevant; blocks stage exit; blocks pilot use; blocks release; cannot be accepted for launch |
| High | Incorrect business behaviour on primary workflows; broken reconciliation; subscription or permission bypass; security/tenant-isolation defects that are not Critical | Blocks the affected stage exit when it impacts that stage’s primary workflow, reconciliation, security, tenant isolation, permissions, subscription enforcement, or posted money/stock; always blocks production launch; cannot be accepted for production launch |
| Medium | Impaired secondary workflow with workaround | May be accepted only with documented workaround, named owner, target resolution, product and technical approval, and no impact on tenant isolation, security, reconciliation, or posted money/stock correctness |
| Low | Cosmetic or minor usability | Same acceptance constraints as Medium |

Posted financial and stock defects default to Critical or High. Silent scope expansion is treated as a process defect and must be reverted or formally approved through the scope-change process.

Stage completion requires every required work item complete and every stage exit criterion satisfied. Residual accepted Medium/Low defects are not a substitute for incomplete required work items.

---

## 7. Reconciliation Gate Detail

Where a stage posts stock or financial effects, reconciliation must prove:

* Inventory quantity balances equal signed stock movements.
* WAC valuation equals movement-derived cost state for product/warehouse.
* Customer receivable/payable and advances equal signed ledger effects.
* Supplier payable/receivable and advances equal signed ledger effects.
* Account balances equal signed account movements.
* Branch invoice sequences have no gaps caused by partial failed posts.
* Reports and alerts read the same authoritative effects (Alerts and Reporting never own conflicting balances).

---

## 8. Security Gate Detail

Security gates must cover:

* Organization isolation on every tenant-owned operation.
* Platform versus organization context separation.
* Permission codes on protected endpoints; no frontend-only authorization.
* Branch and warehouse assignment enforcement where required.
* Subscription suspension blocking operational writes per frozen subscription rules.
* CSRF on cookie-authenticated mutating requests.
* Session expiration and invalidation.
* Audit of permission-sensitive overrides and corrections.
* No secrets, password hashes, or reset tokens in application logs.

---

## 9. Gate Evidence Retention

Each completed work item and stage must retain:

* Test command outputs or CI run identifiers (once CI exists).
* List of frozen sources exercised.
* Reconciliation summaries where applicable.
* Known defects and severities.
* Reviewer acknowledgment of WI-G15 / ST-G08.

Exact CI provider and artifact storage remain unresolved for later tasks.

---

## 10. Mapping to Delivery Stages

| Stage | Emphasized gates beyond the universal set |
| --- | --- |
| F00 | Build, type-check, lint, architecture-test foundation, local replica-set transaction proof |
| F01 | Tenant repository foundation, transaction retry, idempotency, health |
| F02 | Tenant isolation, permission, subscription, CSRF/session, platform/org separation |
| F03 | Plan limits, optimistic concurrency, opening-balance reconciliation |
| F04 | Stock concurrency, transfer atomicity, valuation reconciliation, negative-stock controls |
| F05 | Purchase atomicity, supplier ledger/account reconciliation, returnable quantity |
| F06 | Sale atomicity, idempotent invoices, POS E2E, receivable/COGS/stock reconciliation |
| F07 | Reversal netting, return limits, account balance reconciliation, no generic correction endpoint |
| F08 | Report-to-source reconciliation, import all-or-nothing, suspended read/export policy |
| F09 | Full release gate REL-G01–REL-G15 |

---

## 11. Controlled Unresolved Items

Quality gates intentionally do not decide:

* Exact test frameworks
* Exact lint and formatting tools
* CI provider
* Hosting, backup, and monitoring providers
* Exact production performance thresholds
* Exact rate-limit and upload-limit values

Those remain for P1-07 or later approved decisions and must meet the decision deadlines in [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) and [DELIVERY_PLAN.md](DELIVERY_PLAN.md). A missing decision at its deadline is a blocker and must not be replaced by a silent placeholder production value.
