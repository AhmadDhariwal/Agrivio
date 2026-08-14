/**
 * Reporting public contract (R1-F08-003).
 * Read-only dashboard composition; no authoritative balances.
 */

const { createReportingModule, createReportingService } = require('../reporting.module');
const { computeGrossProfitFromEffects } = require('../gross-profit');

module.exports = {
  computeGrossProfitFromEffects,
  createReportingModule,
  createReportingService,
};
