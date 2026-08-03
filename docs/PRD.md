# Product Requirements Document

## 1. Document Control

| Field | Value |
| --- | --- |
| Document title | Agrivio Product Requirements Document |
| Product name | Agrivio (working name pending domain and trademark verification) |
| Document status | Draft for P1-02 review |
| Current version | 0.1 |
| Last updated | 2026-08-03 |
| Source of truth | [PROJECT_DECISIONS.md](PROJECT_DECISIONS.md) |
| Approval status | Not yet frozen |

This PRD defines product requirements. It does not define database schemas, API routes, folder structures, or implementation code. Finalized decisions remain authoritative in [PROJECT_DECISIONS.md](PROJECT_DECISIONS.md). Release 1 boundaries are defined in [RELEASE_1_SCOPE.md](RELEASE_1_SCOPE.md).

## 2. Executive Summary

Agrivio is a cloud-first, multi-tenant agricultural retail and wholesale management platform for fertilizer businesses, seed stores, pesticide and chemical dealers, agricultural-input retailers, wholesalers, dealers, and distributors.

Release 1 focuses on operationally correct sales, purchases, inventory, batch and expiry tracking, customer receivables, supplier payables, cash and bank tracking, reports, and subscription-controlled SaaS access.

The first release will initially serve two clients and must support additional organizations without client-specific code forks. Application features described in this document are requirements for delivery, not claims of existing functionality.

## 3. Problem Statement

Agricultural retailers and wholesalers commonly face:

* Manual daily sales records that are slow and error-prone
* Inaccurate customer credit balances
* Weak supplier payable tracking
* Unreliable stock counts
* Missing batch and expiry visibility
* Poor stock valuation
* Difficulty tracking cash and bank movements
* Limited business reporting
* Lack of auditability
* Difficulty scaling from one client to multiple organizations

## 4. Product Goals

Release 1 must achieve the following verifiable goals:

* Maintain reliable stock movement history for every stock change
* Maintain customer and supplier ledger traceability
* Support batch-aware and expiry-aware inventory
* Support cash, credit, partial, and mixed payments
* Provide branch-wise invoices
* Support multiple organizations with strict data isolation
* Provide reports that reconcile with transactional data
* Provide a maintainable modular codebase
* Support SaaS subscriptions and dedicated-cloud deployment from the same codebase
* Support initial clients without creating client-specific code forks

## 5. Non-Goals

Release 1 does not aim to provide:

* Offline synchronization
* Native mobile applications
* Full double-entry accounting
* Automated recurring payment gateways
* WhatsApp Business automation
* SMS automation
* Email automation for operational alerts
* Browser push notifications
* Full Urdu interface
* Multi-currency business operations
* AI forecasting
* Microservices
* Public coupon engine
* Self-service on-premise installation
* Self-service dedicated-environment provisioning
* Custom report builder
* Direct raw USB printer communication
* Direct LAN printer-protocol integration
* Silent printing
* Printer-driver installation
* Cash-drawer integration
* Full accounting net profit, balance sheet, trial balance, or general-ledger profit

See [RELEASE_1_SCOPE.md](RELEASE_1_SCOPE.md) for the binding exclusion boundary and [PROJECT_DECISIONS.md](PROJECT_DECISIONS.md) for the deferred list.

## 6. Target Customer Segments

* **Single-shop agricultural retailer** — typically Starter plan usage with one branch and one warehouse
* **Growing dealer or wholesaler** — typically Business plan usage with expanded operational needs
* **Multi-branch agricultural business** — multiple branches and warehouses under one organization
* **Distributor or enterprise customer** — higher-volume operations and stronger entitlement needs
* **Dedicated-cloud customer** — Enterprise option for dedicated-cloud deployment from the same codebase

Subscription plans remain Starter, Business, and Enterprise as recorded in [PROJECT_DECISIONS.md](PROJECT_DECISIONS.md). This PRD does not create new plans.

## 7. User Roles

| Role | Responsibility and scope |
| --- | --- |
| Super Admin | Platform-level administration, including organization creation or approval and platform subscription oversight |
| Owner | Organization leadership; manages employees only within their own organization; cannot access another organization |
| Manager | Organization operational management within assigned permissions and branch or warehouse access |
| Cashier | Sales and payment operations within assigned permissions and branch access |
| Store Keeper | Inventory, warehouse, and stock operations within assigned permissions and warehouse access |

Additional role rules:

* Roles are predefined permission bundles.
* Backend authorization is permission-based.
* Direct role-name authorization checks are prohibited except for documented platform-scope boundaries, such as Super Admin-only operations.
* Branch and warehouse access restrictions must also be enforced by the backend.
* Frontend route or UI hiding is not sufficient authorization.
* Owners manage employees only within their organization.
* Employees may have access to one or multiple branches or warehouses.
* Exact permission assignments will be finalized before authorization implementation.

A complete permission matrix is out of scope for this document.

## 8. Core Business Concepts

The following concepts are summarized here and defined authoritatively by [PROJECT_DECISIONS.md](PROJECT_DECISIONS.md). Detailed glossary entries belong in the future `DOMAIN_GLOSSARY.md`.

| Concept | Summary |
| --- | --- |
| Organization | Tenant boundary with isolated data and at least one Owner |
| Branch | Organization operating location used for sales and operational assignment |
| Warehouse | Stock storage location; Release 1 starts with one and supports multiple |
| Product | Sellable or stocked item with configurable category, units, pricing, and tracking mode |
| Product category | Configurable grouping for products |
| Unit | Measure used for stock and sales quantities |
| Unit conversion | Automatic conversion between units; conversion values used in transactions are historically preserved |
| Batch | Distinct stock lot; mandatory for fertilizers, seeds, pesticides, and chemicals; remains separate for loose stock |
| Expiry | Optional batch attribute; FEFO applies where expiry is used |
| Customer | Buyer record; may be walk-in or registered |
| Customer type | Separate from price tier: Walk-in, Farmer, Individual, Business, Corporate |
| Price tier | Separate from customer type: Retail, Wholesale, Dealer, Distributor |
| Supplier | Vendor from whom purchases are made |
| Sale | Customer transaction supporting cash, credit, partial, and mixed payments |
| Purchase | Supplier transaction that creates stock movements and updates payable |
| Stock movement | Traceable record for every stock change |
| Receivable | Customer amount owed, tracked through ledger activity |
| Payable | Supplier amount owed, tracked through ledger activity |
| Payment allocation | Invoice-specific or general; general customer payments allocate to oldest unpaid invoices |
| Account | Cash, bank, JazzCash, or Easypaisa account used for money movement |
| Expense | Organization operating expense recorded against accounts |
| Subscription | Starter, Business, or Enterprise plan controlling entitlements and access |

## 9. Primary User Workflows

Each workflow describes the expected business outcome. UI screens and API routes are not defined here.

1. **Organization approval and Owner onboarding** — Super Admin creates or approves an organization; Owner gains access to that organization only.
2. **Owner creates organization employees** — Owner creates employees and assigns roles and branch or warehouse access within the organization.
3. **Initial branch and warehouse setup** — Organization configures at least one branch and one warehouse, with architecture support for more warehouses.
4. **Product, category, unit, and price setup** — Organization configures categories, products, units, conversions, tracking modes, and price tiers.
5. **Customer and supplier setup** — Organization creates customers and suppliers with required type, tier, and credit policy fields.
6. **Opening stock entry** — Organization records opening stock with batch and expiry data where applicable and creates stock movements.
7. **Purchase with batch, expiry, landed cost, and supplier payable** — Purchase posts stock, preserves conversion and batch data, includes applicable landed costs in average cost, and updates supplier payable.
8. **Cash sale** — Authorized user completes a fully paid cash sale and stock is reduced with traceable movements.
9. **Credit or partial-payment sale** — Authorized user completes a credit, partial, or mixed-payment sale according to organization credit policy.
10. **Loose quantity sale using unit conversion** — Sale uses automatic unit conversion while preserving conversion values historically.
11. **Customer payment against a selected invoice** — Payment is applied to a specific customer invoice.
12. **General customer payment allocated to oldest invoices** — General payment allocates automatically to oldest unpaid invoices; remainder may remain as customer advance.
13. **Supplier payment** — Organization records invoice-specific or general supplier payment and updates payable.
14. **Sales return** — Return against an original invoice reverses or adjusts stock and financial effects with auditability.
15. **Return without invoice** — Return without original invoice requires lookup, approval, and audit.
16. **Purchase return** — Purchase return updates stock, supplier payable, and valuation.
17. **Warehouse stock transfer** — Stock moves between warehouses with traceable movements and preserved batch identity.
18. **Stock adjustment** — Authorized adjustment records damaged, expired, lost, or corrected stock with reason and audit.
19. **Expired-product sale approval** — Expired-product sale requires Manager or Owner approval, warning, reason, and audit entry.
20. **Negative-stock Owner override** — Negative stock remains blocked by default; Owner override requires reason and audit entry.
21. **Expense and account transaction entry** — Organization records expenses and account inflows, outflows, and transfers.
22. **Invoice and receipt printing** — User prints supported formats through browser-based printing.
23. **Dashboard and report viewing** — Authorized users view operational dashboard metrics and reconciliable reports.
24. **Excel data import** — Import uses templates, preview validation, and rejects silent acceptance of invalid rows.
25. **Subscription activation, expiry, grace period, and reactivation** — Organization proceeds through approved trial, active subscription, configured grace period, suspension, and reactivation without deleting existing data for plan-limit excess.

## 10. Functional Requirements

Requirements are individually numbered, testable, implementation-neutral, and scoped to Release 1 unless marked otherwise.

### Platform and Tenancy

- **FR-PLATFORM-002:** The system shall support shared SaaS deployment for multiple organizations from one codebase.
- **FR-PLATFORM-003:** The system shall support provider-managed dedicated-cloud deployment for eligible Enterprise customers using the same application codebase as shared SaaS, with dedicated environment configuration and dedicated database configuration where contracted, under provider-controlled deployment and updates.
- **FR-PLATFORM-004:** The system shall prevent one organization from reading, creating, updating, or deleting another organization's data.
- **FR-PLATFORM-005:** The system shall provide a public landing page describing the product and supported access paths.
- **FR-PLATFORM-006:** The system shall support onboarding of the initial two clients and additional organizations without client-specific code forks.
- **FR-PLATFORM-007:** The system shall exclude self-service dedicated-environment provisioning from Release 1.
- **FR-PLATFORM-008:** The system shall exclude self-service on-premise installation from Release 1.
- **FR-PLATFORM-009:** The system shall exclude client-managed code forks and a separate dedicated-deployment product codebase from Release 1.

### Authentication and Authorization

- **FR-AUTH-001:** The system shall allow an authorized user to sign in with valid credentials.
- **FR-AUTH-002:** The system shall allow an authenticated user to sign out.
- **FR-AUTH-003:** The system shall support password reset for eligible accounts.
- **FR-AUTH-004:** The system shall require admin-approved activation before a newly created organization account becomes operational.
- **FR-AUTH-005:** The system shall enforce permission-based authorization on the backend for protected operations.
- **FR-AUTH-006:** The system shall enforce branch and warehouse access restrictions on the backend.
- **FR-AUTH-007:** The system shall not treat frontend route or UI hiding as sufficient authorization.
- **FR-AUTH-008:** The system shall prohibit direct role-name authorization checks except for documented platform-scope boundaries, such as Super Admin-only operations.

### Organization Management

- **FR-ORG-001:** The system shall allow Super Admin to create an organization.
- **FR-ORG-002:** The system shall allow Super Admin to approve public organization activation requests.
- **FR-ORG-003:** The system shall require every active organization to have at least one active Owner; additional Owners may be supported according to the finalized permission policy, while the exact maximum number of Owners and Owner-management policy remain unresolved until the permission matrix is defined.
- **FR-ORG-004:** The system shall prevent an Owner from accessing another organization.
- **FR-ORG-005:** The system shall allow organization settings required for Release 1 operations to be managed by authorized users.

### Subscriptions

- **FR-SUB-001:** The system shall support Starter, Business, and Enterprise subscription plans.
- **FR-SUB-002:** The system shall support a configurable billing period, including monthly and annual options, with Release 1 amounts in PKR.
- **FR-SUB-003:** The system shall support a configurable annual discount.
- **FR-SUB-004:** The system shall support a configurable approved trial duration without requiring a payment method.
- **FR-SUB-005:** The system shall support a configurable grace-period duration after subscription expiry.
- **FR-SUB-006:** The system shall support manual billing verification for bank transfer, JazzCash, and Easypaisa in Release 1.
- **FR-SUB-007:** The system shall enforce plan limits through backend entitlements.
- **FR-SUB-008:** The system shall show soft warnings before hard creation limits are reached.
- **FR-SUB-009:** The system shall block new creations that exceed hard plan limits without deleting existing data.
- **FR-SUB-010:** The system shall support subscription suspension and reactivation.
- **FR-SUB-011:** The system shall treat cancellation and data deletion as separate processes.
- **FR-SUB-012:** The system shall support a configurable recoverable data-retention period after cancellation.
- **FR-SUB-013:** The system shall treat shared SaaS as the default deployment and dedicated cloud as an Enterprise option.
- **FR-SUB-014:** The system shall support configurable monthly plan prices.
- **FR-SUB-015:** The system shall support configurable annual plan prices.

### Branches and Warehouses

- **FR-BRANCH-001:** The system shall allow an organization to create and manage branches.
- **FR-BRANCH-002:** The system shall support branch-wise invoice numbering.
- **FR-WAREHOUSE-001:** The system shall allow an organization to operate with one warehouse at start.
- **FR-WAREHOUSE-002:** The system shall support multiple warehouses within an organization.
- **FR-WAREHOUSE-003:** The system shall allow authorized warehouse stock transfers between warehouses.

### Users, Roles, and Permissions

- **FR-USER-001:** The system shall support the predefined roles Super Admin, Owner, Manager, Cashier, and Store Keeper.
- **FR-USER-002:** The system shall allow an Owner to create and manage employees only within their own organization.
- **FR-USER-003:** The system shall allow employees to be assigned to one or multiple branches or warehouses.
- **FR-USER-004:** The system shall deny operations that the authenticated user's permissions do not allow.

### Products and Pricing

- **FR-PRODUCT-001:** The system shall allow configurable product categories.
- **FR-PRODUCT-002:** The system shall allow creation and maintenance of product records.
- **FR-PRODUCT-003:** The system shall store inventory quantities in base units.
- **FR-PRODUCT-004:** The system shall support automatic unit conversions.
- **FR-PRODUCT-005:** The system shall allow authorized users to configure product-specific packaging units; examples such as 1 KG, 5 KG, 10 KG, 20 KG, 25 KG, 40 KG, 50 KG, ML, Litre, Bottle, Can, and Drum are illustrative only and are not system-wide mandatory units.
- **FR-PRODUCT-006:** The system shall require every packaging unit to have a conversion factor to the product's base unit, and shall support configurable units for solid and liquid products.
- **FR-PRODUCT-007:** The system shall historically preserve conversion values used in transactions.
- **FR-PRODUCT-008:** The system shall support product tracking modes of no batch tracking, batch tracking, and batch and expiry tracking.
- **FR-PRODUCT-009:** The system shall require batch tracking for fertilizers, seeds, pesticides, and chemicals.
- **FR-PRODUCT-010:** The system shall treat customer type and price tier as separate fields.
- **FR-PRODUCT-011:** The system shall support customer types Walk-in, Farmer, Individual, Business, and Corporate.
- **FR-PRODUCT-012:** The system shall support price tiers Retail, Wholesale, Dealer, and Distributor.
- **FR-PRODUCT-013:** The system shall automatically select product pricing from the customer's price tier.
- **FR-PRODUCT-014:** The system shall allow manual price overrides only with required permission and audit where applicable.

### Customers and Suppliers

- **FR-CUSTOMER-001:** The system shall allow creation and maintenance of customer records.
- **FR-CUSTOMER-002:** The system shall support organization-configurable customer credit-limit behaviour of warning, Manager approval, or block.
- **FR-CUSTOMER-003:** The system shall control walk-in credit by organization policy and permission.
- **FR-CUSTOMER-004:** The system shall disallow anonymous walk-in credit.
- **FR-CUSTOMER-005:** The system shall maintain a customer ledger of receivable activity.
- **FR-SUPPLIER-001:** The system shall allow creation and maintenance of supplier records.
- **FR-SUPPLIER-002:** The system shall maintain a supplier ledger of payable activity.

### Inventory and Batches

- **FR-INVENTORY-001:** The system shall allow opening stock entry for products and warehouses.
- **FR-INVENTORY-002:** The system shall track warehouse stock by product and warehouse.
- **FR-INVENTORY-003:** The system shall keep batches separate for loose stock.
- **FR-INVENTORY-004:** The system shall allocate expiring products using FEFO.
- **FR-INVENTORY-005:** The system shall use FIFO as fallback where expiry does not apply.
- **FR-INVENTORY-006:** The system shall create a traceable stock movement for every stock change.
- **FR-INVENTORY-007:** The system shall maintain weighted-average inventory cost by product and warehouse.
- **FR-INVENTORY-008:** The system shall include freight, loading, transport, and applicable landed costs in average cost.
- **FR-INVENTORY-009:** The system shall support stock adjustments for damaged, expired, and lost stock with reason and audit.
- **FR-INVENTORY-010:** The system shall block negative stock by default.
- **FR-INVENTORY-011:** The system shall allow Owner override of negative stock only with a mandatory reason and audit entry.
- **FR-INVENTORY-012:** The system shall provide stock valuation based on maintained weighted-average cost.
- **FR-INVENTORY-013:** The system shall support expiry alerts at 30, 60, 90, and custom days.

### Purchases

- **FR-PURCHASE-001:** The system shall allow authorized users to create purchases.
- **FR-PURCHASE-002:** The system shall support full and partial purchase payments.
- **FR-PURCHASE-003:** The system shall create stock movements when a purchase is posted.
- **FR-PURCHASE-004:** The system shall update supplier payable when unpaid purchase amounts remain.
- **FR-PURCHASE-005:** The system shall support purchase returns that update stock, supplier payable, and valuation.
- **FR-PURCHASE-006:** The system shall post purchase inventory, payable, payment, and audit effects atomically.
- **FR-PURCHASE-007:** The system shall require an authorized user to select the receiving warehouse for a purchase.
- **FR-PURCHASE-008:** The system shall link each purchase to a supplier.
- **FR-PURCHASE-009:** The system shall allow recording of the supplier invoice or reference number on a purchase.
- **FR-PURCHASE-010:** The system shall record batch information for purchased products when their tracking mode requires it.
- **FR-PURCHASE-011:** The system shall record manufacturing and expiry dates where required by product tracking mode.
- **FR-PURCHASE-012:** The system shall preserve the unit and conversion factor used in the purchase transaction.
- **FR-PURCHASE-013:** The system shall allow entry of freight, loading, transport, and applicable additional landed costs on a purchase.
- **FR-PURCHASE-014:** The system shall allocate landed costs into inventory cost according to the finalized business rules.
- **FR-PURCHASE-015:** The system shall update the selected cash, bank, JazzCash, or Easypaisa account when full or partial purchase payments are posted.
- **FR-PURCHASE-016:** A failed purchase posting operation shall not leave partial purchase, stock, payable, or account records.

### Sales

- **FR-SALE-001:** The system shall allow an authorized user to create a sale for a registered customer or an approved walk-in customer.
- **FR-SALE-002:** The system shall support cash, credit, partial, and mixed-payment sales.
- **FR-SALE-003:** The system shall enforce the organization's customer credit-limit behaviour during credit sales.
- **FR-SALE-004:** The system shall require Manager or Owner approval, a warning, a reason, and an audit entry for expired-product sales.
- **FR-SALE-005:** The system shall reduce stock through traceable movements when a sale is posted.
- **FR-SALE-006:** The system shall support loose-quantity sales using automatic unit conversion with historically preserved conversion values.
- **FR-SALE-007:** The system shall generate branch-wise invoice numbers for sales invoices.
- **FR-SALE-008:** The system shall require the user to select a branch and a permitted warehouse where applicable for a sale.
- **FR-SALE-009:** The system shall allocate sale products from valid batches.
- **FR-SALE-010:** The system shall suggest FEFO allocation for products with expiry tracking.
- **FR-SALE-011:** The system shall use FIFO allocation where expiry does not apply.
- **FR-SALE-012:** The system shall validate available stock before posting a sale.
- **FR-SALE-013:** The system shall keep negative stock blocked unless an authorized Owner override is completed.
- **FR-SALE-014:** The system shall preserve the unit and conversion factor used in the sale transaction.
- **FR-SALE-015:** The system shall create or update the customer receivable where an unpaid sale amount remains.
- **FR-SALE-016:** The system shall create account movements against the selected payment accounts for sale payments.
- **FR-SALE-017:** The system shall allow mixed payments to allocate one sale amount across multiple payment methods.
- **FR-SALE-018:** The system shall preserve customer payment allocations for posted sales.
- **FR-SALE-019:** The system shall post sale invoice, stock, batch-allocation, receivable, payment, account, sequence, and audit effects atomically.
- **FR-SALE-020:** A failed sale posting operation shall not leave partial sale or stock effects.

### Returns

- **FR-RETURN-001:** The system shall allow sales returns processed against an original invoice.
- **FR-RETURN-002:** The system shall allow sales returns processed without an original invoice only with lookup, approval, and audit.
- **FR-RETURN-003:** The system shall allow purchase returns that update stock, supplier payable, and valuation.
- **FR-RETURN-004:** The system shall record approval and audit information for returns that require them.
- **FR-RETURN-005:** The system shall apply the corresponding financial and stock effects when a return is posted.

### Payments and Ledgers

- **FR-PAYMENT-001:** The system shall support invoice-specific customer payments.
- **FR-PAYMENT-002:** The system shall support general customer payments.
- **FR-PAYMENT-003:** The system shall allocate general customer payments automatically to the oldest unpaid invoices.
- **FR-PAYMENT-004:** The system shall allow unallocated customer payment remainder to remain as customer advance.
- **FR-PAYMENT-005:** The system shall support invoice-specific supplier payments.
- **FR-PAYMENT-006:** The system shall support general supplier payments.
- **FR-PAYMENT-007:** The system shall update customer receivable and supplier payable ledgers according to posted payment activity.

### Accounts

- **FR-ACCOUNT-001:** The system shall support cash accounts.
- **FR-ACCOUNT-002:** The system shall support bank accounts.
- **FR-ACCOUNT-003:** The system shall support JazzCash accounts.
- **FR-ACCOUNT-004:** The system shall support Easypaisa accounts.
- **FR-ACCOUNT-005:** The system shall record account inflows.
- **FR-ACCOUNT-006:** The system shall record account outflows.
- **FR-ACCOUNT-007:** The system shall support transfers between accounts.

### Expenses

- **FR-EXPENSE-001:** The system shall support expense categories.
- **FR-EXPENSE-002:** The system shall allow authorized users to record expenses against accounts.

### Alerts and Notifications

- **FR-ALERT-001:** The system shall support low-stock alerts.
- **FR-ALERT-002:** The system shall support upcoming-expiry alerts using configurable thresholds that may include 30, 60, 90, and custom days.
- **FR-ALERT-003:** The system shall support expired-stock alerts.
- **FR-ALERT-004:** The system shall support dead-stock alerts.
- **FR-ALERT-005:** The system shall support customer-dues alerts.
- **FR-ALERT-006:** The system shall support supplier-dues alerts.
- **FR-ALERT-007:** The system shall deliver Release 1 alerts inside the authenticated web application through dashboard alerts and a notification center.
- **FR-ALERT-008:** The system shall exclude SMS, WhatsApp, email automation, and browser push notifications from Release 1 alert delivery unless separately approved through scope change.

### Dashboard, Reports, and Exports

- **FR-REPORT-001:** The system shall provide authorized users a Release 1 dashboard with minimum access to today's sales, today's purchases, today's expenses, gross profit, cash balances, bank and digital-wallet balances, customer receivables, supplier payables, low-stock count, upcoming-expiry count, expired-stock count, dead-stock summary, recent sales, and top-selling products, without prescribing visual layout.
- **FR-REPORT-002:** The system shall provide a daily sales report.
- **FR-REPORT-003:** The system shall provide a daily purchase report.
- **FR-REPORT-004:** The system shall provide a gross-profit report calculated as net sales revenue minus weighted-average cost of goods sold, accounting for product and invoice discounts, sales returns, reversed or cancelled sales, and weighted-average cost by product and warehouse; Release 1 shall not provide full accounting net profit, balance sheet, trial balance, or general-ledger profit.
- **FR-REPORT-005:** The system shall provide a stock report.
- **FR-REPORT-006:** The system shall provide a stock valuation report.
- **FR-REPORT-007:** The system shall provide a stock movement report.
- **FR-REPORT-008:** The system shall provide a customer ledger report.
- **FR-REPORT-009:** The system shall provide a supplier ledger report.
- **FR-REPORT-010:** The system shall provide account and cash-book reports.
- **FR-REPORT-011:** The system shall provide an expense report.
- **FR-REPORT-012:** The system shall provide a low-stock report.
- **FR-REPORT-013:** The system shall provide an expiry report.
- **FR-REPORT-014:** The system shall provide a dead-stock report.
- **FR-REPORT-015:** The system shall provide a top-products report.
- **FR-REPORT-016:** The system shall provide a top-customers report.
- **FR-REPORT-017:** The system shall provide an employee-sales report.
- **FR-REPORT-018:** The system shall support report export to PDF, Excel, and CSV where tabular export is appropriate.
- **FR-REPORT-019:** The system shall ensure required reports and dashboard values reconcile with underlying transactional data and shall not use independent conflicting calculations.
- **FR-REPORT-020:** The system shall provide a configurable date-range sales report.
- **FR-REPORT-021:** The system shall provide a configurable date-range purchase report.
- **FR-REPORT-022:** The system shall provide a product-wise sales report.
- **FR-REPORT-023:** The system shall provide a category-wise sales report.
- **FR-REPORT-024:** The system shall provide branch-wise reports where branch-scoped reporting applies.
- **FR-REPORT-025:** Where applicable, reports shall support filters for date range, branch, warehouse, customer, supplier, product, product category, customer type, price tier, payment status, payment method, and employee.

### Printing

- **FR-PRINT-001:** The system shall generate 58 mm thermal layouts.
- **FR-PRINT-002:** The system shall generate 80 mm thermal layouts.
- **FR-PRINT-003:** The system shall generate A4 layouts.
- **FR-PRINT-004:** The system shall perform printing through the browser print dialog.
- **FR-PRINT-005:** The system shall support USB and LAN printers only when those printers are already installed and configured in the user's operating system and available to the browser.
- **FR-PRINT-006:** The system shall exclude direct raw USB communication from Release 1.
- **FR-PRINT-007:** The system shall exclude direct LAN printer-protocol integration from Release 1.
- **FR-PRINT-008:** The system shall exclude silent printing from Release 1.
- **FR-PRINT-009:** The system shall exclude printer-driver installation from Release 1.
- **FR-PRINT-010:** The system shall exclude cash-drawer integration from Release 1.

### Import and Migration

- **FR-IMPORT-001:** The system shall support manual data entry for migration.
- **FR-IMPORT-002:** The system shall support Excel import using defined templates.
- **FR-IMPORT-003:** The system shall show import validation errors before final import.
- **FR-IMPORT-004:** The system shall not silently ignore invalid import rows.

### Audit

- **FR-AUDIT-001:** The system shall audit financial changes with actor and timestamp.
- **FR-AUDIT-002:** The system shall audit inventory changes with actor and timestamp.
- **FR-AUDIT-003:** The system shall audit permission-sensitive overrides with actor, timestamp, and reason where applicable.
- **FR-AUDIT-004:** The system shall audit subscription changes with actor and timestamp.
- **FR-AUDIT-005:** The system shall retain audit entries required to reconstruct sensitive operational actions.

### Settings, Backup, and Restore

- **FR-SETTINGS-001:** The system shall provide organization settings required for Release 1 operational configuration.
- **FR-SETTINGS-002:** The system shall back up production data automatically according to the active deployment and subscription backup policy.
- **FR-SETTINGS-003:** The system shall prevent standard organization users from directly restoring the production database.
- **FR-SETTINGS-004:** The system shall monitor backup operations for failure and make backup failure visible to authorized platform operators.
- **FR-SETTINGS-005:** The system shall restrict restore operations to authorized operators under a documented controlled restore procedure.
- **FR-SETTINGS-006:** The system shall require restored data to be verified before normal operation resumes.
- **FR-SETTINGS-007:** At least one successful restore test shall be completed before production acceptance.

## 11. Required Functional Coverage

The functional requirements above cover the following Release 1 areas:

| Coverage area | Requirement IDs |
| --- | --- |
| Platform and tenancy | FR-PLATFORM-002 to FR-PLATFORM-009 |
| Authentication and authorization | FR-AUTH-001 to FR-AUTH-008 |
| Organization management | FR-ORG-001 to FR-ORG-005 |
| Subscriptions | FR-SUB-001 to FR-SUB-015 |
| Branches and warehouses | FR-BRANCH-001 to FR-BRANCH-002; FR-WAREHOUSE-001 to FR-WAREHOUSE-003 |
| Users, roles, and permissions | FR-USER-001 to FR-USER-004 |
| Products and pricing | FR-PRODUCT-001 to FR-PRODUCT-014 |
| Customers and suppliers | FR-CUSTOMER-001 to FR-CUSTOMER-005; FR-SUPPLIER-001 to FR-SUPPLIER-002 |
| Inventory and batches | FR-INVENTORY-001 to FR-INVENTORY-013 |
| Purchases and suppliers | FR-PURCHASE-001 to FR-PURCHASE-016; FR-PAYMENT-005 to FR-PAYMENT-007 |
| Sales and customers | FR-SALE-001 to FR-SALE-020; FR-PAYMENT-001 to FR-PAYMENT-004 |
| Returns | FR-RETURN-001 to FR-RETURN-005 |
| Accounts and expenses | FR-ACCOUNT-001 to FR-ACCOUNT-007; FR-EXPENSE-001 to FR-EXPENSE-002 |
| Alerts | FR-ALERT-001 to FR-ALERT-008 |
| Printing and import | FR-PRINT-001 to FR-PRINT-010; FR-IMPORT-001 to FR-IMPORT-004 |
| Reports and dashboard | FR-REPORT-001 to FR-REPORT-025 |
| Audit | FR-AUDIT-001 to FR-AUDIT-005 |
| Settings, backup, and restore | FR-SETTINGS-001 to FR-SETTINGS-007 |

## 12. Non-Functional Requirements

### Security

- **NFR-SEC-001:** The system shall enforce tenant isolation and automatically test it at every tenant-owned data-access boundary.
- **NFR-SEC-002:** The system shall protect user passwords using secure password hashing.
- **NFR-SEC-003:** The system shall enforce server-side authorization for protected operations.
- **NFR-SEC-004:** The system shall manage secrets through environment-based configuration and keep secrets out of client-side code and source control.
- **NFR-SEC-005:** The system shall record security-sensitive audit events for security-relevant business actions.
- **NFR-SEC-006:** The system shall validate untrusted input before processing.
- **NFR-SEC-007:** The system shall support session expiration and invalidation for authenticated sessions.

### Data Integrity

- **NFR-DATA-001:** The system shall execute multi-record financial and stock workflows atomically.
- **NFR-DATA-002:** The system shall preserve historical posted transaction data required for audit and reconciliation.
- **NFR-DATA-003:** The system shall never permanently delete posted financial or stock transactions.
- **NFR-DATA-004:** The system shall support reconciliation of stock, receivables, payables, and account balances to source transactions.
- **NFR-DATA-005:** The system shall use stable precision rules for money and quantity values.
- **NFR-DATA-006:** Gross profit shall derive from authoritative posted sales and weighted-average cost data.

### Performance

- **NFR-PERF-001:** Measurable acceptance thresholds shall be finalized before production hardening for POS product search, common list loading, sale posting, purchase posting, dashboard loading, standard report loading, Excel import volume, and concurrent users.
- **NFR-PERF-002:** Exact performance threshold values are not fixed in this PRD and remain controlled unresolved details until the performance-baselines phase.
- **NFR-PERF-003:** Performance acceptance thresholds shall be derived from measured baselines before production hardening begins.

### Scalability

- **NFR-SCALE-001:** The system shall support organizations with thousands of products and customers.
- **NFR-SCALE-002:** The system shall support concurrent transactional volume for sales, purchases, and stock movements within the later-approved concurrent-user target.
- **NFR-SCALE-003:** The system shall support multiple organizations on shared SaaS.
- **NFR-SCALE-004:** The system shall support multiple branches and warehouses per organization.
- **NFR-SCALE-005:** The system shall use database indexing appropriate for tenant-scoped operational queries.

### Reliability

- **NFR-REL-001:** The system shall handle failures in a controlled manner without silent data corruption.
- **NFR-REL-002:** The system shall prevent partial posting of multi-record financial or inventory workflows.
- **NFR-REL-003:** The system shall apply idempotency controls where retries could duplicate financial effects.

### Maintainability

- **NFR-MAINT-001:** The system shall be implemented as a modular monolith.
- **NFR-MAINT-002:** The frontend shall remain feature-based.
- **NFR-MAINT-003:** The backend shall keep controllers thin and place business logic in services.
- **NFR-MAINT-004:** Shared code shall be introduced only where genuinely reusable.
- **NFR-MAINT-005:** Development shall remain documentation-driven against authoritative project documents.
- **NFR-MAINT-006:** Automated tests shall cover critical business invariants and permission boundaries.

### Usability

- **NFR-UX-001:** The system shall provide a responsive web interface that adapts to common desktop and tablet viewport widths used for POS and back-office work.
- **NFR-UX-002:** The system shall present clear loading, empty, validation, and error states.
- **NFR-UX-003:** The POS workflow shall support efficient repeated sales entry.
- **NFR-UX-004:** Release 1 interface language shall be English.
- **NFR-UX-005:** The system shall remain structurally ready for future localization without delivering a full Urdu interface in Release 1.

### Accessibility

- **NFR-A11Y-001:** Essential Release 1 workflows shall be operable by keyboard.
- **NFR-A11Y-002:** Essential Release 1 workflows shall use semantic interactive controls.
- **NFR-A11Y-003:** Form inputs in essential workflows shall provide programmatically associated labels.
- **NFR-A11Y-004:** Interactive controls in essential workflows shall show visible focus states.
- **NFR-A11Y-005:** Essential workflows shall expose validation errors accessibly.
- **NFR-A11Y-006:** Essential text and controls shall meet the project's later-defined contrast standard.
- **NFR-A11Y-007:** Essential Release 1 workflows shall be tested with at least one supported screen-reader and browser combination before release.

### Observability

- **NFR-OBS-001:** The system shall emit structured application logs.
- **NFR-OBS-002:** Production errors shall be capturable by the selected error-monitoring solution before launch.
- **NFR-OBS-003:** Sensitive business actions shall create audit events separate from technical logs.
- **NFR-OBS-004:** Health checks shall expose application and required dependency status without exposing secrets.

### Backup

- **NFR-BACKUP-001:** Production backups shall follow the active deployment and subscription backup policy.
- **NFR-BACKUP-002:** Restore operations shall be restricted to authorized operators.
- **NFR-BACKUP-003:** A documented controlled restore procedure shall exist and include verification before return to normal operation.
- **NFR-BACKUP-004:** Standard organization users shall not be able to restore the production database directly.
- **NFR-BACKUP-005:** Backup failures shall be visible to authorized platform operators.
- **NFR-BACKUP-006:** At least one successful restore test shall be completed before production acceptance.

## 13. Business Invariants

The following product-level invariants are mandatory:

```text
Current warehouse stock must reconcile with valid posted stock movements.

Customer receivable must reconcile with opening balance, posted credit sales, returns, allocated payments, advances, and credits.

Supplier payable must reconcile with opening payable, posted purchases, purchase returns, allocated payments, advances, and supplier credits.

Cash, bank, and digital-wallet balances must reconcile with opening balances, posted inflows, posted outflows, payments, refunds, and transfers.

Gross profit must derive from authoritative posted sales and weighted-average cost data.

Posted financial and stock transactions must not be permanently deleted.

Cross-organization access must never be permitted.
```

Detailed equations and reversal rules remain for the future `BUSINESS_RULES.md`.

## 14. Assumptions and Dependencies

Confirmed assumptions:

* Cloud access is acceptable for Release 1.
* Browser printing is acceptable for Release 1.
* Initial billing is manually verified.
* Initial language is English.
* Initial business currency is PKR.
* Initial clients begin with one warehouse.
* The provider manages hosting for the initial SaaS offering.
* Client business data belongs to the client.
* Product source code and platform intellectual property belong to the provider unless agreed otherwise.
* Commercial defaults, including proposed annual discount and recoverable retention values, will be finalized in `SUBSCRIPTION_AND_BILLING.md` and are not hardcoded in core product requirements.

No cloud provider, printer model, legal registration, or client data volume is invented here.

## 15. Controlled Unresolved Details

These details remain unresolved and must not reopen finalized product decisions:

| Unresolved detail | Resolve before / in |
| --- | --- |
| Exact permission matrix | Authorization design and implementation tasks after business-rules documentation |
| Maximum or allowed number of Owners and Owner-management policy | Permission-matrix definition before authorization implementation |
| Final invoice fields and layouts | Printing and UI design tasks before print verification |
| Exact report columns and filter combinations | Reporting specification task before report implementation |
| Final branding, domain, and trademark verification | Branding and launch-preparation tasks |
| Hosting provider and production topology | Architecture and deployment tasks |
| Initial client migration volumes and data quality | Client onboarding and import-preparation tasks |
| Exact commercial prices | `SUBSCRIPTION_AND_BILLING.md` and commercial packaging tasks before billing go-live |
| Final support channels | Launch-operations planning |
| Backup provider, frequency, and storage implementation | Deployment design and backup/operations tasks before production release |
| Performance acceptance thresholds | Performance-baselines phase before production hardening |
| Concurrent-user target | Performance-baselines phase before production hardening |
| Import-volume acceptance target | Performance-baselines phase before production hardening |
| Accessibility browser and screen-reader verification matrix | UI test planning before release verification |
| Exact session-expiration policy | Security design before authentication implementation freeze |
| Selected error-monitoring provider | Observability setup before launch |

## 16. Release Acceptance Summary

Release 1 must support this end-to-end workflow:

```text
Organization activation
→ initial setup
→ product and opening stock
→ purchase
→ sale
→ partial payment
→ invoice printing
→ return
→ customer and supplier ledger
→ stock valuation
→ report export
→ audited correction
```

Binding scope and completion criteria are defined in [RELEASE_1_SCOPE.md](RELEASE_1_SCOPE.md).
