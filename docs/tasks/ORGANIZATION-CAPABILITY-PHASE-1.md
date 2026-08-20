# Organization Capability & UI Policy — Phase 1

Status: Implementation complete; lightweight authenticated browser review remains environment-dependent
Scope: Generic platform foundation plus Products, Categories, Inventory / Stock-on-Hand, and Opening Stock integrations
Completed: 2026-08-20

## Implemented

- Backend-owned semantic registry for `MODULE`, `FEATURE`, `VIEW`, `FIELD`, `WIDGET`, and `ACTION` controls. Unknown keys and non-configurable modes are rejected.
- One organization-scoped policy document with sparse overrides, monotonic optimistic versioning, and per-control audit events.
- Most-restrictive effective resolver across defaults, organization overrides, parent/dependency state, subscription access, and RBAC permissions.
- Authenticated effective-capability endpoint and Super Admin-only registry, policy, reset, and history operations.
- Organization Controls page in the existing platform UI with organization context, module navigation, business-readable default/override/effective values, risk labels, staged diff, critical impact confirmation, reason, real reset operations, and version-safe save.
- Products navigation, routes, table/desktop cards, responsive cards, fields, KPI widgets, lifecycle actions, pricing, forms, and backend mutations wired to policy. Responsive phone cards remain an internal required renderer.
- Categories registered as reference module #2 with module, desktop-card view, Category fields, derived tracking display, Total Categories widget, and create/inspect/edit/deactivate/reactivate/delete actions. Angular navigation/routes/screens and Category APIs enforce the effective policy; responsive phone cards and the underlying product-class tracking rule remain platform enforced.
- Inventory / Stock on Hand registered as module #3 with module access, desktop cards, the four implemented KPI widgets, search/warehouse/product filters, safe field visibility, inspector sections, and Inspect Stock. The same registry-driven Super Admin renderer, staged changes, policy versioning, reset APIs, resolver, and audit path are reused.
- Stock-on-Hand navigation, direct routes, table, desktop/mobile cards, and inspector resolve the same organization policy. Balance inquiry is blocked backend-side when the module is disabled; Batches, Expiry, Adjustments, Transfers, Reconciliation, and Movements remain under their existing RBAC/subscription rules pending their own capability integrations.
- Opening Stock owns the separate `inventory.openingStock` namespace. Its critical module switch, optional module information and product search, safe Packaging Unit and Manufacturing Date presentation, Post action, and View Stock action reuse the same registry, resolver, sparse policy, reset, version, audit, Angular service, guard, navigation filter, and generic Super Admin renderer.
- Warehouse, Product, Quantity, Opening Inventory Value, and conditionally required Batch / Expiry appear as required platform-enforced workflow controls. Product tracking rules and all existing posting, WAC, valuation, batch/expiry, warehouse, transaction, RBAC, and subscription validation remain authoritative.
- Disabling Opening Stock hides tenant navigation, sends direct tenant routes to the shared unavailable state, removes the Stock-on-Hand posting link, and blocks posting through both module and Post-action backend middleware. Platform Super Admin policy routes remain outside tenant capability enforcement so the module can be re-enabled.
- Individual, module, and organization reset operations remove sparse overrides through the transactional backend endpoints, increment policy versions on material changes, emit per-control audit evidence, re-resolve effective policy, and refresh the Super Admin UI.
- Stable policy denial codes: `ORG_CAPABILITY_DISABLED`, `ORG_ACTION_NOT_ALLOWED`, and `ORG_FIELD_NOT_EDITABLE`.

No capability controls were added for Warehouses, Batches, Expiry inquiry, Adjustments, Transfers, Reconciliation, or Stock Movements.

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

## Inventory / Stock-on-Hand registry safety decisions

- `inventory.stock` is a configurable critical control. Disabling it hides Stock on Hand, routes direct access to the existing unavailable state, and rejects balance inquiry for only the target organization without deleting data or changing posting/integrity behavior.
- Product identity and Quantity (Base) visibility are platform enforced because hiding either would make the inquiry operationally meaningless. No stock-state editability modes were registered.
- Warehouse, Batch, WAC, Inventory Value, and Status are configurable presentation fields. WAC and Inventory Value can be hidden consistently from table, cards, and inspector without changing calculations or API data.
- The four registered widgets are exactly Stock Records, Active Warehouses, Catalog Products, and Expiring / Expired. The KPI region is removed when none remain effective.
- Desktop cards are configurable; responsive phone cards remain a required internal renderer. Search, Warehouse Filter, and Product Filter control UI presence only and do not change backend filtering or tenant isolation.
- Inspector Identity and Quantity sections are platform enforced. Valuation and Tracking sections are configurable, and empty valuation presentation is removed when WAC and Inventory Value are both hidden.
- Inspect Stock is the only Stock-on-Hand-owned action registered. Cross-module links were intentionally not duplicated as Stock capabilities.

## Opening Stock registry safety decisions

- `inventory.openingStock` is independent from `inventory.stock`. Its critical switch controls only tenant Opening Stock access and posting; existing inventory and historical transactions are unchanged.
- Module Information and Find Product Search are optional UI helpers. The required Product selector remains available when helper search is hidden.
- Packaging Unit is optional because omission already resolves through the product base unit. Manufacturing Date is optional under existing validation. Hiding either removes only its presentation and does not weaken transaction rules.
- Warehouse, Product, Quantity, Opening Inventory Value, and Batch / Expiry are registered as non-configurable, platform-enforced requirements. Batch and expiry remain conditionally required by the selected product tracking mode; no organization override exists for those rules.
- `inventory.openingStock.actions.post` is enforced in Angular and backend middleware after existing RBAC/subscription checks and before posting. `inventory.openingStock.actions.viewStock` controls only its Opening Stock-owned navigation affordance.
- Individual reset removes one sparse override. Module reset matches only definitions whose `moduleKey` is `inventory.openingStock`, preserving Stock-on-Hand, Products, Categories, and every other module override while incrementing the policy version and emitting the existing per-control audit event.

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

- Focused backend capability resolver/routes, including Stock balance-route enforcement: passed (3 files, 18 tests).
- Real Mongo capability persistence: passed (1 file, 1 test).
- Focused Organization Controls, Stock Inquiry, and navigation Angular coverage: passed through the frontend project test target.
- Complete frontend target: passed.
- Complete backend target: passed.
- Repository typecheck: passed (4 projects).
- Architecture boundary gate: passed (6 tests).
- Repository lint plus changed-file formatting: passed with no errors.
- Repository production build and development frontend build: passed, including Angular template compilation for Organization Controls and Stock Inquiry.
- Opening Stock focused backend capability resolver, tenant isolation, scoped reset/audit/version, re-enable, and route enforcement: passed (2 files, 22 tests).
- Opening Stock, Stock-on-Hand cross-link, Organization Controls, navigation, and routing Angular coverage: passed (5 files, 44 tests across focused runs).
- Frontend and API-contract typecheck: passed. Changed-file ESLint: passed with no errors (three pre-existing Stock Inquiry spec warnings); project-wide lint remains blocked by unrelated pre-existing errors outside this task.
- Final frontend/backend production build: passed, including Angular template compilation for Opening Stock and Organization Controls.
- Lightweight browser review could not start because the installed browser-control runtime referenced a missing bundled browser service before connecting to the local app. No substitute browser mechanism was used; component and template coverage passed.

## Remaining risk

Authenticated cross-organization browser smoke remains outstanding; focused component, route, policy, persistence-boundary, and build validation passed. Foundation + Products + Categories + Stock on Hand + Opening Stock are complete; Warehouses and later Inventory submodules are intentionally not configurable.
