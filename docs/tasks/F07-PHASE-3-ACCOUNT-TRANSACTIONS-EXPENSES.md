# F07 Phase 3 — Manual Account Transactions, Reversals, and Expenses

## Task Status

* Status: **Complete** (implementation)
* Date: 2026-08-13
* Work items: `R1-F07-006`, `R1-F07-007`, `R1-F07-008`
* Does **not** implement `R1-F07-009` (Accounts/expenses/returns Angular vertical slice + stage-exit E2E)

## Scope Delivered

### R1-F07-006 — Manual account inflow, outflow, and transfer

* `POST /api/v1/account-transactions` posts one signed `account_movements` row (`manual_inflow` positive / `manual_outflow` negative)
* `GET /api/v1/account-transactions/:id` views that movement (no `account_transactions` collection)
* `POST /api/v1/account-transfers` posts two linked movements in one Mongo transaction (`account_transfer_out` / `account_transfer_in`, shared `sourceId`)
* Account balance is derived only from signed posted movements; `accounts` has no mutable `balance`
* Amount must be `> 0`; source and destination must differ; both accounts must be active and in the same organization
* Permissions: `accounts.transaction.post` (inflow/outflow), `accounts.transfer` (transfer) per Frozen API_DESIGN / SECURITY_AUTHORIZATION
* Idempotency-Key, tenant scope, audit, one Mongo transaction

### R1-F07-007 — Account transaction reversal

* `POST /api/v1/account-transactions/:id/reverse` (`accounts.transaction.correct`, reason required)
* `POST /api/v1/account-transfers/:id/reverse` (`accounts.transfer.reverse`, reason required; both legs reversed atomically)
* Original movements are not edited or deleted; corrective movements use opposite signed amounts and `reversalOfId`
* Double reversal rejected; idempotent replay does not duplicate; failed reversal leaves no partial corrective movement
* No generic `/corrective-transactions`, `/generic-correction`, `/adjust-anything`, or `/balance-edit` route
* Accounts does **not** write Returns-owned `corrective_transactions`

### R1-F07-008 — Expenses and expense correction

* `expense_categories` master data (`expenses.view` / `expenses.post`)
* Expense draft → post: valid category, active account, positive PKR amount, purpose, `YYYY-MM-DD` date, optional reference
* Posting creates the expense record and a matching signed account outflow (`sourceType=expense`) atomically
* `POST /api/v1/expenses/:id/correct` (`expenses.correct`, reason): original expense preserved (`status=corrected`); linked corrective expense + opposite account movement (`expense_correction`, `reversalOfId`)
* Double correction rejected; posted expense is not deleted or rewritten

## Model review (A/B)

| Model | Class | Result |
| --- | --- | --- |
| `account_movements` (extended) | A/B | Manual/transfer/expense/reversal source types; optional `purpose`/`reference`; unique owned-source and `reversalOfId` indexes |
| `expense_categories` | A | Tenant category master; unique org+nameNormalized; `version` |
| `expenses` | A/B | Draft/posted/corrected lifecycle; `correctionOfId` unique; original amounts/purpose preserved on correction |
| No `account_transactions` / `account_transfers` collections | — | DATA_MODEL + R1-F07-006 data scope: movements only; transfer identity is shared `sourceId` |
| No `account.balance` | — | Derived from signed movement sum |

Deferred **C/D**: payroll, tax, double-entry GL, F08 reporting, R1-F07-009 E2E vertical slice.

## APIs

| Method | Path | Permission |
| --- | --- | --- |
| POST | `/api/v1/account-transactions` | `accounts.transaction.post` |
| GET | `/api/v1/account-transactions/:id` | `accounts.view` |
| POST | `/api/v1/account-transactions/:id/reverse` | `accounts.transaction.correct` |
| POST | `/api/v1/account-transfers` | `accounts.transfer` |
| POST | `/api/v1/account-transfers/:id/reverse` | `accounts.transfer.reverse` |
| GET/POST/PATCH | `/api/v1/expense-categories` | `expenses.view` / `expenses.post` |
| GET/POST/PATCH | `/api/v1/expenses`, `/:id` | `expenses.view` / `expenses.post` |
| POST | `/api/v1/expenses/:id/post` | `expenses.post` |
| POST | `/api/v1/expenses/:id/correct` | `expenses.correct` |

## Angular workflow

* Account detail: manual inflow/outflow, transfer to another active account, reverse with required reason
* `/app/expenses` list + draft/post/correct; `/app/expense-categories` master data
* Shell nav `Expenses` gated by `expenses.view`
* R1-F07-009 browser E2E not in this phase

## Validation

* Focused unit: `apps/backend/src/modules/accounts-expenses/f07-p3.spec.js` — **2 passed**
* Real-Mongo rs0: `f07-p3-mongo.integration.spec.js` — **2 passed** (transfer rollback; transfer/expense idempotency + expense-correction rollback)
* Angular: accounts-expenses page specs — **5 passed**
* Phase gates (once): `test:architecture` **pass** (4), `f04-p3-contracts` **pass** (6), lint **pass** (existing warnings only), typecheck **pass**, frontend build **pass**
* Browser E2E not run in this phase

## Prompt vs Frozen

* Agent prompt listed `accounts.transaction.post` for transfers. Frozen API_DESIGN / SECURITY_AUTHORIZATION use `accounts.transfer` and `accounts.transfer.reverse`. Implementation follows Frozen.
* Agent prompt listed purpose/reference as invariants; Frozen BR-ACCOUNT does not require purpose on transfers. Manual transactions and expenses require purpose; transfer purpose/reference remain optional; reversal/correction require reason.

## Next

* `R1-F07-009` Accounts/expenses/returns Angular vertical slice and stage-exit E2E / reconciliation suite
