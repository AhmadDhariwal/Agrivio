# Organization Capability & UI Policy — Phase 1

Status: Implementation complete; lightweight authenticated browser review remains environment-dependent
Scope: Generic platform foundation plus completed capability integrations through Stock Movements, Accounts, Reports, Alerts, Purchases, Supplier Payments, Supplier Ledger, Sales, Customer Payments, Dashboard, Branches, Warehouses, Billing, Organization Setup, and Organization Settings
Completed: 2026-08-29

## Implemented

- Backend-owned semantic registry for `MODULE`, `FEATURE`, `VIEW`, `FIELD`, `WIDGET`, and `ACTION` controls. Unknown keys and non-configurable modes are rejected.
- One organization-scoped policy document with sparse overrides, monotonic optimistic versioning, and per-control audit events.
- Most-restrictive effective resolver across defaults, organization overrides, parent/dependency state, subscription access, and RBAC permissions.
- Authenticated effective-capability endpoint and Super Admin-only registry, policy, reset, and history operations.
- Organization Controls page in the existing platform UI with organization context, module navigation, business-readable default/override/effective values, risk labels, staged diff, critical impact confirmation, reason, real reset operations, and version-safe save.
- Products navigation, routes, table/desktop cards, responsive cards, fields, KPI widgets, lifecycle actions, pricing, forms, and backend mutations wired to policy. Responsive phone cards remain an internal required renderer.
- Categories registered as reference module #2 with module, desktop-card view, Category fields, derived tracking display, Total Categories widget, and create/inspect/edit/deactivate/reactivate/delete actions. Angular navigation/routes/screens and Category APIs enforce the effective policy; responsive phone cards and the underlying product-class tracking rule remain platform enforced.
- Inventory / Stock on Hand registered as module #3 with module access, desktop cards, the four implemented KPI widgets, search/warehouse/product filters, safe field visibility, inspector sections, and Inspect Stock. The same registry-driven Super Admin renderer, staged changes, policy versioning, reset APIs, resolver, and audit path are reused.
- Stock-on-Hand navigation, direct routes, table, desktop/mobile cards, and inspector resolve the same organization policy. Balance inquiry is blocked backend-side when the module is disabled; Expiry, Adjustments, Transfers, Reconciliation, and Movements remain under their existing RBAC/subscription rules pending their own capability integrations.
- Opening Stock owns the separate `inventory.openingStock` namespace. Its critical module switch, optional module information and product search, safe Packaging Unit and Manufacturing Date presentation, Post action, and View Stock action reuse the same registry, resolver, sparse policy, reset, version, audit, Angular service, guard, navigation filter, and generic Super Admin renderer.
- Warehouse, Product, Quantity, Opening Inventory Value, and conditionally required Batch / Expiry appear as required platform-enforced workflow controls. Product tracking rules and all existing posting, WAC, valuation, batch/expiry, warehouse, transaction, RBAC, and subscription validation remain authoritative.
- Disabling Opening Stock hides tenant navigation, sends direct tenant routes to the shared unavailable state, removes the Stock-on-Hand posting link, and blocks posting through both module and Post-action backend middleware. Platform Super Admin policy routes remain outside tenant capability enforcement so the module can be re-enabled.
- Product Batches owns the separate `inventory.batches` namespace. Its critical module switch, desktop-card view, module information, four implemented KPI widgets, three real filters, safe field visibility, inspector sections, and inquiry/navigation actions reuse the same registry, resolver, sparse policy, reset, version, audit, Angular service, guard, navigation filter, and generic Super Admin renderer.
- Disabling Product Batches hides tenant navigation, sends direct routes to the shared unavailable state, and blocks Batch list/detail inquiry. The dedicated detail endpoint additionally enforces Inspect; cosmetic visibility controls remain frontend-only. View Product and View Stock resolve target-module dependencies, while View Movements preserves existing RBAC/subscription ownership.
- Expiry Inquiry owns the separate `inventory.expiry` namespace. Its critical module switch, desktop-card view, module information, four authoritative KPI widgets, four real filters (search, product, warehouse, classification), safe field visibility, inspector sections, and inquiry/navigation actions reuse the same registry, resolver, sparse policy, reset, version, audit, Angular service, guard, navigation filter, and generic Super Admin renderer.
- Stock Adjustments owns the separate `inventory.adjustments` namespace. Its critical module switch, 7 optional form experience features (moduleInfo, productSearch, productContext, stockContext, guidance, recentAdjustments, serverPostingDate), 8 platform-enforced workflow fields (warehouse, product, adjustmentType, quantity, reason, batch, direction, inventoryValue), and 4 actions (post, reverse, viewStock, viewMovements) reuse the same registry, resolver, sparse policy, reset, version, audit, Angular service, guard, navigation filter, and generic Super Admin renderer.
- Disabling Stock Adjustments hides tenant navigation, sends direct routes to the shared unavailable state, and blocks adjustment draft/post/reverse endpoints across backend middleware. Negative stock override strictly preserves RBAC `inventory.negative-stock.override` authorization.
- Warehouse Transfers owns the separate `inventory.transfers` namespace. Its critical module switch, 7 optional form experience features (moduleInfo, productSearch, productContext, stockContext, guidance, recentTransfers, serverTransferDate), 6 platform-enforced workflow fields (sourceWarehouse, destinationWarehouse, product, quantity, reason, batch), and 4 actions (post, reverse, inspect, viewStock) reuse the same registry, resolver, sparse policy, reset, version, audit, and generic Super Admin renderer.
- Stock Movements owns the separate `inventory.movements` namespace. Its critical module switch, 8 presentation features, 7 platform-enforced audit fields, and 5 read-only actions reuse the same registry, resolver, sparse policy, reset, version, audit, tenant isolation, and RBAC behavior. The movement list endpoint enforces the module; no detail endpoint exists. View Stock, View Product, and View Batch resolve target-module dependencies.
- Accounts owns the `accounts` namespace with 26 authoritative controls: 1 module, 5 real presentation/inquiry features (`moduleInfo`, `search`, `statusFilter`, `movementHistory`, `kpiCards`), 8 real Account fields (`name`, `accountType`, `status`, `derivedBalance`, `bankName`, `accountNumberMasked`, `walletIdentifier`, `openingBalance`), and 12 semantic business actions (`create`, `inspect`, `edit`, `deactivate`, `reactivate`, `delete`, `postOpeningBalance`, `postManualMovement`, `transfer`, `reverseMovement`, `reverseTransfer`, `refresh`). All Accounts API operations enforce the module plus their relevant action, movement-history, or KPI summary control after RBAC/subscription checks; dynamic Account PATCH enforcement distinguishes safe field edits from deactivate/reactivate transitions. Authoritative summary KPI data (total accounts, active, inactive, and organization-wide total balance) is provided via `GET /api/v1/accounts/summary`.
- Accounts navigation, routes (`/app/accounts`, `/app/accounts/new`, `/app/accounts/:id`), and Angular pages implement capability ∩ RBAC gating across list, create, edit, opening balance, transactions, transfers, reversals, and movement history. Super Admin Organization Controls fully integrates Accounts sidebar navigation, section routing, required workflow field protections, and scoped resets.
- Employees & Access owns the `employees` namespace with 17 authoritative controls: 1 module, 5 presentation features (`moduleInfo`, `search`, `statusFilter`, `roleFilter`, `kpiCards`), 6 employee fields (`email`, `displayName`, `role`, `branchAccess`, `warehouseAccess`, `status`), and 5 business actions (`create`, `edit`, `deactivate`, `assignAccess`, `refresh`). Employee user API operations enforce the module plus relevant action controls after RBAC/subscription checks; branch/warehouse assignment mutation is enforced on `PUT /api/v1/users/:id/access-assignments`. Platform-enforced fields remain required for identity, role authorization, lifecycle status, and assignment semantics. No employee reactivate action exists in Release 1.
- Reports owns the `reports` namespace with 22 authoritative controls: 1 module, 16 independently configurable report-availability controls matching the fixed catalog, 1 shared `moduleInfo` feature, and 4 actions (`run`, `exportPdf`, `exportExcel`, `exportCsv`). Tenant navigation and routing enforce the module; the selector removes disabled report families without affecting unrelated reports; Run and each export format resolve their distinct effective action. The catalog, report execution, and all three export formats enforce the same controls backend-side after RBAC and suspended-read subscription checks. Export actions also resolve the existing `reportsExports` entitlement. The generic Super Admin Organization Controls renderer exposes all 22 controls, Default/Override/Effective state, effective restriction reasons, critical module confirmation, individual and scoped Reports reset, and organization-scoped policy operations without a custom Reports admin page.
- Alerts owns the `alerts` namespace with 13 authoritative backend controls: 1 module, 6 independently configurable alert-family availability controls, 3 real presentation features (`moduleInfo`, `summaryCards`, `navbarNotifications`), and 3 actions (`acknowledge`, `markRead`, `markAllRead`). Alert and notification endpoints enforce operational subscription access, `alerts.view`, the module, relevant feature/action controls, organization and user scope, and per-item family availability. Disabled families are removed from alert lists, notifications, unread counts, and summaries without changing Inventory, Ledger, Sales, or Reporting source calculations. No cross-module capability dependency is registered. Generic scoped reset supports `alerts` and removes only `alerts.*` overrides.
- Customer Payments navigation, routes (`/app/customer-payments`, `/app/customer-payments/new`), list/post pages, and generic Super Admin Organization Controls consume the exact 18 controls. Module information, search, payment-date filter, field visibility, posting action, invoice-specific allocation, and ledger preview reflect the effective organization policy while preserving Products-aligned responsive presentation. The shared customer-ledger endpoint retains its existing `customer-payments.view`, subscription, organization, customer, and ledger ownership instead of inheriting the Customer Payments module switch.
- Supplier Ledger owns the sibling `payments.supplierLedger` namespace with 17 authoritative controls: 1 module, 4 real features (`moduleInfo`, required/platform-enforced `supplierSearch`, `reconciliationSummary`, `ledgerFilters`), 11 platform-enforced read-only accounting fields, and 1 configurable source-drill-down action (`viewSource`). The ledger-owned supplier lookup searches the complete active tenant supplier set before returning at most 25 matches; ledger history and reconciliation enforce subscription, `supplier-payments.view`, organization context, tenant scope, and the module, while reconciliation additionally enforces its summary feature. Generic scoped reset removes only `payments.supplierLedger.*` overrides.
- `payments.supplier.actions.viewLedger` remains the Supplier Payments-side launch control and now depends on `payments.supplierLedger`. Disabling Supplier Ledger therefore makes the launch action effectively unavailable; disabling Supplier Payments does not disable direct Supplier Ledger access. Supplier Ledger has no dependency on Purchases, Returns, Accounts, or Suppliers UI capability because it composes immutable historical effects through tenant-scoped domain services. Source drill-down remains subject to each destination route's own RBAC and capability controls.
- Sales owns the `sales` namespace with 34 authoritative backend controls: 1 module, 4 real features, 15 fields, and 14 actions. Customer and product search plus six required workflow fields and six authoritative posted-history fields are platform-enforced. All direct Sales endpoints enforce the module and relevant action after subscription/RBAC checks; optional draft-field editability and conditional payment, credit, price-override, and approval workflows are enforced in the Sales service. Linked sales-return launch additionally requires the Returns posting action. Generic scoped reset removes only `sales.*` overrides.
- Sales navigation, POS create/history routes, list features/actions, draft field visibility/editability, tender/credit settlements, post/cancel/return/print actions, condition-driven approval workflows, and lifecycle-aware read-only detail behavior consume the exact backend registry through `CapabilityService`. The generic Super Admin Organization Controls renderer exposes all 34 Sales controls, required platform-enforced workflow fields, dependencies, Default/Override/Effective state, disable/re-enable confirmation, and scoped reset without a custom Sales admin page.
- Disabling Warehouse Transfers blocks all transfer list/detail/create/update/discard/post/reverse endpoints through backend capability middleware. Source warehouse, destination warehouse, product, quantity, reason, and batch remain platform-enforced; negative-stock override strictly preserves RBAC `inventory.negative-stock.override` authorization and has no capability key. Batch identity and expiry metadata preservation remain enforced by the inventory engine; WAC valuation remains 100% backend-owned.
- Individual, module, and organization reset operations remove sparse overrides through the transactional backend endpoints, increment policy versions on material changes, emit per-control audit evidence, re-resolve effective policy, and refresh the Super Admin UI.
- Warehouses owns the `warehouses` namespace with 13 authoritative backend controls: 1 module, 3 real presentation features (`moduleInfo`, `search`, `statusFilter`), 3 fields (`name`, `code`, `status`), and 6 actions (`create`, `edit`, `deactivate`, `reactivate`, `delete`, `refresh`). All direct Warehouse API operations enforce the module after existing organization context, RBAC, and operational subscription checks. Create and permanent delete enforce their distinct route actions; parsed Warehouse PATCH mutations dynamically enforce Edit, optional Code editability, and the matching lifecycle action without weakening optimistic versioning or tenant scope. Generic module reset and Organization Controls rendering reuse the existing sparse override, Default / Override / Effective, audit, and version paths.
- Branches owns the `branches` namespace with 14 authoritative backend controls: 1 module, 3 presentation-only features (`moduleInfo`, `search`, `statusFilter`), 4 fields (`name`, `invoicePrefix`, `code`, `status`), and 6 actions (`create`, `edit`, `deactivate`, `reactivate`, `delete`, `refresh`). All direct Branch API operations enforce the module after existing organization context, RBAC, and operational subscription checks. Create and permanent delete enforce their distinct route actions; parsed Branch PATCH mutations dynamically enforce Edit, configurable Code and Status field editability, and the matching lifecycle action without weakening validation, optimistic versioning, tenant scope, or branch plan limits. Generic module reset uses the existing sparse override, Default / Override / Effective, audit, and version paths.
- Billing owns the `billing` namespace with 17 authoritative backend controls: 1 module, 4 features, 7 fields, and 5 actions. Tenant current-subscription, plan, evidence upload/download, submission, history, and detail routes enforce the module plus their source-backed feature/action after existing organization context, RBAC, and `billing-access` lifecycle checks. Requested Plan, Billing Period, Payment Method, Payment Reference, Amount, and Evidence remain required/platform-enforced; optional Notes is policy-enforced against crafted payloads. Generic module reset and Organization Controls registry rendering reuse sparse overrides, Default / Override / Effective, audit, and version paths.
- Organization Setup owns the flat `setup` namespace with 10 controls: 1 server-enforced module, 8 presentation features, and 1 presentation refresh action. The existing Setup progress endpoint enforces authentication, organization context, `settings.view`, operational subscription access, and the Setup capability in that order. The frozen tenant UI consumes the presentation controls, while progress facts remain derived from authoritative tenant-scoped domain data and destination links retain their own RBAC and capability checks.
- Stable policy denial codes: `ORG_CAPABILITY_DISABLED`, `ORG_ACTION_NOT_ALLOWED`, and `ORG_FIELD_NOT_EDITABLE`.

## Warehouses backend registry safety decisions

- Warehouse Name is required on create and remains visible/editable as a platform-enforced identity field. It is not exposed as a fake organization toggle; ordinary name changes still require the Warehouse Edit action.
- Warehouse Code is optional and safe to configure for visibility and existing-record editability. Parsed PATCH payloads enforce `warehouses.fields.code.editable`, so crafted requests cannot bypass a read-only organization policy.
- Lifecycle Status remains visible and read-only as a platform-enforced field. Active/inactive transitions are controlled only through the distinct Deactivate and Reactivate actions on the existing optimistic-concurrency PATCH workflow.
- Create, Edit, Deactivate, Reactivate, Delete, and Refresh map to the existing `warehouses.manage` / `warehouses.view` RBAC permissions. Organization policy can restrict those permissions but cannot grant them.
- Permanent deletion remains subject to the existing tenant-scoped record lookup and record-in-use reference checks. Enabling Delete cannot bypass stock history, posted movement, assignment, or other domain references.
- Module reset matches only definitions whose `moduleKey` is `warehouses`, preserves unrelated sparse overrides and organization isolation, increments policy version on material change, and emits the existing per-control audit evidence.
- KPI, pagination, table/mobile renderer, internal identifier, and optimistic version controls were not registered because they are not independent configurable Warehouse business capabilities.

## Branches backend registry safety decisions

- Branch Name and Invoice Prefix are required on create and remain visible/editable as platform-enforced identity fields. Ordinary edits still require the Branch Edit action.
- Branch Code is optional and configurable for visibility and existing-record editability. Parsed PATCH payloads enforce `branches.fields.code.editable`, so crafted requests cannot bypass a read-only organization policy.
- Lifecycle Status is configurable for visibility and editability. Status mutations additionally require the matching Deactivate or Reactivate action, preserving the existing lifecycle validation and optimistic-concurrency workflow.
- Create, Edit, Deactivate, Reactivate, Delete, and Refresh map to the existing `branches.manage` / `branches.view` RBAC permissions. Organization policy can restrict those permissions but cannot grant them.
- Branch controls do not modify the existing `branches` subscription limit or creation-limit enforcement. Enabling the capability does not make branch creation unlimited.
- Module reset matches only definitions whose `moduleKey` is `branches`, preserves unrelated sparse overrides and organization isolation, increments policy version on material change, and emits the existing per-control audit evidence.
- Count pills, pagination, mobile cards, table/layout details, invoice preview, breadcrumbs, typography, and cache behavior were not registered because they are not independent configurable Branch business capabilities.

## Billing backend registry safety decisions

- Billing policy is purely restrictive. Read controls map to `subscription.view`; Submit and Upload Evidence map to `subscription.billing-evidence.submit`. No tenant permission was invented for evidence download or upload.
- Requested Plan and Billing Period were added as semantic required fields after inspecting submit validation. Internal `planCode`, `planVersion`, `evidenceStorageRef`, identifiers, cache, layout, and platform approve/reject operations are not organization controls.
- Plan Selection is required/platform-enforced because active plan identity is mandatory for valid submission. Payment Method, Payment Reference, Amount, and Evidence are likewise non-configurable required inputs. Notes is the only optional configurable submission field and non-empty crafted Notes are rejected when read-only/hidden.
- Every Billing definition uses the existing `billing-access` subscription label. Suspended organizations therefore retain Billing when policy and RBAC allow it, while no Billing control can grant operational access.
- Tenant APIs enforce Billing, Current Subscription, Plan Selection, Billing History, Submit, Upload Evidence, Download Evidence, and Inspect History where the HTTP operation is distinguishable. Module Information and Refresh remain presentation actions; refresh cannot be distinguished from an initial GET without changing the HTTP/cache contract.
- Billing controls do not alter plan validation, evidence ownership/type/size validation, duplicate-reference warnings, coverage calculation, subscription transitions, platform review, or payment workflow.
- Module reset matches only definitions whose `moduleKey` is `billing`, preserves unrelated sparse overrides and organization isolation, increments policy version on material change, and emits existing per-control audit evidence.

## Organization Setup control safety decisions

- `setup` is the canonical capability namespace. Its critical module switch is server-enforced on `GET /api/v1/organization/setup-progress` after `settings.view` and operational subscription checks.
- `moduleInfo`, `summary`, `subscriptionNotice`, `search`, `statusFilter`, `taskList`, `operationalReadiness`, and `notes` are presentation-only because they share one Setup progress DTO or local/session presentation state. `actions.refresh` is also presentation-only because initial load and explicit refresh use the same existing GET and cache contract.
- Every child is parented directly to `setup`; there are no task-ID controls, `openTask` action, child-to-child dependencies, or destination-module dependencies.
- Setup capability changes do not alter organization, settings, branch, warehouse, membership, catalog, customer, supplier, account, opening-balance, or readiness calculations. No Setup persistence or duplicate completion logic was added.
- Subscription Notice only hides informational presentation. It does not change subscription state, Billing capability, Billing RBAC, or lifecycle enforcement.
- Setup task destinations remain independently governed. Existing destination permissions and capabilities determine whether Open is available, and destination routes/APIs remain authoritative.
- Module reset removes only `setup.*` sparse overrides. Existing organizations retain current behavior because all 10 controls default on and no migration or override rewrite is required.

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

## Product Batches registry safety decisions

- `inventory.batches` is independent from Stock on Hand and Opening Stock. Its critical switch governs Product Batch inquiry only; it does not delete or change batches, balances, expiry logic, FEFO, WAC, movements, or transaction history.
- Batch Number and Product are required platform-enforced identity fields. Locations, Manufacture Date, Expiry Date, First Received, Available Quantity, and Status are presentation-only visibility controls; quantity cannot be edited or overridden.
- The four registered widgets are exactly the implemented Total Batches, Expiring Soon, Expired, and Warehouses / Products cards. Search, Product Filter, and Warehouse Filter are the three implemented Batch filters; no non-existent Expiry Status filter was added.
- Desktop cards are configurable while responsive phone cards remain platform enforced. Module Information, Stock by Location, Technical Details, and Inspect Batch are separately configurable without allowing Batch CRUD.
- View Product depends on Products and View Stock depends on Stock on Hand, with effective blocking reasons shown in Organization Controls. View Movements remains a Batch-owned navigation affordance layered on existing movement RBAC/subscription behavior because Stock Movements has no capability namespace yet.
- Individual reset removes one sparse override. Module reset matches only definitions whose `moduleKey` is `inventory.batches`, preserving Products, Categories, Stock-on-Hand, Opening Stock, and every unrelated override while incrementing policy version and emitting per-control audit evidence.

## Expiry Inquiry registry safety decisions

- `inventory.expiry` is independent from Stock on Hand, Opening Stock, and Product Batches. Its critical switch governs Expiry Inquiry only; it does not delete or change batches, balances, expiry dates, threshold days, business date calculations, FEFO, WAC, movements, or transaction history.
- Batch Number, Product, Expiry Date, and Classification are required platform-enforced fields. Warehouse and Quantity are presentation-only visibility controls; classification calculation, threshold days, business date, and quantity cannot be edited or overridden. Field visibility dominates inspector presentation (hiding quantity field suppresses the quantity section in the inspector).
- The four registered widgets are exactly the implemented Total Records, Expiring Soon, Expired, and Tracked Products / Warehouses KPI cards. Search, Product Filter, Warehouse Filter, and Classification Filter are the four implemented Expiry filters.
- Desktop cards are configurable while responsive phone cards remain platform enforced. Module Information, Timeline Section, Quantity Section, Technical Details, and Inspect are separately configurable.
- View Batch depends on Batches, View Product depends on Products, and View Stock depends on Stock on Hand, with effective blocking reasons shown in Organization Controls. View Movements remains an Expiry-owned navigation affordance layered on existing movement RBAC/subscription behavior because Stock Movements has no capability namespace yet.
- Individual reset removes one sparse override. Module reset matches only definitions whose `moduleKey` is `inventory.expiry`, preserving Products, Categories, Stock-on-Hand, Opening Stock, Batches, and every unrelated override while incrementing policy version and emitting per-control audit evidence.

## Warehouse Transfers registry safety decisions

- `inventory.transfers` is independent from Stock on Hand, Opening Stock, Product Batches, Expiry Inquiry, and Stock Adjustments. Its critical switch governs Warehouse Transfers creation, draft mutation, and reversal only; it does not delete or alter historical transfers, stock balances, movements, WAC, batches, or transaction history.
- Source Warehouse, Destination Warehouse, Product, Quantity, Reason, and Batch are non-configurable, platform-enforced required workflow fields. Batch remains conditionally required by product tracking mode and cannot be bypassed by organization overrides.
- Find Product Search, Product Context, Stock Context, Guidance Panel, Recent Transfers History, Module Information, and Server Transfer Date are optional presentation features. Hiding search leaves the native product selector; hiding guidance reflows the form to single-column; hiding stock context removes on-hand indicators without weakening domain validation; hiding history leaves the form clean and avoids list network calls.
- Post, Reverse, and Inspect actions are protected capability actions. Disabling Post blocks draft submission in Angular and rejects post requests with `ORG_ACTION_NOT_ALLOWED`. Disabling Reverse removes the history table action and blocks reversal API requests with `ORG_ACTION_NOT_ALLOWED`. Disabling Inspect removes drawer inspector buttons and blocks inspector API queries. View Stock depends on `inventory.stock` availability.
- Negative Stock Override is intentionally NOT a capability control and strictly preserves RBAC `inventory.negative-stock.override` authorization.
- Individual reset removes one sparse override. Module reset matches only definitions whose `moduleKey` is `inventory.transfers`, preserving all other module overrides while incrementing policy version and emitting per-control audit evidence.

## Stock Movements registry safety decisions

- `inventory.movements` controls inquiry access only. Disabling it blocks `GET /api/v1/inventory/movements` for the selected organization without changing movement creation, posting, balances, WAC, valuation, corrections, or immutable history.
- Product, Warehouse, Direction, Quantity, Source Type, Batch, and Inventory Value remain visible and platform enforced because hiding core identity fields would remove the audit meaning of movement history.
- Refresh, Inspect, View Stock, View Product, and View Batch are the only registered actions. No edit, delete, reverse, or post capability exists for immutable movements.
- View Stock, View Product, and View Batch depend on `inventory.stock`, `inventory.products`, and `inventory.batches`, respectively. The dependencies affect only the navigation actions.
- Module reset removes only controls whose `moduleKey` is `inventory.movements`, increments the organization policy version on material changes, and emits the existing per-control audit event with actor, time, reason, and before/after version evidence.

## Accounts backend registry safety decisions

- `accounts` controls direct Account master-data and direct opening/manual-movement/transfer/reversal workflows only. Disabling it does not prevent Sales, Purchases, Payments, Returns, or Expenses from using the Accounts public interface to create required account movements.
- Account name, type, lifecycle status, derived balance, bank name, wallet identifier, and posted opening-balance information remain visible where applicable and platform enforced. Account type and posted financial history remain non-editable. Masked account number visibility/editability is configurable; safe master-data editability is enforced in the service.
- Bank name and wallet identifier remain conditionally required by the frozen Account type rules. Create remains a separate action so capability policy cannot bypass required creation input or change the four supported Account types.
- Create, Inspect, Edit, Deactivate, Reactivate, Delete, Post Opening Balance, Post Manual Inflow / Outflow, Transfer, Reverse Manual Movement, Reverse Transfer, and Refresh are distinct semantic actions mapped to existing permissions. No capability dependency is registered because no Accounts endpoint requires another capability namespace at runtime.
- Derived balances remain calculated from signed posted movements. Opening balances remain one-time and auditable; transfers remain atomic; reversals create linked corrective movements; posted movements remain immutable; deletion remains subject to opening-balance and record-in-use protection; all queries remain organization-scoped and mutations retain optimistic versioning where applicable.
- Accounts module reset removes only controls whose `moduleKey` is `accounts`, preserves all other organization overrides, increments the policy version on material changes, and emits the existing per-control audit evidence.

## Dashboard backend registry safety decisions

- The 11 controls map to the current frozen Dashboard rather than individual cosmetic cards: one module, three real query filters, Financial Summary, Account Balance Summary, Sales vs Purchases Trend, Gross Profit Trend, Top Selling Products, Inventory Health, and Recent Sales. All controls default on, are organization-configurable, map to `dashboard.view`, and have no cross-module dependency.
- Financial Summary governs the related Sales, Purchases, Expenses, Gross Profit, Receivables, Payables, and Stock Valuation values. Account Balance Summary governs Cash, Bank, JazzCash, Easypaisa, and account distribution. Inventory Health governs Low Stock, Upcoming Expiry, Expired Stock, Dead Stock, and expiry-status presentation. Grouping prevents contradictory policy for values that are different presentations of the same authoritative read model.
- The module is enforced on `GET /api/v1/dashboard` after authentication, organization context, `dashboard.view`, and operational subscription access. The service resolves policy with the caller's permissions, ignores stale query parameters for disabled filters, and removes every disabled widget group's underlying fields from the response. Business date, tenant scope, and source-service branch/warehouse authorization remain authoritative.
- Sales, Purchases, Expenses, Accounts, Inventory, Alerts, Payments/Ledgers, and Reports are source-domain relationships, not capability dependencies. Disabling a source module's direct tenant UI does not erase authoritative Dashboard history or current state; disabling Dashboard does not affect those source modules.
- Period semantics remain unchanged: `periodSales`, `periodPurchases`, and `periodGrossProfit` are the primary selected/default-period values, while `todaysSales` and `todaysPurchases` remain explicit submetrics. Receivables, payables, account balances, stock valuation, inventory health, and latest 10 posted Sales remain current/as-of reads and are not period-filtered by capability code.
- Capability integration does not calculate or change Gross Profit, COGS, Sales/Purchases totals, Expenses, Receivables, Payables, account balances, Stock Valuation, stock thresholds, expiry classification, Dead Stock rules, or Recent Sales selection. It only gates the endpoint, chooses whether supported query parameters are honored, and shapes the authorized response.
- Dashboard module reset removes only definitions whose `moduleKey` is `dashboard`, preserving unrelated sparse overrides, organization isolation, monotonic versioning, and audit behavior. No Dashboard-specific Super Admin endpoint or page was added.

## Reports backend registry safety decisions

- The 16 availability controls map exactly to `sales`, `purchases`, `gross-profit`, `stock`, `stock-valuation`, `stock-movements`, `customer-ledger`, `supplier-ledger`, `account-cash-book`, `expenses`, `low-stock`, `expiry`, `dead-stock`, `top-products`, `top-customers`, and `employee-sales`. Disabling one report does not disable any other report or its source module.
- Report selector, results presentation, required filters, pagination, mobile layout, calculations, and refresh were not registered as organization controls. They are either core workflow behavior, domain contracts, or not separate runtime actions. `moduleInfo` is the only shared presentation feature.
- No cross-module capability dependency is registered. Reporting is the frozen read-only composition exception: it consumes public source-module services under Reports RBAC, tenant/warehouse scope, and suspended-read subscription policy. A Reports capability never grants a source-module permission, and disabling an operational source-module capability does not erase access to historical read-only reports.
- Runtime report sources are: Sales for Sales/Top Products/Top Customers/Employee Sales; Purchases for Purchases; Sales plus Returns for Gross Profit; Inventory for Stock/Stock Valuation/Stock Movements; Payments/Ledgers for Customer Ledger/Supplier Ledger; Accounts for Account/Cash-book; Accounts/Expenses for Expenses; Alerts plus Inventory/Catalog for Low Stock/Expiry/Dead Stock. Catalog, Customer, and Product services provide read-only enrichment where applicable.
- Required filter validation, tenant and warehouse isolation, canonical calculations, source-domain invariants, fixed export format availability, and the `reportsExports` plan entitlement remain platform enforced. Capability policy can only remove access; it cannot grant Reports RBAC or source-module access.
- Reports module reset removes only controls whose `moduleKey` is `reports`, preserves all other organization overrides, increments the policy version on material changes, and emits the existing per-control audit evidence.
- The Reports capability integration does not redesign report presentation, make required filters configurable, or gate responsive/pagination infrastructure. Report-by-report screenshot refinement remains a separate workflow; this record does not declare the Reports Production UI fully frozen.

## Purchases backend registry safety decisions

- Required warehouse, supplier, purchase date, product, quantity, unit cost, and conditionally required batch/expiry inputs are platform enforced. Capability policy cannot weaken active-master validation, product tracking requirements, duplicate supplier-reference protection, optimistic versioning, tenant/warehouse scope, or draft/posted/cancelled lifecycle rules.
- Branch, supplier invoice reference, notes, packaging unit, manufacturing date, and landed costs are optional configurable fields. Disabled editability is rejected in the Purchases service before domain mutation; hiding packaging leaves the product base unit available.
- Posting remains one atomic domain workflow across inventory receipt and WAC valuation, supplier payable allocation, optional account payments, immutable snapshots, audit, and idempotency. Inventory, Suppliers, and Accounts direct-module capabilities are intentionally not dependencies because Purchases calls their public domain interfaces and never receives their RBAC permissions.
- `purchases.actions.addPaymentAtPost` is independently configurable and depends on `purchases.actions.post`. It applies only when a posting request contains a payment; disabling it does not disable unpaid or payable-only posting.
- `purchases.actions.createReturn` depends on `returns.actions.post`. The linked route separately retains `returns.post` and `purchases.return` RBAC, Returns module/action checks, source validation, remaining-returnable limits, stock/ledger safety, and tenant scope. The dependency cannot grant Returns access.
- Cancellation remains a compensating transaction: the original posted purchase and movements remain immutable, posted returns continue to block cancellation, and inventory/payable/account reversal safety remains authoritative. Internal unpaid-purchase and purchase-return source reads are deliberately not capability-gated.
- Purchases module reset removes only controls whose `moduleKey` is `purchases`, preserves unrelated overrides and organization isolation, increments the policy version on material changes, and emits existing per-control audit evidence.

## Alerts backend registry safety decisions

- The six availability controls map exactly to `low_stock`, `upcoming_expiry`, `expired_stock`, `dead_stock`, `customer_dues`, and `supplier_dues`. Disabling one family does not disable another family or alter source-domain calculations.
- Search, filters, refresh, pagination, responsive behavior, unread-badge rendering, source calculations, acknowledgement fields, and read-state persistence are not registered because the finalized Alerts source/UI does not expose them as independent configurable behavior. There is no Alerts detail/inspector endpoint, so no inspect/open backend action is registered.
- `GET /api/v1/alerts` and `GET /api/v1/notifications` enforce the Alerts module and return only enabled families. Summary data is removed when `alerts.features.summaryCards` is disabled and otherwise excludes disabled families. `GET /api/v1/notifications/feed` additionally enforces `alerts.features.navbarNotifications`.
- Acknowledge, mark-one-read, and mark-all-read routes enforce their distinct actions after existing authentication, organization context, `alerts.view`, and operational subscription checks. Per-item operations fail safely when the notification is outside the organization, inactive, or belongs to a disabled family. Read state remains user-scoped; acknowledgement remains separate business state.
- Alerts remains a read-only notification projection. No Inventory, Customers, Suppliers, Sales, Payments/Ledgers, or Reports capability dependency is registered, and the unrestricted Alerts source read used by Reporting remains unchanged.
- Alerts module reset removes only controls whose `moduleKey` is `alerts`, preserves all unrelated organization overrides, increments the policy version on material changes, and emits the existing per-control audit evidence.

## Supplier Payments backend registry safety decisions

- `payments.supplier` is a standalone configurable submodule namespace under the existing Payments domain. No synthetic configurable Payments parent was added, and Customer Payments remains outside this policy surface.
- Supplier, Account, allocation mode, amount, payment date, allocations, payment reference, and posting status are platform-enforced workflow or immutable-history fields. Notes are the only optional configurable field, and disabled note editability is rejected before parsing or mutation.
- Post, invoice-specific post, inspect, view ledger/reconciliation, and correct are distinct actions. Invoice-specific posting depends only on the Supplier Payments Post action. No Suppliers, Purchases, or Accounts UI capability dependency is registered because payment orchestration calls their public domain services and must preserve payable, allocation, advance, and account-movement integrity.
- All six supplier-facing read/write endpoints retain existing organization scope, RBAC, operational subscription checks, validation, idempotency, and transaction behavior before capability-controlled handlers run. The shared correction endpoint retains `payments.correct`; only supplier-party corrections additionally enforce the Supplier Payments module/action after tenant-scoped lookup.
- Posted payments, allocations, ledger effects, supplier advances, and account movements remain immutable. Correction continues to create reversal plus optional replacement records, and the session-scoped supplier posting primitive used by Purchases remains capability-neutral so disabling direct Supplier Payments access cannot break cross-domain accounting.
- Supplier Payments module reset removes only controls whose `moduleKey` is `payments.supplier`, preserves unrelated overrides and organization isolation, increments the policy version on material changes, and emits existing per-control audit evidence.

## Supplier Payments frontend and Super Admin safety decisions

- Sidebar entries and direct list/post/ledger routes intersect the existing RBAC with `payments.supplier`; Post and Supplier Ledger additionally require their exact action controls. No payment detail or correction UI was invented because neither exists in the finalized Supplier Payments frontend.
- Module Info and Payment Date Filter are the only configurable list features. Refresh, pagination, responsive cards, supplier search helpers, and empty/loading/error infrastructure remain ordinary workflow behavior because the backend registry defines no controls for them.
- The list and form consume all nine field controls. Supplier, Account, Allocation Mode, Amount, Payment Date, Allocations, Payment Reference, and Status remain platform-enforced. Notes alone can be hidden or made read-only; read-only Notes are omitted from post payloads so direct backend field enforcement remains authoritative.
- Invoice-specific selection depends on both Post and `postInvoiceSpecific`; general oldest-first allocation remains available when only invoice-specific posting is disabled. Supplier advances remain derived allocation results and do not receive a separate frontend-only capability.
- The existing generic Organization Controls renderer owns Supplier Payments Default, Organization Override, Effective, risk, dependency, platform-enforced reason, scoped reset, and critical disable/re-enable presentation. Disabling Supplier Payments does not disable Purchases, Suppliers, Accounts, or their accounting services.

## Customer Payments backend registry safety decisions

- `payments.customer` is a standalone configurable submodule under the existing Payments domain. No synthetic configurable Payments parent and no Customers, Accounts, Sales, or Customer Ledger capability dependency was added.
- Customer search plus Customer, Receive Into Account, Allocation Mode, Amount, Payment Date, Allocations, and Status are platform-enforced workflow or immutable-history controls. Notes is the only configurable field. Module Info, list Search, Payment Date Filter, and Customer Ledger Preview are optional presentation features.
- Post, invoice-specific post, inspect, and correct are distinct backend actions. `payments.customer.actions.postInvoiceSpecific` depends only on `payments.customer.actions.post`; General oldest-first allocation remains available when invoice-specific posting is disabled.
- Direct list/post/detail endpoints retain organization scope, RBAC, operational subscription checks, validation, CSRF/idempotency, and transaction behavior. The shared correction endpoint retains `payments.correct` and applies Customer Payments policy only after tenant-scoped party resolution. The shared Customer Ledger endpoint remains capability-neutral so other legitimate ledger consumers are not coupled to the direct Customer Payments module.
- Capability handling does not change receivable lookup, allocation order, invoice-specific validation, customer advance remainder, ledger effects, account movements, signed balances, posting atomicity, or historical records.

## Supplier Ledger backend and frontend safety decisions

- `payments.supplierLedger` is a standalone configurable sibling submodule under the Payments domain. Its RBAC mapping is `supplier-payments.view` for the module, all four features, all eleven visible fields, and `actions.viewSource`; organization policy can restrict this permission but cannot grant it.
- The ledger-owned selector endpoint is `GET /api/v1/supplier-ledger/suppliers?search=...`; server-side search applies across the complete active, organization-scoped supplier set before returning at most 25 identity records and does not depend on the direct Suppliers module capability. The frontend selector calls this endpoint for each search rather than filtering a preloaded 25-record page locally. `supplierSearch` is required/platform-enforced because it is the only way to choose the ledger subject. `GET /api/v1/suppliers/:id/ledger` requires the Supplier Ledger module. `GET /api/v1/suppliers/:id/reconciliation` additionally requires `features.reconciliationSummary`.
- Supplier identity, outstanding payable, supplier advance, reconciliation status, allocation total, date, reference, entry type, effect kind, signed amount, and source status remain visible, read-only, and platform enforced. There are no editability, create, edit, delete, reconcile, correction, pagination, responsive-layout, or calculation controls.
- Capability policy only restricts inquiry presentation. Purchase payable, supplier payment allocation/advance, purchase return/cancellation, allocation reversal, supplier opening payable/advance, signed amounts, payable/advance balances, allocation totals, reconciliation calculations, and immutable history remain unchanged.
- The frontend consumes the module and controls under `payments.supplierLedger.*`. The direct Supplier Ledger route/sidebar consumes `payments.supplierLedger`; Supplier Payments launch UI continues consuming `payments.supplier.actions.viewLedger`; supplier selection uses the ledger-owned lookup; reconciliation presentation consumes `features.reconciliationSummary`; source links may consume `actions.viewSource` and retain destination-route enforcement.

## Sales backend registry safety decisions

- `sales` controls direct tenant Sales/POS inquiry, draft, post, cancel, print, and linked-return launch. It does not change pricing, customer-tier selection, stock allocation, invoice sequencing, receivables, payments, account movements, cancellation, or immutable invoice history.
- Search and status filter are configurable presentation features. Customer and product search are required/platform-enforced because the frozen selectors rely on server-backed search to reach the complete active tenant master set. No controls were created for pagination, responsive layout, loading state, badges, calculated line totals, or shortcut buttons.
- Customer, Notes, and Packaging Unit are configurable fields enforced before draft mutation. Branch, Warehouse, Sale Date, Product, Quantity, and Unit Price remain required/platform-enforced. Invoice Number, Lifecycle Status, Sale Total, Paid Total, Receivable Total, and posted Payment Details remain visible, read-only, and platform-enforced.
- Payment at post, sale credit, price override, credit-limit approval, expired-stock approval, and negative-stock override are separate organization restrictions under `sales.actions.*` and depend on `sales.actions.post`. Their existing domain conditions and exact RBAC permissions remain authoritative; capability policy cannot create an approval condition or grant authorization.
- `sales.actions.createReturn` depends on `returns.actions.post` and is enforced after Returns module/post and `returns.post` checks. Customers, Inventory, Accounts, and Pricing are source-domain relationships rather than module capability dependencies, so their direct UI policy cannot corrupt or disable Sales domain posting.
- Module reset matches only definitions whose `moduleKey` is `sales`, preserves sparse overrides for every other module and organization, increments policy version on material change, and emits existing audit evidence.

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
- Complete frontend target: passed (80 test files, 288 tests).
- Complete backend target: passed (106 test files, 414 tests).
- Repository typecheck: passed.
- Architecture boundary gate: passed (6 tests).
- Repository lint plus changed-file formatting: passed with no errors.
- Repository production build and development frontend build: passed, including Angular template compilation for Organization Controls, Transfers, Adjustments, and Stock Inquiry.
- Opening Stock focused backend capability resolver, tenant isolation, scoped reset/audit/version, re-enable, and route enforcement: passed (2 files, 22 tests).
- Opening Stock, Stock-on-Hand cross-link, Organization Controls, navigation, and routing Angular coverage: passed (5 files, 44 tests across focused runs).
- Product Batches focused backend registry/resolver, tenant isolation, dependency, scoped reset/audit/version, authorization, and route enforcement: passed (3 files, 28 tests).
- Product Batches, Stock-on-Hand fail-soft enrichment/cross-link, Organization Controls, navigation, and routing Angular coverage: passed (5 files, 54 tests across focused runs).
- Expiry Inquiry focused backend registry/resolver, tenant isolation, dependency, scoped reset/audit/version, authorization, and route enforcement: passed (3 files, 28 tests).
- Stock Adjustments focused backend registry/resolver, tenant isolation, 3 middleware instances across 7 endpoints, scoped reset/audit/version, and route enforcement: passed (2 files, 26 tests).
- Stock Adjustments Angular page computed helpers, template reflow, action gating, history toggling, navigation capability filter, routing guard, and Super Admin Organization Controls coverage: passed (4 test files, 44 tests across focused runs).

- The 16 availability controls map exactly to `sales`, `purchases`, `gross-profit`, `stock`, `stock-valuation`, `stock-movements`, `customer-ledger`, `supplier-ledger`, `account-cash-book`, `expenses`, `low-stock`, `expiry`, `dead-stock`, `top-products`, `top-customers`, and `employee-sales`. Disabling one report does not disable any other report or its source module.
- Report selector, results presentation, required filters, pagination, mobile layout, calculations, and refresh were not registered as organization controls. They are either core workflow behavior, domain contracts, or not separate runtime actions. `moduleInfo` is the only shared presentation feature.
- No cross-module capability dependency is registered. Reporting is the frozen read-only composition exception: it consumes public source-module services under Reports RBAC, tenant/warehouse scope, and suspended-read subscription policy. A Reports capability never grants a source-module permission, and disabling an operational source-module capability does not erase access to historical read-only reports.
- Runtime report sources are: Sales for Sales/Top Products/Top Customers/Employee Sales; Purchases for Purchases; Sales plus Returns for Gross Profit; Inventory for Stock/Stock Valuation/Stock Movements; Payments/Ledgers for Customer Ledger/Supplier Ledger; Accounts for Account/Cash-book; Accounts/Expenses for Expenses; Alerts plus Inventory/Catalog for Low Stock/Expiry/Dead Stock. Catalog, Customer, and Product services provide read-only enrichment where applicable.
- Required filter validation, tenant and warehouse isolation, canonical calculations, source-domain invariants, fixed export format availability, and the `reportsExports` plan entitlement remain platform enforced. Capability policy can only remove access; it cannot grant Reports RBAC or source-module access.
- Reports module reset removes only controls whose `moduleKey` is `reports`, preserves all other organization overrides, increments the policy version on material changes, and emits the existing per-control audit evidence.
- The Reports capability integration does not redesign report presentation, make required filters configurable, or gate responsive/pagination infrastructure. Report-by-report screenshot refinement remains a separate workflow; this record does not declare the Reports Production UI fully frozen.

## Purchases backend registry safety decisions

- Required warehouse, supplier, purchase date, product, quantity, unit cost, and conditionally required batch/expiry inputs are platform enforced. Capability policy cannot weaken active-master validation, product tracking requirements, duplicate supplier-reference protection, optimistic versioning, tenant/warehouse scope, or draft/posted/cancelled lifecycle rules.
- Branch, supplier invoice reference, notes, packaging unit, manufacturing date, and landed costs are optional configurable fields. Disabled editability is rejected in the Purchases service before domain mutation; hiding packaging leaves the product base unit available.
- Posting remains one atomic domain workflow across inventory receipt and WAC valuation, supplier payable allocation, optional account payments, immutable snapshots, audit, and idempotency. Inventory, Suppliers, and Accounts direct-module capabilities are intentionally not dependencies because Purchases calls their public domain interfaces and never receives their RBAC permissions.
- `purchases.actions.addPaymentAtPost` is independently configurable and depends on `purchases.actions.post`. It applies only when a posting request contains a payment; disabling it does not disable unpaid or payable-only posting.
- `purchases.actions.createReturn` depends on `returns.actions.post`. The linked route separately retains `returns.post` and `purchases.return` RBAC, Returns module/action checks, source validation, remaining-returnable limits, stock/ledger safety, and tenant scope. The dependency cannot grant Returns access.
- Cancellation remains a compensating transaction: the original posted purchase and movements remain immutable, posted returns continue to block cancellation, and inventory/payable/account reversal safety remains authoritative. Internal unpaid-purchase and purchase-return source reads are deliberately not capability-gated.
- Purchases module reset removes only controls whose `moduleKey` is `purchases`, preserves unrelated overrides and organization isolation, increments the policy version on material changes, and emits existing per-control audit evidence.

## Alerts backend registry safety decisions

- The six availability controls map exactly to `low_stock`, `upcoming_expiry`, `expired_stock`, `dead_stock`, `customer_dues`, and `supplier_dues`. Disabling one family does not disable another family or alter source-domain calculations.
- Search, filters, refresh, pagination, responsive behavior, unread-badge rendering, source calculations, acknowledgement fields, and read-state persistence are not registered because the finalized Alerts source/UI does not expose them as independent configurable behavior. There is no Alerts detail/inspector endpoint, so no inspect/open backend action is registered.
- `GET /api/v1/alerts` and `GET /api/v1/notifications` enforce the Alerts module and return only enabled families. Summary data is removed when `alerts.features.summaryCards` is disabled and otherwise excludes disabled families. `GET /api/v1/notifications/feed` additionally enforces `alerts.features.navbarNotifications`.
- Acknowledge, mark-one-read, and mark-all-read routes enforce their distinct actions after existing authentication, organization context, `alerts.view`, and operational subscription checks. Per-item operations fail safely when the notification is outside the organization, inactive, or belongs to a disabled family. Read state remains user-scoped; acknowledgement remains separate business state.
- Alerts remains a read-only notification projection. No Inventory, Customers, Suppliers, Sales, Payments/Ledgers, or Reports capability dependency is registered, and the unrestricted Alerts source read used by Reporting remains unchanged.
- Alerts module reset removes only controls whose `moduleKey` is `alerts`, preserves all unrelated organization overrides, increments the policy version on material changes, and emits the existing per-control audit evidence.

## Supplier Payments backend registry safety decisions

- `payments.supplier` is a standalone configurable submodule namespace under the existing Payments domain. No synthetic configurable Payments parent was added, and Customer Payments remains outside this policy surface.
- Supplier, Account, allocation mode, amount, payment date, allocations, payment reference, and posting status are platform-enforced workflow or immutable-history fields. Notes are the only optional configurable field, and disabled note editability is rejected before parsing or mutation.
- Post, invoice-specific post, inspect, view ledger/reconciliation, and correct are distinct actions. Invoice-specific posting depends only on the Supplier Payments Post action. No Suppliers, Purchases, or Accounts UI capability dependency is registered because payment orchestration calls their public domain services and must preserve payable, allocation, advance, and account-movement integrity.
- All six supplier-facing read/write endpoints retain existing organization scope, RBAC, operational subscription checks, validation, idempotency, and transaction behavior before capability-controlled handlers run. The shared correction endpoint retains `payments.correct`; only supplier-party corrections additionally enforce the Supplier Payments module/action after tenant-scoped lookup.
- Posted payments, allocations, ledger effects, supplier advances, and account movements remain immutable. Correction continues to create reversal plus optional replacement records, and the session-scoped supplier posting primitive used by Purchases remains capability-neutral so disabling direct Supplier Payments access cannot break cross-domain accounting.
- Supplier Payments module reset removes only controls whose `moduleKey` is `payments.supplier`, preserves unrelated overrides and organization isolation, increments the policy version on material changes, and emits existing per-control audit evidence.

## Supplier Payments frontend and Super Admin safety decisions

- Sidebar entries and direct list/post/ledger routes intersect the existing RBAC with `payments.supplier`; Post and Supplier Ledger additionally require their exact action controls. No payment detail or correction UI was invented because neither exists in the finalized Supplier Payments frontend.
- Module Info and Payment Date Filter are the only configurable list features. Refresh, pagination, responsive cards, supplier search helpers, and empty/loading/error infrastructure remain ordinary workflow behavior because the backend registry defines no controls for them.
- The list and form consume all nine field controls. Supplier, Account, Allocation Mode, Amount, Payment Date, Allocations, Payment Reference, and Status remain platform-enforced. Notes alone can be hidden or made read-only; read-only Notes are omitted from post payloads so direct backend field enforcement remains authoritative.
- Invoice-specific selection depends on both Post and `postInvoiceSpecific`; general oldest-first allocation remains available when only invoice-specific posting is disabled. Supplier advances remain derived allocation results and do not receive a separate frontend-only capability.
- The existing generic Organization Controls renderer owns Supplier Payments Default, Organization Override, Effective, risk, dependency, platform-enforced reason, scoped reset, and critical disable/re-enable presentation. Disabling Supplier Payments does not disable Purchases, Suppliers, Accounts, or their accounting services.

## Customer Payments backend registry safety decisions

- `payments.customer` is a standalone configurable submodule under the existing Payments domain. No synthetic configurable Payments parent and no Customers, Accounts, Sales, or Customer Ledger capability dependency was added.
- Customer search plus Customer, Receive Into Account, Allocation Mode, Amount, Payment Date, Allocations, and Status are platform-enforced workflow or immutable-history controls. Notes is the only configurable field. Module Info, list Search, Payment Date Filter, and Customer Ledger Preview are optional presentation features.
- Post, invoice-specific post, inspect, and correct are distinct backend actions. `payments.customer.actions.postInvoiceSpecific` depends only on `payments.customer.actions.post`; General oldest-first allocation remains available when invoice-specific posting is disabled.
- Direct list/post/detail endpoints retain organization scope, RBAC, operational subscription checks, validation, CSRF/idempotency, and transaction behavior. The shared correction endpoint retains `payments.correct` and applies Customer Payments policy only after tenant-scoped party resolution. The shared Customer Ledger endpoint remains capability-neutral so other legitimate ledger consumers are not coupled to the direct Customer Payments module.
- Capability handling does not change receivable lookup, allocation order, invoice-specific validation, customer advance remainder, ledger effects, account movements, signed balances, posting atomicity, or historical records.

## Supplier Ledger backend and frontend safety decisions

- `payments.supplierLedger` is a standalone configurable sibling submodule under the Payments domain. Its RBAC mapping is `supplier-payments.view` for the module, all four features, all eleven visible fields, and `actions.viewSource`; organization policy can restrict this permission but cannot grant it.
- The ledger-owned selector endpoint is `GET /api/v1/supplier-ledger/suppliers?search=...`; server-side search applies across the complete active, organization-scoped supplier set before returning at most 25 identity records and does not depend on the direct Suppliers module capability. The frontend selector calls this endpoint for each search rather than filtering a preloaded 25-record page locally. `supplierSearch` is required/platform-enforced because it is the only way to choose the ledger subject. `GET /api/v1/suppliers/:id/ledger` requires the Supplier Ledger module. `GET /api/v1/suppliers/:id/reconciliation` additionally requires `features.reconciliationSummary`.
- Supplier identity, outstanding payable, supplier advance, reconciliation status, allocation total, date, reference, entry type, effect kind, signed amount, and source status remain visible, read-only, and platform enforced. There are no editability, create, edit, delete, reconcile, correction, pagination, responsive-layout, or calculation controls.
- Capability policy only restricts inquiry presentation. Purchase payable, supplier payment allocation/advance, purchase return/cancellation, allocation reversal, supplier opening payable/advance, signed amounts, payable/advance balances, allocation totals, reconciliation calculations, and immutable history remain unchanged.
- The frontend consumes the module and controls under `payments.supplierLedger.*`. The direct Supplier Ledger route/sidebar consumes `payments.supplierLedger`; Supplier Payments launch UI continues consuming `payments.supplier.actions.viewLedger`; supplier selection uses the ledger-owned lookup; reconciliation presentation consumes `features.reconciliationSummary`; source links may consume `actions.viewSource` and retain destination-route enforcement.

## Sales backend registry safety decisions

- `sales` controls direct tenant Sales/POS inquiry, draft, post, cancel, print, and linked-return launch. It does not change pricing, customer-tier selection, stock allocation, invoice sequencing, receivables, payments, account movements, cancellation, or immutable invoice history.
- Search and status filter are configurable presentation features. Customer and product search are required/platform-enforced because the frozen selectors rely on server-backed search to reach the complete active tenant master set. No controls were created for pagination, responsive layout, loading state, badges, calculated line totals, or shortcut buttons.
- Customer, Notes, and Packaging Unit are configurable fields enforced before draft mutation. Branch, Warehouse, Sale Date, Product, Quantity, and Unit Price remain required/platform-enforced. Invoice Number, Lifecycle Status, Sale Total, Paid Total, Receivable Total, and posted Payment Details remain visible, read-only, and platform-enforced.
- Payment at post, sale credit, price override, credit-limit approval, expired-stock approval, and negative-stock override are separate organization restrictions under `sales.actions.*` and depend on `sales.actions.post`. Their existing domain conditions and exact RBAC permissions remain authoritative; capability policy cannot create an approval condition or grant authorization.
- `sales.actions.createReturn` depends on `returns.actions.post` and is enforced after Returns module/post and `returns.post` checks. Customers, Inventory, Accounts, and Pricing are source-domain relationships rather than module capability dependencies, so their direct UI policy cannot corrupt or disable Sales domain posting.
- Module reset matches only definitions whose `moduleKey` is `sales`, preserves sparse overrides for every other module and organization, increments policy version on material change, and emits existing audit evidence.

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
- Complete frontend target: passed (80 test files, 288 tests).
- Complete backend target: passed (106 test files, 414 tests).
- Repository typecheck: passed.
- Architecture boundary gate: passed (6 tests).
- Repository lint plus changed-file formatting: passed with no errors.
- Repository production build and development frontend build: passed, including Angular template compilation for Organization Controls, Transfers, Adjustments, and Stock Inquiry.
- Opening Stock focused backend capability resolver, tenant isolation, scoped reset/audit/version, re-enable, and route enforcement: passed (2 files, 22 tests).
- Opening Stock, Stock-on-Hand cross-link, Organization Controls, navigation, and routing Angular coverage: passed (5 files, 44 tests across focused runs).
- Product Batches focused backend registry/resolver, tenant isolation, dependency, scoped reset/audit/version, authorization, and route enforcement: passed (3 files, 28 tests).
- Product Batches, Stock-on-Hand fail-soft enrichment/cross-link, Organization Controls, navigation, and routing Angular coverage: passed (5 files, 54 tests across focused runs).
- Expiry Inquiry focused backend registry/resolver, tenant isolation, dependency, scoped reset/audit/version, authorization, and route enforcement: passed (3 files, 28 tests).
- Stock Adjustments focused backend registry/resolver, tenant isolation, 3 middleware instances across 7 endpoints, scoped reset/audit/version, and route enforcement: passed (2 files, 26 tests).
- Stock Adjustments Angular page computed helpers, template reflow, action gating, history toggling, navigation capability filter, routing guard, and Super Admin Organization Controls coverage: passed (4 test files, 44 tests across focused runs).
- Warehouse Transfers focused backend registry/resolver, tenant isolation, 4 middleware instances across 7 endpoints, scoped reset/audit/version, and route enforcement: passed (2 files, 28 tests).
- Warehouse Transfers Angular page computed helpers, template reflow, action gating, history toggling, navigation capability filter, routing guard, and Super Admin Organization Controls coverage: passed (4 test files, 48 tests across focused runs).
- Stock Movements focused backend registry/resolver, dependency, RBAC, tenant isolation, scoped reset/audit/version, and route enforcement: passed (2 files, 16 tests). Complete backend capability regression set passed (12 files, 115 tests).
- Accounts focused backend registry/resolver, RBAC, tenant isolation, scoped reset/audit/version, route/action/feature enforcement, safe field/lifecycle mutation enforcement, and direct financial workflow enforcement: passed (3 files, 19 tests).
- Reports focused backend registry/resolver, suspended-read and export-entitlement intersection, RBAC, independent report availability, scoped reset/audit/version, module route enforcement, execution enforcement, and PDF/Excel/CSV action enforcement: passed (2 files, 7 tests).
- Alerts focused backend registry/resolver, operational subscription and RBAC intersection, independent family availability, scoped reset/audit/version, module/feature/action route enforcement, family-filtered summaries and notifications, tenant safety, and user-scoped read/acknowledgement safety: passed (3 files, 17 tests).
- Dashboard focused backend registry/resolver, RBAC/subscription intersection, scoped reset/audit/version, module route enforcement, disabled-filter handling, and response shaping: passed (2 files, 5 tests).
- Dashboard focused frontend capability behavior (Dashboard page filter/widget gating and omission resilience, exact 11 CapabilityService defaults/registry, route guards, navigation, and generic Super Admin Organization Controls integration): passed (3 files, 109 tests).
- Alerts focused frontend capability behavior (Notification Center page, Navbar Notifications component, exact 13 CapabilityService defaults/registry, and generic Super Admin Organization Controls integration): passed (4 spec files, 89 tests).
- Reports focused frontend capability behavior, exact CapabilityService defaults plus route/navigation wiring, and generic Super Admin Organization Controls integration: passed (3 files, 75 tests).
- Purchases focused backend registry/resolver, RBAC, dependency, organization isolation, scoped reset/audit, route/action enforcement, optional field editability, payment-at-post enforcement, and internal public-read safety: passed (3 files, 21 tests).
- Purchases focused frontend list/editor, exact CapabilityService defaults plus route/navigation wiring, and generic Super Admin Organization Controls integration: passed (4 spec files, 86 tests).
- Supplier Payments focused backend registry/resolver, RBAC, local dependency, organization isolation, scoped reset/audit, six-route enforcement, optional-field enforcement, invoice-specific posting, supplier-only correction, and internal posting safety: passed (3 files, 14 tests).
- Customer Payments focused backend registry/resolver, RBAC, local dependency, organization isolation, scoped reset/audit, route/action enforcement, optional-field enforcement, invoice-specific posting, shared-ledger independence, and party-resolved correction: passed (3 files, 25 tests).
- Supplier Payments focused frontend list/form, exact CapabilityService defaults plus route/navigation wiring, and generic Super Admin Organization Controls integration: passed (4 files, 86 tests).
- Sales focused backend registry/resolver, RBAC, dependency, organization isolation, scoped reset/audit, route/action enforcement, optional field editability, price override, conditional approvals, and linked return safety: passed (3 files, 18 tests).
- Sales focused frontend list/draft/detail/print pages, exact CapabilityService defaults plus route/navigation wiring, and generic Super Admin Organization Controls integration: passed (4 files, 90 tests).
- Warehouses focused backend registry/effective resolution, RBAC intersection, parsed edit and Code-field enforcement, lifecycle and permanent-delete action enforcement, delete-in-use safety, organization isolation, scoped reset, audit/version evidence, and all direct Warehouse route enforcement: passed (2 files, 12 tests).
- Branches focused backend registry/effective resolution, RBAC intersection, parsed edit/Code/Status-field enforcement, lifecycle and permanent-delete action enforcement, subscription-limit independence, organization isolation, scoped reset, audit/version evidence, and all direct Branch route enforcement: passed (2 files, 9 tests).
- Billing focused backend registry/effective resolution, RBAC and `billing-access` lifecycle intersection, required-field safety, optional Notes payload enforcement, module/action route enforcement, organization isolation, scoped reset, and audit/version evidence: passed (2 files, 10 tests; Submit, Upload, and Download action denials covered in one parameterized case).
- Existing subscription lifecycle and billing workflow regression coverage after Billing capability integration: passed (2 files, 10 tests).
- Organization Setup focused backend registry, default/override/effective resolution, direct parent dependency, RBAC intersection, organization isolation, scoped reset/audit/version, unchanged completion calculations, destination independence, and route enforcement: passed (2 files, 9 tests).
- Existing Setup progress and core capability regressions passed (2 files, 33 tests). The tenant-isolation regression timed out only when run concurrently and passed when rerun alone (1 test).
- Organization Setup page presentation controls, destination permission/capability safety, generic Organization Controls rendering/reset, frontend defaults, route guard, and navigation assertions passed. The combined frontend target also reported seven unrelated stale route-count assertions from pre-existing route changes.
- Changed backend JavaScript syntax checks and `git diff --check`: passed.
- Frontend and backend TypeScript project references typecheck: passed.
- Final development and production builds for all projects passed.

## Settings backend controls (2026-09-02)

- Settings owns the exact ten-control `settings` registry: one module, three presentation-only features (`summary`, `documentPreview`, `guidance`), five configurable residual settings fields, and the `actions.update` action. Organization profile name/timezone remains owned by the Organization domain.
- Settings GET enforces existing `settings.view` RBAC intersected with the effective `settings` module. Settings PATCH enforces existing `settings.manage` RBAC intersected with the effective `settings` module and `settings.actions.update`.
- Settings field editability is enforced against changed parsed PATCH values in the service, so crafted mutations of disabled fields fail with `ORG_FIELD_NOT_EDITABLE` and disabled fields are never implicitly cleared. Existing optimistic versioning, audit, sparse updates, tenant isolation, and settings/setup cache invalidation remain unchanged.
- Focused backend Settings capability registry, effective-policy/reset/isolation, route enforcement, field mutation preservation, Settings RBAC intersection, and Organization profile ownership coverage passed (2 new files plus directly affected Settings/Organization specs; 20 tests).

## Remaining risk

Authenticated cross-organization browser smoke remains outstanding; focused component, route, policy, persistence-boundary, and build validation passed. Foundation + Products + Categories + Stock on Hand + Opening Stock + Product Batches + Expiry Inquiry + Stock Adjustments + Warehouse Transfers + Stock Movements + Accounts + Reports + Alerts + Purchases + Supplier Payments + Supplier Ledger + Sales + Customer Payments + Dashboard + Branches + Organization Setup + Settings are complete. Branches, Warehouses, and Billing backend capability enforcement and generic Super Admin registry integration are complete; their tenant frontend consumption and later unintegrated modules remain separate.

BRANCHES CONTROL REGISTRY: ✅ FROZEN

BRANCHES ORG CONTROLS BACKEND: ✅ VERIFIED

BRANCHES RBAC ∩ CAPABILITY: ✅ VERIFIED

BRANCHES FIELD/ACTION ENFORCEMENT: ✅ VERIFIED

WAREHOUSES SUPER ADMIN REGISTRY: ✅ FROZEN

WAREHOUSES BACKEND CAPABILITY ENFORCEMENT: ✅ VERIFIED

WAREHOUSE LIFECYCLE/DELETE SAFETY: ✅ VERIFIED

WAREHOUSES BACKEND SUPER ADMIN INTEGRATION: ✅ FULLY DONE

BILLING SUPER ADMIN REGISTRY: ✅ FROZEN

BILLING BACKEND ORGANIZATION CONTROLS: ✅ VERIFIED

BILLING BACKEND CAPABILITY ENFORCEMENT: ✅ VERIFIED

BILLING RBAC/LIFECYCLE INTERSECTION: ✅ VERIFIED

BILLING ORGANIZATION CONTROLS BACKEND: ✅ FULLY DONE

SETUP CONTROL REGISTRY: ✅ FROZEN

SETUP MODULE BACKEND ENFORCEMENT: ✅ VERIFIED

SETUP ORGANIZATION CONTROLS BACKEND: ✅ VERIFIED

SETUP RBAC INTERSECTION: ✅ VERIFIED

SETUP DESTINATION ACCESS SAFETY: ✅ VERIFIED

SETUP TENANT ISOLATION: ✅ VERIFIED

ORGANIZATION SETUP CONTROLS BACKEND: ✅ FULLY DONE

SETTINGS CONTROL REGISTRY: ✅ FROZEN

SETTINGS ORG CONTROLS BACKEND: ✅ VERIFIED

SETTINGS RBAC ∩ CAPABILITY: ✅ VERIFIED

SETTINGS FIELD/ACTION ENFORCEMENT: ✅ VERIFIED

SETTINGS FRONTEND CONTROLS INTEGRATION: ✅ FULLY DONE

