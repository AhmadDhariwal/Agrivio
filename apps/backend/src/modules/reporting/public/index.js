/**
 * Reporting public contract (R1-F08-003 / R1-F08-004 / R1-F08-005).
 * Read-only dashboard and fixed-report composition; no authoritative balances.
 */

const { createReportingModule, createReportingService } = require('../reporting.module');
const { computeGrossProfitFromEffects } = require('../gross-profit');
const { REPORT_FAMILIES } = require('../report-catalog');

module.exports = {
  computeGrossProfitFromEffects,
  createReportingModule,
  createReportingService,
  REPORT_FAMILIES,
};
