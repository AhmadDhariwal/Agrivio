# F03 Phase 1 — Organization Settings, Branches, Warehouses, Employees

## Task Status

* Status: **Complete**
* Date: 2026-08-10
* Work items: `R1-F03-001`, `R1-F03-002`, `R1-F03-003`, `R1-F03-004`
* Does **not** implement `R1-F03-005` onward

## Scope Delivered

### R1-F03-001 — Organization settings

* `GET/PATCH /api/v1/settings` for residual `organization_settings`
* `PATCH /api/v1/organization` for profile name/timezone (Organizations-owned)
* Version concurrency + `VERSION_CONFLICT`
* Audit on sensitive settings updates
* Angular `features/organization/pages/organization-settings/`

### R1-F03-002 — Branches

* Branch CRUD with invoice prefix, status `active|inactive`, uniqueness indexes
* Plan limit key `branches` on create
* Angular branches list + form

### R1-F03-003 — Warehouses

* Warehouse CRUD (org-scoped, multi-warehouse capable)
* Plan limit key `warehouses` on create
* Angular warehouses list + form
* No stock/transfer/Inventory Engine behavior

### R1-F03-004 — Employees and access

* `GET/POST/PATCH /api/v1/users`, `POST .../deactivate`, `PUT .../access-assignments`
* Predefined roles only; Super Admin blocked
* Owner-presence invariant; session revoke on access changes
* Employee activation via hashed one-time token + existing `/activate`
* Angular employees list + form with branch/warehouse assignments

## Backend modules

```text
modules/settings/
modules/locations/   # branches, warehouses, access assignment replace
modules/identity/    # employees service/routes + activation reuse
```

## Angular features

```text
features/organization/
features/branches-warehouses/
features/users-access/
```

## Validation

Commands run:

```text
npm run lint                 # pass
npm run typecheck            # pass
npm run test:unit            # pass (includes F03 setup security suite + Angular page specs)
npm run test:architecture    # pass
npm run build                # pass
npm run test:integration     # pass (test-support replica-set + F03 Mongo index proof)
npm run e2e -- apps/frontend/tests/e2e/f03-setup.e2e.spec.ts  # pass
```

Focused coverage:

* `apps/backend/src/modules/settings/f03-setup.spec.js` — tenant isolation, permissions, version conflict, Super Admin block, Owner invariant path
* `apps/backend/src/modules/locations/f03-mongo.integration.spec.js` — real Mongo unique indexes on isolated DB
* Angular page specs for settings/branches/warehouses/employees forms
* Playwright `f03-setup.e2e.spec.ts` — Owner settings → branch → warehouse → employee activation handoff

## Next

* F03 P2 (`R1-F03-005`+) after this phase is accepted

## API/cache hardening follow-up (2026-08-30)

Organization profile/settings, branch/warehouse list/detail/options, and employee/access reads now use organization-scoped exact-query caching. Successful scoped mutations invalidate only their read families and derived setup progress. Location selectors use complete `/branches/options` and `/warehouses/options` read models, including selected inactive-value hydration, instead of capped list preloads.
