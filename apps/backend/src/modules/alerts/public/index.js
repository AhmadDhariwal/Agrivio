/**
 * Alerts public contract (R1-F08-001 / R1-F08-002).
 * Read-only composition over Inventory, Payments/Ledgers, and Sales public interfaces.
 */

const { createAlertsModule, createAlertsService } = require('../alerts.module');
const {
  isDeadStock,
  isLowStock,
  inactivityWindowStart,
} = require('../alert-calculations');

module.exports = {
  createAlertsModule,
  createAlertsService,
  inactivityWindowStart,
  isDeadStock,
  isLowStock,
};
