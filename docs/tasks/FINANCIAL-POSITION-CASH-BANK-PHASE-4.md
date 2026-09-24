# Financial Position and Cash / Bank Reporting — Phase 4

## Task status

* Status: **Backend implementation complete**
* Date: 2026-09-24
* Scope: read-only financial position, cash/bank/treasury reporting, manual-adjustment reporting, and on-demand reconciliation diagnostics
* Non-goals: general ledger, balance sheet, P&L redefinition, financial mutation, inventory mutation, and frontend workflows

## Existing architecture reused

* The existing fixed-report framework remains authoritative: `/api/v1/reports/:reportKey`, the report catalog/filter parser, Reports capability controls, `reports.view`, and the existing PDF/Excel/CSV renderer.
* `account_movements` remains the only account-balance source. Account balances are bulk-derived from signed posted movements; there is no mutable account balance and no reporting ledger.
* `ledger_effects` remains authoritative for customer receivable/loan/advance and supplier payable/advance balances. Phase 4 calls the existing bulk balance methods.
* Customer loans, supplier refunds, and customer/supplier balance adjustments remain owned by their Phase 2/3 modules. Reporting consumes new tenant-scoped read methods from those owners.
* Dashboard aggregation is extended only with current liquid-fund summary fields. Full report and reconciliation payloads stay outside Dashboard.

## Report definitions and frontend handoff

All report routes are `GET /api/v1/reports/:reportKey`, require organization context plus `reports.view`, use existing suspended-read/report capability policy, and return no financial writes.

| Report key | Definition |
| --- | --- |
| `financial-position` | Current liquid, customer, and supplier positions |
| `daily-cash-position` | Opening liquid plus external/manual flows and adjustments equals closing liquid; transfers are separate |
| `account-statement` | One account; opening, paginated movements, inflow/outflow, net, closing, running balance |
| `cash-book` | Account Statement logic restricted to actual `cash` accounts |
| `bank-book` | Account Statement logic restricted to actual `bank` accounts; wallets are excluded |
| `account-transfers` | One row per transfer `sourceId`, with paired-leg integrity and reversal state |
| `treasury-movements` | Paginated, human-readable account movement history and unclassified net movement |
| `manual-adjustments` | Account, customer trade/advance/loan, and supplier payable/advance corrections plus reversals |
| `customer-loans` | Phase 2 paginated loan read with principal/repaid/outstanding/due/account/status |
| `supplier-refunds` | Phase 3 paginated refunds; refunds are inflows but never revenue |
| `financial-reconciliation` | Explicit diagnostic endpoint; never mutates or auto-fixes data |

Standard large-report metadata is `page`, `pageSize`, `total`, and `totalPages`; `pageSize` is capped at 100. The catalog exposes applicable filters. The existing exporter now infers columns for new datasets and renders money/entity objects as readable cells rather than `[object Object]`.

## Formulas and classification

* `Total Liquid Funds = active cash + active bank + active JazzCash/Easypaisa (Other Liquid)`.
* `Net Trade Exposure = Trade Receivable - Customer Advance`.
* `Total Customer Exposure = Trade Receivable + Customer Loan Receivable - Customer Advance`.
* `Net Supplier Payable = Supplier Payable - Supplier Advance`.
* Daily position: `Opening + Business Inflow - Business Outflow + Manual Inflow - Manual Outflow +/- Adjustments = Closing`.
* Transfer legs and transfer-reversal legs are visible in an account statement but excluded from organization external flow. Their required organization net is zero; transfer volume counts one outbound leg, not both legs.
* `Unclassified` means only Phase 1 manual movements whose stored category is `unclassified`. The report exposes inflow, outflow, and net movement; it does not call the value revenue or claim current-fund provenance.
* Supplier refunds and loan repayments are treasury inflows, not revenue. Loan disbursement is a treasury outflow, not an expense. Balance adjustments are not P&L.
* Known source types have user-facing labels. Unknown valid posted types remain in the report as Other External Inflow/Outflow according to signed direction.

## Date semantics

Business-period reports use stored `businessDate` when present. Legacy movements with no business date use the UTC date portion of `postedAt`, returned with `dateSource=postedAt_fallback`. Stored `YYYY-MM-DD` values are compared as date-only strings and are never timezone-shifted. Audit chronology preserves the original `postedAt` timestamp.

## Reconciliation behavior

The on-demand report checks negative customer/supplier advance balances and original/reversal transfer leg count plus zero-net pairing. Findings contain code, severity, domain, expected, actual, difference, reference, and remediation guidance. No data is changed.

Customer trade-target, supplier payable-target, and broad source-lineage checks are explicitly returned as `Not Checked` when the current owner APIs cannot perform a bulk organization-level comparison without N+1 reads. They are not presented as green. Existing per-party supplier reconciliation remains authoritative for supplier workflow operations. A future bulk owner-module query can fill these checks without changing the report contract.

## Query and index review

* Account lists already use one grouped balance aggregation; Phase 4 uses one tenant-scoped movement read per report rather than one read per account.
* Customer/supplier positions and loan balances use existing grouped ledger helpers; loan and refund reports use owner-module pagination.
* Added only query-backed, organization-leading indexes: account movement report date, loan due date, customer/supplier adjustment business date, and supplier refund account/status/business date.
* No `syncIndexes()`, new collection, denormalized balance, or speculative field was added.
* Model checklist: ownership, tenant scope, lifecycle, fields, transaction semantics, and API DTOs are unchanged; additions are backward-compatible indexes only. Real-Mongo suites prove existing transactional behavior remains intact.

## Write/non-impact proof

Report services expose only read methods. Tests assert bulk reads and cover transfer exclusion, statement equations, pagination, adjustment merging, incomplete transfer diagnostics, and exporter behavior. No report code calls movement posting, ledger posting, payment allocation, stock movement, WAC, batch, expense, revenue, or audit mutation APIs.

## Dashboard changes

The existing account summary adds `otherLiquidBalances` and `totalLiquidFunds`. Existing customer/supplier cards remain ledger-derived. Dashboard does not run the reconciliation report.

## Validation

* Focused Phase 4 + Phase 1–3 finance tests: **32 passed**.
* Existing reporting/capability compatibility selection: **20 passed**.
* Real-Mongo Accounts: **2 passed**.
* Real-Mongo Customer Finance: **2 passed**.
* Real-Mongo Supplier Finance: **4 passed**.
* Architecture boundary gate: **6 passed**.
* Repository lint: pass.
* Backend production build: pass.
* `git diff --check`: pass (line-ending notices only).
* Full repository regression was not run, per assignment.

## Remaining risk

The current report data read is bulk and avoids per-account N+1 queries, but organization-wide movement datasets are materialized before response pagination. The new organization/date index bounds dated reports; a future scale phase should move statement/treasury row pagination and running-balance windows fully into Mongo aggregation without changing transport semantics. The three reconciliation checks described above remain factual `Not Checked` until bulk owner-module target/lineage readers exist.
