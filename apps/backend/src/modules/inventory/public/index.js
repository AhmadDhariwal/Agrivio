/**
 * Inventory public contract for F05/F06 posting modules (R1-F04-012).
 * Consumers must import this entry point — not Inventory persistence models.
 */

const { allocateStock } = require('../allocation');
const {
  applyBalanceInbound,
  applyBalanceOutbound,
  applyCostInbound,
  applyCostOutbound,
} = require('../inventory-posting');
const { createInventoryModule, createInventoryService } = require('../inventory.module');

module.exports = {
  allocateStock,
  applyBalanceInbound,
  applyBalanceOutbound,
  applyCostInbound,
  applyCostOutbound,
  createInventoryModule,
  createInventoryService,
};
