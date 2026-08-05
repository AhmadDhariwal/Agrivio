/**
 * INTENTIONAL ARCHITECTURE VIOLATION FIXTURE — not production code.
 *
 * Scanned as if it lived at:
 *   apps/backend/src/modules/inventory/services/inventory.service.js
 *
 * Forbidden: inventory importing sales module repository internals
 * (MODULE_BOUNDARIES.md §5 — cross-module repository import).
 */
import { SaleRepository } from '../../sales/repositories/sale.repository.js';

export function leak() {
  return SaleRepository;
}
