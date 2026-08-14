# F09 Phase 2 — Security, permission matrix, performance, accessibility

## Task Status

* Status: **Complete** (implementation)
* Date: 2026-08-14
* Work items: `R1-F09-002`, `R1-F09-003`, `R1-F09-004`

## Scope Delivered

* Attack-style cross-tenant catalog/customer isolation, CSRF on mutations, Cashier cannot manage catalog or view purchases.
* Production auth throttle recorded as **20 attempts / 15 minutes** (existing coded default; test env still raises the ceiling).
* Frozen 81-permission matrix vs role bundles; route/service coverage; HTTP deny/allow for Owner / Cashier / StoreKeeper.
* `payments.correct`, `platform.organizations.create`, and `platform.organizations.suspend` remain catalogued without dedicated routes (onboarding uses activation requests; org operational suspend is subscription lifecycle; no generic payment correction).
* Planning performance baseline: 250 in-memory products listed under 2s.
* Accessibility: document language, labeled login, skip link, main landmark, password visibility name.

## Out of scope

* External penetration-test vendor procurement.
* Final SLA contracts.
