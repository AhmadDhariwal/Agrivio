# F03 Phase 3 — Opening Balances, Plan Limits, Guided Setup

## Task Status

* Status: **Complete** (implementation)
* Date: 2026-08-11
* Work items: `R1-F03-011`, `R1-F03-012`, `R1-F03-013`
* Does **not** implement F04 or operational payments/purchases/sales

## Scope Delivered

### R1-F03-011 — Signed ledger/account foundations and opening balances

* Opening source-request facts nested on `customers` / `suppliers` / `accounts` (`openingBalance`)
* New collections only: `ledger_effects`, `account_movements`
* Public Payments and Ledgers interface (`payments-ledgers`) for posting/querying signed party effects + balance helpers
* Public Accounts interface for posting/querying account movements + derived balance
* No authoritative `*.balance` master fields; no full double-entry; no operational payment workflows
* POST opening-balance APIs with Idempotency-Key, operational subscription gate, dedicated permissions
* Atomic transaction: effect/movement + master facts + audit

### R1-F03-012 — Centralized plan-limit enforcement

* Shared `subscriptions/creation-limit.js` (`assertCreationLimit`, `attachSoftWarning`)
* Refactored customers, suppliers, catalog, locations, employees to use the helper
* Soft warning nested at `entitlement.limit.softWarning`
* Count semantics: creates count; updates/deactivate/reactivate do not call the helper (existing store count methods retained — typically all org records; `activeUsers` remains active-only)
* Accounts remain uncapped
* Frontend plan-limit feedback helper on create forms

### R1-F03-013 — Guided organization setup

* `GET /api/v1/organization/setup-progress` derived from persisted state (no setup collection)
* Angular `/app/organization/setup` page + shell nav link
* Opening-balance UI on customer/supplier/account edit forms

## Model review (A/B)

| Model | Result |
| --- | --- |
| `ledger_effects` | A/B signed effects for openings; indexes per DATA_MODEL; unique opening partial |
| `account_movements` | A/B signed movements for openings; unique opening partial |
| `customers.openingBalance` | A opening source-request facts only |
| `suppliers.openingBalance` | A opening source-request facts only |
| `accounts.openingBalance` | A opening source-request facts only |

Deferred **C/D**: payments, allocations, operational advances, expenses, inventory openings.

## Validation

Focused:

* `f03-p3-openings-setup.spec.js` — isolation, idempotency, semantics, limits, setup progress, ledger-fail leaves no opening facts (**pass**)
* `f03-p3-mongo.integration.spec.js` — unique opening indexes on `rs0` (**pass**)
* Playwright `f03-p3-setup.e2e.spec.ts` — guided setup + openings + customer plan soft-warning/hard-block UX (**pass**)

Gates:

```text
npm run lint                 # pass
npm run typecheck            # pass
npm run test:unit            # pass (110)
npm run test:architecture    # pass
npm run build                # pass
npm run test:integration     # pass (rs0 available)
npx playwright test apps/frontend/tests/e2e/f03-p3-setup.e2e.spec.ts  # pass
```

## Next

* F03 exit gate acceptance
* F04 Inventory Engine
