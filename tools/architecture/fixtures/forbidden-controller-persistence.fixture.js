/**
 * INTENTIONAL ARCHITECTURE VIOLATION FIXTURE — not production code.
 *
 * Scanned as if it lived at:
 *   apps/backend/src/modules/sales/controllers/sale.controller.js
 *
 * Forbidden: controller persistence / Mongoose access
 * (MODULE_BOUNDARIES.md §5 — direct Mongoose access from controllers).
 */
import mongoose from 'mongoose';
import { SaleModel } from '../persistence/sale.model.js';

export function leak(req) {
  return SaleModel.find({ org: req.orgId }).using(mongoose);
}
