# F02 Phase 5 — Plans, Subscription Lifecycle, and Manual Billing

## Task Status

* Status: Complete
* Completion date: 2026-08-08
* Branch: `task/R1-F02-P5-main`
* Work items: `R1-F02-010`, `R1-F02-011`, `R1-F02-012`
* Out of scope this phase: `R1-F02-013`, `R1-F02-014`
* Backend convention: Express 5 + JavaScript CommonJS (`require` / `module.exports`)
* Next phase: **F02 Phase 6** (`R1-F02-013` / `R1-F02-014`)

## R1-F02-010 — Plans and subscription records

* Versioned `subscription_plans` (`planCode`, `planVersion`, `status`) with partial unique active version per plan code
* Organization `subscriptions` remain one current record per organization
* Commercial values are data-driven (`monthlyPriceMinorUnits`, `annualPriceMinorUnits`, `annualDiscountPercent`, limits, entitlements); no hardcoded prices/limits
* Platform plan APIs under `/api/v1/platform/subscription-plans` (`platform.subscriptions.manage`)
* Organization read of selectable plans under `/api/v1/subscription/plans`
* Referenced plan versions become immutable (`referencedAt`); further commercial changes require a new version
* Onboarding approval binds trial subscription to the selectable Starter plan version when present and marks that version referenced

## R1-F02-011 — Trial, grace, suspension, entitlement enforcement

* Lifecycle transitions: trial / active / grace / suspended / reactivation / cancel→retained
* Automatic expiry evaluation: trial→grace, active→grace, grace→suspended
* Centralized entitlement evaluation (`entitlement.js`) and Express middleware labels (`billing-access`, `operational`, `suspended-read`)
* Suspended organizations may use billing-access routes; operational writes are backend-blocked
* Later Frozen-gap close (2026-08-14): `POST /api/v1/platform/organizations/:id/suspend` calls this same `suspendSubscription` path
* Session snapshot includes informational `subscriptionAccessState` (non-authoritative)
* Frontend banners/pages are informational only and never replace backend enforcement
* Unknown entitlement labels / unconfigured feature entitlements default safely to deny; unconfigured numeric limits are not invented

## R1-F02-012 — Manual billing evidence and Super Admin review

* Methods: `bank_transfer`, `jazzcash`, `easypaisa`
* Organization submit/list/get under `/api/v1/subscription/billing-records`
* Platform review queue/detail/approve/reject under `/api/v1/platform/billing-records`
* Opaque `evidenceStorageRef` only (no raw base64 in MongoDB; storage provider unresolved)
* Duplicate payment reference sets a review warning, not auto-rejection
* Approve applies once (`appliedAt` / `appliedSubscriptionId`); reject requires reason; invalid transitions conflict
* Permissions: submit `subscription.billing-evidence.submit`; review `platform.billing.verify`
* Audit events for submit / approve / reject without logging evidence or payment-reference details

## Validation

| Suite | Result |
| --- | --- |
| Focused backend `subscription.spec.js` | passed (8 tests) |
| Backend onboarding/auth regression | passed |
| Backend context-permissions regression (billing-access fixtures) | passed |
| Frontend unit (`nx test frontend`) | passed (13 files / 17 tests) |
| Lint | passed |
| Typecheck | passed |
| Architecture | passed |
| Unit gate (`npm run test:unit`) | passed |
| Build | passed |

## Docker-dependent verification

Mongo replica-set proofs for `subscription_plans`, `subscriptions`, and `subscription_billing_records` indexes (unique plan version, one subscription per org, billing review indexes) remain pending on machines without Docker replica set and do not block this phase.

## Cleanup

* No obsolete temp files retained
* Repo-wide CRLF/Prettier drift intentionally not mass-fixed

## API/cache hardening follow-up (2026-08-30)

Subscription status and billing queues use short organization/session-scoped caching; selectable plans use reference caching. Evidence submission, plan creation, approval, and rejection invalidate only the affected billing, plan, and subscription tags after success.

## Billing UX / evidence-storage follow-up (2026-08-30)

Implemented on the existing F02 Phase 5 billing path. Does **not** claim F02 stage-exit.

* Owner submits against `GET /subscription/plans` and a server-issued evidence ref from authenticated upload (`POST /subscription/billing-evidence`).
* Super Admin queue supports status/organization/search + pagination, start-review, approve/reject with `expectedVersion`, and authorized evidence download.
* Active review workflow: `submitted` → `under_review` → `approved` / `rejected`. Approve/reject remain valid from `submitted` or `under_review`.
* Billing records snapshot listed plan prices (nullable; no invented commercial values) plus evidence metadata.
* Platform reactivation now shares `computeCoverageWindow` so a subscription cannot become `active` with an already-expired paid period.
* Existing `QueryCacheService` is used for billing reads (plans REFERENCE; subscription / owner records / owner record detail / platform queue / platform record detail SHORT). Upload, download, submit, start-review, approve, and reject are not cached as mutation results. Successful submit invalidates `billingRecords` and `platformBillingRecords`. Start review and reject invalidate those two tags. Approve also invalidates `subscription`. Failed mutations do not invalidate. `QueryCacheService` itself was not modified.

* No shared scheduler/job infrastructure exists on `release1/F09`. Retained → deleted 90-day cleanup is **deferred infrastructure work** and does not block Billing freeze. Domain rule `cancelled → retained` with `retainedUntil` remains implemented.

### Model review (billing record fields added)

| Field | Class | Justification |
| --- | --- | --- |
| `evidenceUploadedAt` | A | DATA_MODEL evidence metadata; required for Owner/review display |
| `listedMonthlyPriceMinorUnits` | B | Historical snapshot so later plan versions do not rewrite submissions |
| `listedAnnualPriceMinorUnits` | B | Same |
| `listedAnnualDiscountPercent` | B | Same |

Collection ownership remains Subscriptions. No new collection. Tenant `organizationId` unchanged. Optimistic `version` unchanged. Evidence bytes stay out of Mongo.

## Super Admin Billing Review backend hardening (2026-08-30)

Production hardening stayed within the frozen manual-billing workflow and existing platform endpoints.

* Platform queue retains status / organization / `q` or `search` / limit / offset filtering and now composes organization labels, requested-plan snapshots, period-listed amount, duplicate warning, and reviewer summaries with bounded batch lookups for the current page.
* Platform detail now includes organization, current subscription, requested plan/version price snapshot, evidence metadata, reviewer/rejection data, and applied-subscription coverage information.
* Evidence downloads remain private and permission-gated; the record organization, opaque reference organization, stored-object organization, MIME type, and persisted metadata must agree before bytes are returned. Download filenames strip control characters and path separators.
* Start Review is accepted only from `submitted`. Approve/reject remain accepted from `submitted` or `under_review`; approval remains idempotent and applies/extends/reactivates once, while rejection requires a trimmed reason and leaves the subscription unchanged.
* Billing review writes now use a version predicate in addition to service-level `expectedVersion` validation. Existing transaction and audit infrastructure remains authoritative.
* No payment gateway, subscription lifecycle redesign, new endpoint, new persisted field, or `QueryCacheService` change was introduced.

Verification: focused billing suites passed (10 tests), including queue filters/pagination, display-safe batch composition, detail, evidence authorization and cross-organization binding, review transitions, stale versions, idempotent approval, active extension, suspended reactivation by approval, rejection immutability, RBAC, and audit events. Changed production JavaScript passed `node --check`; `git diff --check` passed.

* SUPER ADMIN BILLING API: ✅ FROZEN
* BILLING REVIEW WORKFLOW: ✅ VERIFIED
* BILLING EVIDENCE REVIEW SECURITY: ✅ VERIFIED
* BILLING APPROVAL/REJECTION: ✅ VERIFIED
* BILLING REVIEW RBAC/AUDIT: ✅ VERIFIED
* SUPER ADMIN BILLING BACKEND: ✅ FULLY DONE

## Suggested commit message

```text
feat(f02-p5): add plans, subscription lifecycle, and manual billing

Implement R1-F02-010/011/012 with versioned plans, entitlement-enforced
lifecycle states, and Super Admin manual billing review.
```

## Final Manage Billing route hardening (2026-09-03)

The shared subscription/grace banner used the nonexistent plural route `/app/subscriptions/billing`. It now consumes the same canonical `/app/subscription/billing` application-path constant as the working Billing sidebar item, preserving the existing route permission and Billing capability guards.

## Billing bootstrap and missing-subscription recovery (2026-09-09)

The existing entitlement resolver now defines `billing-bootstrap` for missing, pending approval, trial, active, grace, suspended, and cancelled subscription states. Only the tenant Billing acquisition/recovery module, status, plan, required payment fields, evidence upload/submission, and own history controls use this label. Authentication, tenant context, RBAC, CSRF, capability policy, file validation, audit, and billing domain validation remain in force; operational controls still require operational subscription access.

Missing subscription reads return an explicit unavailable descriptor with no fabricated ID or plan. Platform organization detail converts that descriptor to `subscription: null`, preserves independent organization aggregation, and exposes the `subscription_missing` operational warning. The Owner Billing page presents an explicit recovery message, while the platform detail page renders Subscription Status as Unavailable.

Normal onboarding remains strict: Request Access creates one pending Starter subscription, and approval requires that record before starting an exact 14-day trial anchored to `approvedAt`. The explicit `scripts/ops/repair-organization-subscription.mjs` utility can inspect or repair legacy malformed organizations. It defaults approved repairs from the original approval instant through trial/grace/suspension, uses a transaction and audit event, never overwrites an existing subscription, and never runs at application startup.

## R1 commercial catalog and plan management (2026-09-09)

`docs/R1_PLAN_CATALOG.md` revision `R1-CATALOG-1` is now the single commercial source for Starter, Business, and Enterprise. The backend catalog module, demo seed, Super Admin editor, tenant Billing cards, and explicit catalog-sync utility all consume or present that policy. The 14-day no-card trial remains a subscription state pinned to the active Starter version, not a fourth plan.

Active versions must have complete presentation metadata, PKR monthly and annual prices, all six positive runtime limits, explicit import/report/dedicated-cloud booleans, audit/backup/support policy references, and trial eligibility. Incomplete drafts may be saved, but cannot be activated. Annual savings are always calculated from prices; the persisted legacy discount field is compatibility evidence and must reconcile when supplied.

Plan changes use an immutable version lifecycle:

* A commercial edit creates a draft with the next `planVersion`; an unreferenced draft may be edited with optimistic `expectedVersion` checks.
* Activation validates completeness, supersedes the previous active version, and makes the new version selectable.
* Referenced versions cannot be edited or deleted. Existing subscriptions remain pinned to their purchased `planCode` and `planVersion` until an explicit upgrade, downgrade, or migration.
* An active version may be retired only through the audited retire action with a reason. No hard-delete API is exposed.

Catalog synchronization is an explicit operator action and never runs during application startup:

```text
npm run bootstrap:plans -- --dry-run
npm run bootstrap:plans -- --apply --confirm=R1-CATALOG-1
```

For local or staging use, first verify the resolved environment targets the intended database, run dry-run and retain its database name/difference report, then run apply with the exact confirmation token. Apply creates and activates a new version when the active record differs; it never overwrites a referenced version. Run dry-run again and require exactly three matching active commercial plans with no proposed actions. The implementation task did not execute either local or staging apply.

### Model review (plan presentation/catalog fields added)

| Field | Class | Justification |
| --- | --- | --- |
| `displayName` | A | Stable customer-facing label for a particular historical plan version |
| `shortDescription` | A | Versioned plan-card presentation copied from the frozen catalog |
| `targetCustomer` | A | Versioned commercial positioning shown to platform operators and tenants |
| `catalogRevision` | B | Provenance tying a plan version to the authoritative catalog revision |

Collection ownership remains Subscriptions and tenant scope is unchanged because plans are platform reference data. The fields are nullable only for backward compatibility with historical records and incomplete drafts; activation requires them. No backfill migration or new index is required. Existing unique `(planCode, planVersion)` and partial unique active-plan indexes remain authoritative, and existing subscription references preserve historical pinning.
