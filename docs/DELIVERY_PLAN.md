# Delivery Plan

Document status: Frozen for Release 1  
Current version: 1.0  
Last updated: 2026-08-04  
Approval status: Approved for implementation preparation

## Document Authority

| Concern | Authoritative document |
| --- | --- |
| What Release 1 must provide | Frozen [PRD.md](PRD.md) |
| Release 1 boundary | Frozen [RELEASE_1_SCOPE.md](RELEASE_1_SCOPE.md) |
| Finalized decisions | [PROJECT_DECISIONS.md](PROJECT_DECISIONS.md) |
| Implementation sequence and work items | Frozen [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) |
| Quality gates | Frozen [QUALITY_GATES.md](QUALITY_GATES.md) |
| Delivery estimates, risks, and rollout | This document |

This document plans Release 1 delivery. It does not begin implementation, select tooling versions, or create application code.

---

## 1. Delivery Assumptions

```text
One primary full-time engineer using AI assistance,
with part-time product review and pilot-client feedback.
```

Additional assumptions:

* Frozen P1-02 through P1-05 documents remain authoritative and unchanged without the scope-change process.
* Implementation follows the ten-stage sequence in [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md).
* Vertical slices include data, backend workflow, authorization, API, frontend, audit, and tests.
* F05 and F06 may begin independently after `R1-F03-011` and `R1-F04-012` are complete; F06 must not require supplier-specific F05 foundations. Interleaving does not reduce one-engineer effort.
* Exact calendar dates are not promised.
* Exact commercial prices, plan numeric limits, hosting, CI, and monitoring providers remain unresolved.
* No automated email, SMS, or WhatsApp workflows are included.

---

## 2. Stage Effort Ranges

Effort is planning range in engineer-weeks for the primary engineer. Ranges include implementation, tests required by each work item, and stage exit evidence. They exclude prolonged pilot-client scheduling delays outside engineering control.

| Stage | Estimated effort range | Main uncertainty | Parallelization opportunity | Required review gate |
| --- | --- | --- | --- | --- |
| F00 — Toolchain and Repository Bootstrap | 1.5–3 weeks | Toolchain and monorepo orchestration choices (P1-07) | Limited; mostly sequential bootstrap | Empty apps build/test; replica-set transactions; architecture checks runnable |
| F01 — Platform Foundation | 2–3.5 weeks | Transaction retry and tenant-repository enforcement design fit | Logging/config parallel with DB/transaction once scaffold exists | Tenant scope unavoidable; transaction and idempotency tests pass |
| F02 — Identity, Tenancy, and Subscription Access | 3.5–5.5 weeks | Session/CSRF and subscription state-machine edge cases | Auth UI parallel with subscription backend after session contract exists | E2E onboarding; cross-tenant; suspension blocks writes; platform/org separation |
| F03 — Organization Setup and Master Data | 3.5–5.5 weeks | Opening-balance orchestration breadth and plan-limit interactions | Catalog/customers/suppliers parallel after locations and settings exist | Org can complete setup; opening entries reconcile; version conflicts and plan limits enforced |
| F04 — Inventory Engine | 4–6.5 weeks | Concurrency, WAC, FEFO/FIFO, transfer atomicity | Adjustments and transfers after core movement/cost engine stable | Quantity/valuation reconcile; no silent overwrite; no one-sided transfer |
| F05 — Purchases and Supplier Payables | 4–6.5 weeks | Landed cost, atomic multi-effect posting, returnable quantity | After R1-F03-011 and R1-F04-012: purchase UI may interleave with supplier payment work; interleaving does not reduce one-engineer weeks | Atomic post/rollback; supplier ledger and accounts reconcile |
| F06 — Sales, POS, and Customer Receivables | 5–7.5 weeks | POS approvals, mixed payments, invoice races, print layouts | After R1-F03-011 and R1-F04-012: may start independently of supplier-specific F05 items; POS UI may interleave with sale posting; calendar overlap needs added capacity | Atomic sale; idempotent invoices; stock/COGS/AR/payment reconcile; cashier E2E |
| F07 — Returns, Corrections, Accounts, and Expenses | 3.5–5.5 weeks | Return-without-invoice and shared reversal correctness | Expenses/account transfers parallel with returns after shared correction conventions | Reversals net; return limits enforced; account balances reconcile; no generic correction API |
| F08 — Alerts, Reporting, Imports, and Operational Views | 3.5–5.5 weeks | Report reconciliation breadth and import all-or-nothing orchestration | Alerts/reports parallel; imports after master and opening contracts | Reports match sources; imports atomic; alerts non-authoritative; suspended read/export policy |
| F09 — Hardening, Pilot, and Release | 4–7 weeks | Pilot data quality, restore rehearsal environment, UAT scheduling | Security/perf/accessibility parallel; pilots sequential | Release gate [QUALITY_GATES.md](QUALITY_GATES.md) REL-G01–REL-G15 |

### Totals

Stage ranges currently sum to **34.5–56 engineer-weeks**. Because the stated assumption is one primary full-time engineer, parallel or overlapping stages do not reduce total engineer effort. F05 and F06 interleaving may reduce waiting and rework but does not reduce engineer-weeks for one engineer. Actual calendar overlap requires additional contributor capacity.

| Estimate type | Range | Notes |
| --- | --- | --- |
| Likely engineering range | 35–48 engineer-weeks | Lower bound is not below the sum of stage lower bounds (34.5 ≈ 35). Assumes limited rework from frozen design; F05/F06 interleaving does not cut one-engineer effort |
| Conservative engineering range | 48–60 engineer-weeks | Heavier concurrency/reconciliation defects, slower review, and little benefit from interleaving |

These are planning ranges, not delivery promises.

Elapsed calendar time will exceed engineer-weeks. Pilot scheduling, commercial approval, environment provisioning, and client feedback delays are calendar lead-time risks and are **not** included in engineer-weeks.

---

## 3. Scope Assumptions Affecting Estimates

* Release 1 scope remains as frozen in [RELEASE_1_SCOPE.md](RELEASE_1_SCOPE.md).
* No client-specific forks.
* Browser-based printing is sufficient; no native print drivers.
* Manual billing only; no payment gateway.
* English and PKR only.
* Shared SaaS default; dedicated cloud is configuration of the same codebase, not a separate product.
* Alerts are in-app only.

### Factors that could increase duration

* Late changes to frozen business rules or technical contracts
* Underestimated concurrency and MongoDB transaction edge cases
* Pilot opening-data quality requiring repeated import/reconciliation cycles
* Print-layout variance across browsers and printers
* Delayed decisions on hosting, backup, or commercial plan limits needed for pilot readiness
* Expanding scope into excluded capabilities (offline, native mobile, tax, messaging automation)

---

## 4. Dependency and Sequencing Summary

Authoritative work-item dependencies live in [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md). Delivery must preserve:

1. F00 before all implementation.
2. F01 before tenant business modules.
3. F02 before protected organization workflows.
4. F03 before Inventory, Purchases, and Sales.
5. F04 before posted Purchases and Sales.
6. F05 and F06 may begin independently after `R1-F03-011` and `R1-F04-012` are complete. F06 must not require `R1-F05-001` or `R1-F05-002`. Interleaving does not reduce one-engineer effort.
7. F07 after relevant posted transaction sources.
8. F08 after authoritative operational modules.
9. F09 after all scoped functionality.

Testing occurs inside every stage. F09 is hardening and release readiness, not the first time tests run.

---

## 5. Risk Register

Probability and impact use Low / Medium / High.

| ID | Risk | Probability | Impact | Prevention | Detection | Owner | Stage addressed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R01 | Tenant leakage | Medium | High | Tenant-safe repositories; mandatory organization scope; platform/org context separation | Cross-tenant isolation suites each stage from F02 | Identity and Access / Platform | F01–F02, continuous, F09 |
| R02 | Incorrect stock valuation | Medium | High | WAC rules from BR-COST; landed-cost allocation tests; movement-derived valuation | Valuation reconciliation gates in F04–F06 | Inventory | F04–F06 |
| R03 | Duplicate transaction effects | Medium | High | Infrastructure idempotency; unique business keys; invoice sequence transactional reservation | Idempotency and duplicate-retry tests | API Infrastructure — Transactions and Idempotency / Sales / Purchases | F01, F05–F06 |
| R04 | Weak reversal handling | Medium | High | Signed opposite effects; linked corrective transactions; no edit-in-place of posted records | Reversal netting and double-cancel tests | Returns and Corrections | F05–F07 |
| R05 | Invoice-number race conditions | Medium | High | Branch sequence collection with transactional allocation; no draft-as-posted numbers | Concurrent sale posting tests | Sales | F06 |
| R06 | Payment/account duplication | Medium | High | Idempotent payment posts; allocation immutability; account movement atomicity | Ledger and account reconciliation | Payments and Ledgers / Accounts and Expenses | F05–F07 |
| R07 | Permission over-granting | Medium | High | Permission catalog and role bundles from frozen security design; deny-by-default | Permission-matrix verification | Identity and Access | F02, F09 |
| R08 | Subscription bypass | Medium | High | Backend entitlement middleware; suspension blocks operational writes | Subscription tests on mutating org APIs | Subscriptions | F02–F03, F08–F09 |
| R09 | Import corruption | Medium | High | Preview validation; all-or-nothing execution; no direct cross-module persistence writes | Import failure and partial-residue tests | Imports | F08 |
| R10 | Reporting mismatch | Medium | High | Reports read authoritative effects only; shared calculation sources with dashboards | Report-to-source reconciliation | Reporting | F08 |
| R11 | Browser-print variance | High | Medium | Fixed 58 mm / 80 mm / A4 layouts; early print fixtures; pilot printer checks | Visual print UAT on USB/LAN printers | Sales (printing) | F06, F09 |
| R12 | MongoDB transaction topology | Medium | High | Local and deployed replica-set requirement; transaction abstraction tests in F00–F01 | Transaction integration failures in CI/local | Operations / Platform | F00–F01 |
| R13 | Performance under large datasets | Medium | Medium | Index plan from data model; baseline scenarios in F09; avoid N+1 in reports | Performance baseline gate | Reporting / Inventory / Operations | F08–F09 |
| R14 | Pilot data migration | High | High | Import templates; preview errors; reconciliation checklists; seed/demo rehearsal first | Opening-data reconciliation reports | Imports / Operations | F08–F09 |
| R15 | Operational restore failure | Medium | High | Documented data-recovery procedure distinct from application rollback; mandatory restore rehearsal before acceptance | Restore rehearsal gate; incident checklist | Operations | F09 |
| R16 | Single-engineer continuity and knowledge concentration | High | High | Written runbooks; stage completion reports; pair review on critical financial paths; documented decision gates | Bus-factor review in F09 readiness; missing owner for a gate is a blocker | Product reviewer / primary engineer | All stages; emphasized F09 |
| R17 | Late operational, commercial, or toolchain decisions | High | High | Decision-deadline table in roadmap/delivery plan; missing decision at deadline blocks the gated work | Gate checklists refuse placeholder production values | Product owner / Operations / primary engineer | P1-07, F00, F02, F08, F09 |
| R18 | Unsafe application rollback or data restore | Medium | High | Separate application-rollback and data-recovery procedures; prefer expand/contract schema; never restore DB merely to undo an app release when later valid transactions would be discarded | Rollback/restore dry-runs; post-restore reconciliation; incident approval | Operations | F09 |

High-impact risks requiring explicit exit evidence: R01, R02, R03, R04, R05, R06, R07, R08, R09, R10, R12, R14, R15, R16, R17, R18.

---

## 6. Pilot and Rollout Strategy

Release 1 initially serves two clients and must support additional organizations later without forks. Rollout is controlled and reversible.

### 6.1 Rollout sequence

| Step | Name | Purpose |
| --- | --- | --- |
| 1 | Internal development validation | Engineering proves stage exit gates and critical E2E on non-production data |
| 2 | Seed/demo organization | Provider-operated demo tenant for training and workflow rehearsal |
| 3 | First pilot-client setup | Onboard first real organization with Super Admin approval and Owner activation |
| 4 | Opening-data import and reconciliation | Excel import and/or manual entry of masters and openings; reconcile before live posting |
| 5 | Controlled UAT | Pilot users exercise primary workflows against agreed scripts |
| 6 | Defect stabilization | Resolve Critical/High defects; re-run affected gates |
| 7 | Second pilot-client onboarding | Repeat setup/import/UAT for second initial client |
| 8 | Production readiness review | Execute release gate REL-G01–REL-G15 |
| 9 | Controlled launch | Enable production use for approved pilot organizations |
| 10 | Post-launch monitoring | Watch backups, errors, reconciliation exceptions, and support queue |

### 6.2 Entry and exit criteria by step

#### 1. Internal development validation

* Entry: F00–F08 stage exits complete for scoped functionality; F09 hardening in progress.
* Exit: Critical workflow E2E green; no open Critical defects; reconciliation suites green on seed data.

#### 2. Seed/demo organization

* Entry: Organization onboarding and setup workflows usable end-to-end.
* Exit: Demo tenant populated with representative catalog, stock, and sample transactions; training scripts available.

#### 3. First pilot-client setup

* Entry: Seed/demo exit met; Super Admin and Owner activation paths verified; subscription plan versions configured for pilot.
* Exit: Organization approved; Owner active; branches/warehouses/users assigned; subscription state allows operational writes.

#### 4. Opening-data import and reconciliation

* Entry: First pilot setup exit met; import templates and preview validation available.
* Exit: Masters and openings imported or entered; stock quantities, valuations, receivables, payables, and account balances reconcile; audit trails present for openings.

#### 5. Controlled UAT

* Entry: Opening-data reconciliation exit met; UAT script covering sales, purchases, returns, payments, transfers, expenses, alerts, and reports.
* Exit: UAT results recorded; Critical/High defects logged; business acceptance for pilot scope signed by designated client reviewer and product reviewer.

#### 6. Defect stabilization

* Entry: UAT complete with known defect list.
* Exit: No unresolved Critical or High defects for launch scope; regressions re-tested.

#### 7. Second pilot-client onboarding

* Entry: First pilot stabilized or running under controlled limited use with accepted residual Medium/Low defects.
* Exit: Second organization setup, openings, and UAT exit criteria met equivalently.

#### 8. Production readiness review

* Entry: Both pilots through defect stabilization for launch scope.
* Exit: [QUALITY_GATES.md](QUALITY_GATES.md) release gates REL-G01–REL-G15 recorded as pass.

#### 9. Controlled launch

* Entry: Production readiness exit met; application-rollback and data-recovery procedures acknowledged by operations owner.
* Exit: Production access enabled for approved organizations; launch record stored; monitoring dashboards watched.

#### 10. Post-launch monitoring

* Entry: Controlled launch exit met.
* Exit: Not a one-time exit; operate under support ownership with scheduled reconciliation and backup verification. Transition criteria include stable error rates, successful backups, and no unresolved Critical production incidents for the agreed observation window.

### 6.3 Data reconciliation requirements

Before live posting and again before launch:

* Inventory quantity and valuation versus movements
* Customer and supplier ledger balances versus signed effects
* Account balances versus signed account movements
* Sample report totals versus source transactions
* Import job results versus preview-accepted rows

### 6.4 Training responsibility

* Product reviewer owns UAT script content and acceptance criteria.
* Primary engineer owns technical walkthrough of workflows and known limitations.
* Organization Owner owns internal end-user training for their staff.
* Super Admin / provider operations owns platform onboarding steps (approval, billing evidence review, dedicated-cloud configuration if contracted).

### 6.5 Defect severity policy

Follow [QUALITY_GATES.md](QUALITY_GATES.md) §6 exactly.

* Critical defects block work-item completion where relevant, stage exit, pilot use, and release. They cannot be accepted for launch.
* High defects block the affected stage exit when they impact that stage’s primary workflow, reconciliation, security, tenant isolation, permissions, subscription enforcement, or posted money/stock. High defects always block production launch and cannot be accepted for production launch.
* Medium and Low defects may be accepted only with documented workaround, named owner, target resolution, product and technical approval, and no impact on tenant isolation, security, reconciliation, or posted money/stock correctness.

### 6.6 Application rollback and data recovery

Application rollback and database restore are separate procedures.

#### Application rollback

Used for a faulty application deployment when stored business data remains valid.

May include:

* Stop or restrict writes
* Redeploy the previously approved application version
* Disable a newly introduced feature or route
* Verify backward compatibility
* Run smoke tests and reconciliation

Application rollback must not automatically restore the database.

#### Data recovery

Used only when data is lost, corrupted, or cannot be corrected safely through approved business correction workflows.

Database restore requires:

* Authorized incident declaration
* Operational write freeze
* Known recovery point
* Explicit assessment of transactions created after the backup
* Recovery plan
* Restore verification
* Post-restore reconciliation
* Incident and audit records
* Approval before reopening operational writes

A database backup must never be restored merely to undo an application release when doing so would discard valid later transactions.

The future deployment strategy must prefer backward-compatible or expand/contract schema changes so application rollback does not require routine database rollback.

#### Trigger conditions

Trigger application write restriction / application rollback, or declare a data-recovery incident, when any of the following occur and cannot be corrected quickly:

* Confirmed cross-tenant data exposure
* Systemic incorrect stock or money posting without reliable corrective path
* Failed restore when restore is required for recovery
* Authentication or authorization bypass in production
* Data corruption from import or migration that fails reconciliation

Posted-business-data repair uses authorized corrective workflows or approved incident procedure—not silent edits or permanent deletes.

### 6.7 Support ownership

| Area | Owner |
| --- | --- |
| Application defects | Primary engineer during pilot; transition to designated support owner at launch |
| Platform approval and manual billing review | Super Admin / provider operations |
| Backup and restore operations | Operations owner |
| Pilot-client business questions | Product reviewer with Owner liaison |
| Security incidents | Operations owner with engineer support |

Exact named individuals and providers are assigned at F09 readiness review.

---

## 7. Vertical-Slice Delivery Expectation

Each stage delivers reviewable increments that include, where practical:

```text
data
→ backend business workflow
→ authorization
→ API contract
→ frontend workflow
→ audit
→ tests
```

A feature is not complete when only UI, route, schema, or controller exists.

---

## 8. Controlled Unresolved Items and Decision Deadlines

Delivery planning keeps values unresolved but assigns a latest approval gate. A missing decision at its deadline is a blocker and must not be replaced by a silent placeholder production value.

| Decision | Latest approval point |
| --- | --- |
| Runtime/framework versions, package manager, monorepo tool, test/lint/format tools, local replica-set method | P1-07 before F00 execution |
| CI implementation approach/provider | Before `R1-F00-009` |
| Initial non-production subscription fixtures | Before F02 integration testing |
| Production commercial plan prices and numeric limits | Before first pilot onboarding |
| Import file-size/type limits | Before F08 import implementation exit |
| Rate-limit production values | Before F09 security review |
| Hosting, production MongoDB topology, backup provider, monitoring provider | Before F09 entry |
| Production performance thresholds | Before F09 performance gate |
| Named support, security, backup, restore, and release owners | Before production readiness review |

Unresolved until those gates:

* Exact Node.js, Angular, TypeScript, Express, or Mongoose versions
* Package manager and monorepo orchestration tool
* Test, lint, and formatting tools
* CI, hosting, backup, and monitoring providers
* Exact commercial prices and numeric plan limits
* Exact production performance thresholds
* Exact rate-limit and file-upload limits

See P1-07 and later deployment tasks.
