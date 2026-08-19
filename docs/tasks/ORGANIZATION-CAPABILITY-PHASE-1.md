# Organization Capability & UI Policy — Phase 1

Status: Implementation complete; repository-level validation exceptions recorded below  
Scope: Generic platform foundation plus Products and Categories reference integrations
Completed: 2026-08-19

## Implemented

- Backend-owned semantic registry for `MODULE`, `FEATURE`, `VIEW`, `FIELD`, `WIDGET`, and `ACTION` controls. Unknown keys and non-configurable modes are rejected.
- One organization-scoped policy document with sparse overrides, monotonic optimistic versioning, and per-control audit events.
- Most-restrictive effective resolver across defaults, organization overrides, parent/dependency state, subscription access, and RBAC permissions.
- Authenticated effective-capability endpoint and Super Admin-only registry, policy, reset, and history operations.
- Organization Controls page in the existing platform UI with organization context, module navigation, business-readable default/override/effective values, risk labels, staged diff, critical impact confirmation, reason, real reset operations, and version-safe save.
- Products navigation, routes, table/desktop cards, responsive cards, fields, KPI widgets, lifecycle actions, pricing, forms, and backend mutations wired to policy. Responsive phone cards remain an internal required renderer.
- Categories registered as reference module #2 with module, desktop-card view, Category fields, derived tracking display, Total Categories widget, and create/inspect/edit/deactivate/reactivate/delete actions. Angular navigation/routes/screens and Category APIs enforce the effective policy; responsive phone cards and the underlying product-class tracking rule remain platform enforced.
- Individual, module, and organization reset operations remove sparse overrides through the transactional backend endpoints, increment policy versions on material changes, emit per-control audit evidence, re-resolve effective policy, and refresh the Super Admin UI.
- Stable policy denial codes: `ORG_CAPABILITY_DISABLED`, `ORG_ACTION_NOT_ALLOWED`, and `ORG_FIELD_NOT_EDITABLE`.

No capability controls were added for Inventory/Warehouses or later Agrivio modules.

## Products registry safety decisions

- `inventory` is a non-configurable parent boundary; inventory-wide policy is later scope.
- Products table view is a non-configurable desktop fallback.
- Responsive mobile cards are not a commercial/configurable control; only the user-selectable desktop card view can be disabled.
- Product name, category, and tracking-mode visibility remain enabled because they are required for a valid catalog workflow; their existing-record editability is configurable.
- Base unit and measurement dimension visibility/editability remain non-configurable because stock and transaction history may reference them.
- Lifecycle status is non-configurable and read-only as a field; deactivate/reactivate actions control status changes and retain existing lifecycle rules.
- Required fields remain collectable during initial creation. Field editability policy applies to later Product mutations; the separate Create action controls whether creation is available.

## Categories registry safety decisions

- `inventory.categories` is a critical organization control. Disabling it blocks Category navigation, direct routes, and Category API operations for the selected organization without deleting records.
- Only the user-selectable desktop/tablet card view is configurable. Responsive phone cards remain a platform-enforced renderer.
- Category name and product-class visibility/editability are configurable for existing-record presentation and mutation. Required creation values remain collectable when the Create action is allowed.
- Lifecycle status visibility is configurable, but status editability is platform enforced; deactivate/reactivate actions retain the existing lifecycle rules.
- The tracking-requirement display is configurable presentation only. Its underlying product-class-derived tracking rule is not registered and cannot be overridden.
- Category deletion policy can block the action but cannot bypass existing record-in-use protection.

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

- Focused backend capability resolver/routes: passed (2 files, 12 tests).
- Real Mongo capability persistence: passed (1 file, 1 test).
- Focused Organization Controls/Categories Angular coverage: passed (4 files, 17 tests).
- Complete frontend: passed (76 files, 154 tests).
- Complete backend: passed (101 files, 337 tests).
- Repository typecheck: passed (4 projects).
- Architecture boundary gate: passed (6 tests).
- Changed-file lint: passed with no errors (non-null-assertion warnings remain in existing Category test/form patterns).
- Repository lint remains blocked by pre-existing errors in files outside this task (`auth-error.interceptor.spec.ts`, `navbar-search.component.html`, `user-profile-menu.component.html`, and `employees.store.js`).
- Production build compiles the capability, Organization Controls, Categories, and Category form chunks. It remains blocked by unchanged pre-existing stylesheet budgets for Products (20.48 kB) and Categories (18.77 kB) against the 8 kB error limit; Organization Controls is 5.16 kB and below the error budget.
- Lightweight visual browser verification could not run because the local browser-control runtime rejected its trusted plugin path before page interaction; automated Angular template compilation and component coverage completed instead.

## Remaining risk

Authenticated cross-organization visual verification should be completed once the local browser-control runtime is available. Foundation + Products + Categories are complete; Inventory/Warehouses and later modules are intentionally not configurable.
