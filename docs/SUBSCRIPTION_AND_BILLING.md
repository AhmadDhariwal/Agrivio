# Subscription and Billing

Document status: Frozen for Release 1  
Current version: 1.0  
Last updated: 2026-08-04  
Approval status: Approved for implementation planning

## Document Authority

| Concern | Authoritative document |
| --- | --- |
| Product scope | Frozen [PRD.md](PRD.md) |
| Subscription business rules | Frozen [BUSINESS_RULES.md](BUSINESS_RULES.md) (`BR-SUB`) |
| Module ownership | Frozen [MODULE_BOUNDARIES.md](MODULE_BOUNDARIES.md) |
| Subscription data collections | [DATA_MODEL.md](DATA_MODEL.md) |
| Subscription and billing APIs | [API_DESIGN.md](API_DESIGN.md) |
| Entitlement enforcement with auth | [SECURITY_AUTHORIZATION.md](SECURITY_AUTHORIZATION.md) |
| Plan model, lifecycle, manual billing | This document |

Frozen requirements define product scope. Frozen Business Rules define calculations and behaviour. Frozen architecture defines module ownership and dependencies. P1-05 defines implementation-ready technical contracts. P1-05 does not create implementation.

---

## 1. Plan Model

Plans remain:

```text
Starter
Business
Enterprise
```

Plan definitions are data driven and versioned in `subscription_plans` using `planCode`, `planVersion`, and `status`.

A plan version may configure:

* Monthly price
* Annual price
* Annual discount
* Trial eligibility
* Branch limit
* Warehouse limit
* Active-user limit
* Product limit
* Customer limit
* Supplier limit
* Import entitlement
* Report/export entitlement
* Audit-history entitlement
* Backup policy reference
* Dedicated-cloud eligibility
* Support-level reference

Rules:

* Plan code is Starter, Business, or Enterprise.
* A plan version becomes immutable after a subscription references it.
* Commercial or entitlement changes create a new plan version.
* Subscription stores the exact referenced plan version.
* Historical subscriptions must not change when a later plan version changes.
* Only one selectable active version may exist for each plan code.
* Exactly one current `subscriptions` record exists per organization (`unique { organizationId: 1 }`).

Exact commercial prices and numeric plan limits remain unresolved until approved by the product owner.

Do not hardcode them into application logic.

Currency remains PKR in Release 1. Billing periods are monthly and annual. The approximately 15% annual discount remains configurable plan data and must not be hardcoded into calculation logic.

---

## 2. Plan Entitlements

Entitlements are evaluated from the active subscription and its plan definition.

Categories:

* Numeric creation limits (branches, warehouses, active users, products, customers, suppliers)
* Feature entitlements (imports, reports/exports, audit-history depth, backup policy reference)
* Deployment entitlement (dedicated cloud eligibility for Enterprise)

Shared SaaS is the default deployment. Dedicated cloud is an Enterprise option. Dedicated and shared deployments use the same application codebase.

---

## 3. Subscription States

```text
pending_approval
trial
active
grace
suspended
cancelled
retained
deleted
```

### 3.1 Allowed lifecycle

```text
pending_approval → trial or active
trial → grace or cancelled
active → grace or cancelled
grace → active, suspended, or cancelled
suspended → active or cancelled
cancelled → retained
retained → deleted through authorized process
```

Allowed cancellation sources: `trial`, `active`, `grace`, `suspended`.

Platform lifecycle actions (replace generic PATCH):

```text
POST /api/v1/platform/subscriptions/:id/suspend
POST /api/v1/platform/subscriptions/:id/reactivate
POST /api/v1/platform/subscriptions/:id/cancel
POST /api/v1/platform/subscriptions/:id/change-plan
```

All use `platform.subscriptions.manage`, require idempotency, expected subscription version, authorized reason where applicable, audit, valid state transition, and transaction owner Subscriptions.

Invalid transitions return a business-rule or version conflict.

Additional authorized transitions:

* Organization approval creates approved trial or active subscription for a pending organization
* `grace` → `active` after approved billing
* `suspended` → `active` after reactivation/approved billing
* `trial` → `grace` when trial expires without approved activation
* `active` → `grace` when subscription expires without renewal

Rules:

* State transitions require authorization.
* Every state transition is audited.
* Cancellation and deletion are separate.
* Suspension does not delete existing data.
* Reactivation preserves organization data.
* `deleted` requires an authorized retention/deletion process.
* Lifecycle history remains available through audit events, billing records, and versioned state-transition information. Do not create several simultaneously current subscription records.

Mapping to BR-SUB-001 terminology: Pending approval, Approved trial, Active, Grace, Suspended, Cancelled, Retained pending deletion, and Deleted.

---

## 4. Trial and Grace Defaults

Release 1 defaults:

```text
Trial duration: 14 calendar days
Grace duration: 7 calendar days
Retention after cancellation: 90 calendar days
```

Durations are configurable; these are Release 1 defaults.

### 4.1 Trial

* No payment method required.
* Available once per organization unless Super Admin approves an exception.
* Uses approved trial entitlements.
* Shows expiry warnings.
* Automatically enters grace when trial expires without approved activation.

### 4.2 Grace

During grace:

* Existing plan entitlements remain operational.
* Persistent expiry and billing warnings are shown.
* Payment evidence may be submitted.
* No data is deleted.

After grace expiry:

* Subscription becomes suspended.

### 4.3 Suspended

Suspended organizations may:

* Sign in
* View subscription status
* Submit payment evidence
* View or export historical data where policy allows
* Contact support through configured channels

Suspended organizations may not:

* Post sales
* Post purchases
* Post payments
* Adjust or transfer stock
* Create operational transactions
* Create new master data beyond billing/support requirements

### 4.4 Cancellation, retention, and deletion

* Cancellation moves the subscription toward `cancelled` then `retained`.
* Retention preserves recoverable data for the configured period (default 90 days).
* Deletion is a separate authorized process after retention.
* Existing data is never deleted because a plan limit is exceeded.

---

## 5. Manual Billing Workflow

Supported evidence methods:

* Bank transfer
* JazzCash
* Easypaisa

Billing record statuses and transitions:

```text
draft → submitted or cancelled
submitted → under_review, cancelled, or expired
under_review → approved, rejected, or expired
approved → terminal
rejected → terminal
expired → terminal
cancelled → terminal
```

`subscription_billing_records` preserve submission snapshots including:

```text
organizationId
requestedPlanId
requestedPlanVersion
billingPeriod
submittedAmount
currency
paymentMethod
paymentReferenceNormalized
evidenceStorageRef
status
submittedAt
reviewedAt
reviewedBy
rejectionReason
appliedAt
appliedSubscriptionId
coverageStart
coverageEnd
version
```

Workflow:

```text
Owner submits payment evidence
→ billing record submitted
→ Super Admin reviews
→ approve or reject
→ approved record activates or extends subscription once
→ audit event created
```

Rules:

* Store a secure opaque evidence reference (`evidenceStorageRef`), not raw base64 evidence in MongoDB.
* Exact storage provider remains unresolved.
* Evidence access remains permission restricted.
* Evidence metadata must not be exposed in ordinary logs.
* Standard organization users cannot approve billing evidence.
* Approval requires actor and timestamp.
* Rejection requires reason.
* Billing approval may apply only once.
* `appliedAt` and `appliedSubscriptionId` prevent double extension.
* Duplicate payment reference produces a warning and review requirement, not an automatic rejection.
* Add a non-unique review index on normalized payment method/reference.
* Approved and rejected are terminal billing-review outcomes.
* A rejected submission requires a new or explicitly resubmitted record.
* Approval must be idempotent.
* Automated payment gateways are excluded from Release 1.

Permissions:

* Submit: `subscription.billing-evidence.submit`
* Verify: `platform.billing.verify`

### 5.1 Billing-period calculation

Use deterministic calendar periods:

* Monthly means one calendar month.
* Annual means one calendar year.
* End-of-month dates clamp to the last valid day of the target month.
* Active or grace renewal extends from the existing period end.
* Reactivation after suspension starts from approval time unless approved billing explicitly records another authorized coverage start.
* Upgrade may apply immediately without automated proration.
* Immediate upgrade does not silently shorten the current paid period.
* Downgrade is scheduled for the next period boundary.
* Coverage dates are stored as UTC instants.

---

## 6. Upgrade, Downgrade, and Renewal

### 6.1 Upgrade

* Approved upgrade may become effective immediately via `change-plan`.
* New entitlements become available after successful activation.
* Release 1 does not require automated proration.
* Immediate upgrade does not silently shorten the current paid period.
* Manual commercial adjustment may be recorded in billing notes and audit.

### 6.2 Downgrade

* Downgrade becomes effective at the next approved billing-period boundary.
* Existing data is not deleted.
* Resources above the new limit remain readable.
* New creation is blocked until usage is within limits or the plan changes.
* Downgrade must warn about limit conflicts before approval.

### 6.3 Renewal

* Approved billing extends the subscription end date once from the existing period end when active or in grace.
* Duplicate approval must not extend twice.
* Annual and monthly periods use deterministic calendar-based subscription dates.

---

## 7. Entitlement and Limit Enforcement

Enforcement occurs on the backend.

Rules:

* Entitlements are evaluated from subscription and plan data.
* Frontend hiding is not enforcement.
* Soft warning occurs before applicable hard limit where configured.
* Hard limit blocks only new creation.
* Existing records remain accessible.
* Limits must not delete data.
* An update that does not increase limited usage may remain allowed.
* Dedicated cloud is an Enterprise entitlement.
* Shared SaaS remains the default.
* Dedicated and shared deployments use the same application codebase.

API documentation in [API_DESIGN.md](API_DESIGN.md) labels whether each endpoint requires:

* Active subscription / trial / grace access
* Specific entitlement
* Numeric limit check
* No subscription check because it is platform or billing access

---

## 8. Dedicated-Cloud Entitlement

* Default deployment: shared SaaS.
* Dedicated cloud: Enterprise plan entitlement / commercial option.
* Same application codebase for shared and dedicated deployments.
* Dedicated environment and database configuration remain deployment concerns.
* Exact dedicated-cloud topology remains unresolved.

---

## 9. Audit Requirements

Subscription-related audited events include:

* Subscription state transitions
* Plan changes (upgrade/downgrade)
* Trial exception approvals
* Billing evidence submission
* Billing approval and rejection
* Suspension and reactivation
* Cancellation
* Retention and deletion process steps
* Restore operations affecting subscription-retained data (via Operations/Audit rules)

Audit must record actor and timestamp; rejection and overrides require reason where applicable (FR-AUDIT-004, BR-AUDIT-013).

---

## 10. Commercially Unresolved Details

| Item | Assigned to |
| --- | --- |
| Exact commercial plan prices | Commercial approval |
| Exact numeric plan limits | Commercial approval |
| Exact annual discount commercial packaging | Commercial approval |
| Final support channels | Commercial / product |
| Dedicated-cloud topology and pricing | Commercial / deployment |
| Backup policy numeric SLAs per plan | Commercial / deployment |
| Tax and regulatory policy | Commercial / legal |

Do not invent values.

---

## 11. Traceability

| Subscription behaviour | PRD requirement | BR-SUB rule | Data record | API operation |
| --- | --- | --- | --- | --- |
| Plans Starter/Business/Enterprise | FR-SUB-001 | BR-SUB-015 | `subscription_plans` | `GET /subscription/plans`, platform manage |
| Monthly/annual PKR prices | FR-SUB-002/014/015 | BR-SUB-017 | `subscription_plans` | Plan data; platform manage |
| Annual discount configurable | FR-SUB-003 | BR-SUB-017 | `subscription_plans` | Plan data |
| Trial without payment method | FR-SUB-004 | BR-SUB-002/003/004 | `subscriptions` | Platform approve → trial |
| Grace after expiry | FR-SUB-005 | BR-SUB-005/006/007 | `subscriptions` | State transitions |
| Manual billing verification | FR-SUB-006 | BR-SUB-014 | `subscription_billing_records` | Submit + platform approve/reject |
| Backend entitlements | FR-SUB-007 | BR-SUB-008 | `subscriptions` + plan | All operational APIs |
| Soft warnings then hard limits | FR-SUB-008/009 | BR-SUB-012/013 | Plan limits | Create endpoints `operational+limit` |
| Suspension and reactivation | FR-SUB-010 | BR-SUB-008/009/010 | `subscriptions` | `POST .../suspend`, `POST .../reactivate` |
| Cancellation ≠ deletion | FR-SUB-011 | BR-SUB-011 | `subscriptions` | `POST .../cancel` then retain/delete |
| Plan change | FR-SUB-001/007 | BR-SUB-015 | `subscriptions` + plan version | `POST .../change-plan` |
| Organization onboarding approval | FR-AUTH-004, FR-ORG-* | BR-ORG, BR-SUB | `organizations`, `subscriptions`, activation tokens | Public request + platform approve |
| Retention period | FR-SUB-012 | BR-SUB-001 (retained/deleted) | `subscriptions` | Retention process |
| Shared SaaS default; dedicated Enterprise | FR-SUB-013 | BR-SUB-016 | Plan entitlement | Deployment + entitlement checks |
| Subscription change audit | FR-AUDIT-004 | BR-AUDIT-013 | `audit_events` | All state/billing transitions |

---

## 12. Document Control

* Frozen requirements define product scope.
* Frozen Business Rules define calculations and behaviour.
* Frozen architecture defines module ownership and dependencies.
* This document defines implementation-ready subscription and billing contracts.
* This document does not create billing code, payment gateways, or commercial price tables.
