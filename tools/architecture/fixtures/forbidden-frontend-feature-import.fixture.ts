/**
 * INTENTIONAL ARCHITECTURE VIOLATION FIXTURE — not production code.
 *
 * Scanned as if it lived at:
 *   apps/frontend/src/app/features/sales-pos/services/pos.service.ts
 *
 * Forbidden: feature-internal cross-import
 * (MODULE_BOUNDARIES.md §5 — one feature importing another feature's internals).
 */
import { StockQuery } from '../../inventory/data-access/stock.query';

export const leak = StockQuery;
