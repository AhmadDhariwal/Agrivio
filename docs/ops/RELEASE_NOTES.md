# Agrivio Release 1 notes

**Status: preparatory draft.** Operational contacts are not named. This is not R1-F09-008 completion.

Release candidate: F00–F08 scoped functionality plus F09 Phase 1 regression consolidation (`R1-F09-001`). F09 P2–P5 Frozen DoD is not accepted.

## Included capabilities

* Organization onboarding, Owner activation, sessions, permissions, subscriptions, and manual billing
* Organization setup: branches, warehouses, employees, catalog, customers, suppliers, accounts, openings
* Inventory (WAC, FEFO/FIFO, adjustments, transfers, reconciliation)
* Purchases, supplier payments, purchase returns/cancellation
* Sales, POS printing (58 mm / 80 mm / A4), customer payments, sale cancellation/approvals
* Sales returns, account transactions, expenses
* Alerts, dashboard, fixed reports and exports, Excel imports, audit inquiry, backup/restore status

## Known limitations

* No generic correction endpoint; posted money/stock is reversed through Frozen workflows
* Super Admin default bundle does not include `operations.restore.execute`
* Restore API coordinates recovery; it does not execute production database restore
* Exact production hosting, backup vendor, and monitoring provider are not selected in-repo
* Performance numbers in F09 are planning baselines, not contracted SLAs

## Operational contacts

Assign named owners before production cutover (support, security, backup, restore, release). Until assigned, the primary engineer and product reviewer remain the interim contacts recorded in delivery planning.
