# Business Rules

Authoritative Release 1 formulas and operational behaviour for Agrivio.

| Field | Value |
| --- | --- |
| Document status | Draft for P1-03 review |
| Current version | 0.1 |
| Approval status | Not yet frozen |
| Last updated | 2026-08-04 |

## Authority

* Frozen [PRD.md](PRD.md) and [RELEASE_1_SCOPE.md](RELEASE_1_SCOPE.md) remain authoritative for product scope.
* After approval, this document is authoritative for Release 1 formulas and operational behaviour.
* [DOMAIN_GLOSSARY.md](DOMAIN_GLOSSARY.md) is authoritative for domain terminology after approval.
* Finalized decisions remain in [PROJECT_DECISIONS.md](PROJECT_DECISIONS.md).
* This draft must not be treated as frozen until human review completes.

## Controlled Unresolved Details

The following remain unresolved and must not be invented here:

* Exact permission matrix
* Multiple-Owner policy
* Two-factor-authentication policy
* Exact session duration
* Taxes and regulatory levies
* Exact commercial prices
* Hosting provider
* Dedicated-cloud topology
* Backup provider and frequency
* Performance thresholds
* Browser/device matrix
* Accessibility test matrix
* Error-monitoring provider
* Exact invoice visual layout
* Exact report columns
* Exact import spreadsheet columns

Tax treatment for purchases, sales, landed cost, and reporting is an unresolved product decision that must be resolved before purchase and sales implementation. Release 1 must not invent taxes, GST, withholding tax, or regulatory levies.

---

## 1. Common Transaction Lifecycle

### Applicable lifecycle states

| Business record | Draft | Posted | Cancelled | Reversed |
| --- | --- | --- | --- | --- |
| Sale | Yes | Yes | Yes | Yes |
| Purchase | Yes | Yes | Yes | Yes |
| Payment | Yes | Yes | No | Yes |
| Return | Yes | Yes | No | Yes |
| Warehouse transfer | Yes | Yes | No | Yes |
| Stock adjustment | Yes | Yes | No | Yes |
| Expense | Yes | Yes | No | Yes |
| Account transaction | Yes | Yes | No | Yes |

Sale and purchase support full cancellation, which posts a linked corrective reversal while preserving the original. Payment, return, warehouse transfer, stock adjustment, expense, and account transaction correction use reversal rather than a separate cancellation state.

### Draft

- **BR-COMMON-001:** A draft has no finalized stock, ledger, costing, payment, account, or reporting effect. (FR-SALE-019, FR-PURCHASE-006)
- **BR-COMMON-002:** An authorized user may edit a draft until it is posted or discarded.
- **BR-COMMON-003:** An authorized user may discard a draft without creating posted stock or financial effects.
- **BR-COMMON-004:** Draft invoice or purchase numbers must not be treated as posted business records unless the numbering rule explicitly reserves them. (FR-SALE-007)

### Posted

- **BR-COMMON-005:** Posting validates the complete transaction before any stock or financial effect is created. (NFR-DATA-001)
- **BR-COMMON-006:** Posting creates all required stock and financial effects atomically. (NFR-REL-002)
- **BR-COMMON-007:** A posted transaction is immutable after successful posting. (NFR-DATA-002)
- **BR-COMMON-008:** A posted transaction cannot be permanently deleted. (NFR-DATA-003)
- **BR-COMMON-009:** Posted transaction snapshots must not change when product, price, unit, customer, supplier, or configuration data later changes. (FR-PRODUCT-007, FR-SALE-014, FR-PURCHASE-012)
- **BR-COMMON-010:** A failed posting must leave no partial stock, ledger, payment, account, sequence, or audit effects. (FR-SALE-020, FR-PURCHASE-016)

### Cancelled

For Release 1, cancellation means a full corrective reversal of a posted sale or purchase.

- **BR-CORRECTION-001:** Cancellation preserves the original posted transaction. (FR-SALE-023, FR-PURCHASE-019)
- **BR-CORRECTION-002:** Cancellation creates a linked corrective transaction that references the original. (FR-SALE-022, FR-PURCHASE-018)
- **BR-CORRECTION-003:** Cancellation requires authorization, reason, actor, and timestamp. (FR-AUDIT-009)
- **BR-CORRECTION-004:** A transaction cannot be cancelled twice.
- **BR-CORRECTION-005:** Partial cancellation is not supported; partial correction uses a return, payment correction, or stock adjustment.
- **BR-CORRECTION-006:** Cancellation must fail without partial effects if the complete correction cannot be posted. (NFR-DATA-007)
- **BR-CORRECTION-007:** Cancellation is available only for posted sales and posted purchases that meet the applicable cancellation conditions in this document.

### Reversed

- **BR-CORRECTION-008:** A reversal is the auditable counter-transaction that neutralizes a posted transaction. (FR-AUDIT-010)
- **BR-CORRECTION-009:** The reversal must reference the original transaction.
- **BR-CORRECTION-010:** The reversal must preserve the original transaction and its snapshots.
- **BR-CORRECTION-011:** Reversal effects must be atomic. (NFR-REL-005)
- **BR-CORRECTION-012:** Reversal must not silently edit the original transaction.
- **BR-CORRECTION-013:** Payment, return, warehouse transfer, stock adjustment, expense, and account-transaction corrections use reversal rather than editing the posted original.
- **BR-CORRECTION-014:** Every reversal shall create signed business effects opposite to the source effects being reversed; formulas shall use signed posted effects rather than subtracting every reversal generically.

---

## 2. Money, Quantity, and Rounding

### Money

- **BR-COMMON-011:** Release 1 business currency is PKR.
- **BR-COMMON-012:** Monetary values use two decimal places in final posted amounts.
- **BR-COMMON-013:** Calculations must not use binary floating-point behaviour that produces inconsistent business totals.
- **BR-COMMON-014:** Intermediate calculations may retain higher precision than two decimal places.
- **BR-COMMON-015:** Final line and transaction amounts use deterministic round-half-up behaviour to two decimal places.
- **BR-COMMON-016:** Posted monetary values are preserved as transaction snapshots.

### Quantities

- **BR-COMMON-017:** Base-unit quantities support up to four decimal places.
- **BR-COMMON-018:** Unit-conversion factors support up to six decimal places.
- **BR-COMMON-019:** Quantities cannot be negative in user-entered transaction lines.
- **BR-COMMON-020:** Direction of quantity effect is represented by the transaction or stock-movement type, not by negative entered quantities.
- **BR-COMMON-021:** Zero-quantity posted lines are prohibited.

### Calculation order

- **BR-COMMON-022:** Applicable sales, purchases, payments, and returns follow this calculation order:

  1. Entered packaging quantity
  2. Conversion to base quantity
  3. Unit price or unit cost
  4. Line amount
  5. Approved price adjustment where applicable
  6. Transaction total
  7. Payment allocation
  8. Remaining receivable or payable

- **BR-COMMON-023:** Taxes, GST, withholding tax, and regulatory levies are excluded from Release 1 calculations until tax policy is approved.
- **BR-COMMON-024:** Quantity and unit-conversion calculations shall retain sufficient decimal precision during intermediate calculation.
- **BR-COMMON-025:** The final posted base quantity shall use deterministic round-half-up behaviour to four decimal places.
- **BR-COMMON-026:** The posted base-quantity snapshot shall be used consistently for stock movements, batch quantities, costing, returns, transfers, and reconciliation; a non-zero entered quantity that rounds to zero base quantity shall be rejected.

Monetary finals remain two decimal places with round-half-up. Conversion factors support up to six decimal places. Posted base quantities support up to four decimal places. Truncation and binary floating-point rounding are prohibited.

---

## 3. Organization and Access Boundaries

- **BR-ORG-001:** Every tenant-owned business operation is scoped to exactly one organization. (FR-PLATFORM-004)
- **BR-ORG-002:** One organization must never read, create, update, or delete another organization's data. (NFR-SEC-001)
- **BR-ORG-003:** Every active organization must have at least one active Owner. (FR-ORG-003)
- **BR-ORG-004:** An Owner must not access another organization. (FR-ORG-004)
- **BR-ORG-005:** Branch and warehouse restrictions apply to authorized operations that require them. (FR-AUTH-006)
- **BR-ORG-006:** Frontend route or UI hiding is not authorization. (FR-AUTH-007)

---

## 4. Product Units and Conversion

- **BR-UNIT-001:** Every stocked product has exactly one base unit. (FR-PRODUCT-003)
- **BR-UNIT-002:** Inventory is stored and reconciled in the base unit.
- **BR-UNIT-003:** A packaging unit belongs to one product. (FR-PRODUCT-005)
- **BR-UNIT-004:** Every packaging unit has a positive conversion factor to the base unit. (FR-PRODUCT-006)
- **BR-UNIT-005:** A conversion factor of zero or less is invalid.
- **BR-UNIT-006:** Conversions may occur only between compatible units of the same measurement dimension.
- **BR-UNIT-007:** Weight must not be converted into volume without a separately approved product-specific business rule.
- **BR-UNIT-008:** A product base unit cannot be changed after its first posted stock transaction.
- **BR-UNIT-009:** Packaging units and conversion factors may change only for future transactions.
- **BR-UNIT-010:** Posted purchases, sales, returns, opening stock, and transfers retain their original conversion snapshot. (FR-PRODUCT-007)

### Conversion formula

```text
Base quantity = entered packaging quantity × conversion-factor snapshot
```

- **BR-UNIT-011:** Base quantity is calculated as entered packaging quantity multiplied by the conversion-factor snapshot retained on the transaction line.

---

## 5. Inventory and Stock Movements

- **BR-INVENTORY-001:** Stock on hand is movement-derived and must not be treated as a manually editable total. (FR-INVENTORY-006)
- **BR-INVENTORY-002:** Every stock change requires a posted stock movement.
- **BR-INVENTORY-003:** Direct manual editing of the calculated stock balance is prohibited.
- **BR-INVENTORY-004:** Stock is scoped by organization, warehouse, product, and batch where tracking applies. (FR-INVENTORY-002)
- **BR-INVENTORY-005:** Stock movements retain their source transaction reference.
- **BR-INVENTORY-006:** Cancelled or reversed source transactions are corrected through linked movements rather than deleted movements. (NFR-DATA-003)
- **BR-INVENTORY-007:** Organization-level total stock excludes duplicated value during warehouse transfer. (FR-WAREHOUSE-008)

### Stock formula

```text
Warehouse stock on hand
= total posted inbound base quantity
- total posted outbound base quantity
```

- **BR-INVENTORY-008:** Warehouse stock on hand equals total posted inbound base quantity minus total posted outbound base quantity for the same organization, warehouse, product, and batch scope where applicable.

### Movement behaviour

| Movement type | Direction effect |
| --- | --- |
| Opening stock | Inbound |
| Purchase receipt | Inbound |
| Sale | Outbound |
| Sales return (sellable) | Inbound to sellable stock |
| Sales return (unsellable) | Inbound to unsellable stock only |
| Purchase return | Outbound |
| Transfer outbound | Outbound from source warehouse |
| Transfer inbound | Inbound to destination warehouse |
| Damage adjustment | Outbound from sellable stock |
| Expiry adjustment | Outbound from sellable stock |
| Loss adjustment | Outbound from sellable stock |
| Correction adjustment | Inbound or outbound according to authorized correction direction |
| Cancellation | Linked corrective movements that reverse the original effects |
| Reversal | Linked corrective movements that reverse the original effects |

- **BR-INVENTORY-009:** Opening stock creates an auditable inbound stock movement. (FR-INVENTORY-001, FR-INVENTORY-016)
- **BR-INVENTORY-010:** Purchase receipt creates inbound stock movements for received base quantities. (FR-PURCHASE-003)
- **BR-INVENTORY-011:** Sale creates outbound stock movements for sold base quantities. (FR-SALE-005)
- **BR-INVENTORY-012:** Sales return creates inbound stock movements according to returned-stock condition. (FR-RETURN-005)
- **BR-INVENTORY-013:** Purchase return creates outbound stock movements for returned base quantities. (FR-RETURN-003)
- **BR-INVENTORY-014:** Warehouse transfer creates linked outbound and inbound movements. (FR-WAREHOUSE-006, FR-WAREHOUSE-007)
- **BR-INVENTORY-015:** Damage, expiry, loss, and correction adjustments create posted stock movements with reason and audit. (FR-INVENTORY-009)
- **BR-INVENTORY-016:** Cancellation and reversal create linked corrective stock movements and do not delete original movements.

### Negative stock

- **BR-INVENTORY-017:** Negative stock is blocked by default. (FR-INVENTORY-010)
- **BR-INVENTORY-018:** Availability is validated in base units and at batch level where tracking applies. (FR-SALE-012)
- **BR-INVENTORY-019:** Owner override of negative stock requires permission, warning, mandatory reason, and audit. (FR-INVENTORY-011)
- **BR-INVENTORY-020:** Negative-stock override applies only to the current transaction.
- **BR-INVENTORY-021:** Negative-stock override must not disable future stock validation.
- **BR-INVENTORY-022:** Negative-stock sale cost uses the current warehouse-product weighted-average-cost snapshot at posting.
- **BR-INVENTORY-023:** Later receipts do not retroactively change the posted cost of a negative-stock sale.

---

## 6. Batch and Expiry Rules

- **BR-BATCH-001:** Batch tracking is mandatory for fertilizers, seeds, pesticides, and chemicals. (FR-PRODUCT-009)
- **BR-BATCH-002:** A tracked stock quantity belongs to a specific batch. (FR-INVENTORY-014)
- **BR-BATCH-003:** Loose stock from different batches remains separate. (FR-INVENTORY-003)
- **BR-BATCH-004:** Batch identity is preserved during purchase, sale, return, adjustment, and warehouse transfer. (FR-WAREHOUSE-005)
- **BR-BATCH-005:** Batch number is required when the product tracking mode requires batch tracking. (FR-PURCHASE-010)
- **BR-BATCH-006:** Expiry information is required when the product tracking mode requires expiry tracking. (FR-INVENTORY-015)
- **BR-BATCH-007:** Manufacturing date is optional unless the applicable product or organizational rule requires it. (FR-PURCHASE-011)
- **BR-BATCH-008:** Expiry is stored at batch level, not product level.

### FEFO

- **BR-BATCH-009:** For products using expiry tracking, allocate the eligible batch with the earliest expiry date first. (FR-INVENTORY-004)
- **BR-BATCH-010:** If expiry dates are equal under FEFO, allocate the oldest received eligible stock first.

### FIFO

- **BR-BATCH-011:** Where expiry does not apply, allocate the oldest received eligible stock first. (FR-INVENTORY-005)

### Expired stock

- **BR-BATCH-012:** A batch is expired when its expiry date is earlier than the organization’s current business date.
- **BR-BATCH-013:** Expired stock is excluded from normal sale allocation.
- **BR-BATCH-014:** Manager or Owner approval is required to sell expired stock. (FR-SALE-004)
- **BR-BATCH-015:** Expired sale requires warning, reason, actor, and audit entry.
- **BR-BATCH-016:** Expired stock remains separately identifiable in reporting.

---

## 7. Weighted-Average Cost

- **BR-COST-001:** Weighted-average cost is maintained by organization, product, and warehouse. (FR-INVENTORY-007)

### Purchase receipt value

```text
Receipt inventory value
= purchase-line product amount
+ allocated landed cost
```

```text
Receipt unit cost
= receipt inventory value ÷ received base quantity
```

- **BR-COST-002:** Receipt inventory value equals purchase-line product amount plus allocated landed cost.
- **BR-COST-003:** Receipt unit cost equals receipt inventory value divided by received base quantity.

### New weighted-average cost

When existing base quantity is greater than zero and the receipt is positive:

```text
New weighted-average cost
=
(existing stock value + receipt inventory value)
÷
(existing base quantity + received base quantity)
```

- **BR-COST-004:** For a positive receipt when existing base quantity is greater than zero, new weighted-average cost equals existing stock value plus receipt inventory value, divided by existing base quantity plus received base quantity.
- **BR-COST-005:** Cost calculations use unrounded internal precision before the posted cost snapshot is stored.
- **BR-COST-006:** The posted transaction stores the resulting cost snapshot.
- **BR-COST-007:** Sales use the current warehouse-product weighted-average cost at posting.
- **BR-COST-008:** Posted sale cost must not change retroactively, including when a later receipt covers an earlier negative-stock position.
- **BR-COST-009:** Warehouse transfer outbound uses source warehouse weighted-average cost.
- **BR-COST-010:** Warehouse transfer inbound carries the exact outbound transfer value into the destination warehouse.
- **BR-COST-011:** Organization-wide inventory value must not change because of a warehouse transfer.
- **BR-COST-012:** Stock valuation uses the maintained weighted-average cost. (FR-INVENTORY-012)

### Zero or negative stock before receipt

- **BR-COST-017:** When existing base quantity is greater than zero, a positive receipt shall use the normal weighted-average-cost formula.
- **BR-COST-018:** When existing base quantity is zero or negative before a positive receipt, the new weighted-average cost shall be set to the receipt unit cost rather than applying the normal weighted-average formula.
- **BR-COST-019:** When warehouse-product stock on hand becomes exactly zero, its inventory value shall be zero; the previous weighted-average cost may remain only as a historical last-cost snapshot and shall not represent current inventory value.
- **BR-COST-020:** The first positive receipt after stock is zero shall establish weighted-average cost from that receipt unit cost.

Weighted-average-cost calculation must never divide by zero. Historical cost-of-goods-sold snapshots must not be recalculated when a later receipt covers an earlier negative-stock position.

### Landed cost

- **BR-COST-013:** Release 1 landed-cost components may include freight, loading, transport, and other approved non-recoverable acquisition costs. (FR-INVENTORY-008, FR-PURCHASE-013)
- **BR-COST-014:** Allocate landed cost proportionally by purchase-line base product value. (FR-PURCHASE-014)
- **BR-COST-015:** If all eligible purchase-line values are zero, block posting and require manual correction rather than inventing an allocation.
- **BR-COST-016:** Detailed tax-related landed-cost treatment remains unresolved until tax policy is approved.

---

## 8. Purchase Rules

- **BR-PURCHASE-001:** A purchase must contain organization, supplier, receiving warehouse, at least one valid product line, quantity, unit and conversion snapshot, product cost, batch information where required, expiry information where required, and landed costs where applicable. (FR-PURCHASE-001, FR-PURCHASE-007, FR-PURCHASE-008)
- **BR-PURCHASE-002:** A draft purchase may be edited until it is posted.
- **BR-PURCHASE-003:** Posting a purchase atomically creates the posted purchase, inventory receipt, batch stock, stock movements, weighted-average-cost update, supplier payable for unpaid amount, payment allocations, selected account movements, and audit events. (FR-PURCHASE-006)
- **BR-PURCHASE-004:** A failed purchase posting must not leave partial purchase, stock, payable, or account records. (FR-PURCHASE-016)
- **BR-PURCHASE-005:** Posted purchases cannot be permanently deleted. (FR-PURCHASE-017)

### Purchase payment

```text
Purchase payable
= sum of signed posted payable effects linked to the purchase
```

Signed payable effects:

* Purchase payable creation is positive.
* Purchase return and purchase cancellation effects are negative.
* Supplier payment and applied supplier advance effects are negative.
* Reversal of a supplier payment is positive.
* Reversal of a purchase return is positive.
* Every corrective effect uses the opposite sign of its source.

- **BR-PURCHASE-006:** Purchase payable equals the sum of signed posted payable effects linked to the purchase. (FR-PURCHASE-004)
- **BR-PURCHASE-007:** Full and partial purchase payments update the selected cash, bank, JazzCash, or Easypaisa account. (FR-PURCHASE-002, FR-PURCHASE-015)

### Supplier invoice reference

- **BR-PURCHASE-008:** Supplier invoice or reference may be recorded on a purchase. (FR-PURCHASE-009)
- **BR-PURCHASE-009:** Duplicate supplier references within the same organization and supplier must produce a warning.
- **BR-PURCHASE-010:** Duplicate warning may be overridden only by an authorized user with reason and audit.
- **BR-PURCHASE-011:** A duplicate warning does not by itself prove that the purchase is a duplicate.

### Purchase cancellation

- **BR-PURCHASE-012:** Full purchase cancellation is allowed only when the purchase has not already been cancelled, required stock remains available for reversal, dependent returns or corrections do not make full reversal inconsistent, and the complete stock and financial reversal can be posted atomically. (FR-PURCHASE-018, FR-PURCHASE-020)
- **BR-PURCHASE-013:** If full purchase cancellation cannot satisfy BR-PURCHASE-012, use purchase return or another approved corrective transaction.
- **BR-PURCHASE-014:** A failed purchase cancellation or reversal must not leave partial corrective effects. (FR-PURCHASE-021)

---

## 9. Sales Rules

- **BR-SALE-001:** A sale must contain organization, branch, permitted warehouse, at least one valid product line, quantity, unit and conversion snapshot, valid batch allocation where required, posted selling price, customer or approved walk-in identity, and payment information. (FR-SALE-001, FR-SALE-008)
- **BR-SALE-002:** A draft sale may be edited until it is posted.
- **BR-SALE-003:** Sales support cash, credit, partial, and mixed payments. (FR-SALE-002)

### Price selection

- **BR-SALE-004:** Default unit price comes from the customer’s assigned price tier. (FR-PRODUCT-013)
- **BR-SALE-005:** Retail price is the fallback where no specific tier price exists.
- **BR-SALE-006:** Release 1 does not provide separate line-discount or invoice-discount fields.
- **BR-SALE-007:** Negotiated reductions use authorized price override. (FR-PRODUCT-014)
- **BR-SALE-008:** Price override requires permission, reason, actor, timestamp, and audit.
- **BR-SALE-009:** The posted line retains the final unit price after any approved override.

### Sale calculation

```text
When price is entered per packaging unit:
Packaging-unit line total = entered packaging quantity × packaging-unit price
Base-equivalent unit price = packaging-unit price ÷ conversion-factor snapshot
Line total = round-half-up(Packaging-unit line total, 2)

When price is entered per base unit:
Line total = round-half-up(base quantity × base-unit price, 2)

Both paths must produce the same monetary result for the same commercial intent after deterministic rounding.
```

```text
Sale total = sum of posted sale-line totals
```

```text
Amount due
= sale total
- allocated payments
- customer advance applied
```

- **BR-SALE-010:** When price is entered per packaging unit, line total equals entered packaging quantity multiplied by packaging-unit price, rounded half-up to two decimal places.
- **BR-SALE-011:** When price is entered per base unit, line total equals base quantity multiplied by base-unit price, rounded half-up to two decimal places.
- **BR-SALE-012:** Sale total equals the sum of posted sale-line totals.
- **BR-SALE-013:** Amount due equals sale total minus allocated payments and applied customer advance.

### Credit sale

- **BR-SALE-014:** Anonymous walk-in credit is prohibited. (FR-CUSTOMER-004)
- **BR-SALE-015:** Walk-in credit requires identifying customer information and organization policy permission. (FR-CUSTOMER-003)
- **BR-SALE-016:** Credit-limit behaviour is organization-configurable as warning, Manager approval, or block. (FR-CUSTOMER-002, FR-SALE-003)
- **BR-SALE-017:** Manager approval for credit-limit override requires reason and audit.

### Atomic sale posting

- **BR-SALE-018:** Posting a sale atomically creates the sales invoice, invoice sequence consumption, batch allocation, stock movements, cost-of-goods-sold snapshot, customer receivable, payment allocations, account movements, and audit events. (FR-SALE-019)
- **BR-SALE-019:** A failed sale posting must not leave partial sale or stock effects. (FR-SALE-020)
- **BR-SALE-020:** Posted sales cannot be permanently deleted. (FR-SALE-021)

### Sale cancellation

- **BR-SALE-021:** Full sale cancellation is allowed only when the sale is not already cancelled, no unresolved linked return or correction prevents a consistent full reversal, required payment and account effects can be reversed, required stock can be restored to original batches, and the full corrective transaction can post atomically. (FR-SALE-022, FR-SALE-024)
- **BR-SALE-022:** Partial correction of a sale uses a sales return rather than partial cancellation.
- **BR-SALE-023:** A failed sale cancellation or reversal must not leave partial corrective effects. (FR-SALE-025)

---

## 10. Invoice Numbering

- **BR-SALE-024:** Sales invoice numbering is branch-specific. (FR-BRANCH-002, FR-SALE-007)
- **BR-SALE-025:** Every posted sales invoice receives one unique branch sequence number.
- **BR-SALE-026:** Drafts must not produce duplicate posted numbers.
- **BR-SALE-027:** Failed posting must not produce two invoices with the same number.
- **BR-SALE-028:** A cancelled invoice number is never reused.
- **BR-SALE-029:** Sequence gaps are allowed where necessary for failure safety and auditability.
- **BR-SALE-030:** Human-readable format may include a branch prefix and sequential number; exact visual formatting remains for the invoice specification task.

---

## 11. Payments and Allocations

### Customer payments

- **BR-PAYMENT-001:** The system supports invoice-specific customer payment. (FR-PAYMENT-001)
- **BR-PAYMENT-002:** The system supports general customer payment. (FR-PAYMENT-002)
- **BR-PAYMENT-003:** The system supports customer advance and application of customer advance. (FR-PAYMENT-004)
- **BR-PAYMENT-004:** General customer payment allocation order is:

  1. Oldest due unpaid invoice
  2. If due date is equal or absent, oldest invoice date
  3. If invoice date is equal, lowest invoice sequence

  Any remainder becomes customer advance. (FR-PAYMENT-003)

### Supplier payments

- **BR-PAYMENT-005:** The system supports invoice-specific supplier payment. (FR-PAYMENT-005)
- **BR-PAYMENT-006:** The system supports general supplier payment. (FR-PAYMENT-006)
- **BR-PAYMENT-007:** The system supports supplier advance and application of supplier advance. (FR-PAYMENT-008)
- **BR-PAYMENT-008:** General supplier payment allocation uses the oldest unpaid purchase first, then oldest purchase date if due date is equal or absent, then lowest purchase sequence if dates are equal.

### Overpayment and correction

- **BR-PAYMENT-009:** Invoice-specific payment cannot create an unexplained negative invoice balance.
- **BR-PAYMENT-010:** Excess approved payment becomes an advance.
- **BR-PAYMENT-011:** Payment allocations are preserved after posting. (FR-PAYMENT-009)
- **BR-PAYMENT-012:** Posted payments cannot be edited.
- **BR-PAYMENT-013:** Payment correction uses an auditable reversal followed by a corrected payment where required. (FR-PAYMENT-010)

### Payment formula

```text
Invoice outstanding
= sum of signed posted receivable effects linked to the invoice
```

Signed receivable effects:

* Posted credit-sale receivable is positive.
* Sales return, payment allocation, advance application, and sale cancellation effects are negative.
* Reversal of a payment allocation is positive.
* Reversal of a sales return is positive.
* Every corrective effect uses the opposite sign of its source.

- **BR-PAYMENT-014:** Invoice outstanding equals the sum of signed posted receivable effects linked to the invoice.
- **BR-PAYMENT-015:** Mixed payment allocates one sale amount across multiple payment methods. (FR-SALE-017)

---

## 12. Customer and Supplier Ledgers

- **BR-LEDGER-001:** Ledgers are transaction-derived histories and must not be directly edited balances. (FR-CUSTOMER-005, FR-SUPPLIER-002)

### Customer receivable

```text
Customer receivable
=
opening receivable
+ posted credit sales
- sales returns and credits
- allocated payments
- applied customer advances
± approved corrective transactions
```

Corrective transactions are applied using their signed effects. A reversal always has the opposite sign of the source entry. A source and its complete reversal net to zero. Reversed payment, return, advance-allocation, or invoice effects must not be counted twice.

- **BR-LEDGER-002:** Customer receivable equals opening receivable plus the sum of signed posted receivable effects for the customer, including posted credit sales, sales returns and credits, allocated payments, applied customer advances, and approved corrective transactions; each reversal uses the opposite sign of its source and must not be double-counted with that source.
- **BR-LEDGER-003:** A customer opening advance reduces future receivable when applied. (FR-CUSTOMER-007)
- **BR-LEDGER-004:** Customer opening receivable and opening advance require auditable source transactions. (FR-CUSTOMER-008)
- **BR-LEDGER-005:** Silent mutable initialization of customer balances without an auditable source transaction is prohibited. (FR-CUSTOMER-009)

### Supplier payable

```text
Supplier payable
=
opening payable
+ posted unpaid purchases
- purchase returns and supplier credits
- allocated supplier payments
- applied supplier advances
± approved corrective transactions
```

Corrective transactions are applied using their signed effects. A reversal always has the opposite sign of the source entry. A source and its complete reversal net to zero. Reversed payment, return, advance-allocation, or purchase effects must not be counted twice.

- **BR-LEDGER-006:** Supplier payable equals opening payable plus the sum of signed posted payable effects for the supplier, including posted unpaid purchases, purchase returns and supplier credits, allocated supplier payments, applied supplier advances, and approved corrective transactions; each reversal uses the opposite sign of its source and must not be double-counted with that source.
- **BR-LEDGER-007:** Supplier opening payable and opening advance require auditable source transactions. (FR-SUPPLIER-005)
- **BR-LEDGER-008:** Unexplained mutable initialization of supplier payables without an auditable source transaction is prohibited. (FR-SUPPLIER-006)
- **BR-LEDGER-009:** Posted ledger entries remain historically preserved.
- **BR-LEDGER-010:** Reconciliation must trace every balance component to its source. (NFR-DATA-004)

---

## 13. Return Rules

### Linked sales return

```text
Maximum returnable quantity
= original sold quantity
- previously posted non-reversed return quantity
```

- **BR-RETURN-001:** Maximum returnable quantity for a linked sales return equals original sold quantity minus previously posted non-reversed return quantity. (FR-RETURN-007, FR-RETURN-008)
- **BR-RETURN-002:** Revenue reversal for a linked sales return uses the original posted sale price snapshot.
- **BR-RETURN-003:** Cost reversal for a linked sales return uses the original sale cost snapshot.
- **BR-RETURN-004:** Sellable returned stock returns to the original batch where identifiable. (FR-RETURN-010)
- **BR-RETURN-005:** The returned quantity updates warehouse weighted-average cost using the original cost snapshot.
- **BR-RETURN-006:** Refund or ledger adjustment must match the approved returned value.

### Sales return without invoice

- **BR-RETURN-007:** Sales return without invoice requires customer lookup or recorded identifying information where available, Manager or Owner approval, mandatory reason, manually approved refund value, batch identification where possible, and an audit event. (FR-RETURN-002, FR-RETURN-004)
- **BR-RETURN-008:** Inventory value for an unlinked returned item uses the current warehouse-product weighted-average cost unless an authorized documented cost is approved.

### Purchase return

```text
Maximum returnable quantity
= original purchased quantity
- previously posted non-reversed purchase-return quantity
```

- **BR-RETURN-009:** Maximum returnable quantity for a linked purchase return equals original purchased quantity minus previously posted non-reversed purchase-return quantity. (FR-RETURN-009)
- **BR-RETURN-010:** Linked purchase return removes stock from the original batch where identifiable.
- **BR-RETURN-011:** Linked purchase return reduces supplier payable or supplier balance by the approved return amount.
- **BR-RETURN-012:** Inventory value for a linked purchase return is removed using the original receipt cost snapshot for the returned quantity.
- **BR-RETURN-013:** After a linked purchase return, remaining warehouse weighted-average cost is recalculated from remaining stock value and quantity.

### Returned-stock condition

- **BR-RETURN-014:** Returned stock is classified as sellable or unsellable. (FR-RETURN-011, FR-RETURN-012)
- **BR-RETURN-015:** Unsellable includes expired, damaged, opened, contaminated, or otherwise unsuitable for normal sale. (FR-RETURN-013, FR-RETURN-014, FR-RETURN-015)
- **BR-RETURN-016:** Unsellable returned stock must not enter normal sellable inventory. (FR-RETURN-016)

### Return resolution

- **BR-RETURN-017:** Release 1 supports cash refund; bank, JazzCash, or Easypaisa account refund; and customer or supplier ledger adjustment. (FR-RETURN-017, FR-RETURN-018, FR-RETURN-019)
- **BR-RETURN-018:** A product exchange is represented as a posted return plus a separate new sale; no separate exchange transaction type exists.
- **BR-RETURN-019:** Every posted return requires a return reason. (FR-RETURN-006)
- **BR-RETURN-020:** Return posting must be atomic and must apply stock, batch, valuation, ledger, refund, account, and audit effects together. (FR-RETURN-022, FR-RETURN-023)
- **BR-RETURN-021:** A failed return posting must not leave partial stock, batch, ledger, valuation, payment, account, or audit effects. (FR-RETURN-024)
- **BR-RETURN-022:** A linked purchase return quantity shall not exceed the currently available stock quantity in the selected warehouse and original batch where the batch is identifiable.
- **BR-RETURN-023:** Negative-stock override shall not be used to post a purchase return for goods that are not physically available; stock must first be made available in the applicable warehouse and batch.

A linked purchase return must satisfy both:

```text
Return quantity
<= remaining quantity returnable against the original purchase
```

and:

```text
Return quantity
<= currently available quantity in the applicable warehouse and batch
```

---

## 14. Warehouse Transfer Rules

Release 1 uses a one-step atomic warehouse-transfer model. It does not use in-transit stock state, destination acceptance, or separate dispatch and receipt posting.

- **BR-TRANSFER-001:** A posted transfer atomically creates outbound movement from source warehouse, inbound movement into destination warehouse, preserved product identity, preserved batch identity, preserved base quantity, preserved total stock value, and an audit event. (FR-WAREHOUSE-003 to FR-WAREHOUSE-008)
- **BR-TRANSFER-002:** Source and destination warehouses must differ.
- **BR-TRANSFER-003:** Source stock must be available for the transferred quantity and batch scope.
- **BR-TRANSFER-004:** FEFO/FIFO does not automatically change the batch selected for an explicitly prepared transfer.
- **BR-TRANSFER-005:** Transfer cost uses source warehouse weighted-average-cost snapshot.
- **BR-TRANSFER-006:** Destination inventory receives the exact transfer value.
- **BR-TRANSFER-007:** Failed transfer creates neither outbound nor inbound effect. (FR-WAREHOUSE-009)
- **BR-TRANSFER-008:** Organization-wide quantity and value must remain unchanged after a successful transfer.
- **BR-TRANSFER-009:** Release 1 does not use in-transit stock state.
- **BR-TRANSFER-010:** Release 1 does not require destination acceptance before transfer completion.
- **BR-TRANSFER-011:** Release 1 does not use separate dispatch and receipt posting for warehouse transfers.

---

## 15. Accounts and Expenses

### Account types

- **BR-ACCOUNT-001:** Supported account types are Cash, Bank, JazzCash, and Easypaisa. (FR-ACCOUNT-001 to FR-ACCOUNT-004)

### Account balance

```text
Account balance
=
opening balance
+ posted inflows
- posted outflows
+ inbound transfers
- outbound transfers
+ refunds received
- refunds paid
± reversals
```

- **BR-ACCOUNT-002:** Account balance equals opening balance plus posted inflows, minus posted outflows, plus inbound transfers, minus outbound transfers, plus refunds received, minus refunds paid, plus or minus reversals.
- **BR-ACCOUNT-003:** Account balances are transaction-derived.
- **BR-ACCOUNT-004:** Direct account balance editing is prohibited.
- **BR-ACCOUNT-005:** Opening balances use auditable source transactions. (FR-ACCOUNT-008, FR-ACCOUNT-009)
- **BR-ACCOUNT-006:** Account transfer atomically creates linked outbound and inbound entries. (FR-ACCOUNT-007)
- **BR-ACCOUNT-007:** Source and destination account must differ for an account transfer.
- **BR-ACCOUNT-008:** Posted account movements cannot be edited or deleted.
- **BR-ACCOUNT-009:** Account refunds must link to their source transactions. (FR-ACCOUNT-010)
- **BR-ACCOUNT-010:** Account reversals must link to corrective transactions. (FR-ACCOUNT-011)
- **BR-ACCOUNT-011:** Account balances must reconcile to source transactions. (FR-ACCOUNT-012)

### Expense

- **BR-EXPENSE-001:** Posting an expense creates the expense transaction, selected account outflow, and audit event. (FR-EXPENSE-001, FR-EXPENSE-002)
- **BR-EXPENSE-002:** Expense correction uses reversal rather than editing the posted expense. (FR-EXPENSE-003)
- **BR-EXPENSE-003:** Expense recording and correction retain auditability. (FR-EXPENSE-004)
- **BR-EXPENSE-004:** Release 1 does not define full general-ledger entries for expenses.

---

## 16. Alerts

- **BR-ALERT-001:** Alert evaluation uses the organization’s configured business date and timezone.

### Low stock

```text
Low-stock condition:
sellable on-hand quantity <= configured product-and-warehouse threshold
```

- **BR-ALERT-002:** Low-stock condition exists when sellable on-hand quantity is less than or equal to the configured product-and-warehouse threshold. (FR-ALERT-001, FR-ALERT-009)

### Upcoming expiry

```text
0 <= expiry date - business date <= configured expiry threshold
```

- **BR-ALERT-003:** Upcoming-expiry condition exists when expiry date minus business date is greater than or equal to zero and less than or equal to the configured expiry threshold. (FR-ALERT-002)

### Expired stock

```text
expiry date < business date
```

- **BR-ALERT-004:** Expired-stock condition exists when expiry date is earlier than the business date. (FR-ALERT-003)

### Dead stock

- **BR-ALERT-005:** A product is dead stock when sellable on-hand quantity is greater than zero and no posted non-reversed sale occurred during the configured inactivity period. (FR-ALERT-004)
- **BR-ALERT-006:** Dead-stock inactivity period is configurable and must not be silently hardcoded. (FR-ALERT-010, FR-ALERT-012)

### Dues

- **BR-ALERT-007:** Customer and supplier due alerts derive from posted reconciled ledger balances. (FR-ALERT-005, FR-ALERT-006)
- **BR-ALERT-008:** Alerts are delivered only through the dashboard and in-app notification center. (FR-ALERT-007)
- **BR-ALERT-009:** Alert values are calculated from authoritative inventory and sales data. (FR-ALERT-011)

---

## 17. Gross-Profit Rules

Release 1 gross profit is operational gross profit, not accounting net profit.

### Net sales revenue

```text
Net sales revenue
= sum of signed posted revenue effects
```

Signed revenue effects:

* Posted sales create positive revenue effects.
* Sales returns create negative revenue effects.
* Sale cancellation or reversal creates effects exactly opposite to the original sale.
* Reversal of a return creates effects opposite to the return.
* Original transactions and corrective transactions must not be double-subtracted.

- **BR-REPORT-001:** Net sales revenue equals the sum of signed posted revenue effects.
- **BR-REPORT-002:** Posted sale revenue uses the final authorized sale price, including any price override.
- **BR-REPORT-003:** Separate Release 1 line-discount or invoice-discount fields do not exist and must not be assumed in gross-profit calculation.

### Net cost of goods sold

```text
Net COGS
= sum of signed posted cost-of-goods-sold effects
```

Signed COGS effects:

* Posted sales create positive COGS effects.
* Sales returns create negative COGS effects.
* Sale cancellation or reversal creates effects exactly opposite to the original sale.
* Reversal of a return creates effects opposite to the return.
* Original transactions and corrective transactions must not be double-subtracted.

- **BR-REPORT-004:** Net COGS equals the sum of signed posted cost-of-goods-sold effects.

### Gross profit

```text
Gross profit = net sales revenue - net COGS
```

- **BR-REPORT-005:** Gross profit equals net sales revenue minus net COGS. (FR-REPORT-004, NFR-DATA-006)
- **BR-REPORT-006:** Gross profit excludes operating expenses, purchase payments, customer payments, supplier payments, account transfers, full accounting adjustments, and taxes until tax policy is approved.
- **BR-REPORT-007:** Dashboard and reports must use the same gross-profit calculation. (FR-REPORT-019)

---

## 18. Subscription Rules

### States

- **BR-SUB-001:** Subscription states are Pending approval, Approved trial, Active, Grace, Suspended, Cancelled, Retained pending deletion, and Deleted according to authorized retention process. (FR-SUB-010, FR-SUB-011)

### Behaviour

- **BR-SUB-002:** Trial is available once per organization unless Super Admin explicitly approves an exception. (FR-SUB-004)
- **BR-SUB-003:** Trial does not require a payment method.
- **BR-SUB-004:** Trial duration is configurable.
- **BR-SUB-005:** Grace duration is configurable. (FR-SUB-005)
- **BR-SUB-006:** Expired active subscription enters Grace.
- **BR-SUB-007:** Expired Grace enters Suspended.
- **BR-SUB-008:** Suspension blocks restricted operational access according to entitlement policy. (FR-SUB-007, FR-SUB-010)
- **BR-SUB-009:** Suspension does not delete existing data.
- **BR-SUB-010:** Reactivation restores entitled access.
- **BR-SUB-011:** Cancellation and deletion are separate processes. (FR-SUB-011)
- **BR-SUB-012:** Existing data is not deleted because a plan limit is exceeded. (FR-SUB-009)
- **BR-SUB-013:** Plan-limit excess blocks only applicable new creation after warnings. (FR-SUB-008)
- **BR-SUB-014:** Manual billing activation requires verified payment evidence and authorized approval. (FR-SUB-006)
- **BR-SUB-015:** Supported plans are Starter, Business, and Enterprise. (FR-SUB-001)
- **BR-SUB-016:** Shared SaaS is the default deployment; dedicated cloud is an Enterprise option. (FR-SUB-013)
- **BR-SUB-017:** Exact prices and commercial defaults remain outside this document.

---

## 19. Import Rules

Supported imports remain those listed in the frozen PRD.

- **BR-IMPORT-001:** Every import uses a defined template version. (FR-IMPORT-002)
- **BR-IMPORT-002:** The system validates all rows before posting. (FR-IMPORT-003, FR-IMPORT-019)
- **BR-IMPORT-003:** Invalid rows identify row and field. (FR-IMPORT-021, FR-IMPORT-022)
- **BR-IMPORT-004:** Invalid rows are not silently ignored. (FR-IMPORT-004)
- **BR-IMPORT-005:** No import overwrites existing records silently.
- **BR-IMPORT-006:** Create/update behaviour must be explicit for each import.
- **BR-IMPORT-007:** Imported opening balances and opening stock create auditable source transactions. (FR-IMPORT-025)
- **BR-IMPORT-008:** Required batch and expiry information is validated according to product tracking mode. (FR-IMPORT-023, FR-IMPORT-024)
- **BR-IMPORT-009:** An import posting operation is logically all-or-nothing. (FR-IMPORT-026)
- **BR-IMPORT-010:** An unrecoverable posting failure must not leave a partially committed import.
- **BR-IMPORT-011:** Import correction uses auditable reversal or approved correction rather than direct deletion.
- **BR-IMPORT-012:** Exact spreadsheet columns belong in the future import specification and are not defined here.

---

## 20. Audit Rules

- **BR-AUDIT-001:** Sensitive operations must record organization, actor, timestamp, action, affected business record, source transaction, reason where required, approval actor where applicable, and link to corrective transaction where applicable. (FR-AUDIT-001 to FR-AUDIT-005)
- **BR-AUDIT-002:** Audit is mandatory for price override. (FR-AUDIT-003)
- **BR-AUDIT-003:** Audit is mandatory for credit-limit override.
- **BR-AUDIT-004:** Audit is mandatory for expired-product sale. (FR-SALE-004)
- **BR-AUDIT-005:** Audit is mandatory for negative-stock override. (FR-INVENTORY-011)
- **BR-AUDIT-006:** Audit is mandatory for opening balances. (FR-AUDIT-006)
- **BR-AUDIT-007:** Audit is mandatory for stock adjustment. (FR-AUDIT-007)
- **BR-AUDIT-008:** Audit is mandatory for return without invoice. (FR-AUDIT-008)
- **BR-AUDIT-009:** Audit is mandatory for payment correction.
- **BR-AUDIT-010:** Audit is mandatory for expense correction.
- **BR-AUDIT-011:** Audit is mandatory for cancellation. (FR-AUDIT-009)
- **BR-AUDIT-012:** Audit is mandatory for reversal. (FR-AUDIT-010)
- **BR-AUDIT-013:** Audit is mandatory for subscription change. (FR-AUDIT-004)
- **BR-AUDIT-014:** Audit is mandatory for duplicate supplier-reference override.
- **BR-AUDIT-015:** Audit is mandatory for restore operation. (FR-SETTINGS-005)
- **BR-AUDIT-016:** Audit records must not be treated as editable business notes.

---

## 21. Traceability to Frozen PRD

| PRD area | Business-rule section | Main BR prefixes |
| --- | --- | --- |
| Platform and tenancy | Organization and Access Boundaries | BR-ORG |
| Authentication and authorization | Organization and Access Boundaries | BR-ORG |
| Organization management | Organization and Access Boundaries | BR-ORG |
| Subscriptions | Subscription Rules | BR-SUB |
| Branches and warehouses | Invoice Numbering; Warehouse Transfer Rules | BR-SALE, BR-TRANSFER |
| Users, roles, and permissions | Organization and Access Boundaries | BR-ORG |
| Products and pricing | Product Units and Conversion; Sales Rules | BR-UNIT, BR-SALE |
| Customers and suppliers | Customer and Supplier Ledgers; Sales Rules | BR-LEDGER, BR-SALE |
| Inventory and batches | Inventory and Stock Movements; Batch and Expiry Rules; Weighted-Average Cost | BR-INVENTORY, BR-BATCH, BR-COST |
| Purchases | Purchase Rules; Weighted-Average Cost | BR-PURCHASE, BR-COST |
| Sales | Sales Rules; Invoice Numbering | BR-SALE |
| Returns | Return Rules | BR-RETURN |
| Payments and ledgers | Payments and Allocations; Customer and Supplier Ledgers | BR-PAYMENT, BR-LEDGER |
| Accounts | Accounts and Expenses | BR-ACCOUNT |
| Expenses | Accounts and Expenses | BR-EXPENSE |
| Alerts and notifications | Alerts | BR-ALERT |
| Dashboard, reports, and exports | Gross-Profit Rules | BR-REPORT |
| Printing | Controlled Unresolved Details; Invoice Numbering notes | — |
| Import and migration | Import Rules | BR-IMPORT |
| Audit | Audit Rules | BR-AUDIT |
| Settings, backup, and restore | Audit Rules; Controlled Unresolved Details | BR-AUDIT |
| Business invariants / data integrity | Common Transaction Lifecycle; Inventory; Ledgers; Corrections | BR-COMMON, BR-INVENTORY, BR-LEDGER, BR-CORRECTION |

Printing visual layouts, exact report columns, and exact import spreadsheet columns remain unresolved product or later-specification details and are intentionally not expanded into formulas here.
