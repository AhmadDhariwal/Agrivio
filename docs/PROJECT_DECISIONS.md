# Project Decisions

Concise record of finalized decisions for Agrivio (Fertilizer POS & Inventory Management System).

This document records decisions. It is not the PRD.

## Product Scope

| Decision | Value |
| --- | --- |
| Product name | Agrivio |
| Product name status | Working name pending domain and trademark verification |
| Product | Cloud-first Fertilizer POS and Inventory Management web application |
| Target users | Fertilizer retailers; seed stores; pesticide and chemical dealers; agricultural-input wholesalers; dealers and distributors |
| Initial clients | Two clients in the first release |
| Future organizations | Must support additional organizations |
| Release 1 language | English |
| Future language | Urdu |
| Release 1 currency | PKR |

## Technical Stack and Architecture

| Decision | Value |
| --- | --- |
| Frontend | Angular and TypeScript |
| Backend | Node.js, Express and TypeScript |
| Database | MongoDB with Mongoose |
| Repository | Monorepo |
| Architecture | Modular monolith |
| API style | REST |
| Styling | SCSS with a centralized design system |
| Deployment model | Shared SaaS and dedicated cloud from the same codebase |
| On-premise | Contract-only; future-compatible deployment |
| Offline synchronization | Excluded from Release 1 |
| Native mobile applications | Excluded from Release 1 |

## Organization and Tenancy

| Decision | Value |
| --- | --- |
| Multi-tenancy | Yes; every organization has isolated data |
| Public organization activation | Admin-approved |
| Organization creation or approval | Super Admin |
| Organization leadership | Every organization has an Owner |
| Employee management | Owner manages employees for their own organization |
| Cross-organization Owner access | Not allowed |
| Branch and warehouse assignment | Employees may be assigned to one or multiple branches or warehouses |

## Roles and Authorization

Finalized roles:

* Super Admin
* Owner
* Manager
* Cashier
* Store Keeper

Authorization uses action-based permissions rather than hardcoded role checks wherever practical.

## Inventory

| Decision | Value |
| --- | --- |
| Categories and units | Configurable |
| Stock storage | Base units |
| Unit conversions | Automatic |
| Common quantity packs | 1, 5, 10, 20, 25, 40 and 50 kilograms |
| Liquid products | Configurable volume units |
| Conversion history | Conversion values used in transactions must be historically preserved |
| Batch tracking | Mandatory for fertilizers, seeds, pesticides and chemicals |
| Product batch modes | No batch tracking; batch tracking; batch and expiry tracking |
| Loose stock | Batches remain separate |
| Expiry allocation | FEFO |
| Non-expiry allocation | FIFO fallback |
| Expired-product sales | Require Manager or Owner approval; warning, reason and audit entry |
| Expiry alerts | 30, 60, 90 and custom days |
| Negative stock | Blocked by default |
| Negative stock override | Owner override allowed with mandatory reason and audit entry |
| Warehouses | Start with one; architecture supports multiple |
| Inventory cost method | Weighted-average by product and warehouse |
| Landed costs in average cost | Freight, loading, transport and applicable landed costs included |
| Stock changes | Every stock change must have a traceable stock movement |

## Sales and Customers

| Decision | Value |
| --- | --- |
| Payment modes | Cash, credit, partial and mixed |
| Walk-in credit | Controlled by organization policy and permission |
| Anonymous walk-in credit | Not allowed |
| Credit-limit behaviour | Organization-configurable: warning, Manager approval, or block |
| Customer payments | Invoice-specific or general |
| General payment allocation | Automatically to oldest unpaid invoices |
| Unallocated payment | May remain as customer advance |
| Customer type and price tier | Separate fields |
| Customer types | Walk-in; Farmer; Individual; Business; Corporate |
| Price tiers | Retail; Wholesale; Dealer; Distributor |
| Price selection | Customer price tier automatically selects product pricing |
| Manual price overrides | Require permission and audit where applicable |
| Sales returns | May be processed with or without an original invoice |
| Returns without invoice | Require lookup, approval and audit |

## Purchases and Suppliers

| Decision | Value |
| --- | --- |
| Purchase payments | Partial and full |
| Purchase posting | Creates stock movements and updates supplier payable |
| Supplier payments | Invoice-specific or general |
| Purchase returns | Update stock, supplier payable and valuation |
| Multi-record purchase workflows | Must be atomic |

## Printing and Data Migration

| Decision | Value |
| --- | --- |
| Print formats | 58 mm thermal; 80 mm thermal; A4 |
| Initial printer connections | USB; LAN |
| Release 1 printing approach | Browser-based printing is sufficient |
| Data migration methods | Manual entry; Excel import |
| Import validation | Show errors before final import |
| Invalid import rows | Must not be silently ignored |

## Subscription and Commercial Model

### Plans

* Starter
* Business
* Enterprise

### Billing and Trial

| Decision | Value |
| --- | --- |
| Billing periods | Monthly; annual |
| Currency | PKR in Release 1 |
| Annual discount | Approximately 15% |
| Trial | Fourteen-day approved trial |
| Trial payment method | Not required |
| Grace period | Seven days |
| Release 1 billing operations | Manual |
| Accepted payment methods | Bank transfer; JazzCash; Easypaisa |
| Plan limits | Enforced through backend entitlements |
| Limit enforcement style | Soft warnings before hard creation limits |
| Exceeded plan limits | Existing data must never be deleted |
| Default deployment | Shared SaaS |
| Dedicated cloud | Enterprise option |
| Client business data ownership | Belongs to the client |
| Product source code and platform IP | Belong to the provider unless agreed otherwise |
| Cancellation vs data deletion | Separate processes |
| Recommended recoverable retention after cancellation | 90 days |

Exact plan pricing and provider implementation details are not finalized in this document.

## Release 1 Core Modules

* Landing page
* Authentication
* Organization management
* Users, roles and permissions
* Subscription management
* Branches
* Warehouses
* Customers
* Suppliers
* Product categories
* Products
* Units and conversions
* Inventory and batches
* Purchases
* Sales POS
* Customer ledger
* Supplier ledger
* Returns
* Payments and receipts
* Cash and bank accounts
* Expenses
* Alerts and notifications
* Dashboard
* Reports and exports
* Audit logs
* Settings
* Backup and restore preparation

## Release 1 performance acceptance (non-SLA)

Accepted planning thresholds for REL-G06. Controlled non-production measurement only. Not a contractual SLA or production capacity claim.

| Scenario | Target |
| --- | --- |
| POS product search p95 | <= 300 ms |
| Common paginated/search list APIs p95 | <= 500 ms |
| Inventory balance/list queries p95 | <= 500 ms |
| Dashboard p95 | <= 1,000 ms |
| Sale posting p95 | <= 1,000 ms |
| Purchase posting p95 | <= 1,000 ms |
| Standard reports p95 | <= 2,000 ms |
| Browser route navigation to usable primary content p95 (navigation start, including required API work) | <= 2,000 ms |
| Excel import preview, 500 rows, p95 | <= 5 seconds |
| Excel import execution, 200 rows, p95 | <= 5 seconds |
| Normal-request application error rate | < 1% |
| Concurrency baseline | 20 concurrent virtual users, including at least 5 concurrent sale-posting users |

Under that mixed workload: no duplicate invoices; no lost stock updates; no partial financial/stock effects; no tenant leakage; normal-request application error rate < 1%; read/API latency degradation must be recorded.

Evidence command: `npm run test:perf:baseline` (replica-set HTTP) and `npm run test:perf:navigation` (browser routes).

## Release 1 contrast standard (NFR-A11Y-006)

R1-F09-004 uses WCAG 2.2 Level AA contrast criteria for NFR-A11Y-006. This does not claim complete WCAG 2.2 AA product conformance.

| Surface | Minimum ratio |
| --- | --- |
| Normal text | 4.5:1 |
| Large text | 3:1 |
| Applicable non-text UI components / graphical objects (WCAG 1.4.11) | 3:1 |

Evidence command: `npm run test:a11y:baseline` (includes rendered contrast scan).

## Explicitly Deferred

The following are deferred and are not Release 1 requirements:

* Offline synchronization
* Native Android and iOS applications
* Full double-entry accounting
* Automated recurring payment gateway
* WhatsApp Business automation
* SMS automation
* Full Urdu interface
* Multi-currency business operations
* AI forecasting
* Microservices
* Public coupon engine
* Self-service on-premise installer
* Custom report builder
