# Domain Glossary

Authoritative definitions of Agrivio Release 1 business terms.

| Field | Value |
| --- | --- |
| Document status | Frozen for Release 1 |
| Current version | 1.0 |
| Approval status | Approved for Phase 1 continuation |
| Last updated | 2026-08-04 |

## Authority

* Frozen [PRD.md](PRD.md) and [RELEASE_1_SCOPE.md](RELEASE_1_SCOPE.md) remain authoritative for product scope.
* After approval, [BUSINESS_RULES.md](BUSINESS_RULES.md) is authoritative for Release 1 formulas and operational behaviour.
* After approval, this document is authoritative for domain terminology.
* Finalized decisions remain in [PROJECT_DECISIONS.md](PROJECT_DECISIONS.md).
* This draft must not be treated as frozen until human review completes.

## Controlled Unresolved Details

Where relevant to terminology only:

* Exact permission matrix names and grants remain unresolved.
* Taxes and regulatory levies remain unresolved and must not be invented as domain concepts for Release 1.
* Exact commercial prices and plan commercial defaults remain outside this glossary.
* Exact invoice visual layout, report columns, and import spreadsheet columns remain unresolved.

Do not interpret glossary definitions as database fields, API contracts, or class names.

---

## Platform and Tenancy

| Term | Definition | Not the same as | Related rule IDs |
| --- | --- | --- | --- |
| Dedicated cloud | Provider-managed deployment option for eligible Enterprise customers using the same application codebase with dedicated environment and database configuration where contracted. | Shared SaaS | BR-SUB-016 |
| Organization | The tenant business entity whose operational data, users, branches, warehouses, and ledgers are isolated from every other organization. | Branch; Warehouse; Tenant isolation | BR-ORG-001, BR-ORG-002, BR-ORG-003 |
| Shared SaaS | Default multi-tenant deployment model where multiple organizations run from one shared codebase and shared platform operation. | Dedicated cloud | BR-SUB-016 |
| Tenant | An organization whose data boundary is enforced by the platform. | Branch; Warehouse | BR-ORG-001, BR-ORG-002 |
| Tenant isolation | The rule that one organization must never read, create, update, or delete another organization's data. | Permission | BR-ORG-002 |

## Organization and Access

| Term | Definition | Not the same as | Related rule IDs |
| --- | --- | --- | --- |
| Branch | An organizational sales and operational location used for branch-scoped work such as invoice numbering. | Warehouse; Organization | BR-SALE-001, BR-SALE-024 |
| Entitlement | Subscription-controlled right that determines whether an organization may use a capability or create additional resources under plan limits. | Permission | BR-SUB-008, BR-SUB-013 |
| Manager approval | Authorized Manager or Owner confirmation required for a restricted business action, recorded with reason and audit where required. | Permission; Owner | BR-SALE-017, BR-BATCH-014, BR-RETURN-007 |
| Owner | The organization leadership role that controls the organization and must not access another organization. | Manager approval; Super Admin | BR-ORG-003, BR-ORG-004 |
| Permission | An action-based authorization grant that decides whether an authenticated user may perform a protected operation. | Entitlement; Role name alone | BR-ORG-005, BR-ORG-006 |
| Warehouse | A stock-holding location within an organization. Stock is tracked by warehouse and product, and by batch where tracking applies. | Branch; Organization | BR-INVENTORY-004, BR-TRANSFER-001 |

## Products and Units

| Term | Definition | Not the same as | Related rule IDs |
| --- | --- | --- | --- |
| Base quantity | Quantity expressed in the product's base unit after applying the conversion-factor snapshot. | Packaging quantity; Stock on hand | BR-UNIT-011 |
| Base unit | The single inventory unit of measure in which a stocked product is stored and reconciled. | Packaging unit | BR-UNIT-001, BR-UNIT-002, BR-UNIT-008 |
| Customer type | Classification of a customer such as Walk-in, Farmer, Individual, Business, or Corporate. | Price tier | BR-SALE-004 |
| Packaging unit | A product-specific selling or receiving unit that converts to the product's base unit by a positive conversion factor. | Base unit | BR-UNIT-003, BR-UNIT-004 |
| Price override | Authorized change of the default tier price for a sale line, retained as the posted final unit price with audit. | Price tier; Line discount field | BR-SALE-007, BR-SALE-008, BR-SALE-009 |
| Price tier | Pricing classification such as Retail, Wholesale, Dealer, or Distributor that selects the default product selling price. | Customer type | BR-SALE-004, BR-SALE-005 |
| Product | A sellable or stockable item maintained by the organization, including tracking mode and unit configuration. | Batch; Packaging unit | BR-UNIT-001, BR-BATCH-001 |
| Tracking mode | Product setting that determines whether stock uses no batch tracking, batch tracking, or batch and expiry tracking. | Batch identity | BR-BATCH-005, BR-BATCH-006 |
| Unit conversion | Deterministic conversion of an entered packaging quantity into base quantity using the conversion-factor snapshot. | Weighted-average cost | BR-UNIT-011, BR-UNIT-010 |

## Inventory and Batches

| Term | Definition | Not the same as | Related rule IDs |
| --- | --- | --- | --- |
| Batch | A distinct identity group for tracked stock of a product, optionally carrying expiry information. | Batch quantity alone; Product | BR-BATCH-002, BR-BATCH-008 |
| Batch identity | The preserved identity of a tracked batch across purchase, sale, return, adjustment, and warehouse transfer. | Batch quantity; Loose stock | BR-BATCH-004 |
| Dead stock | Sellable on-hand stock with quantity greater than zero and no posted non-reversed sale during the configured inactivity period. | Expired stock; Low stock | BR-ALERT-005, BR-ALERT-006 |
| Expired stock | Stock whose batch expiry date is earlier than the organization's current business date. | Upcoming expiry; Dead stock | BR-BATCH-012, BR-ALERT-004 |
| Expiry date | The date stored on a batch that determines upcoming-expiry and expired-stock behaviour. | Manufacturing date; Product-level expiry | BR-BATCH-006, BR-BATCH-008 |
| FEFO | First-Expiry-First-Out allocation that selects the eligible batch with the earliest expiry date first, then oldest received stock when expiry dates are equal. | FIFO | BR-BATCH-009, BR-BATCH-010 |
| FIFO | First-In-First-Out allocation that selects the oldest received eligible stock first where expiry does not apply. | FEFO | BR-BATCH-011 |
| Inventory value | The monetary value of stock derived from maintained weighted-average cost and stock quantity. | Account balance; Gross profit | BR-COST-012, BR-COST-002 |
| Loose stock | Stock sold or held in non-whole packaging quantities while batch identity remains separate for tracked products. | Unsellable stock | BR-BATCH-003 |
| Negative stock | A stock position below zero. Blocked by default and allowed only through Owner override for the current transaction. | Stock adjustment | BR-INVENTORY-017, BR-INVENTORY-019 |
| Opening stock | Auditable inbound stock established at migration or start of operations for a product and warehouse. | Opening balance; Stock adjustment | BR-INVENTORY-009 |
| Sellable stock | Stock eligible for normal sale allocation. | Unsellable stock | BR-RETURN-014, BR-ALERT-002 |
| Stock adjustment | Authorized posted correction that changes stock for damage, expiry, loss, or correction with reason and audit. | Warehouse transfer; Cancellation | BR-INVENTORY-015 |
| Stock movement | Posted inbound or outbound quantity change linked to a source transaction. | Stock on hand; Account movement | BR-INVENTORY-002, BR-INVENTORY-005 |
| Stock on hand | Calculated available quantity equal to total posted inbound base quantity minus total posted outbound base quantity for the applicable scope. | Stock movement; Inventory value | BR-INVENTORY-001, BR-INVENTORY-008 |
| Transfer value | Exact inventory value moved with a warehouse transfer from source weighted-average cost into destination inventory. | Landed cost | BR-TRANSFER-005, BR-TRANSFER-006 |
| Unsellable stock | Returned or adjusted stock classified as expired, damaged, opened, contaminated, or otherwise unsuitable for normal sale and excluded from normal sellable inventory. | Sellable stock | BR-RETURN-015, BR-RETURN-016 |
| Warehouse transfer | One-step atomic move of stock from one warehouse to another within the same organization, preserving product identity, batch identity, quantity, and total value. | Stock adjustment; In-transit state | BR-TRANSFER-001, BR-TRANSFER-009 |
| Weighted-average cost | Inventory cost maintained by organization, product, and warehouse. When existing base quantity is greater than zero, a positive receipt uses the normal weighted-average formula; when existing base quantity is zero or negative, the new cost is set to the receipt unit cost. Zero stock has zero inventory value. | Selling price; Landed cost alone | BR-COST-001, BR-COST-004, BR-COST-017, BR-COST-018, BR-COST-019, BR-COST-020 |

## Sales and Purchases

| Term | Definition | Not the same as | Related rule IDs |
| --- | --- | --- | --- |
| Approved walk-in | A walk-in customer sale or credit path that includes identifying customer information where credit is involved and complies with organization policy. | Anonymous walk-in credit; Registered customer only | BR-SALE-014, BR-SALE-015 |
| Cash sale | A sale whose amount due is settled fully by payment methods at posting with no remaining receivable. | Credit sale; Partial payment | BR-SALE-003 |
| Credit limit | Organization-configured receivable threshold behaviour that may warn, require Manager approval, or block a credit sale. | Customer advance | BR-SALE-016 |
| Credit sale | A sale that leaves unpaid amount as customer receivable. | Cash sale; Anonymous walk-in credit | BR-SALE-014, BR-LEDGER-002 |
| Customer | A party that buys from the organization and may hold receivable or advance balances. | Supplier; Approved walk-in | BR-SALE-001, BR-LEDGER-002 |
| Invoice | The posted sales document that receives one unique branch sequence number and retains transaction snapshots. | Draft transaction; Payment | BR-SALE-018, BR-SALE-024, BR-SALE-025 |
| Landed cost | Approved non-recoverable acquisition cost such as freight, loading, transport, or other approved cost allocated into purchase inventory value. | Transfer value; Operating expense | BR-COST-013, BR-COST-014 |
| Purchase | Posted acquisition of products from a supplier into a receiving warehouse, creating stock, cost, payable, payment, and audit effects as applicable. | Purchase return; Expense | BR-PURCHASE-001, BR-PURCHASE-003 |
| Sale | Posted disposal of products to a customer or approved walk-in, creating invoice, stock, cost, receivable, payment, and audit effects as applicable. | Sales return; Draft transaction | BR-SALE-001, BR-SALE-018 |
| Supplier | A party from which the organization purchases products and may hold payable or advance balances. | Customer | BR-PURCHASE-001, BR-LEDGER-006 |
| Transaction snapshot | Immutable posted values such as price, cost, unit, conversion factor, customer, supplier, and batch facts retained on a posted transaction. | Current master data | BR-COMMON-009 |

## Payments and Ledgers

| Term | Definition | Not the same as | Related rule IDs |
| --- | --- | --- | --- |
| Advance | Unallocated payment remainder retained as customer advance or supplier advance for later application. | Receivable; Payable; Payment allocation | BR-PAYMENT-003, BR-PAYMENT-007, BR-PAYMENT-010 |
| Allocation | The assignment of a posted payment or advance to one or more invoices or purchases according to explicit rules. | Payment | BR-PAYMENT-004, BR-PAYMENT-011 |
| Customer advance | Customer payment amount not yet applied to invoices and available to reduce future receivable when applied. | Receivable; Invoice-specific payment | BR-PAYMENT-003, BR-LEDGER-003 |
| Customer ledger | Transaction-derived history of customer receivable activity, opening balances, sales, returns, payments, advances, and corrections. | Account balance; Supplier ledger | BR-LEDGER-001, BR-LEDGER-002 |
| Invoice-specific payment | Payment explicitly applied to a nominated invoice or purchase rather than allocated by general oldest-first rules. | General payment; Advance | BR-PAYMENT-001, BR-PAYMENT-005 |
| Mixed payment | Settlement of one sale amount across multiple payment methods in one posting. | Partial payment | BR-PAYMENT-015 |
| Opening balance | Auditable starting receivable, payable, advance, or account balance established by a source transaction. | Opening stock; Direct balance edit | BR-LEDGER-004, BR-ACCOUNT-005 |
| Partial payment | Payment that covers only part of an invoice or purchase amount and leaves remaining receivable or payable. | Mixed payment; Advance | BR-PURCHASE-007, BR-SALE-003 |
| Payable | Amount owed by the organization to a supplier, derived from opening payable, unpaid purchases, returns, payments, advances, and corrections. | Supplier advance; Account balance | BR-LEDGER-006, BR-PURCHASE-006 |
| Payment | Posted receipt from a customer or disbursement to a supplier that creates account and ledger effects. | Payment allocation; Refund | BR-PAYMENT-001, BR-PAYMENT-012 |
| Payment allocation | Preserved linkage of a posted payment or advance to the invoices or purchases it settles. | Payment; Ledger adjustment | BR-PAYMENT-011, BR-PAYMENT-014 |
| Receivable | Amount owed to the organization by a customer, derived from opening receivable, credit sales, returns, payments, advances, and corrections. | Customer advance; Account balance | BR-LEDGER-002 |
| Supplier advance | Supplier payment amount not yet applied to purchases and available to reduce future payable when applied. | Payable | BR-PAYMENT-007, BR-LEDGER-006 |
| Supplier ledger | Transaction-derived history of supplier payable activity, opening balances, purchases, returns, payments, advances, and corrections. | Account balance; Customer ledger | BR-LEDGER-001, BR-LEDGER-006 |

## Returns and Corrections

| Term | Definition | Not the same as | Related rule IDs |
| --- | --- | --- | --- |
| Cancellation | Full corrective reversal of a posted sale or purchase that preserves the original transaction and posts a linked corrective transaction. | Reversal; Return; Partial cancellation | BR-CORRECTION-001, BR-CORRECTION-005, BR-CORRECTION-007 |
| Corrective transaction | Linked posted transaction that neutralizes or corrects an earlier posted transaction without editing or deleting the original. | Draft transaction; Silent edit | BR-CORRECTION-002, BR-CORRECTION-008 |
| Credit note | Non-standalone Release 1 concept. Credit value is represented through ledger adjustment linked to return or corrective activity; Release 1 has no separate credit-note module. | Return; Refund | BR-RETURN-017, BR-LEDGER-002 |
| Draft transaction | Incomplete business transaction with no finalized stock, ledger, costing, payment, account, or reporting effect. | Posted transaction | BR-COMMON-001, BR-COMMON-002 |
| Ledger adjustment | Authorized ledger effect used to settle return value or corrective credit against customer or supplier balances. | Credit note module; Direct balance edit | BR-RETURN-017, BR-LEDGER-001 |
| Posted transaction | Validated immutable business record whose stock and financial effects have been created atomically. | Draft transaction | BR-COMMON-005, BR-COMMON-007 |
| Product exchange | Non-standalone Release 1 concept implemented as a posted return plus a separate new sale. No separate exchange transaction type exists. | Return; Cancellation | BR-RETURN-018 |
| Purchase return | Posted return of purchased quantity that updates stock, supplier payable or balance, and valuation. Quantity must not exceed remaining returnable quantity against the original purchase and must not exceed currently available stock in the applicable warehouse and batch. | Purchase cancellation; Sales return | BR-RETURN-009, BR-RETURN-011, BR-RETURN-022, BR-RETURN-023 |
| Refund | Return resolution that pays money back through cash or a bank, JazzCash, or Easypaisa account. | Ledger adjustment; Payment | BR-RETURN-017 |
| Return | Posted corrective goods transaction that reverses part or all of a sale or purchase within returnable quantity rules. | Cancellation; Product exchange | BR-RETURN-001, BR-RETURN-020 |
| Reversal | Auditable counter-transaction that neutralizes a posted transaction while preserving the original and its snapshots, and that posts signed effects opposite to its source. | Cancellation; Silent edit | BR-CORRECTION-008, BR-CORRECTION-012, BR-CORRECTION-014 |
| Sales return | Posted return of sold quantity, either linked to an invoice or processed without invoice under approval and audit rules. | Sale cancellation; Purchase return | BR-RETURN-001, BR-RETURN-007 |

## Accounts and Expenses

| Term | Definition | Not the same as | Related rule IDs |
| --- | --- | --- | --- |
| Account | Cash, Bank, JazzCash, or Easypaisa money account whose balance is derived from posted movements. | Customer ledger; Supplier ledger | BR-ACCOUNT-001, BR-ACCOUNT-003 |
| Account balance | Calculated money position of an account from opening balance, inflows, outflows, transfers, refunds, and reversals. | Customer ledger; Stock on hand | BR-ACCOUNT-002, BR-ACCOUNT-004 |
| Account movement | Posted inflow, outflow, transfer, refund, or reversal entry that changes an account balance. | Stock movement; Payment allocation | BR-ACCOUNT-008, BR-ACCOUNT-009 |
| Easypaisa account | Digital wallet account type supported for payments, refunds, opening balances, and reconciliation. | JazzCash account; Bank account | BR-ACCOUNT-001 |
| JazzCash account | Digital wallet account type supported for payments, refunds, opening balances, and reconciliation. | Easypaisa account; Bank account | BR-ACCOUNT-001 |

## Subscriptions

| Term | Definition | Not the same as | Related rule IDs |
| --- | --- | --- | --- |
| Active subscription | Subscription state in which the organization has entitled operational access under its current plan. | Grace period; Suspended subscription | BR-SUB-001, BR-SUB-006 |
| Grace period | Configurable period after active subscription expiry during which the organization has not yet entered Suspended. | Active subscription; Suspended subscription | BR-SUB-005, BR-SUB-006 |
| Suspended subscription | Subscription state entered after grace expiry that blocks restricted operational access according to entitlement policy without deleting existing data. | Cancelled subscription; Deleted | BR-SUB-007, BR-SUB-008, BR-SUB-009 |

## Reporting and Audit

| Term | Definition | Not the same as | Related rule IDs |
| --- | --- | --- | --- |
| Audit event | Immutable recorded evidence of a sensitive operation including actor, timestamp, action, affected record, and reason or approval where required. | Editable business note; Technical log alone | BR-AUDIT-001, BR-AUDIT-016 |
| Gross profit | Operational profit equal to net sales revenue minus net COGS. Not accounting net profit. | Net profit; Account balance | BR-REPORT-005, BR-REPORT-006 |

---

## Important Distinctions

| Confused pair | Distinction |
| --- | --- |
| Organization vs branch | Organization is the tenant boundary. Branch is a location inside one organization. |
| Branch vs warehouse | Branch is used for operational and invoice scoping. Warehouse holds stock. |
| Base unit vs packaging unit | Base unit is the inventory unit of record. Packaging unit converts into base unit. |
| Customer type vs price tier | Customer type classifies the customer. Price tier selects default selling price. |
| Payment vs payment allocation | Payment is the posted money transaction. Allocation links that payment to invoices or purchases. |
| Receivable vs customer advance | Receivable is amount owed by the customer. Customer advance is unallocated customer money available to apply later. |
| Payable vs supplier advance | Payable is amount owed to the supplier. Supplier advance is unallocated supplier payment available to apply later. |
| Return vs cancellation | Return corrects quantity within returnable limits. Cancellation fully reverses a posted sale or purchase. |
| Cancellation vs reversal | Cancellation is the full sale/purchase corrective process. Reversal is the counter-transaction mechanism used by cancellation and other corrections. |
| Return vs product exchange | Return is a Release 1 transaction. Product exchange is only a return plus a separate sale. |
| Stock adjustment vs warehouse transfer | Stock adjustment changes quantity or condition for authorized reasons. Warehouse transfer relocates existing stock between warehouses without changing organization totals. |
| Account balance vs customer ledger | Account balance is money in a cash or digital account. Customer ledger tracks receivable activity. |
| Gross profit vs net profit | Gross profit is operational sales revenue minus COGS. Full accounting net profit is out of Release 1 scope. |
| Batch identity vs batch quantity | Batch identity is which batch the stock belongs to. Batch quantity is how much of that batch exists. |
| Draft transaction vs posted transaction | Draft has no finalized effects. Posted is immutable and effect-bearing. |

## Non-Standalone Release 1 Concepts

* **Credit note:** Ledger adjustment may represent credit value. Release 1 has no separate credit-note module.
* **Product exchange:** Implemented as a posted return plus a separate new sale. No separate exchange transaction type exists.
