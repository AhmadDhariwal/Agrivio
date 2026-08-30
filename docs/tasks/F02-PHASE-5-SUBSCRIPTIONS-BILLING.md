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

## Suggested commit message

```text
feat(f02-p5): add plans, subscription lifecycle, and manual billing

Implement R1-F02-010/011/012 with versioned plans, entitlement-enforced
lifecycle states, and Super Admin manual billing review.
```
