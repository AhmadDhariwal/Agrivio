# Agrivio Release 1 Plan Catalog

Document status: Frozen for Release 1  
Catalog revision: `R1-CATALOG-1`  
Last updated: 2026-09-09  
Approval status: Approved commercial catalog specification; implementation pending

## 1. Authority and interpretation

This document is the authoritative Release 1 commercial catalog for Agrivio. It resolves the exact prices, limits, and plan entitlements that the earlier frozen subscription design deliberately left for later commercial approval.

The evidence was applied in this order:

1. Frozen product and subscription decisions.
2. The repository's canonical three-plan seed and implementation history.
3. The completed plan-limit audit findings.
4. Active local and staging records as deployed-state evidence only.

Historical plan versions, demo/test values, active local records, and staging records do not override this catalog. A record that differs from this document remains historical or malformed deployed data and must not be presented as current R1 policy.

The trial is a subscription state, not a plan. Agrivio has exactly three normal R1 plans: Starter, Business, and Enterprise.

## 2. Final comparison

All monetary values below are PKR major units. Persisted minor-unit amounts are shown in parentheses.

| Field | Starter | Business | Enterprise |
| --- | --- | --- | --- |
| Code | `Starter` | `Business` | `Enterprise` |
| Display name | Starter | Business | Enterprise |
| Short description | Essential POS and inventory for a single-location agricultural retailer. | Expanded capacity and data tools for a growing dealer or wholesaler. | High-volume, multi-branch operations with priority support and dedicated-cloud eligibility. |
| Target customer | Single-shop agricultural retailer | Growing dealer or wholesaler | Multi-branch agricultural business, distributor, or enterprise customer |
| Monthly price | PKR 5,000 (`500000`) | PKR 15,000 (`1500000`) | PKR 35,000 (`3500000`) |
| Annual price | PKR 50,000 (`5000000`) | PKR 150,000 (`15000000`) | PKR 350,000 (`35000000`) |
| Calculated annual savings | PKR 10,000; **16.67%** | PKR 30,000; **16.67%** | PKR 70,000; **16.67%** |
| Product limit | 200 | 2,000 | 10,000 |
| Active-user limit | 2 | 15 | 100 |
| Branch limit | 1 | 5 | 50 |
| Warehouse limit | 1 | 10 | 50 |
| Customer limit | 100 | 1,000 | 10,000 |
| Supplier limit | 50 | 500 | 5,000 |
| Imports | Not included | Included | Included |
| Reports and data exports | Not included | Included | Included |
| Audit-history depth | 30 days (`30d`) | 90 days (`90d`) | 365 days (`365d`) |
| Backup policy reference | `weekly` | `daily` | `daily_immutable` |
| Dedicated-cloud eligible | No | No | Yes |
| Support tier | Standard (`standard`) | Business (`business`) | Priority (`priority`) |
| Trial eligible | Yes | Yes | Yes |
| Currency | PKR | PKR | PKR |
| Catalog revision | `R1-CATALOG-1` | `R1-CATALOG-1` | `R1-CATALOG-1` |
| Clean-bootstrap `planVersion` | 1 | 1 | 1 |
| Selectable/public | Yes | Yes | Yes |
| Catalog state | Active | Active | Active |

### 2.1 Starter conflict resolution

The final Starter product limit is 200, not unlimited. The final active-user limit is 2, not 5. Imports and reports/exports are not included. Audit history is 30 days, not unlimited.

This selection adopts the repository's canonical version-1 tier definition because it forms a coherent progression into Business and Enterprise and is consistent with Starter's frozen single-shop target. The conflicting later Starter version is historical deployed state, not final R1 policy. “Unlimited products” on Starter would invert the Business product tier and is therefore rejected.

## 3. Price and savings policy

Annual savings has one commercial source of truth: monthly and annual prices.

```text
annual list price = monthly price × 12
annual savings amount = annual list price − annual price
annual savings percent = (annual savings amount ÷ annual list price) × 100
```

For all three plans, the result is `16.666...%`, displayed as **16.67%** when two decimal places are shown. A whole-number marketing badge may display **17%**, but must be derived using normal rounding and must not be stored as an independent commercial value.

The historical stored value `annualDiscountPercent: 16` does not reconcile exactly with the prices and must not drive the UI. During later implementation, the plan response/UI must calculate savings from prices. If `annualDiscountPercent` remains temporarily for backward compatibility, the current catalog rows must carry the derived value `16.67`, validation must reject a materially inconsistent value, and new billing snapshots must derive it from the listed prices.

## 4. Exact public card presentation

Cards use these fields in this order:

1. Display name.
2. Short description.
3. Monthly price and `/month`, or annual price and `/year`, according to the billing-period selector.
4. On annual selection: `Save PKR {amount} ({percent}%) annually`, calculated from prices.
5. Feature/limit labels from the ordered lists below.
6. Trial/selection action.

Starter labels:

* Up to 200 products
* Up to 2 active users
* 1 branch
* 1 warehouse
* Up to 100 customers
* Up to 50 suppliers
* 30-day audit history
* Weekly backup policy
* Standard support

Business labels:

* Up to 2,000 products
* Up to 15 active users
* Up to 5 branches
* Up to 10 warehouses
* Up to 1,000 customers
* Up to 500 suppliers
* Master data imports included
* Reports & data exports included
* 90-day audit history
* Daily backup policy
* Business support

Enterprise labels:

* Up to 10,000 products
* Up to 100 active users
* Up to 50 branches
* Up to 50 warehouses
* Up to 10,000 customers
* Up to 5,000 suppliers
* Master data imports included
* Reports & data exports included
* 365-day audit history
* Daily immutable backup policy
* Dedicated-cloud eligible
* Priority support

Excluded entitlements are omitted from the positive marketing list; they must not be presented as included. Administrative or comparison views may show explicit `Not included` values. Labels must use locale-aware thousands separators and correct singular/plural grammar (`1 branch`, not `1 branches`). `null` must never be rendered as “Unlimited”; R1 has no unlimited numeric limit.

## 5. Trial and default plan

The authoritative trial default is the current selectable Starter version.

* A newly approved organization starts on Starter in `trial`.
* Trial duration is exactly 14 calendar days for the R1 default.
* No card or payment method is required.
* Trial is available once per organization unless Super Admin approves an exception.
* The trial subscription stores the exact Starter `planCode`, `planVersion`, and plan reference used at approval.
* Trial access uses that Starter version's limits and entitlements; trial is not a fourth catalog row.

## 6. Versioning and lifecycle policy

`R1-CATALOG-1` identifies this commercial specification. Database `planVersion` remains the existing positive integer sequence within each `planCode`.

### 6.1 Clean bootstrap

A new database creates exactly one active row per plan code at `planVersion: 1`, using this catalog. All three rows are active and selectable.

### 6.2 Existing environments

An existing environment must never renumber, overwrite, reactivate, or delete historical plan rows to force version-number equality with a clean bootstrap.

For each plan code:

1. If an existing active row exactly matches this catalog, retain its existing `planVersion` and mark it as the environment's mapping to `R1-CATALOG-1`.
2. Otherwise create the next available integer `planVersion` with the complete catalog snapshot.
3. Activate the new version and atomically supersede the previously active version.
4. Leave all older versions present with `status: superseded`; referenced versions remain immutable.
5. Never repair malformed history by mutating a referenced version.

Only one version per plan code may have `status: active`. `draft` is non-public and non-selectable. `superseded` is deprecated and non-public for new self-selection, but remains assignable only through an explicit authorized historical/recovery operation where the existing backend contract requires it.

### 6.3 Subscription pinning and plan changes

* Every subscription is pinned to its purchased `planCode` and `planVersion` until an explicit plan change or approved billing application changes it.
* Publishing a new active version does not migrate existing subscriptions, including subscriptions on the same plan code.
* A same-code move to a newer version is an explicit migration and is audited.
* Upgrade: may take effect immediately after approval; no automated proration is required in R1; the paid period must not be shortened.
* Downgrade: becomes effective at the next approved billing-period boundary; the target plan/version must be persisted as a pending change until applied.
* Downgrade validation warns when current usage exceeds target limits. Existing data remains readable; only new creation is blocked until usage is within the target limit or the plan changes.
* All changes require authorization, expected-version concurrency control, reason where required, idempotency, and audit.

## 7. Runtime limits versus descriptive features

| Catalog field | Classification | Required R1 behaviour |
| --- | --- | --- |
| Branches, warehouses, active users, products, customers, suppliers | Technical numeric runtime limits | Backend creation/reactivation checks; soft warning near limit; hard-block only limit-increasing creation; never delete existing data |
| Imports | Technical feature entitlement | Backend denies import preview/execution when false |
| Reports and data exports | Technical feature entitlement | Backend denies export when false; ordinary in-app report viewing is not represented by this flag |
| Audit-history depth | Technical data-access entitlement | Backend bounds tenant audit inquiry to `30d`, `90d`, or `365d` |
| Trial eligibility | Technical lifecycle field | Used only through the approved subscription lifecycle; it does not create another plan |
| Dedicated-cloud eligibility | Deployment/commercial entitlement | Enterprise-only eligibility; provisioning and topology are outside catalog runtime limits |
| Backup policy reference | Descriptive operational-policy reference in current R1 implementation | Identifies intended policy; must not claim an SLA until the referenced policy is separately approved and enforced |
| Support tier | Descriptive service-tier reference | Marketing/service routing reference; exact channels and response commitments require separate approval |
| Short description and target customer | Presentation metadata | No runtime authorization effect |

`null` is not a valid current-catalog value for any field in the comparison table. Historical code may interpret an unconfigured numeric limit as not hard-blocked, but that compatibility behavior does not mean “Unlimited” and must not be used for R1 cards.

## 8. Required catalog and seed reconciliation (implementation deferred)

No code or database change is made by this specification. A later implementation task must:

1. Make this catalog the single clean-bootstrap source for all three plans; demo data must reference it rather than redefine commercial policy.
2. Reconcile local and staging with the existing-environment version procedure in section 6.2.
3. Create new active versions where deployed values differ; supersede, but do not mutate or delete, historical versions.
4. Repair the Starter public card so `null` is not labeled unlimited and only true entitlements are presented as included.
5. Derive annual savings from monthly and annual prices; stop using the inconsistent stored `16` as display authority.
6. Preserve subscriptions on their exact purchased versions. Do not bulk-migrate them merely because a new public version is activated.
7. Persist and apply scheduled downgrades at the period boundary; an audit-only scheduled result is insufficient.
8. Validate that staging contains exactly one active version per plan code and no malformed active plan values.
9. Keep demo/test fixtures explicitly identified and prevent them from becoming production catalog authority.

## 9. Product decisions still required

No unresolved decision blocks the three R1 catalog rows above.

The following referenced service details remain outside the numeric catalog and are still **PRODUCT DECISION REQUIRED** before they can be marketed as contractual commitments:

* Exact channels, hours, and response targets for Standard, Business, and Priority support.
* Numeric retention, restore, availability, or recovery commitments behind `weekly`, `daily`, and `daily_immutable` backup policy references.
* Dedicated-cloud topology, provisioning terms, and price; Enterprise eligibility alone is frozen here.
* Tax and regulatory treatment of the listed PKR prices.

## 10. Value provenance

| Values | Authority and determination |
| --- | --- |
| Exactly Starter, Business, Enterprise | Frozen `PROJECT_DECISIONS.md` Subscription and Commercial Model; `PRD.md` FR-SUB-001; `BUSINESS_RULES.md` BR-SUB-015 |
| PKR; monthly and annual billing | Frozen `PROJECT_DECISIONS.md`; `PRD.md` FR-SUB-002/014/015; `SUBSCRIPTION_AND_BILLING.md` section 1 |
| 14-day no-card trial; default Starter trial | Frozen `PROJECT_DECISIONS.md`; `SUBSCRIPTION_AND_BILLING.md` section 4; implemented onboarding rule recorded in `tasks/F02-PHASE-5-SUBSCRIPTIONS-BILLING.md` |
| Versioning, one active version, pinning, immutability | Frozen `SUBSCRIPTION_AND_BILLING.md` sections 1 and 6; `DATA_MODEL.md` subscription-plan rules |
| Starter target customer | Frozen `PRD.md` persona: single-shop agricultural retailer |
| Business target customer | Frozen `PRD.md` persona: growing dealer or wholesaler |
| Enterprise target and dedicated-cloud eligibility | Frozen `PRD.md` personas and FR-PLATFORM-003/FR-SUB-013; `PROJECT_DECISIONS.md` |
| Exact prices, limits, audit depth, backup refs, support refs | Repository canonical plan payload in `scripts/lib/demo-seed/seed-engine.js`, promoted by this commercial approval after comparison against frozen tier intent and the completed audit |
| Imports and reports/export values | Canonical plan payload, checked against frozen entitlement model in `SUBSCRIPTION_AND_BILLING.md` and runtime entitlement shape; conflicting later Starter version rejected by section 2.1 |
| Annual savings percentage and amount | Calculated from the final monthly and annual prices; no independent historical discount value is authoritative |
| Public descriptions and normalized labels | Presentation decisions frozen by this document from the approved personas and final catalog values |
| Technical/descriptive classification | Current backend enforcement paths plus frozen `SUBSCRIPTION_AND_BILLING.md` sections 2 and 7 and F08 suspended/audit policy |

The completed audit's local/staging observations are comparison evidence only: matching Business/Enterprise values corroborate the canonical payload; conflicting Starter values demonstrate historical version drift and do not override this catalog.

## 11. Non-implementation statement

This document changes no application code, seed, database, subscription, or deployed plan. Implementation and environment reconciliation require a separately assigned task.
