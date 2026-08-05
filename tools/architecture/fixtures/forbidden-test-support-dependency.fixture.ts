/**
 * INTENTIONAL ARCHITECTURE VIOLATION FIXTURE — not production code.
 *
 * Scanned as if it lived at:
 *   packages/test-support/src/lib/leak.ts
 *
 * Forbidden: test-support importing application business modules.
 */
import { SaleService } from '../../../apps/backend/src/modules/sales/services/sale.service.js';

export const leak = SaleService;
