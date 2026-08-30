# Project-Wide Server-Side Pagination

Status: complete (2026-08-18)

## Delivered contract

* List endpoints use integer-only `page` and `pageSize`, defaulting to `1` and `25`, with `pageSize` capped at `100`; `all` is not supported.
* Successful list responses use the shared success envelope with the resource array in `data` and shared `PaginationMeta` (`page`, `pageSize`, `total`) in `meta`.
* Tenant and assignment scope plus endpoint-specific filters/search are applied before count and pagination.
* Search remains resource-specific, uses normalized/indexed fields where available, and escapes regex input.
* Transactional resources remain newest-first with deterministic `_id` tie-breaking. Master data retains its existing business order with a deterministic tie-breaker.

## Delivered surfaces

The shared parser, API contract, Angular pagination model, and paginator were applied to catalog, customers, suppliers, sales, purchases, customer/supplier payments, inventory balances/batches/adjustments/transfers/movements, branches, warehouses, employees, accounts, account movements, expense categories, expenses, returns, audit inquiry, and platform organizations.

Bounded master-data selectors explicitly request `page=1&pageSize=100`. Products, customers, and suppliers use their server-search methods; list pages never infer that a first page is the complete dataset.

The paginator hides at ten or fewer total rows, retains range and page-size controls for a single page above ten rows, shows full navigation for multiple pages, and changes from a bounded page select to numeric go-to for large page counts. Page-size options are 10, 25, 50, and 100.

## Validation

Focused tests were run after the implementation batches. Coverage includes parser validation, shared API metadata, paginator visibility/navigation modes, bounded selector request parameters, tenant/warehouse scope-before-count, and an inventory dataset of 238 rows with a partial final page. Frontend typecheck and the development build pass. Full regression was intentionally not run.

## Notes

The existing Angular/API-contract compilation-path warnings remain unchanged and do not fail the build.
