# Release 1 Scope

Binding Release 1 boundary for Agrivio.

| Field | Value |
| --- | --- |
| Status | Frozen for Release 1 |
| Version | 1.0 |
| Freeze date | 2026-08-04 |
| Scope changes | Material changes require the documented scope-change process |

This document prevents silent addition of future features. Product requirements are defined in [PRD.md](PRD.md). Finalized decisions remain authoritative in [PROJECT_DECISIONS.md](PROJECT_DECISIONS.md).

## 1. Scope Statement

Release 1 is a production-ready cloud-first web release for the first two clients and for future multi-tenant onboarding. It delivers the operational modules required for correct sales, purchases, inventory, ledgers, reporting, and subscription-controlled access.

Architecture compatibility with a later capability does not mean that capability is implemented in Release 1.

## 2. Included Capabilities

Every included capability corresponds to one or more requirements in [PRD.md](PRD.md).

### Public and authentication

* Public landing page
* Sign in, sign out, and password reset
* Admin-approved account and organization activation
* Permission-based access control
* Branch and warehouse access restriction
* Session expiration and invalidation

### Platform administration

* Shared SaaS multi-tenant operation
* Provider-managed dedicated-cloud deployment for eligible Enterprise customers from the same codebase
* Dedicated environment configuration and dedicated database configuration where contracted
* Provider-controlled deployment and updates
* Super Admin organization create and approve flows
* Strict organization data isolation

### Organization administration

* Organization profile and Release 1 settings
* At least one active Owner per active organization
* Owner-scoped organization control
* No cross-organization Owner access

### Subscriptions

* Starter, Business, and Enterprise plans
* Configurable monthly and annual plan prices in PKR
* Configurable billing period, annual discount, trial duration, grace period, and recoverable retention
* Manual billing verification for bank transfer, JazzCash, and Easypaisa
* Backend entitlements, soft warnings, and hard creation limits
* Suspension and reactivation
* Cancellation separate from data deletion
* Shared SaaS as default deployment
* Dedicated cloud as an Enterprise option

### Users and permissions

* Roles: Super Admin, Owner, Manager, Cashier, Store Keeper
* Roles as predefined permission bundles
* Backend permission-based authorization
* Backend-enforced branch and warehouse access restriction
* Frontend route or UI hiding not treated as authorization
* Owner management of organization employees
* Assignment of employees to one or multiple branches or warehouses

### Branches

* Branch management
* Branch-wise invoice numbering

### Warehouses

* One warehouse at start with support for multiple warehouses
* Warehouse stock transfer

### Products

* Configurable categories
* Product records
* Tracking modes: no batch, batch, batch and expiry
* Mandatory batch tracking for fertilizers, seeds, pesticides, and chemicals

### Units and conversions

* Base units and product-specific configurable packaging units
* Conversion factor from each packaging unit to base unit
* Configurable units for solid and liquid products
* Historical preservation of conversion values used in transactions

### Pricing

* Separate customer type and price tier fields
* Automatic price-tier selection
* Permissioned and audited price override where applicable

### Customers

* Customer records
* Customer types and price tiers
* Customer credit-limit behaviour: warning, Manager approval, or block
* Walk-in credit controlled by policy and permission
* No anonymous walk-in credit
* Customer ledger

### Suppliers

* Supplier records
* Supplier ledger

### Opening balances

* Customer opening receivable
* Customer opening advance
* Supplier opening payable
* Supplier opening advance
* Cash opening balance
* Bank opening balance
* JazzCash opening balance
* Easypaisa opening balance
* Opening stock
* Auditable source transactions

### Inventory

* Warehouse stock
* Traceable stock movements
* Weighted-average cost by product and warehouse
* Landed costs in average cost
* Stock adjustments for damage, expiry, loss, and correction
* Negative stock blocked by default
* Owner negative-stock override with reason and audit
* Stock valuation

### Batches and expiry

* Batch and expiry tracking
* Batch identity preservation
* FEFO allocation for expiring products
* FIFO fallback where expiry does not apply
* Configurable expiry alert thresholds, including 30, 60, 90, and custom days

### Purchases

* Purchase creation linked to a supplier and receiving warehouse
* Supplier invoice or reference number
* Batch, manufacturing, and expiry capture where required
* Preservation of unit and conversion factor used in the purchase
* Freight, loading, transport, and applicable landed-cost entry and allocation
* Full and partial purchase payments updating selected cash, bank, JazzCash, or Easypaisa accounts
* Supplier payable updates for unpaid amounts
* Stock movement creation on purchase posting
* Complete purchase transactional effects
* Atomic purchase posting with no partial failed-posting residue
* Purchase cancellation or reversal with preservation of the original purchase
* Atomic reversal of stock, batch, supplier payable, payment, account, valuation, and audit effects
* No permanent deletion of posted purchases
* No partial failed correction

### Sales POS

* Registered and approved walk-in sales
* Branch and permitted warehouse selection where applicable
* Cash, credit, partial, and mixed payments
* Valid batch allocation using FEFO for expiry-tracked products and FIFO where expiry does not apply
* Stock validation before posting
* Loose-quantity sales with unit conversion preservation
* Expired-product sale approval with warning, reason, and audit
* Negative-stock Owner override path
* Receivable, payment, account, and allocation effects
* Complete sale transactional effects
* Atomic sale posting with no partial failed-posting residue
* Sale cancellation or reversal with preservation of the original invoice
* Atomic corrective transaction with no partial failed correction
* No permanent deletion of posted sales
* Branch-wise invoice numbering

### Payments

* Invoice-specific customer payments
* General customer payments allocated to oldest unpaid invoices
* Customer advances for unallocated remainder
* Invoice-specific and general supplier payments
* Supplier advances
* Preserved payment allocations
* Auditable payment correction

### Ledgers

* Customer receivable ledger updates
* Supplier payable ledger updates

### Returns

* Sales return against invoice
* Sales return without invoice with lookup, approval, reason, and audit
* Purchase return
* Return quantity controls against remaining returnable quantity
* Original batch restoration where identifiable
* Sellable and unsellable returned-stock separation
* Handling of expired, damaged, opened, or contaminated returned stock
* Return resolution by cash refund
* Return resolution by refund through the relevant bank or digital account
* Return resolution by customer or supplier ledger adjustment
* Stock, batch, valuation, ledger, refund, account, and audit effects
* Atomic return posting with no partial failed effects
* Product exchange is handled as an auditable return followed by a separate new sale; Release 1 does not provide a separate exchange transaction type
* No separate credit-note module

### Warehouse transfers

* Product identity preservation
* Batch identity preservation
* Traceable outbound stock movement
* Traceable inbound stock movement
* Atomic posting
* No one-sided failed transfer

### Cancellations and reversals

* Auditable sale cancellation or reversal
* Auditable purchase cancellation or reversal
* Preservation of original posted transactions
* Atomic corrective effects
* No permanent deletion of posted financial or stock transactions

### Accounts

* Cash, bank, JazzCash, and Easypaisa accounts
* Inflows, outflows, and transfers
* Opening balances with auditable account-opening transactions
* Refunds and reversals
* Reconciliation to source transactions

### Expenses

* Expense categories and expense records
* Selected account effect
* Authorized expense correction
* Auditability

### Alerts

* In-app delivery through dashboard alerts and notification center
* Low stock with configurable threshold by applicable product and warehouse
* Upcoming expiry with configurable thresholds
* Expired stock
* Dead stock with configurable inactivity period
* Customer dues
* Supplier dues
* Calculations from authoritative inventory and sales data

### Dashboard

* Minimum dashboard coverage for today's sales, today's purchases, today's expenses, gross profit, cash balances, bank balances, JazzCash balance, Easypaisa balance, customer receivables, supplier payables, low-stock count, upcoming-expiry count, expired-stock count, dead-stock summary, recent sales, and top-selling products
* Dashboard values using the same authoritative calculations as reports and ledgers

### Reports and exports

* Daily and configurable date-range sales reports
* Daily and configurable date-range purchase reports
* Gross-profit reporting from net posted sales revenue minus weighted-average cost of goods sold
* Product-wise and category-wise sales reports
* Branch-wise reports
* Stock, stock valuation, and stock movement
* Customer ledger and supplier ledger
* Account and cash-book reports
* Expense
* Low stock, expiry, and dead stock
* Top products, top customers, and employee sales
* Applicable filters for date range, branch, warehouse, customer, supplier, product, product category, customer type, price tier, payment status, payment method, and employee
* PDF and Excel exports, plus CSV where appropriate
* Reconciliation with source transactions

### Printing

* Generated 58 mm thermal, 80 mm thermal, and A4 layouts
* Browser print dialog
* OS-installed USB and LAN printers available to the browser

### Import

* Manual data entry
* Excel import of product categories, products, product prices, customers, and suppliers
* Excel import of customer opening receivables and advances
* Excel import of supplier opening payables and advances
* Excel import of cash, bank, JazzCash, and Easypaisa opening balances
* Excel import of opening stock
* Preview validation identifying invalid row and field
* No silent ignoring of invalid rows
* Batch and expiry requirements enforced when tracking mode requires them
* Auditable source transactions for opening balances and opening stock
* No partially posted imports after unrecoverable failure

### Audit

* Financial changes
* Inventory changes
* Permission-sensitive overrides
* Subscription changes
* Opening balances
* Stock adjustments
* Returns
* Cancellations
* Reversals
* Actor, timestamp, and reason where applicable

### Settings

* Organization settings required for Release 1 operations

### Backup and restore

* Automated production backups according to deployment and subscription backup policy
* Backup failure monitoring visible to authorized platform operators
* Controlled restore by authorized operators
* Documented restore procedure with verification before normal operation
* Successful restore testing before production acceptance
* No direct production restore by standard organization users

### Production operations

* Provider-controlled deployment and updates for shared SaaS and dedicated cloud
* Health and operational readiness required for production acceptance

## 3. Explicitly Excluded

The following are deferred and are not Release 1 requirements. Being architecture-compatible does not mean implemented in Release 1.

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

## 4. Release Boundaries

| Boundary | Release 1 position |
| --- | --- |
| Connectivity | Cloud-first, not offline-first |
| Client | Web application, not native mobile |
| Accounting | Accounting-lite with gross-profit reporting |
| Billing | Manual subscription verification |
| Reporting | Fixed reports, not custom report builder |
| Printing | Browser print dialog with OS-configured printers |
| Language | English |
| Deployment | Shared SaaS and provider-managed dedicated cloud |
| Alerts | In-app only |
| Correction | Auditable cancellation and reversal, not permanent deletion |
| Exchange | A product exchange is handled as an auditable return followed by a separate new sale. Release 1 does not provide a separate exchange transaction type. |

## 5. Scope-Change Policy

A proposed feature is a Release 1 scope change when it:

* Introduces a new module
* Changes a finalized business invariant
* Requires new external integrations
* Adds a new deployment model
* Adds full accounting capability
* Changes tenant-isolation strategy
* Adds offline synchronization
* Changes subscription enforcement
* Materially changes the frozen data model
* Moves a deferred feature into Release 1

Every scope change must document:

* Business reason
* Client requesting it
* Urgency
* Architecture impact
* Data-model impact
* Test impact
* Schedule impact
* Which Release 1 feature will be removed, if applicable

No AI agent may approve a scope change.

## 6. Release Completion Criteria

Release 1 is complete only when:

* Required workflows operate end to end
* Tenant-isolation tests pass
* Permission tests pass
* Opening balances reconcile
* Stock reconciliation passes
* Customer ledger reconciliation passes
* Supplier ledger reconciliation passes
* Cash, bank, JazzCash, and Easypaisa reconciliation passes
* Weighted-average costing tests pass
* Gross-profit calculations reconcile
* Purchase atomicity tests pass
* Sale atomicity tests pass
* Return atomicity tests pass
* Warehouse-transfer atomicity tests pass
* Cancellation and reversal tests pass
* Required reports reconcile
* Printing formats are verified
* Excel import is verified
* Backup operations are verified
* Restore procedure is documented
* At least one restore test succeeds
* UAT is approved by initial clients
* No critical known defect remains
* Documentation is current

## 7. Future Backlog Boundary

Deferred work is grouped below without implementation design:

### Mobile and offline

* Native Android and iOS applications
* Offline synchronization

### Communications

* WhatsApp Business automation
* SMS automation
* Email automation for operational alerts
* Browser push notifications

### Accounting

* Full double-entry accounting
* Full accounting net profit, balance sheet, trial balance, and general-ledger profit

### Billing automation

* Automated recurring payment gateway

### Localization

* Full Urdu interface
* Multi-currency business operations

### Analytics and AI

* AI forecasting
* Custom report builder

### Integrations

* Public coupon engine

### Printing extensions

* Direct raw USB printer communication
* Direct LAN printer-protocol integration
* Silent printing
* Printer-driver installation
* Cash-drawer integration

### Enterprise deployment

* Microservices
* Self-service on-premise installation
* Self-service dedicated-environment provisioning
* Client-managed code forks
* Separate dedicated-cloud codebase
