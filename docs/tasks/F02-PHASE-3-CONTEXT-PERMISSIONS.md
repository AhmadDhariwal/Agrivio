# F02 Phase 3 — Active Context and Permission Enforcement

## Task Status

* Status: Complete
* Completion date: 2026-08-08
* Work items: `R1-F02-007`, `R1-F02-008`
* Backend convention: Express 5 + JavaScript CommonJS (`require` / `module.exports`)
* Next phase: **F02 Phase 4** (branch/warehouse assignment enforcement foundation — roadmap `R1-F02-009`+)

## Scope Delivered

* Authenticated active-context selection for platform and organization memberships
* Optional branch/warehouse selection within assigned scope (Owner treated as organization-wide)
* Session+CSRF rotation on context switch; security-relevant switch audited
* Active membership revalidated on every authenticated resolve (revoked/disabled → `401`)
* Unauthorized context/branch/warehouse/cross-tenant selection → `403`
* Frozen 81-permission catalog and role-bundle resolution with default-deny for unknown codes
* Permission middleware (`requirePermission`) and organization-context gate
* Sample protected route `GET /api/v1/organization` enforcing `organization.view`
* Super Admin platform permissions only in platform context; restore remains non-automatic
* Request auth context attached for downstream modules (`req.authContext` / `req.requestContext`)
* Angular `/context` switcher plus `AuthSessionStore` reactive active-context exposure
* Existing onboarding, sessions, CSRF, and password-reset behaviour preserved

## Consolidation note

* `modules/platform` retains Super Admin actor middleware only — not a duplicate of `src/platform`
* `modules/audit` retains the Mongoose `audit_events` model; `platform/audit` retains the writer
* `access_assignments` model lives under Locations ownership for fixture-backed context scope

## Docker-dependent verification

MongoDB replica-set proofs for `auth_sessions` / `access_assignments` TTL/index behaviour remain pending and do not block this phase.

## Validation

| Suite | Result |
| --- | --- |
| Backend focused (context/permissions) | passed |
| Frontend unit | passed |
| Backend lint | passed |
| Frontend lint | passed |
| Typecheck | passed |
| Architecture | passed |
| Unit gate (`nx run-many -t test --all`) | passed |
| Build | passed |
| Full `pnpm check` format step | blocked by pre-existing Prettier drift across ~116 unrelated files |

Focused coverage lives in:

* `apps/backend/src/modules/identity/auth.context-permissions.spec.js`
* `apps/backend/src/modules/identity/role-permissions.spec.js`
* `apps/frontend/src/app/features/auth/auth-session.store.spec.ts`
* `apps/frontend/src/app/features/auth/context-switcher.page.spec.ts`
