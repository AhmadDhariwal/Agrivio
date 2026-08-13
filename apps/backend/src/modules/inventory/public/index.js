/**
 * Inventory public contract for F05/F06 posting modules (R1-F04-012).
 * Consumers must import this entry point — not Inventory persistence models.
 */

const { allocateStock } = require('../allocation');
const {
  applyBalanceInbound,
  applyBalanceUnsellableInbound,
  applyBalanceOutbound,
  applyBalanceUnsellableOutbound,
  applyCostInbound,
  applyCostOutbound,
  applyCostOutboundAtValue,
} = require('../inventory-posting');
const { createInventoryModule, createInventoryService } = require('../inventory.module');
const { isExpiredOnBusinessDate } = require('../allocation');

module.exports = {
  allocateStock,
  applyBalanceInbound,
  applyBalanceUnsellableInbound,
  applyBalanceOutbound,
  applyBalanceUnsellableOutbound,
  applyCostInbound,
  applyCostOutbound,
  applyCostOutboundAtValue,
  createInventoryModule,
  createInventoryService,
  isExpiredOnBusinessDate,
};
