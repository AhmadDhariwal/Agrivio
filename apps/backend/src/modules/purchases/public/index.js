/**
 * Purchases public entry (draft lifecycle for R1-F05-003).
 * Does not re-export persistence models.
 */

const {
  createPurchasesModule,
  createPurchasesService,
} = require('../purchases.module');

module.exports = {
  createPurchasesModule,
  createPurchasesService,
};
