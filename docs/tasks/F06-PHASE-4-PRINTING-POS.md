# F06 Phase 4 — Printing and POS Cashier Vertical Slice

## Task Status

* Status: **Complete** (implementation)
* Date: 2026-08-13
* Work items: `R1-F06-010`, `R1-F06-011`
* Closes F06 Sales/POS
* Does **not** implement F07 returns, F08 reporting, native/silent printing, cash-drawer integration, or offline POS

## Scope Delivered

### R1-F06-010 — Printing (58mm, 80mm, A4)

* Browser print only (`window.print()`); no native drivers, raw/silent printing, or cash-drawer integration
* `GET /api/v1/sales/:id/print` returns a posted-snapshot print payload (`sales.view`, tenant + warehouse isolation)
* Drafts rejected (`409`); posted and cancelled invoices printable; original cancelled invoice preserved
* Angular print page `/app/sales/:id/print` with 58mm, 80mm, and A4 layouts
* Print CSS is confined to the print page (`ViewEncapsulation.None` + `@media print` hiding chrome) so POS UI is unaffected
* Historical values come from posted sale snapshots (product/customer/branch/warehouse/price/payment names), not live master data

### R1-F06-011 — Final POS cashier vertical slice

* Existing F06 P1–P3 posting/pricing/payment/approval/cancel APIs remain authoritative; no new posting engine
* POS uses branch/warehouse selectors filtered by assignment; walk-in vs registered customer; packaging/qty; tier price fill; override reason; cash/credit/partial/mixed payments; approval capture; post; invoice number; detail; print; cancel entry when `sales.cancel` is granted
* `GET /api/v1/sales/payment-accounts` (`sales.create`) exposes a slim POS account picker so cashiers can tender without `accounts.view` (Frozen cashier bundle)
* Duplicate post guarded by in-flight disable + idempotency-key reuse on transport failure; client keys rotate on 4xx so approval retries are not idempotency conflicts
* Cashier cannot cancel; Store Keeper cannot print

## Print data source / Frozen invoice fields

PRD still lists “Final invoice fields and layouts” as unresolved. Print uses only Frozen posted snapshot display facts already persisted on `sales`:

* invoice number, status, sale date, posted at
* branch / warehouse / customer name snapshots, price-tier snapshot, notes
* line: product name, unit, conversion factor, quantity, unit price, line amount
* payment: account name/type snapshots, amount
* sale / paid / receivable totals

Internal COGS, product IDs, and live catalog names are not printed.

## Model review (A/B)

No new collections and no `sales` schema change. Print is a read projection of existing posted snapshots.

## Cashier permissions verified

| Action | Cashier |
| --- | --- |
| `sales.view` / print | allowed |
| `sales.create` / `sales.post` | allowed |
| POS payment-account list | allowed via `sales.create` |
| `sales.cancel` | denied |
| Store Keeper print | denied (`sales.view` N) |

## Printer / UAT checklist (manual)

Roadmap requires a practical printer UAT artifact. Use a posted invoice on `/app/sales/:id/print`:

1. Select **58mm**, Print → browser dialog → OS USB or LAN thermal (58mm paper). Confirm width, wrapping, totals, no POS chrome.
2. Select **80mm**, Print → 80mm thermal. Confirm line items and payments.
3. Select **A4**, Print → A4/letter. Confirm table layout and invoice number.
4. Reprint after renaming the product in catalog: printed name must remain the posted snapshot.
5. User without `sales.view` must not reach a printable invoice.
6. Org B session must not open Org A invoice.
7. Cancelled invoice prints with cancelled marking; original invoice number unchanged.
8. Confirm no silent print and no cash-drawer kick.

Layout variance across browsers/printers remains the Frozen risk for this item.

## Validation

* `f06-p4.spec.js` — snapshot immutability, 58/80/A4 payload, print permission, tenant isolation, cashier cash post, cashier cancel deny, POS accounts, stock qty after cashier post, no foreign persistence imports
* Angular: `sale-print.page.spec.ts`, `sale-edit.page.spec.ts`, `sales.page.spec.ts`, `app.routes.spec.ts`
* Playwright `f06-p4-sales.e2e.spec.ts` — cashier walk-in cash, invoice number, 58/80/A4 print, registered partial payment, owner approval retry
* No new Mongo integration suite (presentation/read wiring; P1–P3 Mongo proofs reused)

## Final gates (2026-08-13, once after P4 complete)

| Command | Result |
| --- | --- |
| `npm run lint` | passed (pre-existing warnings only) |
| `npm run typecheck` | passed |
| `npm run test:architecture` | passed (3 tests) |
| `npm run build` | passed |
| `npm run test:unit` | passed (65 files / 190 tests) |
| `npm run e2e` | passed (15 Playwright tests, 3.7m) |

## F06 exit-gate evaluation

Roadmap exit: *Sale posts atomically; duplicate retries cannot duplicate invoices; stock, COGS, receivable, payment, and account effects reconcile; critical cashier workflow passes E2E tests.*

| Exit criterion | Evidence | Status |
| --- | --- | --- |
| Sale posts atomically | F06 P2 posting engine + P4 cashier post | Implementation complete |
| Duplicate retries cannot duplicate invoices | P2 idempotency + P4 in-flight disable / key reuse | Implementation complete |
| Stock / COGS / AR / payment / account reconcile | P2–P3 Mongo + P4 HTTP stock `96.0000` after two qty-2 sales | Implementation complete; P4 did not add a new Mongo suite |
| Critical cashier E2E | `f06-p4-sales.e2e.spec.ts` + full E2E 15 passed | Local green |
| All F06 work items (R1-F06-001–011) | P1–P4 task records | ST-G01 implementation complete |

ST-G02 architecture suite green. ST-G03 no known Critical/High defects from P4. ST-G06 cashier E2E green. ST-G07 no native/offline/F07/F08 expansion. ST-G08 this report.

**Stage exit ready pending acceptance** (same pattern as F04/F05). Residual: PRD “final invoice fields” still unresolved; print layout variance across browsers/printers; cashiers tender via `GET /sales/payment-accounts` (`sales.create`) because Frozen cashier bundle lacks `accounts.view`.

## Next

* F07 Returns, Corrections, Accounts, and Expenses after F06 exit-gate acceptance
