# F02 Phase 4 — Identity Foundation Closure and Assignment Enforcement

## Task Status

* Status: Complete
* Completion date: 2026-08-08
* Branch: `task/R1-F02-P4`
* Work items: `R1-F02-001` (verified), `R1-F02-002` (verified + Owner-presence hooks), `R1-F02-009` (implemented)
* Backend convention: Express 5 + JavaScript CommonJS (`require` / `module.exports`)
* Next phase: **F02 Phase 5** (plans/subscription records — roadmap `R1-F02-010`+)

## R1-F02-001 verification

Definition of Done: users can be persisted and authenticated against hashed credentials.

Evidence (no rewrite required):

* `users` model with `emailNormalized`, `passwordHash`, status lifecycle
* Argon2id hash/verify + password policy in `password.service.js`
* Login/activation/reset authenticate against hashes only
* Password redaction in logging
* Unit coverage in `password.service.spec.js` and session auth specs

Residual: Mongo repository/index proofs remain Docker-dependent and pending.

## R1-F02-002 verification

Definition of Done: memberships resolve effective permissions per frozen role bundles.

Evidence:

* `organization_memberships` with `role`, `conditionalPermissionGrants`, `status`
* Frozen 81-permission catalog + role matrix in `role-permissions.js`
* Platform vs organization permission separation
* Expanded unit coverage for Owner/Manager/Cashier/StoreKeeper/Super Admin

Gap closed in this phase:

* Owner-presence invariant hooks prepared in `owner-presence.js` (BR-ORG-003 / SECURITY §9.0) for later membership mutation transactions

## R1-F02-009 delivered

* Shared assignment enforcement helpers in `assignment-scope.js`
* Middleware: `requireBranchAccess`, `requireWarehouseAccess` composed with `requirePermission`
* Auth context carries `branchAssignments` / `warehouseAssignments`
* Session context selection reuses the same assignment rules
* Owner organization-wide access preserved
* Client-supplied branch/warehouse never grants access
* Canonical `access_assignments` collection retained (Locations-owned model)
* Angular assignment-aware selector helpers ready for F03 (`assignment-scope.util.ts` + `AuthSessionStore` filters)
* No F03 branch/warehouse CRUD

## Validation

| Suite | Result |
| --- | --- |
| Focused assignment/owner/role/password/context tests | passed |
| Frontend unit | passed (10 files / 13 tests) |
| Lint | passed |
| Typecheck | passed |
| Architecture | passed |
| Unit gate (`nx run-many -t test --all`) | passed (backend 22 files / 69 tests after Argon2 timeout buffer) |
| Build | passed (prior gate run) |
| Full `pnpm check` format step | skipped (known unrelated CRLF/Prettier drift) |

Argon2-heavy specs use a 20s timeout to avoid parallel-load flakes under the full suite.

Focused coverage:

* `assignment-scope.spec.js`
* `owner-presence.spec.js`
* `role-permissions.spec.js`
* `password.service.spec.js`
* `auth.context-permissions.spec.js`
* `assignment-scope.util.spec.ts`
* `auth-session.store.spec.ts`

## Docker-dependent verification

Mongo replica-set proofs for `users` / `organization_memberships` / `access_assignments` indexes and TTL behaviour remain pending and do not block this phase.

## Cleanup

* No invented assignment collections
* No `@ts-check` / JSDoc typing added
* Repo-wide CRLF/Prettier drift intentionally not fixed in this phase
