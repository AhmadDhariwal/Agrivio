/**
 * Sales public contract for F06 (R1-F06-002 / R1-F06-003).
 * Exposes sale draft services and invoice sequence allocation without persistence leakage.
 */

const { createSalesModule, createSalesService } = require('../sales.module');
const { formatInvoiceNumber } = require('../invoice-sequence');

module.exports = {
  createSalesModule,
  createSalesService,
  formatInvoiceNumber,
};
