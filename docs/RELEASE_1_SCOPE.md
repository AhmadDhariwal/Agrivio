# Release 1 Scope

Binding Release 1 boundary for Agrivio.

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

### Platform administration

* Shared SaaS multi-tenant operation
* Provider-managed dedicated-cloud deployment for eligible Enterprise customers from the same codebase
* Dedicated environment configuration and dedicated database configuration where contracted
* Provider-controlled deployment and updates
* Super Admin organization create and approve flows
* Strict organization data isolation
* No client-specific code forks
* No self-service dedicated-environment provisioning

### Organization administration

* Organization profile and Release 1 settings
* At least one active Owner per active organization
* Owner-scoped organization control
* No cross-organization Owner access

### Subscriptions

* Starter, Business, and Enterprise plans
* Configurable monthly and annual plan prices in PKR
* Configurable billing period, annual discount, trial duration, grace period, and recoverable retention
* Manual billing for bank transfer, JazzCash, and Easypaisa
* Backend entitlements, soft warnings, and hard creation limits
* Suspension and reactivation
* Cancellation separate from data deletion

### Users and permissions

* Roles: Super Admin, Owner, Manager, Cashier, Store Keeper
* Roles as predefined permission bundles
* Backend permission-based authorization
* Backend-enforced branch and warehouse access restriction
* Frontend route or UI hiding not treated as authorization
* Owner management of organization employees
* Assignment of employees to one or multiple branches or warehouses

### Branches and warehouses

* Branch management
* Branch-wise invoice numbering
* One warehouse at start with support for multiple warehouses
* Warehouse stock transfer

### Products and pricing

* Configurable categories
* Product records
* Base units and product-specific configurable packaging units
* Conversion factor from each packaging unit to base unit
* Configurable units for solid and liquid products
* Historical preservation of conversion values used in transactions
* Tracking modes: no batch, batch, batch and expiry
* Mandatory batch tracking for fertilizers, seeds, pesticides, and chemicals
* Separate customer type and price tier fields
* Automatic price-tier selection
* Permissioned and audited price override where applicable

### Customers and suppliers

* Customer and supplier records
* Customer types and price tiers
* Customer credit-limit behaviour: warning, Manager approval, or block
* Walk-in credit controlled by policy and permission
* No anonymous walk-in credit
* Customer and supplier ledgers

### Inventory and batches

* Opening stock
* Warehouse stock
* Batch and expiry tracking
* FEFO allocation for expiring products
* FIFO fallback where expiry does not apply
* Traceable stock movements
* Weighted-average cost by product and warehouse
* Landed costs in average cost
* Stock adjustments for damaged, expired, and lost stock
* Negative stock blocked by default
* Owner negative-stock override with reason and audit
* Stock valuation
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
* Purchase returns updating stock, payable, and valuation

### Sales POS

* Registered and approved walk-in sales
* Branch and permitted warehouse selection where applicable
* Cash, credit, partial, and mixed payments
* Valid batch allocation with FEFO suggestion and FIFO fallback
* Stock validation before posting
* Loose-quantity sales with unit conversion preservation
* Expired-product sale approval with warning, reason, and audit
* Negative-stock Owner override path
* Receivable, payment, account, and allocation effects
* Complete sale transactional effects
* Atomic sale posting with no partial failed-posting residue
* Branch-wise invoice numbering

### Payments and ledgers

* Invoice-specific customer payments
* General customer payments allocated to oldest unpaid invoices
* Customer advances for unallocated remainder
* Invoice-specific and general supplier payments
* Receivable and payable ledger updates

### Returns

* Sales return against invoice
* Sales return without invoice with lookup, approval, and audit
* Purchase return
* Financial and stock effects of posted returns

### Accounts and expenses

* Cash, bank, JazzCash, and Easypaisa accounts
* Inflows, outflows, and transfers
* Expense categories and expense records

### Alerts

* In-app delivery through dashboard alerts and notification center
* Low stock
* Upcoming expiry
* Expired stock
* Dead stock
* Customer dues
* Supplier dues

### Dashboard

* Minimum dashboard coverage for today's sales, today's purchases, today's expenses, gross profit, cash balances, bank and digital-wallet balances, customer receivables, supplier payables, low-stock count, upcoming-expiry count, expired-stock count, dead-stock summary, recent sales, and top-selling products
* Dashboard values using the same authoritative calculations as reports and ledgers

### Reports and exports

* Daily and configurable date-range sales reports
* Daily and configurable date-range purchase reports
* Gross-profit reporting
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
* Reconciliation with transactional data

### Printing

* Generated 58 mm thermal, 80 mm thermal, and A4 layouts
* Browser print dialog only
* OS-installed USB and LAN printers available to the browser
* No direct raw USB communication
* No direct LAN printer-protocol integration
* No silent printing
* No printer-driver installation
* No cash-drawer integration

### Import

* Manual data entry
* Excel import templates
* Preview validation
* No silent ignoring of invalid rows

### Audit

* Financial changes
* Inventory changes
* Permission-sensitive overrides
* Subscription changes
* Actor, timestamp, and reason where applicable

### Settings

* Organization settings required for Release 1 operations

### Production operations

* Automated production backups according to deployment and subscription backup policy
* Backup failure monitoring visible to authorized platform operators
* Controlled restore by authorized operators
* Documented restore procedure with verification before normal operation
* Successful restore testing before production acceptance
* No direct production restore by standard organization users

## 3. Explicitly Excluded

The following are deferred and are not Release 1 requirements. Being architecture-compatible does not mean implemented in Release 1.

* Offline synchronization
* Native Android and iOS applications
* Full double-entry accounting
* Full accounting net profit, balance sheet, trial balance, or general-ledger profit
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
* Self-service on-premise installer
* Self-service dedicated-environment provisioning
* Client-managed code forks
* Separate dedicated-deployment product codebase
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
| Client type | Web application, not native mobile |
| Accounting depth | Accounting-lite with gross-profit reporting, not full general ledger accounting |
| Billing operations | Manual subscription billing, not automated recurring billing |
| Reporting | Fixed reports, not a custom report builder |
| Printing | Browser print dialog with OS-configured printers, not silent native printer control |
| Language | English interface, not full Urdu localization |
| Deployment | Shared SaaS and provider-managed dedicated cloud, not self-service on-premise or self-service dedicated provisioning |
| Alerts | In-app dashboard and notification center, not SMS, WhatsApp, email, or browser push automation |

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
* Materially changes the data model after freeze

Every scope change must document:

* Business reason
* Client requesting it
* Urgency
* Architecture impact
* Data-model impact
* Test impact
* Schedule impact
* Whether another Release 1 feature will be removed

No agent may approve scope changes.

## 6. Release Completion Criteria

Release 1 is complete only when:

* Required workflows operate end to end
* Tenant-isolation tests pass
* Permission tests pass
* Stock reconciliation passes
* Customer and supplier ledger reconciliation passes
* Cash, bank, and digital-wallet reconciliation passes
* Weighted-average costing tests pass
* Gross-profit calculations reconcile to posted sales and cost data
* Required reports reconcile
* Printing formats are verified through browser printing
* Excel import is verified
* Automated backups are verified
* Controlled restore procedure exists and at least one successful restore test is completed
* UAT is approved by initial clients
* No critical known defect remains
* Required documentation is current

## 7. Future Backlog Boundary

Deferred work is grouped below without implementation design:

### Mobile and offline

* Native Android and iOS applications
* Offline synchronization

### Communications

* WhatsApp Business automation
* SMS automation

### Accounting

* Full double-entry accounting

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

### Enterprise deployment

* Microservices
* Self-service on-premise installer
