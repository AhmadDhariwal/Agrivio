# Product Requirements Document

## 1. Document Control

| Field | Value |
| --- | --- |
| Document title | Agrivio Product Requirements Document |
| Product name | Agrivio — working name pending domain and trademark verification |
| Document status | Frozen for Release 1 |
| Current version | 1.0 |
| Last updated | 2026-08-04 |
| Source of truth | [PROJECT_DECISIONS.md](PROJECT_DECISIONS.md) |
| Approval status | Approved for Phase 1 continuation |

This PRD defines product requirements. It does not define database schemas, API routes, folder structures, or implementation code. Finalized decisions remain authoritative in [PROJECT_DECISIONS.md](PROJECT_DECISIONS.md). Release 1 boundaries are defined in [RELEASE_1_SCOPE.md](RELEASE_1_SCOPE.md). Features described in this PRD are requirements, not claims of existing functionality.

## 2. Executive Summary

Agrivio is a cloud-first, multi-tenant agricultural retail and wholesale management platform for fertilizer retailers, seed stores, pesticide and chemical dealers, agricultural-input retailers, wholesalers, dealers, and distributors.

Release 1 focuses on operationally correct sales, purchases, inventory, batch tracking, expiry tracking, customer receivables, supplier payables, cash and digital-account tracking, reports, and subscription-controlled SaaS access.

The initial release will serve two clients while supporting future organizations without client-specific code forks. Application features described in this document are requirements for delivery, not claims of existing functionality.

## 3. Problem Statement

Agricultural retailers and wholesalers commonly face:

* Manual and error-prone daily sales records
* Inaccurate customer credit balances
* Weak supplier payable tracking
* Unreliable stock quantities
* Missing batch and expiry visibility
* Poor inventory valuation
* Difficulty tracking cash, bank, JazzCash, and Easypaisa movements
* Limited business reporting
* Lack of auditability
* Difficulty scaling from one client to multiple organizations
* Difficulty migrating existing opening balances and stock
* Lack of controlled transaction correction and reversal

## 4. Product Goals

Release 1 must achieve the following verifiable goals:

* Maintain reliable stock movement history for every stock change
* Maintain customer and supplier ledger traceability
* Support batch-aware and expiry-aware inventory
* Support cash, credit, partial, and mixed payments
* Provide branch-wise invoice numbering
* Support multiple organizations with strict tenant isolation
* Provide reports that reconcile with source transactions
* Provide a maintainable modular-monolith architecture
* Support shared SaaS and provider-managed dedicated cloud from the same codebase
* Support initial clients without creating client-specific code forks
* Support auditable opening balances
* Support auditable transaction cancellation and reversal
* Support atomic stock and financial workflows
* Support tested backup and restore operations

## 5. Non-Goals

Release 1 does not aim to provide:

* Offline synchronization
* Native Android application
* Native iOS application
* Full double-entry accounting
* Full accounting net profit
* Balance sheet
* Trial balance
* General-ledger profit
* Automated recurring payment gateway
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
* Client-managed code forks
* Separate dedicated-cloud codebase
* Custom report builder
* Direct raw USB printer communication
* Direct LAN printer-protocol integration
* Silent printing
* Printer-driver installation
* Cash-drawer integration

Architecture compatibility with a future feature must not be described as Release 1 implementation.

See [RELEASE_1_SCOPE.md](RELEASE_1_SCOPE.md) for the binding exclusion boundary and [PROJECT_DECISIONS.md](PROJECT_DECISIONS.md) for the deferred list.

## 6. Target Customer Segments

* **Single-shop agricultural retailer** — typically Starter plan usage with one branch and one warehouse
* **Growing dealer or wholesaler** — typically Business plan usage with expanded operational needs
* **Multi-branch agricultural business** — multiple branches and warehouses under one organization
* **Distributor or enterprise customer** — higher-volume operations and stronger entitlement needs
* **Provider-managed dedicated-cloud customer** — Enterprise option for dedicated-cloud deployment from the same codebase

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
* Branch access must be enforced by the backend.
* Warehouse access must be enforced by the backend.
* Frontend route protection and hidden UI controls are not sufficient authorization.
* Owners can manage employees only within their own organization.
* Employees may be assigned to one or multiple branches or warehouses.
* Every active organization must have at least one active Owner.

The following Owner-policy details remain unresolved and must not be implied by requirements:

* Whether multiple Owners are allowed
* Maximum number of Owners
* Who may add or remove another Owner
* How the final Owner may be replaced or removed

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
| Base unit | Unit in which inventory quantities are stored |
| Packaging unit | Product-specific sellable or purchase packaging with a conversion factor to the base unit |
| Unit conversion | Automatic conversion between packaging and base units; conversion values used in transactions are historically preserved |
| Batch | Distinct stock lot; mandatory for fertilizers, seeds, pesticides, and chemicals; remains separate for loose stock |
| Expiry | Optional batch attribute; FEFO applies where expiry is used |
| Customer | Buyer record; may be walk-in or registered |
| Customer type | Separate from price tier: Walk-in, Farmer, Individual, Business, Corporate |
| Price tier | Separate from customer type: Retail, Wholesale, Dealer, Distributor |
| Supplier | Vendor from whom purchases are made |
| Sale | Customer transaction supporting cash, credit, partial, and mixed payments |
| Purchase | Supplier transaction that creates stock movements and updates payable |
| Return | Sales or purchase return that adjusts stock, valuation, and ledger effects |
| Stock movement | Traceable record for every stock change |
| Warehouse transfer | Movement of stock between warehouses with preserved product and batch identity |
| Receivable | Customer amount owed, tracked through ledger activity |
| Payable | Supplier amount owed, tracked through ledger activity |
| Payment allocation | Invoice-specific or general; general customer payments allocate to oldest unpaid invoices |
| Customer advance | Unallocated customer payment remainder held as advance |
| Supplier advance | Unallocated supplier payment remainder held as advance |
| Account | Cash, bank, JazzCash, or Easypaisa account used for money movement |
| Expense | Organization operating expense recorded against accounts |
| Subscription | Starter, Business, or Enterprise plan controlling entitlements and access |
| Audit event | Record of actor, timestamp, and reason where applicable for sensitive actions |
| Corrective transaction | Auditable cancellation or reversal that preserves the original posted transaction |
| Opening balance | Auditable initial receivable, payable, account, or stock balance |

## 9. Primary User Workflows

Each workflow describes the expected business outcome. UI screens and API routes are not defined here.

1. **Organization approval and Owner onboarding** — Super Admin creates or approves an organization; Owner gains access to that organization only.
2. **Owner creates employees** — Owner creates employees and assigns roles and branch or warehouse access within the organization.
3. **Branch and warehouse setup** — Organization configures at least one branch and one warehouse, with architecture support for more warehouses.
4. **Product, category, unit, conversion, and pricing setup** — Organization configures categories, products, base units, packaging units, conversions, tracking modes, and price tiers.
5. **Customer and supplier setup** — Organization creates customers and suppliers with required type, tier, and credit policy fields.
6. **Customer opening receivable or advance** — Organization records an auditable customer opening receivable or opening advance.
7. **Supplier opening payable or advance** — Organization records an auditable supplier opening payable or opening advance.
8. **Cash, bank, JazzCash, and Easypaisa opening balances** — Organization records auditable opening balances for cash and digital accounts.
9. **Opening stock entry** — Organization records opening stock with batch and expiry data where applicable through an auditable opening-stock transaction.
10. **Purchase with supplier, warehouse, batch, expiry, and landed cost** — Purchase posts stock to the receiving warehouse, preserves conversion and batch data, includes applicable landed costs in average cost, and updates supplier payable.
11. **Full or partial purchase payment** — Purchase payment updates the selected cash, bank, JazzCash, or Easypaisa account and reduces payable.
12. **Cash sale** — Authorized user completes a fully paid cash sale and stock is reduced with traceable movements.
13. **Credit sale** — Authorized user completes a credit sale according to organization credit policy and creates receivable.
14. **Partial-payment sale** — Authorized user completes a partially paid sale with receivable for the unpaid amount.
15. **Mixed-payment sale** — Authorized user allocates one sale across multiple payment methods.
16. **Loose-quantity sale using unit conversion** — Sale uses automatic unit conversion while preserving conversion values historically.
17. **Customer invoice-specific payment** — Payment is applied to a specific customer invoice.
18. **General customer payment allocated to oldest unpaid invoices** — General payment allocates automatically to oldest unpaid invoices; remainder may remain as customer advance.
19. **Supplier invoice-specific payment** — Payment is applied to a specific supplier invoice.
20. **General supplier payment** — Organization records a general supplier payment and updates payable.
21. **Customer advance** — Unallocated customer payment remainder remains as customer advance.
22. **Supplier advance** — Unallocated supplier payment remainder remains as supplier advance.
23. **Sales return against invoice** — Return against an original invoice adjusts stock and financial effects within remaining returnable quantity.
24. **Sales return without invoice** — Return without original invoice requires lookup, approval, reason, and audit.
25. **Purchase return** — Purchase return updates stock, supplier payable, and valuation within remaining returnable quantity.
26. **Sellable and unsellable return handling** — Returned stock is classified as sellable or unsellable; unsellable stock does not enter normal sellable inventory.
27. **Warehouse stock transfer** — Stock moves between warehouses atomically with preserved product and batch identity and traceable outbound and inbound movements.
28. **Stock adjustment** — Authorized adjustment records damaged, expired, lost, or corrected stock with reason and audit.
29. **Expired-product sale approval** — Expired-product sale requires Manager or Owner approval, warning, reason, and audit entry.
30. **Negative-stock Owner override** — Negative stock remains blocked by default; Owner override requires reason and audit entry.
31. **Sales cancellation or reversal** — Posted sale is cancelled or reversed through an auditable corrective transaction that preserves the original invoice and atomically reverses related effects.
32. **Purchase cancellation or reversal** — Posted purchase is cancelled or reversed through an auditable corrective transaction that preserves the original purchase and atomically reverses related effects.
33. **Expense entry** — Organization records an expense against a selected account with auditability.
34. **Account inflow** — Organization records an account inflow.
35. **Account outflow** — Organization records an account outflow.
36. **Account transfer** — Organization transfers funds between accounts.
37. **Invoice and receipt printing** — User prints supported formats through the browser print dialog using OS-configured printers.
38. **Dashboard and report viewing** — Authorized users view operational dashboard metrics and reconciliable reports.
39. **PDF, Excel, and CSV report export** — Authorized users export applicable reports to PDF, Excel, and CSV where tabular export is appropriate.
40. **Excel data import** — Import validates and previews rows for supported master and opening-balance data and rejects silent acceptance of invalid rows.
41. **Subscription activation** — Organization activates an approved subscription plan with backend entitlements.
42. **Subscription expiry** — Expired subscription enters the configured grace behaviour without deleting existing data.
43. **Grace period** — Organization operates under the configured grace period after expiry.
44. **Suspension** — Organization access is suspended according to subscription policy.
45. **Reactivation** — Suspended subscription is reactivated without deleting existing data.
46. **Backup failure monitoring** — Authorized platform operators can see backup failures.
47. **Controlled data restore** — Authorized operators restore data under a documented procedure with verification before normal operation.
48. **Audited corrective transaction** — Sensitive corrections are posted as auditable corrective transactions rather than permanent deletions.

## 10. Functional Requirements

Requirements are individually numbered, testable, implementation-neutral, and scoped to Release 1 unless marked otherwise.

### Platform and Tenancy

- **FR-PLATFORM-002:** The system shall support shared SaaS deployment for multiple organizations from one codebase.
- **FR-PLATFORM-003:** The system shall support provider-managed dedicated-cloud deployment for eligible Enterprise customers using the same application codebase as shared SaaS, with dedicated environment configuration and dedicated database configuration where contracted, under provider-controlled deployment and updates.
- **FR-PLATFORM-004:** The system shall prevent one organization from reading, creating, updating, or deleting another organization's data.
- **FR-PLATFORM-005:** The system shall provide a public landing page describing the product and supported access paths.
- **FR-PLATFORM-006:** The system shall support onboarding of the initial two clients and additional organizations without client-specific code forks.

### Authentication and Authorization

- **FR-AUTH-001:** The system shall allow an authorized user to sign in with valid credentials.
- **FR-AUTH-002:** The system shall allow an authenticated user to sign out.
- **FR-AUTH-003:** The system shall support password reset for eligible accounts.
- **FR-AUTH-004:** The system shall require admin-approved activation before a newly created organization account becomes operational.
- **FR-AUTH-005:** The system shall enforce permission-based authorization on the backend for protected operations.
- **FR-AUTH-006:** The system shall enforce branch and warehouse access restrictions on the backend.
- **FR-AUTH-007:** The system shall not treat frontend route or UI hiding as sufficient authorization.
- **FR-AUTH-008:** The system shall prohibit direct role-name authorization checks except for documented platform-scope boundaries, such as Super Admin-only operations.
- **FR-AUTH-009:** The system shall support session expiration for authenticated sessions.
- **FR-AUTH-010:** The system shall support session invalidation for authenticated sessions.

### Organization Management

- **FR-ORG-001:** The system shall allow Super Admin to create an organization.
- **FR-ORG-002:** The system shall allow Super Admin to approve public organization activation requests.
- **FR-ORG-003:** The system shall require every active organization to have at least one active Owner.
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
- **FR-WAREHOUSE-004:** The system shall preserve product identity during warehouse stock transfers.
- **FR-WAREHOUSE-005:** The system shall preserve batch identity during warehouse stock transfers.
- **FR-WAREHOUSE-006:** The system shall create a traceable outbound stock movement for a warehouse transfer.
- **FR-WAREHOUSE-007:** The system shall create a traceable inbound stock movement for a warehouse transfer.
- **FR-WAREHOUSE-008:** The system shall post warehouse transfers atomically.
- **FR-WAREHOUSE-009:** A failed warehouse transfer shall not leave one-sided stock effects.

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
- **FR-CUSTOMER-006:** The system shall support customer opening receivable balances.
- **FR-CUSTOMER-007:** The system shall support customer opening advances.
- **FR-CUSTOMER-008:** The system shall create an auditable source transaction for each customer opening receivable or opening advance.
- **FR-CUSTOMER-009:** The system shall not allow silent mutable initialization of customer balances without an auditable source transaction.
- **FR-SUPPLIER-001:** The system shall allow creation and maintenance of supplier records.
- **FR-SUPPLIER-002:** The system shall maintain a supplier ledger of payable activity.
- **FR-SUPPLIER-003:** The system shall support supplier opening payable balances.
- **FR-SUPPLIER-004:** The system shall support supplier opening advances.
- **FR-SUPPLIER-005:** The system shall create an auditable source transaction for each supplier opening payable or opening advance.
- **FR-SUPPLIER-006:** The system shall not allow unexplained mutable initialization of supplier payables without an auditable source transaction.

### Inventory and Batches

- **FR-INVENTORY-001:** The system shall allow opening stock entry for products and warehouses.
- **FR-INVENTORY-002:** The system shall track warehouse stock by product and warehouse.
- **FR-INVENTORY-003:** The system shall keep batches separate for loose stock.
- **FR-INVENTORY-004:** The system shall allocate expiring products using FEFO.
- **FR-INVENTORY-005:** The system shall use FIFO as fallback where expiry does not apply.
- **FR-INVENTORY-006:** The system shall create a traceable stock movement for every stock change.
- **FR-INVENTORY-007:** The system shall maintain weighted-average inventory cost by product and warehouse.
- **FR-INVENTORY-008:** The system shall include freight, loading, transport, and applicable landed costs in average cost.
- **FR-INVENTORY-009:** The system shall support stock adjustments for damage, expiry, loss, and correction with reason and audit.
- **FR-INVENTORY-010:** The system shall block negative stock by default.
- **FR-INVENTORY-011:** The system shall allow Owner override of negative stock only with a mandatory reason and audit entry.
- **FR-INVENTORY-012:** The system shall provide stock valuation based on maintained weighted-average cost.
- **FR-INVENTORY-013:** The system shall support expiry alerts at 30, 60, 90, and custom days.
- **FR-INVENTORY-014:** The system shall preserve batch identity for tracked products.
- **FR-INVENTORY-015:** The system shall store expiry data for products whose tracking mode requires expiry.
- **FR-INVENTORY-016:** The system shall create an auditable opening-stock transaction for opening stock entry.

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
- **FR-PURCHASE-017:** The system shall not permanently delete posted purchases.
- **FR-PURCHASE-018:** The system shall support auditable purchase cancellation or reversal.
- **FR-PURCHASE-019:** The system shall preserve the original purchase when a cancellation or reversal is posted.
- **FR-PURCHASE-020:** The system shall atomically reverse stock, batch, supplier payable, payment, account, valuation, and audit effects for a purchase cancellation or reversal.
- **FR-PURCHASE-021:** A failed purchase cancellation or reversal shall not leave partial corrective effects.

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
- **FR-SALE-010:** The system shall allocate stock using FEFO when the product uses expiry tracking.
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
- **FR-SALE-021:** The system shall not permanently delete posted sales.
- **FR-SALE-022:** The system shall support auditable sale cancellation or reversal.
- **FR-SALE-023:** The system shall preserve the original sales invoice when a cancellation or reversal is posted.
- **FR-SALE-024:** The system shall post sale cancellation or reversal as an atomic corrective transaction.
- **FR-SALE-025:** A failed sale cancellation or reversal shall not leave partial corrective effects.

### Returns

- **FR-RETURN-001:** The system shall allow sales returns processed against an original invoice.
- **FR-RETURN-002:** The system shall allow sales returns processed without an original invoice only with lookup, approval, and audit.
- **FR-RETURN-003:** The system shall allow purchase returns that update stock, supplier payable, and valuation.
- **FR-RETURN-004:** The system shall record approval and audit information for returns that require them.
- **FR-RETURN-005:** The system shall apply the corresponding financial and stock effects when a return is posted.
- **FR-RETURN-006:** The system shall require a return reason for posted returns.
- **FR-RETURN-007:** The system shall prevent a return quantity from exceeding the remaining returnable quantity.
- **FR-RETURN-008:** The system shall prevent a sales return quantity from exceeding the original sold quantity minus previous returns for the same source.
- **FR-RETURN-009:** The system shall prevent a purchase return quantity from exceeding the original purchased quantity minus previous returns for the same source.
- **FR-RETURN-010:** The system shall restore the original batch for returned stock where the original batch is identifiable.
- **FR-RETURN-011:** The system shall support classification of returned stock as sellable.
- **FR-RETURN-012:** The system shall support classification of returned stock as unsellable.
- **FR-RETURN-013:** The system shall support handling of expired returned stock.
- **FR-RETURN-014:** The system shall support handling of damaged returned stock.
- **FR-RETURN-015:** The system shall support handling of opened or contaminated returned stock.
- **FR-RETURN-016:** The system shall prevent unsellable returned stock from entering normal sellable inventory.
- **FR-RETURN-017:** The system shall support return resolution by cash refund.
- **FR-RETURN-018:** The system shall support return resolution by refund through the relevant bank or digital account.
- **FR-RETURN-019:** The system shall support return resolution by customer or supplier ledger adjustment.
- **FR-RETURN-022:** The system shall apply stock, batch, valuation, ledger, refund, account, and audit effects when a return is posted.
- **FR-RETURN-023:** The system shall post returns atomically.
- **FR-RETURN-024:** A failed return posting shall not leave partial stock, batch, ledger, valuation, payment, account, or audit effects.

### Payments and Ledgers

- **FR-PAYMENT-001:** The system shall support invoice-specific customer payments.
- **FR-PAYMENT-002:** The system shall support general customer payments.
- **FR-PAYMENT-003:** The system shall allocate general customer payments automatically to the oldest unpaid invoices.
- **FR-PAYMENT-004:** The system shall allow unallocated customer payment remainder to remain as customer advance.
- **FR-PAYMENT-005:** The system shall support invoice-specific supplier payments.
- **FR-PAYMENT-006:** The system shall support general supplier payments.
- **FR-PAYMENT-007:** The system shall update customer receivable and supplier payable ledgers according to posted payment activity.
- **FR-PAYMENT-008:** The system shall support supplier advances for unallocated supplier payment remainder.
- **FR-PAYMENT-009:** The system shall preserve payment allocations for posted payments.
- **FR-PAYMENT-010:** The system shall support auditable payment correction.

### Accounts

- **FR-ACCOUNT-001:** The system shall support cash accounts.
- **FR-ACCOUNT-002:** The system shall support bank accounts.
- **FR-ACCOUNT-003:** The system shall support JazzCash accounts.
- **FR-ACCOUNT-004:** The system shall support Easypaisa accounts.
- **FR-ACCOUNT-005:** The system shall record account inflows.
- **FR-ACCOUNT-006:** The system shall record account outflows.
- **FR-ACCOUNT-007:** The system shall support transfers between accounts.
- **FR-ACCOUNT-008:** The system shall support opening balances for cash, bank, JazzCash, and Easypaisa accounts.
- **FR-ACCOUNT-009:** The system shall create an auditable account-opening transaction for each account opening balance.
- **FR-ACCOUNT-010:** The system shall support account refunds linked to source transactions.
- **FR-ACCOUNT-011:** The system shall support account reversals linked to corrective transactions.
- **FR-ACCOUNT-012:** The system shall support reconciliation of account balances to source transactions.

### Expenses

- **FR-EXPENSE-001:** The system shall support expense categories.
- **FR-EXPENSE-002:** The system shall allow authorized users to record expenses against a selected account.
- **FR-EXPENSE-003:** The system shall allow authorized expense correction.
- **FR-EXPENSE-004:** The system shall retain auditability for expense recording and correction.

### Alerts and Notifications

- **FR-ALERT-001:** The system shall support low-stock alerts.
- **FR-ALERT-002:** The system shall support upcoming-expiry alerts using configurable thresholds that may include 30, 60, 90, and custom days.
- **FR-ALERT-003:** The system shall support expired-stock alerts.
- **FR-ALERT-004:** The system shall support dead-stock alerts.
- **FR-ALERT-005:** The system shall support customer-dues alerts.
- **FR-ALERT-006:** The system shall support supplier-dues alerts.
- **FR-ALERT-007:** The system shall deliver Release 1 alerts inside the authenticated web application through dashboard alerts and a notification center.
- **FR-ALERT-009:** The system shall support a configurable low-stock threshold by applicable product and warehouse.
- **FR-ALERT-010:** The system shall support a configurable dead-stock inactivity period.
- **FR-ALERT-011:** The system shall calculate alert values from authoritative inventory and sales data.
- **FR-ALERT-012:** The system shall not silently hardcode the dead-stock inactivity period.

### Dashboard, Reports, and Exports

- **FR-REPORT-001:** The system shall provide authorized users a Release 1 dashboard with minimum access to today's sales, today's purchases, today's expenses, gross profit, cash balances, bank balances, JazzCash balance, Easypaisa balance, customer receivables, supplier payables, low-stock count, upcoming-expiry count, expired-stock count, dead-stock summary, recent sales, and top-selling products, without prescribing visual layout.
- **FR-REPORT-002:** The system shall provide a daily sales report.
- **FR-REPORT-003:** The system shall provide a daily purchase report.
- **FR-REPORT-004:** The system shall provide a gross-profit report calculated from net posted sales revenue minus weighted-average cost of goods sold, accounting for approved price adjustments, sales returns, cancelled sales, reversed sales, and weighted-average cost by product and warehouse.
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

### Import and Migration

- **FR-IMPORT-001:** The system shall support manual data entry for migration.
- **FR-IMPORT-002:** The system shall support Excel import using defined templates.
- **FR-IMPORT-003:** The system shall show import validation errors before final import.
- **FR-IMPORT-004:** The system shall not silently ignore invalid import rows.
- **FR-IMPORT-005:** The system shall support Excel import of product categories.
- **FR-IMPORT-006:** The system shall support Excel import of products.
- **FR-IMPORT-007:** The system shall support Excel import of product prices.
- **FR-IMPORT-008:** The system shall support Excel import of customers.
- **FR-IMPORT-009:** The system shall support Excel import of suppliers.
- **FR-IMPORT-010:** The system shall support Excel import of customer opening receivables.
- **FR-IMPORT-011:** The system shall support Excel import of customer opening advances.
- **FR-IMPORT-012:** The system shall support Excel import of supplier opening payables.
- **FR-IMPORT-013:** The system shall support Excel import of supplier opening advances.
- **FR-IMPORT-014:** The system shall support Excel import of cash opening balances.
- **FR-IMPORT-015:** The system shall support Excel import of bank opening balances.
- **FR-IMPORT-016:** The system shall support Excel import of JazzCash opening balances.
- **FR-IMPORT-017:** The system shall support Excel import of Easypaisa opening balances.
- **FR-IMPORT-018:** The system shall support Excel import of opening stock.
- **FR-IMPORT-019:** The system shall validate import data before posting.
- **FR-IMPORT-020:** The system shall show a preview validation of import data before posting.
- **FR-IMPORT-021:** The system shall identify the invalid row for each failed import validation.
- **FR-IMPORT-022:** The system shall identify the invalid field for each failed import validation.
- **FR-IMPORT-023:** The system shall require batch information on opening-stock import when product tracking mode requires batch tracking.
- **FR-IMPORT-024:** The system shall require expiry information on opening-stock import when product tracking mode requires expiry tracking.
- **FR-IMPORT-025:** The system shall create auditable source transactions for imported opening balances and opening stock.
- **FR-IMPORT-026:** The system shall avoid partially posted imports after an unrecoverable import failure.

### Audit

- **FR-AUDIT-001:** The system shall audit financial changes with actor and timestamp.
- **FR-AUDIT-002:** The system shall audit inventory changes with actor and timestamp.
- **FR-AUDIT-003:** The system shall audit permission-sensitive overrides with actor, timestamp, and reason where applicable.
- **FR-AUDIT-004:** The system shall audit subscription changes with actor and timestamp.
- **FR-AUDIT-005:** The system shall retain audit entries required to reconstruct sensitive operational actions.
- **FR-AUDIT-006:** The system shall audit opening-balance transactions.
- **FR-AUDIT-007:** The system shall audit stock adjustments.
- **FR-AUDIT-008:** The system shall audit returns.
- **FR-AUDIT-009:** The system shall audit cancellations.
- **FR-AUDIT-010:** The system shall audit reversals.

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
| Platform and tenancy | FR-PLATFORM-002 to FR-PLATFORM-006 |
| Authentication and authorization | FR-AUTH-001 to FR-AUTH-010 |
| Organization management | FR-ORG-001 to FR-ORG-005 |
| Subscriptions | FR-SUB-001 to FR-SUB-015 |
| Branches and warehouses | FR-BRANCH-001 to FR-BRANCH-002; FR-WAREHOUSE-001 to FR-WAREHOUSE-009 |
| Users, roles, and permissions | FR-USER-001 to FR-USER-004 |
| Products and pricing | FR-PRODUCT-001 to FR-PRODUCT-014 |
| Customers and suppliers | FR-CUSTOMER-001 to FR-CUSTOMER-009; FR-SUPPLIER-001 to FR-SUPPLIER-006 |
| Inventory and batches | FR-INVENTORY-001 to FR-INVENTORY-016 |
| Purchases | FR-PURCHASE-001 to FR-PURCHASE-021 |
| Sales | FR-SALE-001 to FR-SALE-025 |
| Returns | FR-RETURN-001 to FR-RETURN-019; FR-RETURN-022 to FR-RETURN-024 |
| Payments and ledgers | FR-PAYMENT-001 to FR-PAYMENT-010 |
| Accounts and expenses | FR-ACCOUNT-001 to FR-ACCOUNT-012; FR-EXPENSE-001 to FR-EXPENSE-004 |
| Alerts | FR-ALERT-001 to FR-ALERT-007; FR-ALERT-009 to FR-ALERT-012 |
| Printing and import | FR-PRINT-001 to FR-PRINT-005; FR-IMPORT-001 to FR-IMPORT-026 |
| Reports and dashboard | FR-REPORT-001 to FR-REPORT-025 |
| Audit | FR-AUDIT-001 to FR-AUDIT-010 |
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
- **NFR-DATA-007:** The system shall not leave partial reversal effects.
- **NFR-DATA-008:** The system shall not leave partial return effects.
- **NFR-DATA-009:** The system shall not leave one-sided warehouse-transfer effects.

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
- **NFR-REL-004:** The system shall support recovery from recoverable operational failures.
- **NFR-REL-005:** The system shall execute correction workflows atomically.

### Maintainability

- **NFR-MAINT-001:** The system shall be implemented as a modular monolith.
- **NFR-MAINT-002:** The frontend shall remain feature-based.
- **NFR-MAINT-003:** The backend shall keep controllers thin and place business logic in services.
- **NFR-MAINT-004:** Shared code shall be introduced only where genuinely reusable.
- **NFR-MAINT-005:** Development shall remain documentation-driven against authoritative project documents.
- **NFR-MAINT-006:** Automated tests shall cover critical business rules and permission boundaries.
- **NFR-MAINT-007:** Complex reusable data access shall use repositories.
- **NFR-MAINT-008:** Automated tests shall cover tenant-isolation boundaries.

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

Customer receivable must reconcile with opening receivable or advance, posted credit sales, returns, allocated payments, advances, credits, cancellations, and reversals.

Supplier payable must reconcile with opening payable or advance, posted purchases, purchase returns, allocated payments, advances, supplier credits, cancellations, and reversals.

Cash, bank, JazzCash, and Easypaisa balances must reconcile with opening balances, posted inflows, posted outflows, payments, refunds, transfers, cancellations, and reversals.

Warehouse transfers must not create or destroy total organization stock except through a separately authorized stock adjustment.

Returns must not leave partial stock, batch, ledger, valuation, payment, account, or audit effects.

Cancellations and reversals must not leave partial corrective effects.

Gross profit must derive from authoritative posted sales and weighted-average cost data.

Posted financial and stock transactions must not be permanently deleted.

Cross-organization access must never be permitted.
```

Detailed formulas belong in the future `BUSINESS_RULES.md`.

## 14. Assumptions and Dependencies

Confirmed assumptions:

* Cloud access is acceptable for Release 1.
* Browser printing is acceptable for Release 1.
* Initial billing is manually verified.
* Release 1 language is English.
* Release 1 currency is PKR.
* Initial clients begin with one warehouse.
* The provider manages hosting for the initial SaaS offering.
* Client business data belongs to the client.
* Product source code and platform intellectual property belong to the provider unless contractually agreed otherwise.
* Commercial defaults belong in `SUBSCRIPTION_AND_BILLING.md`.
* Detailed formulas belong in `BUSINESS_RULES.md`.
* Detailed domain definitions belong in `DOMAIN_GLOSSARY.md`.

Do not invent cloud provider, printer model, legal registration, client data volumes, browser versions, or performance timings here.

## 15. Controlled Unresolved Details

These details remain unresolved and must not reopen finalized product decisions:

| Unresolved detail | Resolve before / in |
| --- | --- |
| Exact permission matrix | Before authorization implementation |
| Multiple-Owner policy | Before authorization implementation |
| Maximum number of Owners | Before authorization implementation |
| Owner replacement/removal policy | Before authorization implementation |
| Release 1 two-factor-authentication policy | Before authentication implementation freeze |
| Exact session-expiration policy | Before authentication implementation freeze |
| Final invoice fields and layouts | Before printing implementation |
| Exact report columns | Before report implementation |
| Exact report filter combinations | Before report implementation |
| Final brand, domain, and trademark verification | Before launch |
| Hosting provider and topology | Architecture and deployment tasks |
| Dedicated-cloud topology | Architecture and deployment tasks |
| Initial migration data volumes | Before import implementation |
| Initial client data quality | Before migration execution |
| Exact commercial prices | `SUBSCRIPTION_AND_BILLING.md` |
| Commercial defaults | `SUBSCRIPTION_AND_BILLING.md` |
| Final support channels | Before launch |
| Backup provider | Deployment design |
| Backup frequency | Deployment design |
| Backup storage | Deployment design |
| Backup retention implementation | Deployment design |
| Performance acceptance thresholds | Before production hardening |
| Concurrent-user target | Before production hardening |
| Import-volume target | Before import performance testing |
| Browser and OS support matrix | Before UI acceptance |
| Viewport and device verification matrix | Before UI acceptance |
| Accessibility browser/screen-reader matrix | Before accessibility verification |
| Contrast standard | Before UI design-system freeze |
| Error-monitoring provider | Before production launch |
| Warehouse-transfer in-transit policy | `BUSINESS_RULES.md` |
| Warehouse destination-acceptance policy | `BUSINESS_RULES.md` |
| One-step versus two-step transfer | `BUSINESS_RULES.md` |
| Detailed cancellation and reversal formulas | `BUSINESS_RULES.md` |
| Detailed return formulas | `BUSINESS_RULES.md` |
| Detailed gross-profit formula | `BUSINESS_RULES.md` |
| Exact import spreadsheet columns | Import specification task |
| Whether Release 1 supports separately recorded line-level or invoice-level discounts | `BUSINESS_RULES.md` before sales implementation |

## 16. Release Acceptance Summary

Release 1 must support this end-to-end workflow:

```text
Organization activation
→ organization setup
→ branch and warehouse setup
→ opening customer balances
→ opening supplier balances
→ opening account balances
→ product setup
→ opening stock
→ purchase
→ partial purchase payment
→ sale
→ mixed or partial sale payment
→ invoice printing
→ customer payment
→ supplier payment
→ warehouse transfer
→ return
→ cancellation or reversal
→ ledger reconciliation
→ stock valuation
→ gross-profit report
→ report export
→ backup verification
→ controlled restore test
→ audited corrective transaction
```

Binding scope and completion criteria are defined in [RELEASE_1_SCOPE.md](RELEASE_1_SCOPE.md).
