# F07 Phase 4 — Accounts, Expenses, and Returns Angular Vertical Slice

## Task Status

* Status: **Complete** (implementation)
* Date: 2026-08-13
* Work items: `R1-F07-009`
* Does **not** implement F08 (alerts, reporting, imports, operational views)

## Scope Delivered

### R1-F07-009 — Accounts expenses returns Angular vertical slice

P1–P3 posting, reversal, and expense engines were left in place. This phase completed missing endpoint/UI wiring, UX states, stage-exit reconciliation, and focused E2E.

**Returns**

* Detail route `/app/returns/:id`: type/status, warehouse/party names, resolution, lines (condition/batch), reverse with required reason, reversed/immutable banners
* List: human type/resolution labels, warehouse/product names, status badges, Open link (`return-open`); purchase returns share the same list/detail conventions
* Without-invoice: batch select by `batchNumber` via inventory batch read model when tracking ≠ `none` (no raw Mongo batch ID field)
* Posted-sale return: related returns, posted-return link after post; sellable/unsellable and refund vs ledger remain P1 behavior

**Accounts**

* List shows derived balance from signed movements; Open/Edit uses existing account read model
* `accounts.view` can inquire balance/history; manage/transaction/transfer/reverse remain permission-gated
* Manual inflow/outflow, transfer, transaction reversal, and transfer reversal UX: loading, validation, 403, in-flight, success, reversed state

**Expenses**

* List joins category names (`expense-open`)
* Draft/create, post, history/detail, correction with reason; posted/corrected banners; 403/success/in-flight

**Reconciliation / exit invariants** (`apps/backend/src/modules/returns-corrections/f07-p4.spec.js`)

1. Sales-return stock effects reconcile
2. Refund/ledger effects reconcile
3. Reversed return nets its original source
4. Purchase-return posting/reversal remains compatible
5. Manual inflow/outflow balances equal signed `account_movements`
6. Transfer source + destination net correctly
7. Reversed transfer nets both original legs
8. Expenses match account outflows
9. Expense correction nets its original account effect
10. No mutable account/customer/stock balance shortcuts on persistence models

Also: reversal/correction linked to source; originals immutable; no generic correction routes; return qty cap at **post**; batch/source identity; unsellable separate from sellable; transfers never one-sided; tenant isolation on foreign reads (404/403). No auto-repair.

## Model review (A/B)

No new collections. No new persisted fields in this phase.

| Model | Class | Result |
| --- | --- | --- |
| Existing F07 collections | — | Unchanged; UI/read wiring and stage-exit proof only |
| No `account.balance` / party cached balances | — | Architecture scan: no `receivableBalance` / `payableBalance` / `currentBalance` / `runningBalance` / `cachedBalance` on persistence models |

Deferred **C/D**: F08 reporting, payroll, tax, double-entry GL.

## Angular workflow

* Returns: list → detail → reverse; sale-linked return; without-invoice with batch selector
* Accounts: list balances → inquiry → inflow/outflow/transfer/reverse
* Expenses: categories → draft/post → correct
* Permission-aware UI is not treated as security enforcement

## Validation

* Focused backend: `f07-p4.spec.js` — **3 passed**
* Focused Angular (9 specs): **12 passed**
* Focused Playwright: `f07-p4-returns`, `f07-p4-accounts`, `f07-p4-expenses` — **3 passed**
* Final F07 gate (once): lint **pass** (existing warnings only), typecheck **pass**, `test:architecture` **4 passed**, build **pass**, `test:unit` **pass** (frontend 66, backend 217, api-contracts 3, test-support 3), `npm run e2e` **19 passed**
* Playwright `reuseExistingServer: false` so E2E owns ports 3000/4200; application default ports unchanged

## Prompt vs Frozen

* Return quantity over-limit is enforced at **post** (Frozen remaining-returnable rule), not at draft create. Stage-exit suite asserts 201 on over-qty draft and 400 on post.
* Stock/ledger public read DTOs do not expose `reversalOfId`. Netting is proven from source types/ids and opposite signed amounts; `corrective_transactions` remains the Returns-owned reversal link.
* Agent prompt listed `accounts.transaction.post` for transfers in earlier F07 phases. Frozen API_DESIGN still uses `accounts.transfer` / `accounts.transfer.reverse`. UI follows Frozen.

## Next

* Stage F08 — Alerts, Reporting, Imports, and Operational Views (`R1-F08-001`+)
