/**
 * Payments and Ledgers public contract for F05/F06 (R1-F04-012).
 * Exposes signed ledger-effect posting without persistence leakage.
 */

const { createLedgersModule, createLedgersService } = require('../ledgers.module');

module.exports = {
  createLedgersModule,
  createLedgersService,
};
