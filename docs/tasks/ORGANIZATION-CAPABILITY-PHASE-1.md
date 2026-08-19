# Organization Capability & UI Policy — Phase 1

Status: Implementation complete; repository-level validation exceptions recorded below  
Scope: Generic platform foundation plus Products reference integration only  
Completed: 2026-08-19

## Implemented

- Backend-owned semantic registry for `MODULE`, `FEATURE`, `VIEW`, `FIELD`, `WIDGET`, and `ACTION` controls. Unknown keys and non-configurable modes are rejected.
- One organization-scoped policy document with sparse overrides, monotonic optimistic versioning, and per-control audit events.
- Most-restrictive effective resolver across defaults, organization overrides, parent/dependency state, subscription access, and RBAC permissions.
- Authenticated effective-capability endpoint and Super Admin-only registry, policy, reset, and history operations.
- Organization Controls page in the existing platform UI with organization context, search, default/override/effective values, staged diff, reason, reset controls, confirmation, and version-safe save.
- Products navigation, routes, table/desktop cards, responsive cards, fields, KPI widgets, lifecycle actions, pricing, forms, and backend mutations wired to policy. Responsive phone cards remain an internal required renderer.
- Stable policy denial codes: `ORG_CAPABILITY_DISABLED`, `ORG_ACTION_NOT_ALLOWED`, and `ORG_FIELD_NOT_EDITABLE`.

No capability controls were added for later Agrivio modules.

## Products registry safety decisions

- `inventory` is a non-configurable parent boundary; inventory-wide policy is later scope.
- Products table view is a non-configurable desktop fallback.
- Responsive mobile cards are not a commercial/configurable control; only the user-selectable desktop card view can be disabled.
- Product name, category, and tracking-mode visibility remain enabled because they are required for a valid catalog workflow; their existing-record editability is configurable.
- Base unit and measurement dimension visibility/editability remain non-configurable because stock and transaction history may reference them.
- Lifecycle status is non-configurable and read-only as a field; deactivate/reactivate actions control status changes and retain existing lifecycle rules.
- Required fields remain collectable during initial creation. Field editability policy applies to later Product mutations; the separate Create action controls whether creation is available.

## Model review checklist outcome

| Check | Outcome |
| --- | --- |
| Ownership | `organization_capability_policies` is owned by the capability module under `persistence/`; Audit is used only through the shared writer. |
| Fields/utilization | Only organization id, monotonic version, sparse overrides, updater, and timestamps are persisted; every field is used. |
| Validation | Service validation is authoritative; schema validation is supplementary. Unknown keys/modes, duplicate changes, extra fields, invalid booleans, and stale versions fail closed. |
| Relationships/tenancy | `organizationId` references Organization and leads every policy query/update. Super Admin policy routes verify the target organization. |
| Lifecycle | No speculative policy lifecycle/status field was added. Reset is represented by removing sparse overrides while preserving version history. |
| Versioning | Every material policy change increments `version`; update filters include `organizationId + expectedVersion`. |
| Indexes | A unique organization-leading index enforces one document per organization. No speculative search indexes were added. |
| Security/API | No secrets are stored. Transport responses are explicit effective/registry shapes and do not expose Mongoose documents. |
| Frontend | Feature-local capability models and data access are used; no Mongo schema is copied into shared frontend state. |
| Audit/transactions | Policy write and one audit event per changed control share the transaction runner. Audit records actor, organization, control key, before/after override, versions, and optional reason. |
| Evolution | Backward-compatible additive collection; no backfill or migration is required because absence of a policy resolves to current behavior. |
| Real Mongo | Isolated `agrivio_test_capabilities_*` database proved the unique index and persisted version/override metadata on local `rs0`. |

## Validation

- Focused capability resolver/authorization/catalog regression: passed (3 files, 9 tests).
- Real Mongo capability persistence: passed (1 file, 1 test).
- Frontend: passed (76 files, 141 tests).
- Repository typecheck: passed (4 projects).
- Architecture boundary gate: passed (6 tests).
- Changed-file lint: passed with no errors (two pre-existing Product non-null-assertion warnings remain).
- Complete backend target: passed (101 files, 333 tests), including the corrected endpoint-permission inventory.
- Repository lint remains blocked by pre-existing errors in files outside this task (`auth-error.interceptor.spec.ts`, `navbar-search.component.html`, `user-profile-menu.component.html`, and `employees.store.js`).
- Production build compiles the capability and Organization Controls chunks but remains blocked by the unchanged pre-existing Products stylesheet budget (20.48 kB against an 8 kB error limit).
- Lightweight visual browser verification could not run because the local browser-control runtime rejected its trusted plugin path; automated component/template/build coverage completed instead.

## Remaining risk

Authenticated cross-organization visual verification should be completed once the local browser-control runtime is available. Foundation + Products are complete; later modules are intentionally not configurable.
