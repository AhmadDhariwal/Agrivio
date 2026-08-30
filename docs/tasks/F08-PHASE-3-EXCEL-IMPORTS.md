# F08 Phase 3 — Excel import preview and execution

## Task Status

* Status: **Complete** (implementation)
* Date: 2026-08-14
* Work items: `R1-F08-006`
* Does **not** implement `R1-F08-007`+ (audit UI, backup/restore views, F08-009 suspended-policy work, vertical-slice E2E)

## Scope Delivered

### R1-F08-006 — Excel import preview and execution

Imports owns job lifecycle, template type+version recognition, workbook parse, preview validation, row/field errors, all-or-nothing execution, and result references.

Target writes go only through public application interfaces:

* Catalog: `createCategory`, `createProduct`, `createPrice` (create-only), lookup helpers
* Customers / Suppliers: `createCustomer` / `createSupplier`, `postOpeningBalance`
* Accounts: `postOpeningBalance` (cash/bank/JazzCash/Easypaisa typed imports)
* Inventory: `postOpeningStock`
* Locations: warehouse lookup
* Audit: `import_job.created` / `import_job.executed`

Caller-controlled Mongo session is accepted by those posting/create methods (`options.session`) so one import job is one transaction.

## Implementation-level templates (not Frozen columns)

All templates are `AGRIVIO_TEMPLATE` / type / version `1` in row 1, headers in row 2.

| Type | Columns | Create/update |
| --- | --- | --- |
| product_categories | name, productClass | create-only |
| products | sku, name, categoryName, trackingMode, baseUnitCode, measurementDimension | create-only |
| product_prices | productSku, priceTier, amount | create-only (no replacePrices) |
| customers | name, phone?, customerType, priceTier? | create-only |
| suppliers | name, phone? | create-only |
| customer_opening_receivables / advances | customerName, amount | create-only; existing posted opening is a preview error |
| supplier_opening_payables / advances | supplierName, amount | same |
| cash/bank/jazzcash/easypaisa_opening_balances | accountName, amount | account type must match; existing opening is an error |
| opening_stock | productSku, warehouseCode, quantity, inventoryValue, batchNumber?, expiryDate?, manufacturingDate? | create-only posting; batch/expiry per tracking mode |

Unknown/missing required columns fail preview. No silent overwrite.

Workbook bytes are stored via opaque `storageRef` (local temp file / memory), not as Mongo binaries.

## APIs

`GET/POST /api/v1/imports` surfaces per API_DESIGN: templates, create, upload (raw Excel body), validate, get, errors, confirm, execute (`Idempotency-Key`).

## Angular

`/app/imports` wizard: type → template/version → upload → preview counts/errors → confirm/execute → in-flight → success/failure.

## Model review (A/B)

| Model | Result |
| --- | --- |
| `import_jobs` | A tenant job lifecycle + opaque storage metadata |
| `import_row_errors` | A row/field preview and validation errors |

Deferred **C/D**: CSV entity types, scheduled imports, malware scan provider, F08-007+ UI.

## Next

* F08 P4 — `R1-F08-007` audit views (and later backup/restore, suspended policy, E2E)

## API/cache hardening follow-up (2026-08-30)

Import templates use reference caching; exact job/status and row-error reads use short organization-scoped caching with in-flight deduplication. Upload, validate, and confirm remain uncached and invalidate job/error reads only after success. Successful execute additionally invalidates the minimum import-type-specific domain tags so affected lists and selectors refresh on the next read.
